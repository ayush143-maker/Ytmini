package com.ayutube.kt.data

import android.content.Context
import android.os.StatFs
import com.ayutube.kt.data.db.DownloadDao
import com.ayutube.kt.data.db.DownloadEntity
import com.ayutube.kt.player.AyuPlayer
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import okhttp3.OkHttpClient
import okhttp3.Request
import org.schabi.newpipe.extractor.stream.AudioStream
import org.schabi.newpipe.extractor.stream.AudioTrackType
import org.schabi.newpipe.extractor.stream.DeliveryMethod
import org.schabi.newpipe.extractor.stream.Stream
import org.schabi.newpipe.extractor.stream.StreamInfo
import org.schabi.newpipe.extractor.stream.VideoStream
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

private const val CHUNK = 4L * 1024 * 1024
private const val MIN_FREE = 150L * 1024 * 1024

/** "124 MB", "1.3 GB". */
fun formatSize(bytes: Long): String = when {
    bytes >= 1L shl 30 -> "%.1f GB".format(bytes / (1L shl 30).toDouble())
    bytes >= 1L shl 20 -> "${bytes / (1L shl 20)} MB"
    else -> "${bytes / 1024} KB"
}

private fun progressive(stream: Stream) = stream.isUrl && stream.deliveryMethod == DeliveryMethod.PROGRESSIVE_HTTP

private fun isMp4(stream: Stream) = stream.format?.mimeType?.contains("mp4") == true

/** The qualities to offer for a video: picture height and a label (0 = audio only). */
fun downloadChoices(info: StreamInfo): List<Pair<Int, String>> {
    val seconds = info.duration

    fun size(bytes: Long) = if (bytes > 0) " \u00B7 ~" + formatSize(bytes) else ""

    val audio = info.audioStreams.filter { progressive(it) }.maxByOrNull { it.averageBitrate }
    val audioBytes = if (audio != null && seconds > 0) audio.averageBitrate * 1000L * seconds / 8 else 0L

    val groups = info.videoOnlyStreams
        .filter { progressive(it) && it.height > 0 }
        .groupBy { it.height }
        .entries
        .sortedByDescending { it.key }

    val out = mutableListOf<Pair<Int, String>>()

    for (entry in groups.filter { it.key <= 1080 }.take(5)) {
        val best = entry.value.maxByOrNull { it.bitrate }
        val bytes = if (best != null && best.bitrate > 0 && seconds > 0) best.bitrate.toLong() * seconds / 8 + audioBytes else 0L

        out += entry.key to "${entry.key}p" + size(bytes)
    }

    if (out.isEmpty()) {
        info.videoStreams.filter { progressive(it) && it.height > 0 }.maxByOrNull { it.height }
            ?.let { out += it.height to "${it.height}p" }
    }

    out += 0 to "Audio only" + size(audioBytes)

    return out
}

/**
 * Saves videos to the phone: a queue, resumable chunked downloads, new links when YouTube's expire.
 * State goes in the database; the video and audio are plain files, so nothing big lives in the database.
 */
