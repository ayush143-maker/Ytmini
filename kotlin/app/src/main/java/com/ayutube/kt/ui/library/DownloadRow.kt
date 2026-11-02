package com.ayutube.kt.ui.library

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.ayutube.kt.AyuApp
import com.ayutube.kt.data.VideoItem
import com.ayutube.kt.data.db.DownloadEntity
import com.ayutube.kt.data.formatSize
import com.ayutube.kt.ui.components.AyIcons
import com.ayutube.kt.ui.components.formatClock
import com.ayutube.kt.ui.theme.Ay
import java.io.File

/** One downloaded (or downloading) video: picture, title, status, a thin progress line and two small buttons. */
@Composable
fun DownloadRow(row: DownloadEntity, onOpen: (VideoItem) -> Unit) {
    val downloader = AyuApp.container.downloader
    val done = row.status == "DONE"
    val running = row.status == "RUNNING" || row.status == "QUEUED"

    val video = VideoItem(
        id = row.videoId,
        title = row.title,
        channel = row.channelTitle,
        channelId = row.channelId,
        thumbnail = row.thumbnailUrl,
        durationSec = row.durationSeconds.toLong(),
        views = -1,
        uploaded = "",
        avatar = ""
    )

    val quality = if (row.quality == 0) "Audio only" else "${row.quality}p"

    val status = when (row.status) {
        "DONE" -> "Saved \u00B7 ${formatSize(row.sizeBytes)} \u00B7 $quality"
        "RUNNING" -> "Downloading \u00B7 ${row.progress / 10}%"
        "QUEUED" -> "Waiting\u2026"
        "PAUSED" -> "Paused \u00B7 ${row.progress / 10}%"
        else -> "Failed" + (row.error?.let { ": $it" } ?: "")
    }

    Row(
        Modifier.fillMaxWidth()
            .clickable {
                when {
                    done -> onOpen(video)
                    running -> downloader.pause(row.videoId)
                    else -> downloader.resume(row.videoId)
                }
            }
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.width(132.dp).aspectRatio(16f / 9f).background(Ay.Slate)) {
            AsyncImage(
                model = row.thumbPath?.let { File(it) } ?: row.thumbnailUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )

            if (row.durationSeconds > 0) {
                Text(
                    formatClock(row.durationSeconds.toLong()),
                    color = Color.White,
                    fontSize = 11.sp,
                    lineHeight = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.align(Alignment.BottomEnd).background(Color(0xE6000000))
                        .padding(horizontal = 5.dp, vertical = 2.dp)
                )
            }
        }

        Column(Modifier.weight(1f).padding(start = 12.dp, end = 4.dp)) {
            Text(
                row.title,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                lineHeight = 18.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                status,
                fontSize = 12.sp,
                color = if (row.status == "FAILED") Ay.Pink else Ay.Dim,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 4.dp)
            )

            if (!done) {
                Box(Modifier.padding(top = 6.dp).fillMaxWidth().height(3.dp).background(Ay.Steel)) {
                    Box(
                        Modifier.fillMaxWidth((row.progress / 1000f).coerceIn(0f, 1f)).height(3.dp).background(Ay.Pink)
                    )
                }
            }
        }

        if (!done) {
            Box(
                Modifier.size(40.dp).clickable {
                    if (running) downloader.pause(row.videoId) else downloader.resume(row.videoId)
                },
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    if (running) AyIcons.Pause else AyIcons.Play,
                    contentDescription = if (running) "Pause" else "Resume",
                    tint = Ay.Paper,
                    modifier = Modifier.size(22.dp)
                )
            }
        }

        Box(
            Modifier.size(40.dp).clickable { downloader.delete(row.videoId) },
            contentAlignment = Alignment.Center
        ) {
            Icon(AyIcons.Trash, contentDescription = "Delete", tint = Ay.Paper, modifier = Modifier.size(22.dp))
        }
    }
}
