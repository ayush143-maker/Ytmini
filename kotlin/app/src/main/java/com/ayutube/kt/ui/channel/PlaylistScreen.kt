package com.ayutube.kt.ui.channel

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ayutube.kt.AyuApp
import com.ayutube.kt.data.ExtractorRepository
import com.ayutube.kt.data.PlaylistDetail
import com.ayutube.kt.data.VideoItem
import com.ayutube.kt.ui.components.AyButton
import com.ayutube.kt.ui.components.AyIcons
import com.ayutube.kt.ui.components.VideoCard
import com.ayutube.kt.ui.theme.Ay
import kotlinx.coroutines.launch
import org.schabi.newpipe.extractor.Page

@Composable
fun PlaylistScreen(
    playlistId: String,
    nameHint: String,
    onBack: () -> Unit,
    onOpen: (VideoItem) -> Unit,
    onMore: (VideoItem) -> Unit
) {
    val library = remember { AyuApp.container.library }
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()

    var detail by remember { mutableStateOf<PlaylistDetail?>(null) }
    var videos by remember { mutableStateOf<List<VideoItem>>(emptyList()) }
    var next by remember { mutableStateOf<Page?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var loadingMore by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(playlistId) {
        try {
            val loaded = ExtractorRepository.playlist(playlistId)

            detail = loaded
            videos = loaded.videos.items
            next = loaded.videos.next
        } catch (failure: Exception) {
            error = failure.message ?: failure.javaClass.simpleName
        }
    }

    val nearEnd by remember {
        derivedStateOf {
            val last = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            last >= listState.layoutInfo.totalItemsCount - 3
        }
    }

    LaunchedEffect(nearEnd, videos.size) {
        val page = next

        if (nearEnd && page != null && !loadingMore) {
            loadingMore = true

            try {
                val more = ExtractorRepository.playlistMore(playlistId, page)
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
            if (detail == null && error == null) {
                item {
                    Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = Ay.Pink)
                    }
                }
            }

            error?.let { item { Text(it, color = Ay.Pink, fontSize = 13.sp, modifier = Modifier.padding(16.dp)) } }

            detail?.let { info ->
                item {
                    Column(Modifier.padding(16.dp)) {
                        Text(info.name, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        Text(
                            listOf(info.uploader, "${info.count} videos").filter { it.isNotEmpty() }.joinToString(" \u00B7 "),
                            color = Ay.Dim,
                            fontSize = 13.sp,
                            modifier = Modifier.padding(top = 4.dp)
                        )
                        Row(Modifier.padding(top = 12.dp)) {
                            AyButton("Save to library", onClick = {
                                scope.launch {
                                    val created = library.createPlaylist(info.name)

                                    videos.forEach { library.addToPlaylist(created.id, it) }
                                    message = "Saved ${videos.size} videos."
                                }
                            })
                        }
                        message?.let { Text(it, color = Ay.Bone, fontSize = 13.sp, modifier = Modifier.padding(top = 8.dp)) }
                    }
                }
            }

            items(videos, key = { "pv-" + it.id }) { video ->
                VideoCard(video, modifier = Modifier.padding(top = 12.dp), onMore = { onMore(video) }) { onOpen(video) }
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
