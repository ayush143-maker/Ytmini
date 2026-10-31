package com.ayutube.kt.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.dp

private val BarShape = RoundedCornerShape(2.dp)
private val SkeletonBase = Color(0xFF1A1A1A)
private val SkeletonGlow = Color(0xFF303030)

/** A grey block with a soft light that sweeps across it, while content is loading. */
fun Modifier.shimmer(shape: Shape = RectangleShape): Modifier = composed {
    val transition = rememberInfiniteTransition(label = "shimmer")
    val phase by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(1300, easing = LinearEasing), RepeatMode.Restart),
        label = "phase"
    )

    clip(shape).drawWithCache {
        val band = size.width * 0.6f

        onDrawBehind {
            drawRect(SkeletonBase)

            val start = -band + (size.width + band) * phase

            drawRect(
                Brush.horizontalGradient(
                    colors = listOf(SkeletonGlow.copy(alpha = 0f), SkeletonGlow, SkeletonGlow.copy(alpha = 0f)),
                    startX = start,
                    endX = start + band
                )
            )
        }
    }
}

/** Same layout as VideoCard: 16:9 picture, round channel picture, two text lines. */
@Composable
fun VideoCardSkeleton(modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().padding(bottom = 18.dp)) {
        // Explicit 16:9 height, so the picture never stretches to fill the screen.
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            Box(Modifier.fillMaxWidth().height(maxWidth * 9f / 16f).shimmer())
        }

        Row(Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp)) {
            Box(Modifier.size(38.dp).shimmer(CircleShape))

            Column(Modifier.weight(1f).padding(start = 12.dp)) {
                Box(Modifier.fillMaxWidth(0.94f).height(14.dp).shimmer(BarShape))
                Spacer(Modifier.height(8.dp))
                Box(Modifier.fillMaxWidth(0.6f).height(12.dp).shimmer(BarShape))
            }
        }
    }
}

/** A few video cards in a column, for a screen that has nothing to show yet. */
@Composable
fun VideoListSkeleton(modifier: Modifier = Modifier, count: Int = 3) {
    LazyColumn(modifier.fillMaxWidth(), userScrollEnabled = false) {
        items(count) { VideoCardSkeleton(Modifier.padding(top = 8.dp)) }
    }
}

/** Search result row for a channel. */
@Composable
fun ChannelRowSkeleton() {
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
        Box(Modifier.size(64.dp).shimmer(CircleShape))

        Column(Modifier.weight(1f).padding(start = 16.dp)) {
            Box(Modifier.fillMaxWidth(0.5f).height(15.dp).shimmer(BarShape))
            Spacer(Modifier.height(8.dp))
            Box(Modifier.fillMaxWidth(0.3f).height(12.dp).shimmer(BarShape))
            Spacer(Modifier.height(8.dp))
            Box(Modifier.fillMaxWidth(0.8f).height(12.dp).shimmer(BarShape))
        }
    }
}

/** Search or channel row for a playlist: picture on the left, text on the right. */
@Composable
fun PlaylistRowSkeleton(pictureWidth: Int = 150) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp)) {
        Box(Modifier.width(pictureWidth.dp).aspectRatio(16f / 9f).shimmer())

        Column(Modifier.weight(1f).padding(start = 12.dp)) {
            Box(Modifier.fillMaxWidth(0.9f).height(14.dp).shimmer(BarShape))
            Spacer(Modifier.height(8.dp))
            Box(Modifier.fillMaxWidth(0.5f).height(12.dp).shimmer(BarShape))
        }
    }
}

/** Top of a channel page: banner, round picture, name and the Follow button. */
@Composable
fun ChannelHeaderSkeleton() {
    Column(Modifier.fillMaxWidth()) {
        Box(Modifier.fillMaxWidth().aspectRatio(16f / 5f).shimmer())

        Row(Modifier.padding(16.dp)) {
            Box(Modifier.size(72.dp).shimmer(CircleShape))

            Column(Modifier.weight(1f).padding(start = 16.dp)) {
                Spacer(Modifier.height(8.dp))
                Box(Modifier.fillMaxWidth(0.6f).height(20.dp).shimmer(BarShape))
                Spacer(Modifier.height(10.dp))
                Box(Modifier.fillMaxWidth(0.35f).height(13.dp).shimmer(BarShape))
            }
        }

        Box(Modifier.padding(horizontal = 16.dp).width(110.dp).height(40.dp).shimmer())
        Spacer(Modifier.height(16.dp))
    }
}

/** Top of a playlist page: title, details and the save button. */
@Composable
fun PlaylistHeaderSkeleton() {
    Column(Modifier.fillMaxWidth().padding(16.dp)) {
        Box(Modifier.fillMaxWidth(0.65f).height(22.dp).shimmer(BarShape))
        Spacer(Modifier.height(10.dp))
        Box(Modifier.fillMaxWidth(0.4f).height(13.dp).shimmer(BarShape))
        Spacer(Modifier.height(14.dp))
        Box(Modifier.width(130.dp).height(40.dp).shimmer())
    }
}
