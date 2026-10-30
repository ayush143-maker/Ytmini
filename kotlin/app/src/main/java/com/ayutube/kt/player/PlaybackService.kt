package com.ayutube.kt.player

import android.content.Intent
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
        mediaSession = MediaSession.Builder(this, AyuApp.container.playback.ayu.exo).build()
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
