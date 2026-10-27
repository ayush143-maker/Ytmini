package com.ayutube.kt.ui.components

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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.ayutube.kt.data.AvatarCache
import com.ayutube.kt.data.VideoItem
import com.ayutube.kt.ui.theme.Ay

fun formatClock(total: Long): String {
    val hours = total / 3600
    val minutes = (total % 3600) / 60
    val seconds = total % 60

    return if (hours > 0) "%d:%02d:%02d".format(hours, minutes, seconds)
    else "%d:%02d".format(minutes, seconds)
}

fun viewsText(views: Long): String = when {
    views < 0 -> ""
    views >= 1_000_000 -> "%.1fM views".format(views / 1_000_000.0)
    views >= 1_000 -> "%.1fK views".format(views / 1_000.0)
    else -> "$views views"
}

/** A round channel picture; falls back to the first letter. */
@Composable
fun ChannelAvatar(name: String, url: String, channelId: String, size: Int = 38) {
    val picture by produceState(url, channelId, url) {
        if (url.isEmpty() && channelId.isNotEmpty()) value = AvatarCache.get(channelId)
    }

    Box(
        Modifier.size(size.dp).clip(CircleShape).background(Color(0xFF1C1C1F)),
        contentAlignment = Alignment.Center
    ) {
        if (picture.isNotEmpty()) {
            AsyncImage(
                model = picture,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
        } else {
            Text(name.trim().take(1).uppercase(), color = Ay.Bone, fontWeight = FontWeight.Bold)
        }
    }
}

/**
 * YouTube-style card: full-width 16:9 thumbnail, duration badge, watched bar,
 * channel picture, two-line title and "channel . views . age".
 */
@Composable
fun VideoCard(
    video: VideoItem,
    modifier: Modifier = Modifier,
    progress: Float? = null,
    onMore: (() -> Unit)? = null,
    onChannel: (() -> Unit)? = null,
    onClick: () -> Unit
) {
    Column(modifier.fillMaxWidth().clickable(onClick = onClick).padding(bottom = 18.dp)) {
        Box {
            AsyncImage(
                model = video.thumbnail,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f).background(Ay.Slate)
            )

            if (video.durationSec > 0) {
                Text(
                    formatClock(video.durationSec),
                    color = Color.White,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.align(Alignment.BottomEnd).padding(8.dp)
                        .background(Color(0xCC000000)).padding(horizontal = 6.dp, vertical = 2.dp)
                )
            }

            if (progress != null && progress > 0f) {
                Box(Modifier.align(Alignment.BottomStart).fillMaxWidth().height(3.dp).background(Ay.Steel)) {
                    Box(Modifier.fillMaxWidth(progress.coerceIn(0f, 1f)).height(3.dp).background(Ay.Pink))
                }
            }
        }

        Row(Modifier.padding(start = 16.dp, end = 4.dp, top = 12.dp)) {
            Box(Modifier.clickable(enabled = onChannel != null) { onChannel?.invoke() }) {
                ChannelAvatar(video.channel, video.avatar, video.channelId)
            }

            Column(Modifier.weight(1f).padding(start = 12.dp)) {
                Text(
                    video.title,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Medium,
                    lineHeight = 20.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    listOf(video.channel, viewsText(video.views), video.uploaded)
                        .filter { it.isNotEmpty() }
                        .joinToString(" \u00B7 "),
                    fontSize = 12.5.sp,
                    color = Ay.Dim,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 3.dp)
                )
            }

            if (onMore != null) {
                Box(Modifier.size(40.dp).clickable(onClick = onMore), contentAlignment = Alignment.Center) {
                    Icon(AyIcons.More, contentDescription = "More", tint = Ay.Fog, modifier = Modifier.size(22.dp))
                }
            }
        }
    }
}
