package com.ayutube.app.data

import android.content.Context
import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer

/** Native Media3 controller. The Activity owns this controller's lifetime. */
class PlaybackController(context: Context) {
    val player: ExoPlayer = ExoPlayer.Builder(context.applicationContext).build()

    fun play(uri: String, startPositionMs: Long = 0L, autoPlay: Boolean = true) {
        require(uri.startsWith("https://") || uri.startsWith("content://")) { "Unsupported media URL" }
        player.setMediaItem(MediaItem.fromUri(Uri.parse(uri)), startPositionMs.coerceAtLeast(0L))
        player.prepare()
        player.playWhenReady = autoPlay
    }

    fun pause() = player.pause()
    fun resume() = player.play()
    fun seekTo(positionMs: Long) = player.seekTo(positionMs.coerceAtLeast(0L))

    fun setSpeed(speed: Float) {
        require(speed in 0.25f..3.0f) { "Playback speed must be between 0.25x and 3x" }
        player.setPlaybackSpeed(speed)
    }

    fun release() = player.release()
}
