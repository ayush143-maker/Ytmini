package com.ayutube.kt.ui.search

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
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
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.ayutube.kt.data.PlaylistSummary
import com.ayutube.kt.data.VideoItem
import com.ayutube.kt.ui.components.AyIcons
import com.ayutube.kt.ui.components.ChannelAvatar
import com.ayutube.kt.ui.components.SearchField
import com.ayutube.kt.ui.components.TopicChips
import com.ayutube.kt.ui.components.VideoCard
import com.ayutube.kt.ui.theme.Ay

@Composable
fun SearchScreen(
    onOpen: (VideoItem) -> Unit,
    onChannel: (VideoItem) -> Unit,
    onMore: (VideoItem) -> Unit,
    onOpenChannel: (String, String) -> Unit,
    onOpenPlaylist: (PlaylistSummary) -> Unit,
    vm: SearchViewModel = viewModel()
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()

    val nearEnd by remember {
        derivedStateOf {
            val last = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            last >= listState.layoutInfo.totalItemsCount - 3
        }
    }

    LaunchedEffect(nearEnd, state.items.size) {
        if (state.searched && state.type == 0 && nearEnd) vm.loadMore()
    }

    Column(Modifier.fillMaxSize()) {
        Box(Modifier.padding(16.dp)) {
            SearchField(state.query, vm::onQueryChange, onSearch = { vm.search() })
        }

        if (state.searched) {
            TopicChips(listOf("Videos", "Channels", "Playlists"), state.type, vm::setType)
        }

        if (state.loading) {
            Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Ay.Pink)
            }
        }

        state.error?.let {
            Text(it, color = Ay.Pink, fontSize = 13.sp, modifier = Modifier.padding(16.dp))
        }

        LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
            if (!state.searched) {
                val rows = if (state.query.isBlank()) state.recents else state.suggestions

                if (state.query.isBlank() && rows.isNotEmpty()) {
                    item {
                        Row(
                            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text("Recent searches", fontWeight = FontWeight.SemiBold)
                            Text("Clear", color = Ay.Bone, fontSize = 13.sp, modifier = Modifier.clickable { vm.clearRecents() })
                        }
                    }
                }

                items(rows, key = { "s-$it" }) { text ->
                    Row(
                        Modifier.fillMaxWidth().clickable { vm.search(text) }.padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            if (state.query.isBlank()) AyIcons.History else AyIcons.Search,
                            contentDescription = null,
                            tint = Ay.Fog,
                            modifier = Modifier.size(20.dp)
                        )
                        Text(text, modifier = Modifier.weight(1f).padding(horizontal = 14.dp), fontSize = 15.sp, maxLines = 1)

                        if (state.query.isBlank()) {
                            Icon(
                                AyIcons.Close,
                                contentDescription = "Remove",
                                tint = Ay.Dim,
                                modifier = Modifier.size(18.dp).clickable { vm.removeRecent(text) }
                            )
                        }
                    }
                }
            } else when (state.type) {
                0 -> items(state.items, key = { it.id }) { video ->
                    VideoCard(
                        video = video,
                        modifier = Modifier.padding(top = 8.dp),
                        onMore = { onMore(video) },
                        onChannel = { onChannel(video) }
                    ) { onOpen(video) }
                }

                1 -> {
                    val channels = state.channels

                    if (channels == null) {
                        item {
                            Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                                CircularProgressIndicator(color = Ay.Pink, modifier = Modifier.size(24.dp))
                            }
                        }
                    } else if (channels.isEmpty()) {
                        item { Text("No channels found.", color = Ay.Fog, modifier = Modifier.padding(16.dp)) }
                    }

                    items(channels.orEmpty(), key = { "c-" + it.id }) { channel ->
                        Row(
                            Modifier.fillMaxWidth().clickable { onOpenChannel(channel.id, channel.name) }
                                .padding(horizontal = 16.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            ChannelAvatar(channel.name, channel.avatar, channel.id, size = 64)
                            Column(Modifier.weight(1f).padding(start = 16.dp)) {
                                Text(channel.name, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1)

                                if (channel.subscribers >= 0) {
                                    Text("${compact(channel.subscribers)} subscribers", color = Ay.Dim, fontSize = 12.sp)
                                }

                                if (channel.description.isNotBlank()) {
                                    Text(channel.description, color = Ay.Fog, fontSize = 12.sp, maxLines = 2)
                                }
                            }
                        }
                    }
                }

                else -> {
                    val playlists = state.playlists

                    if (playlists == null) {
                        item {
                            Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                                CircularProgressIndicator(color = Ay.Pink, modifier = Modifier.size(24.dp))
                            }
                        }
                    } else if (playlists.isEmpty()) {
                        item { Text("No playlists found.", color = Ay.Fog, modifier = Modifier.padding(16.dp)) }
                    }

                    items(playlists.orEmpty(), key = { "p-" + it.id }) { playlist ->
                        Row(
                            Modifier.fillMaxWidth().clickable { onOpenPlaylist(playlist) }
                                .padding(horizontal = 16.dp, vertical = 10.dp)
                        ) {
                            AsyncImage(
                                model = playlist.thumbnail,
                                contentDescription = null,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.width(150.dp).aspectRatio(16f / 9f).background(Ay.Slate)
                            )
                            Column(Modifier.padding(start = 12.dp)) {
                                Text(playlist.name, fontWeight = FontWeight.Medium, fontSize = 14.sp, maxLines = 2)
                                Text(
                                    listOf(playlist.uploader, "${playlist.count} videos").filter { it.isNotEmpty() }.joinToString(" \u00B7 "),
                                    color = Ay.Dim,
                                    fontSize = 12.sp,
                                    modifier = Modifier.padding(top = 4.dp)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun compact(count: Long): String = when {
    count >= 1_000_000 -> "%.1fM".format(count / 1_000_000.0)
    count >= 1_000 -> "%.1fK".format(count / 1_000.0)
    else -> count.toString()
}
