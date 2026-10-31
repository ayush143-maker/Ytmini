package com.ayutube.kt.ui.search

import androidx.compose.foundation.layout.height
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.HorizontalDivider
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import com.ayutube.kt.ui.theme.Sans
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
import com.ayutube.kt.ui.components.ChannelRowSkeleton
import com.ayutube.kt.ui.components.PlaylistRowSkeleton
import com.ayutube.kt.ui.components.VideoCardSkeleton
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
    val focus = LocalFocusManager.current
    val requester = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        if (!vm.state.value.searched && vm.state.value.query.isBlank()) runCatching { requester.requestFocus() }
    }

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
        UnderlineSearchField(
            value = state.query,
            onValueChange = vm::onQueryChange,
            onSearch = {
                focus.clearFocus()
                vm.search()
            },
            requester = requester
        )

        if (state.searched) {
            TopicChips(listOf("Videos", "Channels", "Playlists"), state.type, vm::setType)
        }

        state.error?.let {
            Text(it, color = Ay.Pink, fontSize = 13.sp, modifier = Modifier.padding(16.dp))
        }

        LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
            if (!state.searched) {
                val showingRecents = state.query.isBlank()
                val rows = if (showingRecents) state.recents else state.suggestions

                items(rows, key = { "s-$it" }) { text ->
                    Row(
                        Modifier.fillMaxWidth().height(54.dp)
                            .clickable {
                                focus.clearFocus()
                                vm.search(text)
                            }
                            .padding(start = 16.dp, end = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            if (showingRecents) AyIcons.History else AyIcons.Search,
                            contentDescription = null,
                            tint = Ay.Bone,
                            modifier = Modifier.size(24.dp)
                        )
                        Text(
                            text,
                            modifier = Modifier.weight(1f).padding(horizontal = 18.dp),
                            fontSize = 17.sp,
                            maxLines = 1
                        )

                        if (showingRecents) {
                            Box(
                                Modifier.size(44.dp).clickable { vm.removeRecent(text) },
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(AyIcons.Close, contentDescription = "Remove", tint = Ay.Paper, modifier = Modifier.size(20.dp))
                            }
                        }

                        // Puts the text in the box so it can be edited before searching.
                        Box(
                            Modifier.size(44.dp).clickable {
                                vm.onQueryChange(text)
                                runCatching { requester.requestFocus() }
                            },
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(AyIcons.ArrowUpLeft, contentDescription = "Use", tint = Ay.Paper, modifier = Modifier.size(22.dp))
                        }
                    }
                }
            } else when (state.type) {
                0 -> {
                    if (state.loading) {
                        items(3) { VideoCardSkeleton(Modifier.padding(top = 8.dp)) }
                    }

                    items(state.items, key = { it.id }) { video ->
                        VideoCard(
                            video = video,
                            modifier = Modifier.padding(top = 8.dp),
                            onMore = { onMore(video) },
                            onChannel = { onChannel(video) }
                        ) { onOpen(video) }
                    }
                }

                1 -> {
                    val channels = state.channels

                    if (channels == null) {
                        items(6) { ChannelRowSkeleton() }
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
                        items(5) { PlaylistRowSkeleton(150) }
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

/** Search icon, the text, and a thin line under it. No box and no back button. */
@Composable
private fun UnderlineSearchField(
    value: String,
    onValueChange: (String) -> Unit,
    onSearch: () -> Unit,
    requester: FocusRequester
) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
        Row(Modifier.fillMaxWidth().height(52.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(AyIcons.Search, contentDescription = null, tint = Ay.Fog, modifier = Modifier.size(24.dp))

            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                singleLine = true,
                textStyle = TextStyle(fontFamily = Sans, fontSize = 18.sp, color = Ay.Paper),
                cursorBrush = SolidColor(Ay.Pink),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { onSearch() }),
                modifier = Modifier.weight(1f).padding(horizontal = 14.dp).focusRequester(requester),
                decorationBox = { inner ->
                    Box(contentAlignment = Alignment.CenterStart) {
                        if (value.isEmpty()) Text("Search ayutube", color = Ay.Dim, fontSize = 18.sp)
                        inner()
                    }
                }
            )

            if (value.isNotEmpty()) {
                Box(Modifier.size(40.dp).clickable { onValueChange("") }, contentAlignment = Alignment.Center) {
                    Icon(AyIcons.Close, contentDescription = "Clear", tint = Ay.Fog, modifier = Modifier.size(20.dp))
                }
            }
        }

        HorizontalDivider(color = Ay.SteelHi)
    }
}

private fun compact(count: Long): String = when {
    count >= 1_000_000 -> "%.1fM".format(count / 1_000_000.0)
    count >= 1_000 -> "%.1fK".format(count / 1_000.0)
    else -> count.toString()
}
