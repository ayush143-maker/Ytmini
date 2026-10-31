package com.ayutube.kt.player

import android.content.Context
import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.exoplayer.source.MergingMediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.exoplayer.source.SingleSampleMediaSource
import androidx.media3.extractor.ExtractorsFactory
import androidx.media3.extractor.text.DefaultSubtitleParserFactory
import androidx.media3.extractor.text.SubtitleExtractor
import okhttp3.OkHttpClient
import org.schabi.newpipe.extractor.stream.AudioStream
import org.schabi.newpipe.extractor.stream.DeliveryMethod
import org.schabi.newpipe.extractor.stream.Stream
import org.schabi.newpipe.extractor.stream.StreamInfo
import org.schabi.newpipe.extractor.stream.VideoStream

/** A subtitle track the person can switch on. */
data class Caption(val label: String, val language: String, val url: String, val mime: String)

/** One entry in the quality menu. */
data class QualityOption(val label: String, val video: VideoStream, val muxed: Boolean)

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

    val exo: ExoPlayer = ExoPlayer.Builder(context)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                .build(),
            true
        )
        .setHandleAudioBecomingNoisy(true)
        .build()

    private fun progressive(stream: Stream) =
        stream.isUrl && stream.deliveryMethod == DeliveryMethod.PROGRESSIVE_HTTP

    private fun isMp4(stream: Stream) = stream.format?.mimeType?.contains("mp4") == true

    private fun source(url: String, meta: MediaMetadata? = null): MediaSource {
        val item = MediaItem.Builder().setUri(url).apply { if (meta != null) setMediaMetadata(meta) }.build()

        return ProgressiveMediaSource.Factory(dataFactory).createMediaSource(item)
    }

    /** Quality choices, best first: adaptive (separate audio) then the muxed fallback. */
    fun qualities(info: StreamInfo): List<QualityOption> {
        val adaptive = info.videoOnlyStreams
            .filter { progressive(it) && it.height > 0 }
            .groupBy { it.height }
            .map { (height, streams) ->
                val best = streams.sortedWith(
                    compareByDescending<VideoStream> { isMp4(it) }.thenByDescending { it.bitrate }
                ).first()

                QualityOption("${height}p", best, false)
            }
            .sortedByDescending { it.video.height }

        val muxed = info.videoStreams
            .filter { progressive(it) && it.height > 0 }
            .maxByOrNull { it.height }
            ?.let { QualityOption("${it.height}p with audio", it, true) }

        return adaptive + listOfNotNull(muxed)
    }

    fun audios(info: StreamInfo): List<AudioStream> =
        info.audioStreams.filter { progressive(it) }.sortedByDescending { it.averageBitrate }

    /** Highest adaptive quality up to 720p, else the muxed stream, else the first. */
    fun defaultQuality(options: List<QualityOption>): QualityOption? =
        options.filter { !it.muxed && it.video.height <= 720 }.maxByOrNull { it.video.height }
            ?: options.firstOrNull { it.muxed }
            ?: options.firstOrNull()

    fun defaultAudio(audios: List<AudioStream>): AudioStream? =
        audios.filter { isMp4(it) }.ifEmpty { audios }.maxByOrNull { it.averageBitrate }

    /** Plays [option] (with [audio] unless it is muxed) from [positionMs]. */
    fun play(
        option: QualityOption,
        audio: AudioStream?,
        positionMs: Long,
        meta: MediaMetadata? = null,
        captions: List<Caption> = emptyList()
    ) {
        val video = source(option.video.content, meta)

        val parsers = DefaultSubtitleParserFactory()

        val subtitles = captions.mapNotNull { caption ->
            try {
                val format = Format.Builder()
                    .setSampleMimeType(caption.mime)
                    .setLanguage(caption.language)
                    .setLabel(caption.label)
                    .setSelectionFlags(0)
                    .build()
                val extractors = ExtractorsFactory { arrayOf(SubtitleExtractor(parsers.create(format), format)) }

                ProgressiveMediaSource.Factory(dataFactory, extractors)
                    .createMediaSource(MediaItem.fromUri(Uri.parse(caption.url)))
            } catch (_: Exception) {
                null
            }
        }

        val parts = mutableListOf(video)

        if (!option.muxed && audio != null) parts += source(audio.content)

        parts += subtitles

        val media = if (parts.size == 1) video else MergingMediaSource(*parts.toTypedArray())

        exo.setMediaSource(media, positionMs)
        exo.prepare()
        exo.playWhenReady = true
    }

    fun playHls(url: String, meta: MediaMetadata? = null) {
        val item = MediaItem.Builder().setUri(url).apply { if (meta != null) setMediaMetadata(meta) }.build()

        exo.setMediaSource(HlsMediaSource.Factory(dataFactory).createMediaSource(item))
        exo.prepare()
        exo.playWhenReady = true
    }

    /** Shows the caption track in [language], or hides captions when null. */
    fun setCaption(language: String?) {
        exo.trackSelectionParameters = exo.trackSelectionParameters.buildUpon()
            .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, language == null)
            .apply { if (language != null) setPreferredTextLanguage(language) }
            .build()
    }

    fun setSpeed(speed: Float) {
        exo.playbackParameters = PlaybackParameters(speed)
    }

    val isEnded get() = exo.playbackState == Player.STATE_ENDED

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
