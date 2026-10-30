package com.ayutube.kt.player

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import com.ayutube.kt.data.ExtractorRepository
import com.ayutube.kt.data.FeedBuilder
import com.ayutube.kt.data.HomeTopics
import com.ayutube.kt.data.SettingsStore
import com.ayutube.kt.data.VideoItem
import com.ayutube.kt.data.db.LibraryRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.schabi.newpipe.extractor.stream.AudioStream
import org.schabi.newpipe.extractor.stream.StreamInfo
import java.security.MessageDigest

data class Chapter(val title: String, val startSeconds: Int)

private data class Skip(val startMs: Long, val endMs: Long)

/**
 * The one video that is playing. It lives for the whole app, so closing the
 * watch page leaves the video playing in the mini player.
 */
class PlaybackSession(
    context: Context,
    private val settings: SettingsStore,
    private val library: LibraryRepository
) {
    private val appContext = context.applicationContext

    val ayu = AyuPlayer(context)

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val http = OkHttpClient()

    var video by mutableStateOf<VideoItem?>(null)
        private set
    var info by mutableStateOf<StreamInfo?>(null)
        private set
    var options by mutableStateOf<List<QualityOption>>(emptyList())
        private set
    var audios by mutableStateOf<List<AudioStream>>(emptyList())
        private set
    var quality by mutableStateOf<QualityOption?>(null)
        private set
    var audio by mutableStateOf<AudioStream?>(null)
        private set
    var speed by mutableFloatStateOf(1f)
        private set
    var error by mutableStateOf<String?>(null)
    var related by mutableStateOf<List<VideoItem>>(emptyList())
        private set
    var chapters by mutableStateOf<List<Chapter>>(emptyList())
        private set
    var captions by mutableStateOf<List<Caption>>(emptyList())
        private set
    var caption by mutableStateOf<String?>(null)
        private set

    var playing by mutableStateOf(false)
        private set
    var buffering by mutableStateOf(false)
        private set
    var positionMs by mutableLongStateOf(0L)
        private set
    var durationMs by mutableLongStateOf(0L)
        private set

    var inPip by mutableStateOf(false)
    var notice by mutableStateOf<String?>(null)

    private var skips: List<Skip> = emptyList()
    private var loadJob: Job? = null

    init {
        ayu.exo.addListener(object : Player.Listener {
            override fun onPlayerError(playbackError: PlaybackException) {
                error = "${playbackError.errorCodeName}\n${playbackError.cause}"
            }

            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_ENDED && settings.settings.value.autoplayNext) {
                    related.firstOrNull()?.let { open(it) }
                }
            }
        })

        scope.launch {
            var sinceSave = 0

            while (true) {
                playing = ayu.exo.isPlaying
                buffering = ayu.exo.playbackState == Player.STATE_BUFFERING
                durationMs = ayu.exo.duration.coerceAtLeast(0L)
                positionMs = ayu.exo.currentPosition

                if (playing && settings.settings.value.sponsorBlock) {
                    val hit = skips.firstOrNull { positionMs >= it.startMs && positionMs < it.endMs - 400 }

                    if (hit != null) {
                        ayu.exo.seekTo(hit.endMs)
                        notice = "Skipped a sponsor segment"
                    }
                }

                delay(250)
                sinceSave += 1

                if (sinceSave >= 40 && playing) {
                    sinceSave = 0
                    saveProgress()
                }
            }
        }
    }

    fun saveProgress() {
        val current = video ?: return
        val seconds = (ayu.exo.currentPosition / 1000).toInt()
        val length = (ayu.exo.duration.coerceAtLeast(0) / 1000).toInt()

        if (seconds > 0) scope.launch { library.saveProgress(current, seconds, length) }
    }

    /** Starts [next] unless it is already the current video. */
    fun open(next: VideoItem) {
        if (video?.id == next.id) return

        saveProgress()
        loadJob?.cancel()

        video = next
        info = null
        options = emptyList()
        audios = emptyList()
        quality = null
        audio = null
        error = null
        related = emptyList()
        chapters = emptyList()
        captions = emptyList()
        caption = null
        skips = emptyList()
        positionMs = 0L
        durationMs = 0L
        ayu.exo.stop()

        startService()
        loadJob = scope.launch { load(next) }
    }

    private fun meta(item: VideoItem): MediaMetadata = MediaMetadata.Builder()
        .setTitle(item.title)
        .setArtist(item.channel)
        .setArtworkUri(if (item.thumbnail.isNotEmpty()) Uri.parse(item.thumbnail) else null)
        .build()

    /** Keeps the video playing, with a notification, when the app is in the background. */
    private fun startService() {
        try {
            appContext.startService(Intent(appContext, PlaybackService::class.java))
        } catch (_: Exception) {
            // Playback still works while the app is open.
        }
    }

    private suspend fun load(next: VideoItem) {
        try {
            val resume = library.historyOf(next.id)?.progressSeconds?.takeIf { it > 5 }?.let { it * 1000L } ?: 0L
            val streams = ExtractorRepository.streams(next.id)

            if (video?.id != next.id) return

            info = streams
            options = ayu.qualities(streams)
            audios = ayu.audios(streams)
            chapters = streams.streamSegments.orEmpty().map { Chapter(it.title.orEmpty(), it.startTimeSeconds) }

            captions = streams.subtitles.orEmpty()
                .filter { it.isUrl }
                .map {
                    Caption(
                        label = it.displayLanguageName.orEmpty() + if (it.isAutoGenerated) " (auto)" else "",
                        language = it.languageTag.orEmpty(),
                        url = it.content,
                        mime = it.format?.mimeType ?: "text/vtt"
                    )
                }
                .take(30)

            val first = ayu.defaultQuality(options)

            if (first != null) {
                quality = first
                audio = ayu.defaultAudio(audios)
                ayu.play(first, audio, resume, meta(next), captions)
                ayu.setCaption(null)
                ayu.setSpeed(speed)
            } else if (!streams.hlsUrl.isNullOrEmpty()) {
                ayu.playHls(streams.hlsUrl, meta(next))
            } else {
                error = "No playable stream was found for this video."
            }

            loadSkips(next.id)

            // Up Next: a few of YouTube's related videos, then a mix of other topics.
            val official = ExtractorRepository.related(streams).filter { it.id != next.id }

            related = official.take(4)

            val mixed = try {
                FeedBuilder(
                    listOf(next.channel) + HomeTopics.topics.shuffled().take(5).map { it.queries.random() }
                ).nextBatch(14)
            } catch (_: Exception) {
                emptyList()
            }

            if (video?.id != next.id) return

            val seen = (official.take(4) + next).map { it.id }.toSet()

            related = official.take(4) +
                (official.drop(4).take(2) + mixed).filter { it.id !in seen }.distinctBy { it.id }
        } catch (failure: kotlinx.coroutines.CancellationException) {
            throw failure
        } catch (failure: Exception) {
            error = failure.message ?: failure.javaClass.simpleName
        }
    }

    /** SponsorBlock: parts of the video that can be skipped. */
    private suspend fun loadSkips(id: String) {
        skips = try {
            withContext(Dispatchers.IO) {
                val hash = MessageDigest.getInstance("SHA-256").digest(id.toByteArray())
                    .joinToString("") { "%02x".format(it) }.take(4)
                val url = "https://sponsor.ajay.app/api/skipSegments/$hash" +
                    "?categories=" + java.net.URLEncoder.encode(
                    "[\"sponsor\",\"selfpromo\",\"interaction\",\"intro\",\"outro\"]", "UTF-8"
                )

                http.newCall(Request.Builder().url(url).build()).execute().use { response ->
                    if (!response.isSuccessful) return@use emptyList<Skip>()

                    val videos = JSONArray(response.body?.string().orEmpty())
                    val out = mutableListOf<Skip>()

                    for (index in 0 until videos.length()) {
                        val entry = videos.getJSONObject(index)

                        if (entry.optString("videoID") != id) continue

                        val segments = entry.optJSONArray("segments") ?: continue

                        for (item in 0 until segments.length()) {
                            val segment = segments.getJSONObject(item)

                            if (segment.optString("actionType", "skip") != "skip") continue

                            val range = segment.optJSONArray("segment") ?: continue

                            out += Skip((range.getDouble(0) * 1000).toLong(), (range.getDouble(1) * 1000).toLong())
                        }
                    }

                    out
                }
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun apply(nextQuality: QualityOption, nextAudio: AudioStream?) {
        val at = ayu.exo.currentPosition

        quality = nextQuality
        audio = nextAudio
        error = null
        ayu.play(nextQuality, nextAudio, at, video?.let { meta(it) }, captions)
        ayu.setCaption(caption)
        ayu.setSpeed(speed)
    }

    /** Pass a caption's language to show it, or null to hide captions. */
    fun selectCaption(language: String?) {
        caption = language
        ayu.setCaption(language)
    }

    fun changeSpeed(value: Float) {
        speed = value
        ayu.setSpeed(value)
    }

    fun togglePlay() {
        if (ayu.isEnded) ayu.exo.seekTo(0)

        if (ayu.exo.isPlaying) ayu.exo.pause() else ayu.exo.play()
    }

    fun seekTo(ms: Long) {
        val target = ms.coerceIn(0L, ayu.exo.duration.coerceAtLeast(0L))

        ayu.exo.seekTo(target)
        positionMs = target
    }

    /** Stops playing and forgets the video (the mini player closes). */
    fun stop() {
        saveProgress()
        loadJob?.cancel()
        ayu.exo.stop()
        video = null
        info = null
        related = emptyList()
        chapters = emptyList()
        skips = emptyList()
        playing = false
        appContext.stopService(Intent(appContext, PlaybackService::class.java))
    }
}
