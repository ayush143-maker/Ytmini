package com.ayutube.kt.ui.home

import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyHorizontalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.shape.RoundedCornerShape
import coil.compose.AsyncImage
import com.ayutube.kt.data.VideoItem
import com.ayutube.kt.ui.components.formatClock
import com.ayutube.kt.ui.components.shimmer
import com.ayutube.kt.ui.theme.Ay

/** Cards in the sideways rows are 90% as wide as a normal full-width video picture. */
@Composable
private fun cardWidth(): Dp = (LocalConfiguration.current.screenWidthDp * 0.9f).dp

/** Title above a Home section ("Continue Watching", "Trending Now", "Feed"). */
@Composable
fun HomeTitle(text: String) {
    Text(
        text,
        fontSize = 18.sp,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 22.dp, bottom = 10.dp)
    )
}

/** A small card for the sideways rows: picture, duration, optional watched bar, title, channel. */
@Composable
fun CompactVideoCard(video: VideoItem, width: Dp, progress: Float? = null, onClick: () -> Unit) {
    Column(Modifier.width(width).clickable(onClick = onClick)) {
        Box {
            AsyncImage(
                model = video.thumbnail,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f).background(Ay.Slate)
            )

            if (video.durationSec > 0) {
                val lift = if (progress != null && progress > 0f) 3.dp else 0.dp

                Text(
                    formatClock(video.durationSec),
                    color = Color.White,
                    fontSize = 11.sp,
                    lineHeight = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.align(Alignment.BottomEnd).padding(bottom = lift)
                        .background(Color(0xE6000000))
                        .padding(horizontal = 5.dp, vertical = 2.dp)
                )
            }

            if (progress != null && progress > 0f) {
                Box(Modifier.align(Alignment.BottomStart).fillMaxWidth().height(3.dp).background(Ay.Steel)) {
                    Box(Modifier.fillMaxWidth(progress.coerceIn(0f, 1f)).height(3.dp).background(Ay.Pink))
                }
            }
        }

        Text(
            video.title,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            lineHeight = 18.sp,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 7.dp)
        )
        Text(
            video.channel,
            fontSize = 12.sp,
            color = Ay.Dim,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 2.dp)
        )
    }
}

/** Videos the person started but did not finish, in one sideways row. */
@Composable
fun ContinueRow(items: List<ContinueItem>, onOpen: (VideoItem) -> Unit) {
    val width = cardWidth()

    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        items(items, key = { entry -> entry.video.id }) { entry ->
            CompactVideoCard(entry.video, width, entry.progress) { onOpen(entry.video) }
        }
    }
}

/** Some videos in one sideways row (used for "Because you watched ..."). */
@Composable
fun VideoRow(videos: List<VideoItem>, onOpen: (VideoItem) -> Unit) {
    val width = cardWidth()

    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        items(videos, key = { video -> video.id }) { video ->
            CompactVideoCard(video, width) { onOpen(video) }
        }
    }
}

/** Two sideways rows of trending videos. Each row scrolls on its own; more are asked for near either end. */
@Composable
fun TrendingGrid(
    videos: List<VideoItem>,
    loading: Boolean,
    onOpen: (VideoItem) -> Unit,
    onEnd: () -> Unit
) {
    val width = cardWidth()
    val top = remember(videos) { videos.filterIndexed { index, _ -> index % 2 == 0 } }
    val bottom = remember(videos) { videos.filterIndexed { index, _ -> index % 2 == 1 } }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        TrendingRow(top, loading, width, onOpen, onEnd)
        TrendingRow(bottom, loading, width, onOpen, onEnd)
    }
}

@Composable
private fun TrendingRow(
    videos: List<VideoItem>,
    loading: Boolean,
    width: Dp,
    onOpen: (VideoItem) -> Unit,
    onEnd: () -> Unit
) {
    val state = rememberLazyListState()
    val nearEnd by remember(videos.size) {
        derivedStateOf {
            val last = state.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0

            videos.isNotEmpty() && last >= videos.size - 2
        }
    }

    LaunchedEffect(nearEnd, videos.size) {
        if (nearEnd) onEnd()
    }

    LazyRow(
        state = state,
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        if (videos.isEmpty() && loading) {
            items(4) {
                Column(Modifier.width(width)) {
                    Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f).shimmer())
                    Box(Modifier.padding(top = 8.dp).fillMaxWidth(0.9f).height(12.dp).shimmer())
                    Box(Modifier.padding(top = 6.dp).fillMaxWidth(0.5f).height(11.dp).shimmer())
                }
            }
        }

        items(videos, key = { video -> video.id }) { video ->
            CompactVideoCard(video, width) { onOpen(video) }
        }
    }
}
