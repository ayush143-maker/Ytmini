package com.ayutube.kt.data

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.ayutube.kt.AyuApp
import com.ayutube.kt.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch

/** Keeps downloads alive in the background and shows their progress in a notification. */
class DownloadService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var watching: Job? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        ensureChannel()

        try {
            ServiceCompat.startForeground(
                this,
                NOTIFICATION_ID,
                notification("Starting\u2026", 0, 1),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } catch (_: Exception) {
            stopSelf()
            return START_NOT_STICKY
        }

        if (watching == null) {
            val container = AyuApp.container

            watching = scope.launch {
                combine(container.downloader.active, container.downloads.observeActive()) { count, rows -> count to rows }
                    .collect { (count, rows) ->
                        if (count == 0) {
                            stopForeground(STOP_FOREGROUND_REMOVE)
                            stopSelf()
                        } else {
                            val current = rows.firstOrNull { it.status == "RUNNING" } ?: rows.firstOrNull()

                            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).notify(
                                NOTIFICATION_ID,
                                notification(current?.title ?: "Downloading", current?.progress ?: 0, count)
                            )
                        }
                    }
            }
        }

        return START_NOT_STICKY
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    private fun ensureChannel() {
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager

        manager.createNotificationChannel(NotificationChannel(CHANNEL, "Downloads", NotificationManager.IMPORTANCE_LOW))
    }

    private fun notification(title: String, progress: Int, count: Int): Notification {
        val open = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle(if (count > 1) "Downloading $count videos" else "Downloading")
            .setContentText(title)
            .setProgress(1000, progress, false)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(open)
            .build()
    }

    companion object {
        private const val CHANNEL = "downloads"
        private const val NOTIFICATION_ID = 4107

        fun start(context: Context) {
            try {
                ContextCompat.startForegroundService(context, Intent(context, DownloadService::class.java))
            } catch (_: Exception) {
                // The download carries on while the app is open.
            }
        }
    }
}
