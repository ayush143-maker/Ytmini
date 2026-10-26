package com.ayutube.kt.ui

import android.app.Activity
import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.PlayerView
import coil.compose.AsyncImage
import com.ayutube.kt.data.ExtractorRepository
import com.ayutube.kt.data.VideoItem
import com.ayutube.kt.player.AyuPlayer
import com.ayutube.kt.player.StreamMode
import kotlinx.coroutines.delay
import org.schabi.newpipe.extractor.stream.StreamInfo

@Composable
fun AyuTubeApp(vm: MainViewModel = viewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val activity = LocalContext.current as? Activity

    // Back closes the video first, then sends the app to the background.
    BackHandler(enabled = state.selected != null) { vm.close() }
    BackHandler(enabled = state.selected == null) { activity?.moveTaskToBack(true) }

    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        HomeScreen(vm)

        state.selected?.let { item ->
            WatchScreen(item = item, onClose = vm::close)
        }
    }
}

@Composable
private fun HomeScreen(vm: MainViewModel) {
    val state by vm.state.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()

    val nearEnd by remember {
        derivedStateOf {
            val last = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            last >= listState.layoutInfo.totalItemsCount - 3
        }
    }

    LaunchedEffect(nearEnd, state.items.size) {
        if (nearEnd) vm.loadMore()
    }

    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedTextField(
                value = state.query,
                onValueChange = vm::onQueryChange,
                modifier = Modifier.weight(1f),
                singleLine = true,
                placeholder = { Text("Search videos") }
            )
            IconButton(onClick = { vm.search() }) {
                Icon(Icons.Default.Search, contentDescription = "Search")
            }
        }

        state.error?.let {
            Text(it, color = Pink, modifier = Modifier.padding(16.dp), fontSize = 13.sp)
        }

        if (state.loading) {
            Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Pink)
            }
        }

        LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
            items(state.items, key = { it.id }) { video ->
                VideoCard(video) { vm.open(video) }
            }
        }
    }
}

@Composable
private fun VideoCard(video: VideoItem, onClick: () -> Unit) {
    Column(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(bottom = 18.dp)) {
        Box {
            AsyncImage(
                model = video.thumbnail,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f).background(Panel)
            )
            if (video.durationSec > 0) {
                Text(
                    formatClock(video.durationSec),
                    color = Color.White,
                    fontSize = 12.sp,
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(8.dp)
                        .background(Color(0xCC000000))
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                )
            }
        }

        Row(Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
            Box(
                Modifier.size(38.dp).clip(CircleShape).background(Color(0xFF1C1C1F)),
                contentAlignment = Alignment.Center
            ) {
                if (video.avatar.isNotEmpty()) {
                    AsyncImage(
                        model = video.avatar,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize()
                    )
                } else {
                    Text(video.channel.take(1).uppercase(), color = Bone)
                }
            }

            Column(Modifier.padding(start = 12.dp)) {
                Text(
                    video.title,
                    fontSize = 15.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    color = Bone
                )
                Text(
                    listOf(video.channel, viewsText(video.views), video.uploaded)
                        .filter { it.isNotEmpty() }
                        .joinToString(" \u00B7 "),
                    fontSize = 12.5.sp,
                    color = Dim,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@androidx.annotation.OptIn(UnstableApi::class)
@Composable
private fun WatchScreen(item: VideoItem, onClose: () -> Unit) {
    val context = LocalContext.current
    val ayu = remember { AyuPlayer(context) }

    var info by remember { mutableStateOf<StreamInfo?>(null) }
    var mode by remember { mutableStateOf(StreamMode.ADAPTIVE) }
    var stream by remember { mutableStateOf("loading streams...") }
    var error by remember { mutableStateOf<String?>(null) }
    var readout by remember { mutableStateOf("") }

    DisposableEffect(ayu) {
        val listener = object : Player.Listener {
            override fun onPlayerError(playbackError: PlaybackException) {
                error = "${playbackError.errorCodeName}\n${playbackError.cause}"
            }
        }

        ayu.exo.addListener(listener)

        onDispose {
            ayu.exo.removeListener(listener)
            ayu.release()
        }
    }

    LaunchedEffect(item.id) {
        try {
            info = ExtractorRepository.streams(item.id)
        } catch (failure: Exception) {
            error = failure.message ?: failure.javaClass.simpleName
        }
    }

    LaunchedEffect(info, mode) {
        val streams = info ?: return@LaunchedEffect
        val position = ayu.exo.currentPosition

        error = null

        val chosen = ayu.prepare(streams, mode, position)

        stream = chosen?.label ?: "no playable stream found"
    }

    LaunchedEffect(ayu) {
        while (true) {
            readout = ayu.snapshot()
            delay(500)
        }
    }

    Column(Modifier.fillMaxSize().background(Color.Black).statusBarsPadding()) {
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    player = ayu.exo
                    useController = true
                }
            },
            modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f)
        )

        Text(
            "$readout\n$stream",
            color = Dim,
            fontFamily = FontFamily.Monospace,
            fontSize = 11.sp,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
        )

        error?.let {
            Text(it, color = Pink, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 12.dp))
        }

        Row(
            Modifier.padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Button(onClick = { mode = StreamMode.ADAPTIVE }) { Text("Adaptive") }
            OutlinedButton(onClick = { mode = StreamMode.MUXED }) { Text("360p with audio") }
            OutlinedButton(onClick = onClose) { Text("Close") }
        }

        Text(
            item.title,
            color = Bone,
            fontSize = 17.sp,
            modifier = Modifier.padding(horizontal = 12.dp)
        )
        Text(
            item.channel,
            color = Dim,
            fontSize = 13.sp,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp)
        )
    }
}

private fun formatClock(total: Long): String {
    val hours = total / 3600
    val minutes = (total % 3600) / 60
    val seconds = total % 60

    return if (hours > 0) "%d:%02d:%02d".format(hours, minutes, seconds)
    else "%d:%02d".format(minutes, seconds)
}

private fun viewsText(views: Long): String = when {
    views < 0 -> ""
    views >= 1_000_000 -> "%.1fM views".format(views / 1_000_000.0)
    views >= 1_000 -> "%.1fK views".format(views / 1_000.0)
    else -> "$views views"
}