class Downloader(private val context: Context, private val dao: DownloadDao) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val gate = Semaphore(2)
    private val jobs = ConcurrentHashMap<String, Job>()
    private val lastWrite = ConcurrentHashMap<String, Pair<Int, Long>>()

    /** Queued plus running downloads. The foreground service stops when this reaches 0. */
    val active = MutableStateFlow(0)

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .addInterceptor { chain ->
            chain.proceed(
                chain.request().newBuilder()
                    .header("User-Agent", AyuPlayer.userAgentFor(chain.request().url.toString()))
                    .build()
            )
        }
        .build()

    init {
        scope.launch { dao.pauseStale() }
    }

    private fun root(): File = File(context.getExternalFilesDir(null) ?: context.filesDir, "downloads").apply { mkdirs() }

    fun enqueue(video: VideoItem, height: Int) {
        scope.launch {
            val existing = dao.get(video.id)

            if (existing?.status == "DONE") return@launch

            if (existing != null && existing.quality != height) File(root(), video.id).deleteRecursively()

            dao.upsert(
                DownloadEntity(
                    videoId = video.id,
                    title = video.title,
                    channelTitle = video.channel,
                    channelId = video.channelId,
                    thumbnailUrl = video.thumbnail,
                    thumbPath = null,
                    durationSeconds = video.durationSec.toInt(),
                    status = "QUEUED",
                    quality = height,
                    progress = 0,
                    sizeBytes = 0,
                    videoPath = null,
                    audioPath = null,
                    error = null,
                    createdAt = System.currentTimeMillis()
                )
            )

            startJob(video.id)
        }
    }

    fun resume(id: String) = startJob(id)

    fun pause(id: String) {
        scope.launch {
            jobs[id]?.cancelAndJoin()
            dao.setStatus(id, "PAUSED", null)
        }
    }

    fun delete(id: String) {
        scope.launch {
            jobs[id]?.cancelAndJoin()
            File(root(), id).deleteRecursively()
            dao.delete(id)
        }
    }

    fun deleteAll() {
        scope.launch {
            jobs.values.toList().forEach { it.cancelAndJoin() }
            root().deleteRecursively()
            dao.deleteAll()
        }
    }

    private fun startJob(id: String) {
        jobs.remove(id)?.cancel()

        val job = scope.launch {
            dao.setStatus(id, "QUEUED", null)
            gate.withPermit { run(id) }
        }

        jobs[id] = job
        active.value = jobs.size

        job.invokeOnCompletion {
            jobs.remove(id, job)
            active.value = jobs.size
        }

        DownloadService.start(context)
    }

    private class Part(val kind: String, val file: File, val url: String)

    private class Pick(val video: VideoStream?, val audio: AudioStream?)

    /** The streams for [height]: separate video and audio, or one stream that has both. */
    private fun pick(info: StreamInfo, height: Int): Pick {
        val audios = info.audioStreams.filter { progressive(it) }
        val originals = audios.filter { it.audioTrackType == null || it.audioTrackType == AudioTrackType.ORIGINAL }.ifEmpty { audios }
        val audio = originals.filter { isMp4(it) }.ifEmpty { originals }.maxByOrNull { it.averageBitrate }

        if (height <= 0) return Pick(null, audio)

        val adaptive = info.videoOnlyStreams
            .filter { progressive(it) && it.height == height }
            .sortedWith(compareByDescending<VideoStream> { isMp4(it) }.thenByDescending { it.bitrate })
            .firstOrNull()

        if (adaptive != null && audio != null) return Pick(adaptive, audio)

        val muxed = info.videoStreams.filter { progressive(it) && it.height > 0 }.sortedByDescending { it.height }

        return Pick(muxed.firstOrNull { it.height == height } ?: muxed.firstOrNull(), null)
    }

    private suspend fun freshUrl(id: String, height: Int, kind: String): String? {
        val pick = pick(ExtractorRepository.streams(id), height)

        return if (kind == "video") pick.video?.content else pick.audio?.content
    }

    private fun report(id: String, permille: Int) {
        val now = System.currentTimeMillis()
        val last = lastWrite[id]

        if (last != null && (permille == last.first || now - last.second < 700)) return

        lastWrite[id] = permille to now
        scope.launch { dao.setProgress(id, permille) }
    }

    private suspend fun run(id: String) {
        val saved = dao.get(id) ?: return

        dao.setStatus(id, "RUNNING", null)

        try {
            val dir = File(root(), id).apply { mkdirs() }

            if (StatFs(dir.path).availableBytes < MIN_FREE) throw IOException("Not enough free storage")

            val pick = pick(ExtractorRepository.streams(id), saved.quality)
            val parts = mutableListOf<Part>()

            pick.video?.let { parts += Part("video", File(dir, "video.mp4"), it.content) }
            pick.audio?.let { parts += Part("audio", File(dir, "audio.m4a"), it.content) }

            if (parts.isEmpty()) throw IOException("No downloadable stream was found")

            var before = 0.0

            for (part in parts) {
                val weight = if (parts.size == 1) 1.0 else if (part.kind == "video") 0.85 else 0.15

                fetch(part.file, part.url, { freshUrl(id, saved.quality, part.kind) }) { fraction ->
                    report(id, ((before + weight * fraction) * 1000).toInt().coerceIn(0, 999))
                }

                before += weight
            }

            val thumb = try {
                saveThumbnail(saved.thumbnailUrl, File(dir, "thumb.jpg"))
            } catch (_: Exception) {
                null
            }

            dao.finish(
                id,
                parts.sumOf { it.file.length() },
                parts.firstOrNull { it.kind == "video" }?.file?.path,
                parts.firstOrNull { it.kind == "audio" }?.file?.path,
                thumb
            )
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            dao.setStatus(id, "FAILED", error.message?.take(120) ?: "The download failed")
        }
    }

    private suspend fun fetch(
        target: File,
        firstUrl: String,
        refresh: suspend () -> String?,
        onFraction: (Double) -> Unit
    ) {
        if (target.isFile && target.length() > 0) {
            onFraction(1.0)
            return
        }

        val part = File(target.path + ".part")
        var url = firstUrl
        var done = part.length()
        var total = -1L
        var expired = 0
        var failures = 0
        var finished = false

        RandomAccessFile(part, "rw").use { out ->
            out.seek(done)

            while (!finished && (total < 0 || done < total)) {
                currentCoroutineContext().ensureActive()

                val request = Request.Builder().url(url).header("Range", "bytes=$done-${done + CHUNK - 1}").build()
                val before = done

                try {
                    client.newCall(request).execute().use { response ->
                        when (response.code) {
                            200, 206 -> {
                                if (response.code == 200 && done > 0) {
                                    // The server ignored the range: start the file again.
                                    out.setLength(0)
                                    out.seek(0)
                                    done = 0
                                }

                                total = if (response.code == 206) {
                                    response.header("Content-Range")?.substringAfter('/')?.toLongOrNull() ?: total
                                } else {
                                    response.body?.contentLength()?.takeIf { it > 0 } ?: total
                                }

                                val body = response.body ?: throw IOException("Empty answer from the server")
                                val buffer = ByteArray(64 * 1024)

                                body.byteStream().use { input ->
                                    while (true) {
                                        val read = input.read(buffer)

                                        if (read < 0) break

                                        out.write(buffer, 0, read)
                                        done += read

                                        if (total > 0) onFraction(done.toDouble() / total)

                                        currentCoroutineContext().ensureActive()
                                    }
                                }

                                if (response.code == 200 || (total < 0 && done - before < CHUNK)) finished = true
                            }

                            416 -> finished = true

                            403, 410 -> {
                                if (++expired > 3) throw IOException("The download link expired")

                                url = refresh() ?: throw IOException("Could not get a new download link")
                            }

                            else -> throw IOException("The server answered ${response.code}")
                        }
                    }

                    failures = 0
                } catch (error: IOException) {
                    if (++failures > 3) throw error

                    delay(1500L * failures)
                    out.seek(done)
                }
            }
        }

        if (total > 0 && done < total) throw IOException("The download stopped early")

        target.delete()

        if (!part.renameTo(target)) throw IOException("Could not save the file")
    }

    private fun saveThumbnail(url: String, file: File): String? {
        if (url.isBlank()) return null

        client.newCall(Request.Builder().url(url).build()).execute().use { response ->
            val body = response.body

            if (!response.isSuccessful || body == null) return null

            file.outputStream().use { out -> body.byteStream().copyTo(out) }

            return file.path
        }
    }
}
