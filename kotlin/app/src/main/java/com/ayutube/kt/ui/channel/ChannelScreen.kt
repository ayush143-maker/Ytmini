package com.ayutube.kt.ui.channel

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.ayutube.kt.AyuApp
import com.ayutube.kt.data.ChannelDetail
import com.ayutube.kt.data.ExtractorRepository
import com.ayutube.kt.data.PlaylistSummary
import com.ayutube.kt.data.VideoItem
import com.ayutube.kt.ui.components.AyButton
import com.ayutube.kt.ui.components.AyIcons
import com.ayutube.kt.ui.components.ChannelAvatar
import com.ayutube.kt.ui.components.TabStrip
import com.ayutube.kt.ui.components.VideoCard
import com.ayutube.kt.ui.theme.Ay
import kotlinx.coroutines.launch
import org.schabi.newpipe.extractor.Page

private fun subscribersText(count: Long): String = when {
    count < 0 -> ""
    count >= 1_000_000 -> "%.1fM subscribers".format(count / 1_000_000.0)
    count >= 1_000 -> "%.1fK subscribers".format(count / 1_000.0)
    else -> "$count subscribers"
}

@Composable
fun ChannelScreen(
    channelId: String,
    nameHint: String,
    onBack: () -> Unit,
    onOpen: (VideoItem) -> Unit,
    onMore: (VideoItem) -> Unit,
    onPlaylist: (PlaylistSummary) -> Unit
) {
    val library = remember { AyuApp.container.library }
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()

    var detail by remember { mutableStateOf<ChannelDetail?>(null) }
    var videos by remember { mutableStateOf<List<VideoItem>>(emptyList()) }
    var next by remember { mutableStateOf<Page?>(null) }
    var playlists by remember { mutableStateOf<List<PlaylistSummary>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var loadingMore by remember { mutableStateOf(false) }
    var following by remember { mutableStateOf(false) }
    var tab by remember { mutableIntStateOf(0) }
    var aboutOpen by remember { mutableStateOf(false) }

    LaunchedEffect(channelId) {
        following = library.channelPrefs().any { it.channelKey == channelId && it.kind == "follow" }

        try {
            val loaded = ExtractorRepository.channel(channelId)

            detail = loaded
            videos = loaded.videos.items
            next = loaded.videos.next
        } catch (failure: Exception) {
            error = failure.message ?: failure.javaClass.simpleName
        }
    }

    LaunchedEffect(tab) {
        if (tab == 1 && playlists == null) {
            playlists = try {
                ExtractorRepository.channelPlaylists(channelId)
            } catch (_: Exception) {
                emptyList()
            }
        }
    }

    val nearEnd by remember {
        derivedStateOf {
            val last = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            last >= listState.layoutInfo.totalItemsCount - 3
        }
    }

    LaunchedEffect(nearEnd, videos.size, tab) {
        val page = next

        if (tab == 0 && nearEnd && page != null && !loadingMore) {
            loadingMore = true

            try {
                val more = ExtractorRepository.channelMore(channelId, page, detail?.name ?: nameHint)
                val known = videos.map { it.id }.toSet()

                videos = videos + more.items.filter { it.id !in known }
                next = more.next
            } catch (_: Exception) {
                // The next scroll tries again.
            } finally {
                loadingMore = false
            }
        }
    }

    Column(Modifier.fillMaxSize().background(Ay.Ink)) {
        Row(Modifier.fillMaxWidth().height(48.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(48.dp).clickable(onClick = onBack), contentAlignment = Alignment.Center) {
                Icon(AyIcons.Back, contentDescription = "Back", tint = Ay.Paper, modifier = Modifier.size(24.dp))
            }
            Text(
                detail?.name ?: nameHint,
                fontSize = 17.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }

        LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
            val info = detail

            if (info == null && error == null) {
                item {
                    Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = Ay.Pink)
                    }
                }
            }

            error?.let { item { Text(it, color = Ay.Pink, fontSize = 13.sp, modifier = Modifier.padding(16.dp)) } }

            if (info != null) {
                if (info.banner.isNotEmpty()) {
                    item {
                        AsyncImage(
                            model = info.banner,
                            contentDescription = null,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxWidth().aspectRatio(16f / 5f).background(Ay.Slate)
                        )
                    }
                }

                item {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        ChannelAvatar(info.name, info.avatar, info.id, size = 72)
                        Column(Modifier.weight(1f).padding(start = 16.dp)) {
                            Text(info.name, fontSize = 20.sp, fontWeight = FontWeight.Bold, maxLines = 2)
                            Text(subscribersText(info.subscribers), color = Ay.Dim, fontSize = 13.sp)
                        }
                    }
                }

                item {
                    Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        AyButton(
                            text = if (following) "Following" else "Follow",
                            primary = !following,
                            onClick = {
                                scope.launch {
                                    if (following) {
                                        library.removeChannelPref(channelId)
                                    } else {
                                        library.setChannelPref(channelId, info.name, "follow", info.avatar)
                                    }

                                    following = !following
                                }
                            }
                        )
                    }
                }

                if (info.description.isNotBlank()) {
                    item {
                        Column(Modifier.padding(16.dp).clickable { aboutOpen = !aboutOpen }) {
                            Text(
                                info.description,
                                color = Ay.Fog,
                                fontSize = 13.sp,
                                lineHeight = 19.sp,
                                maxLines = if (aboutOpen) Int.MAX_VALUE else 2,
                                overflow = TextOverflow.Ellipsis
                            )
                            Text(
                                if (aboutOpen) "Less" else "More",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(top = 4.dp)
                            )
                        }
                    }
                }

                item {
                    Box(Modifier.padding(horizontal = 16.dp)) {
                        TabStrip(listOf("Videos", "Playlists"), tab, { tab = it })
                    }
                }

                if (tab == 0) {
                    if (videos.isEmpty()) item { Text("No videos.", color = Ay.Fog, modifier = Modifier.padding(16.dp)) }

                    items(videos, key = { "v-" + it.id }) { video ->
                        VideoCard(video, modifier = Modifier.padding(top = 12.dp), onMore = { onMore(video) }) { onOpen(video) }
                    }
                } else {
                    val lists = playlists

                    if (lists == null) {
                        item {
                            Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                                CircularProgressIndicator(color = Ay.Pink)
                            }
                        }
                    } else if (lists.isEmpty()) {
                        item { Text("No playlists.", color = Ay.Fog, modifier = Modifier.padding(16.dp)) }
                    }

                    items(lists.orEmpty(), key = { "p-" + it.id }) { playlist ->
                        Row(
                            Modifier.fillMaxWidth().clickable { onPlaylist(playlist) }.padding(horizontal = 16.dp, vertical = 10.dp)
                        ) {
                            AsyncImage(
                                model = playlist.thumbnail,
                                contentDescription = null,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.width(140.dp).aspectRatio(16f / 9f).background(Ay.Slate)
                            )
                            Column(Modifier.padding(start = 12.dp)) {
                                Text(playlist.name, fontWeight = FontWeight.Medium, fontSize = 14.sp, maxLines = 2)
                                Text("${playlist.count} videos", color = Ay.Dim, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
                            }
                        }
                    }
                }

                if (loadingMore) {
                    item {
                        Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = Ay.Pink, modifier = Modifier.size(24.dp))
                        }
                    }
                }
            }
        }
    }
}
