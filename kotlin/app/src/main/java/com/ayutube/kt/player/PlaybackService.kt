package com.ayutube.kt.player

import android.content.Intent
import android.net.Uri
import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.ayutube.kt.AyuApp

/**
 * Lets the video keep playing as audio when the app is in the background,
 * with a notification (play, pause, seek) and lock-screen controls.
 */
class PlaybackService : MediaSessionService() {
    private var mediaSession: MediaSession? = null

    override fun onCreate() {
        super.onCreate()
        mediaSession = MediaSession.Builder(this, NotificationPlayer(AyuApp.container.playback.ayu.exo)).build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = mediaSession

    override fun onTaskRemoved(rootIntent: Intent?) {
        val player = mediaSession?.player

        // Swiping the app away stops the service unless something is playing.
        if (player == null || !player.playWhenReady) stopSelf()
    }

    override fun onDestroy() {
        mediaSession?.release()
        mediaSession = null
        super.onDestroy()
    }
}

/**
 * What the notification and lock screen see. The title, channel, picture and length always come
 * from the video the app is playing, so the phone knows what is playing even if the stream itself
 * carries no tags.
 */
private class NotificationPlayer(player: Player) : ForwardingPlayer(player) {
    override fun getMediaMetadata(): MediaMetadata {
        val base = super.getMediaMetadata()
        val session = AyuApp.container.playback
        val video = session.video ?: return base

        val builder = base.buildUpon()
            .setTitle(video.title)
            .setArtist(video.channel)
            .setDisplayTitle(video.title)

        if (video.thumbnail.isNotEmpty()) builder.setArtworkUri(Uri.parse(video.thumbnail))

        val length = super.getDuration().takeIf { it > 0L } ?: session.durationMs.takeIf { it > 0L }

        if (length != null) builder.setDurationMs(length)

        return builder.build()
    }
}
