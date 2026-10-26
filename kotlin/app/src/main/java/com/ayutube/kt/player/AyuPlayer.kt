package com.ayutube.kt.player

import android.content.Context
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.exoplayer.source.MergingMediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import okhttp3.OkHttpClient
import org.schabi.newpipe.extractor.stream.DeliveryMethod
import org.schabi.newpipe.extractor.stream.Stream
import org.schabi.newpipe.extractor.stream.StreamInfo
import org.schabi.newpipe.extractor.stream.VideoStream

enum class StreamMode { ADAPTIVE, MUXED }

data class ChosenStream(val label: String, val source: MediaSource)

/** ExoPlayer wrapper that plays what NewPipeExtractor found. */
@OptIn(UnstableApi::class)
class AyuPlayer(context: Context) {
    private val dataFactory: DataSource.Factory = OkHttpDataSource.Factory(
        OkHttpClient.Builder()
            .addInterceptor { chain ->
                chain.proceed(
                    chain.request().newBuilder()
                        .header("User-Agent", userAgentFor(chain.request().url.toString()))
                        .build()
                )
            }
            .build()
    )

    val exo: ExoPlayer = ExoPlayer.Builder(context).build()

    private fun progressive(stream: Stream) =
        stream.isUrl && stream.deliveryMethod == DeliveryMethod.PROGRESSIVE_HTTP

    private fun isMp4(stream: Stream) = stream.format?.mimeType?.contains("mp4") == true

    private fun progressiveSource(url: String): MediaSource =
        ProgressiveMediaSource.Factory(dataFactory).createMediaSource(MediaItem.fromUri(url))

    fun choose(info: StreamInfo, mode: StreamMode): ChosenStream? {
        val muxed = info.videoStreams.filter { progressive(it) }.maxByOrNull { it.height }

        val audioAll = info.audioStreams.filter { progressive(it) }
        val audio = audioAll.filter { isMp4(it) }.ifEmpty { audioAll }.maxByOrNull { it.averageBitrate }

        val video = info.videoOnlyStreams
            .filter { progressive(it) && it.height in 1..720 }
            .sortedWith(
                compareByDescending<VideoStream> { isMp4(it) }.thenByDescending { it.height }
            )
            .firstOrNull()

        if (mode == StreamMode.ADAPTIVE && video != null && audio != null) {
            return ChosenStream(
                "adaptive ${video.height}p + audio ${audio.averageBitrate}k",
                MergingMediaSource(progressiveSource(video.content), progressiveSource(audio.content))
            )
        }

        if (muxed != null) {
            return ChosenStream("muxed ${muxed.height}p", progressiveSource(muxed.content))
        }

        val hls = info.hlsUrl
        if (!hls.isNullOrEmpty()) {
            return ChosenStream(
                "hls",
                HlsMediaSource.Factory(dataFactory).createMediaSource(MediaItem.fromUri(hls))
            )
        }

        return null
    }

    fun prepare(info: StreamInfo, mode: StreamMode, positionMs: Long): ChosenStream? {
        val chosen = choose(info, mode) ?: return null

        exo.setMediaSource(chosen.source, positionMs)
        exo.prepare()
        exo.playWhenReady = true

        return chosen
    }

    /** One line of diagnostics for the on-screen readout. */
    fun snapshot(): String {
        val state = when (exo.playbackState) {
            Player.STATE_BUFFERING -> "buffering"
            Player.STATE_READY -> if (exo.isPlaying) "playing" else "paused"
            Player.STATE_ENDED -> "ended"
            else -> "idle"
        }

        return "$state  ${exo.currentPosition / 1000}s / ${exo.duration.coerceAtLeast(0) / 1000}s" +
            "  buffered ${exo.bufferedPosition / 1000}s"
    }

    fun release() {
        exo.release()
    }

    companion object {
        private const val UA_WEB =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0"
        private const val UA_ANDROID =
            "com.google.android.youtube/19.44.38 (Linux; U; Android 14; en_US) gzip"
        private const val UA_ANDROID_VR =
            "com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip"
        private const val UA_IOS =
            "com.google.ios.youtube/20.03.02 (iPhone16,2; U; CPU iOS 18_2_1 like Mac OS X;)"

        private val client = Regex("[?&]c=([A-Z_]+)")

        /** YouTube wants the user agent of the client that produced the URL. */
        fun userAgentFor(url: String): String =
            when (client.find(url)?.groupValues?.get(1)) {
                "IOS" -> UA_IOS
                "ANDROID_VR" -> UA_ANDROID_VR
                "ANDROID" -> UA_ANDROID
                else -> UA_WEB
            }
    }
}
