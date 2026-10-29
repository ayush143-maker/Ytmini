package com.ayutube.kt.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.ayutube.kt.AyuApp
import com.ayutube.kt.ui.theme.Ay

/** The video keeps playing here when the watch page is closed. */
@Composable
fun MiniPlayer(onExpand: () -> Unit) {
    val session = remember { AyuApp.container.playback }
    val video = session.video ?: return
    val fraction = if (session.durationMs > 0) session.positionMs.toFloat() / session.durationMs else 0f

    Column(Modifier.fillMaxWidth().background(Ay.SlateHi).clickable(onClick = onExpand)) {
        Box(Modifier.fillMaxWidth().height(2.dp).background(Ay.Steel)) {
            Box(Modifier.fillMaxWidth(fraction.coerceIn(0f, 1f)).height(2.dp).background(Ay.Pink))
        }

        Row(Modifier.fillMaxWidth().height(60.dp), verticalAlignment = Alignment.CenterVertically) {
            AndroidView(
                factory = { ctx ->
                    PlayerView(ctx).apply {
                        player = session.ayu.exo
                        useController = false
                        resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                    }
                },
                update = { it.player = session.ayu.exo },
                modifier = Modifier.padding(start = 8.dp).width(96.dp).height(54.dp).background(Ay.Ink)
            )

            Column(Modifier.weight(1f).padding(horizontal = 10.dp)) {
                Text(video.title, fontSize = 13.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(video.channel, fontSize = 11.sp, color = Ay.Dim, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }

            Box(Modifier.size(44.dp).clickable { session.togglePlay() }, contentAlignment = Alignment.Center) {
                Icon(
                    if (session.playing) AyIcons.Pause else AyIcons.Play,
                    contentDescription = if (session.playing) "Pause" else "Play",
                    tint = Ay.Paper,
                    modifier = Modifier.size(24.dp)
                )
            }

            Box(Modifier.size(44.dp).clickable { session.stop() }, contentAlignment = Alignment.Center) {
                Icon(AyIcons.Close, contentDescription = "Close", tint = Ay.Paper, modifier = Modifier.size(22.dp))
            }
        }
    }
}
