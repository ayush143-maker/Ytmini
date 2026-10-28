package com.ayutube.kt.ui.library

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ayutube.kt.AyuApp
import com.ayutube.kt.data.VideoItem
import com.ayutube.kt.data.db.ChannelPrefEntity
import com.ayutube.kt.data.db.HistoryEntity
import com.ayutube.kt.data.db.LibraryStats
import com.ayutube.kt.data.db.PlaylistEntity
import com.ayutube.kt.data.db.PlaylistProgress
import com.ayutube.kt.ui.components.AyButton
import com.ayutube.kt.ui.components.ChannelAvatar
import com.ayutube.kt.ui.components.SectionHead
import com.ayutube.kt.ui.components.TabStrip
import com.ayutube.kt.ui.components.VideoCard
import com.ayutube.kt.ui.theme.Ay
import com.ayutube.kt.ui.theme.Sans
import kotlinx.coroutines.launch

private val SECTIONS = listOf("Overview", "Playlists", "Watch later", "Liked", "History", "Following")

private fun video(id: String, title: String, channel: String, thumbnail: String) = VideoItem(
    id = id, title = title, channel = channel, channelId = "", thumbnail = thumbnail,
    durationSec = 0, views = -1, uploaded = "", avatar = ""
)

/** One calm geometric shape per block: off-white on obsidian, never behind the text. */
@Composable
private fun BlockShape(kind: Int) {
    Canvas(Modifier.size(46.dp)) {
        val bone = Ay.Bone
        val w = size.width
        val h = size.height

        when (kind) {
            0 -> drawCircle(bone, radius = w / 2 - 3.dp.toPx(), style = Stroke(width = 6.dp.toPx()))
            1 -> drawCircle(bone, radius = w / 2)
            2 -> for (row in 0..2) {
                drawRect(bone, topLeft = Offset(0f, row * h / 3 + 2f), size = Size(w, h / 3 - 9f))
            }
            3 -> drawPath(
                Path().apply {
                    moveTo(w, h)
                    lineTo(0f, h)
                    arcTo(androidx.compose.ui.geometry.Rect(-w, -h, w, h), 90f, -90f, false)
                    close()
                },
                bone
            )
            else -> drawPath(
                Path().apply {
                    moveTo(w / 2, 0f)
                    lineTo(w, h)
                    lineTo(0f, h)
                    close()
                },
                bone
            )
        }
    }
}

@Composable
fun LibraryScreen(onOpen: (VideoItem) -> Unit) {
    val library = remember { AyuApp.container.library }
    val scope = rememberCoroutineScope()

    var section by remember { mutableIntStateOf(0) }
    var refresh by remember { mutableIntStateOf(0) }

    var stats by remember { mutableStateOf<LibraryStats?>(null) }
    var history by remember { mutableStateOf<List<HistoryEntity>>(emptyList()) }
    var later by remember { mutableStateOf<List<VideoItem>>(emptyList()) }
    var liked by remember { mutableStateOf<List<VideoItem>>(emptyList()) }
    var playlists by remember { mutableStateOf<List<PlaylistEntity>>(emptyList()) }
    var progress by remember { mutableStateOf<Map<String, PlaylistProgress>>(emptyMap()) }
    var follows by remember { mutableStateOf<List<ChannelPrefEntity>>(emptyList()) }
    var openPlaylist by remember { mutableStateOf<PlaylistEntity?>(null) }
    var playlistItems by remember { mutableStateOf<List<VideoItem>>(emptyList()) }
    var newName by remember { mutableStateOf("") }

    LaunchedEffect(refresh, section, openPlaylist) {
        stats = library.stats()
        history = library.history(100)
        later = library.watchLater(100).map { video(it.videoId, it.title, it.channelTitle, it.thumbnailUrl) }
        liked = library.likes(100).map { video(it.videoId, it.title, it.channelTitle, it.thumbnailUrl) }
        playlists = library.playlists()
        progress = library.playlistProgress()
        follows = library.channelPrefs().filter { it.kind == "follow" }
        playlistItems = openPlaylist?.let { open ->
            library.playlistItems(open.id).map { video(it.videoId, it.title, it.channelTitle, it.thumbnailUrl) }
        } ?: emptyList()
    }

    Column(Modifier.fillMaxSize()) {
        Column(Modifier.padding(horizontal = 16.dp)) {
            Text(
                "Library",
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(top = 16.dp, bottom = 2.dp)
            )
            TabStrip(SECTIONS, section, { section = it; openPlaylist = null })
        }

        LazyColumn(Modifier.fillMaxSize()) {
            when (section) {
                0 -> {
                    item {
                        val blocks = listOf(
                            Triple("Watch later", stats?.watchLater ?: 0, 2),
                            Triple("Liked videos", stats?.likes ?: 0, 3),
                            Triple("Playlists", stats?.playlists ?: 0, 1),
                            Triple("History", stats?.history ?: 0, 4),
                            Triple("Following", stats?.following ?: 0, 5)
                        )

                        Column(
                            Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            blocks.chunked(2).forEachIndexed { rowIndex, pair ->
                                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    pair.forEachIndexed { column, (title, count, target) ->
                                        val kind = rowIndex * 2 + column

                                        Box(
                                            Modifier.weight(1f).height(112.dp)
                                                .background(Ay.Obsidian, RoundedCornerShape(16.dp))
                                                .border(1.dp, Color(0xFF242428), RoundedCornerShape(16.dp))
                                                .clickable { section = target }
                                                .padding(16.dp)
                                        ) {
                                            Box(Modifier.align(Alignment.TopEnd)) { BlockShape(kind) }
                                            Column(Modifier.align(Alignment.BottomStart)) {
                                                Text(title, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, color = Ay.Bone)
                                                Text(
                                                    "$count ${if (count == 1) "item" else "items"}",
                                                    fontSize = 12.sp,
                                                    color = Color(0xFF8E8C86)
                                                )
                                            }
                                        }
                                    }

                                    if (pair.size == 1) Spacer(Modifier.weight(1f))
                                }
                            }
                        }
                    }

                    if (history.isNotEmpty()) {
                        item { Box(Modifier.padding(horizontal = 16.dp)) { SectionHead("History", "See all") { section = 4 } } }
                        items(history.take(3), key = { "h-" + it.videoId }) { row ->
                            VideoCard(
                                video(row.videoId, row.title, row.channelTitle, row.thumbnailUrl),
                                progress = row.durationSeconds?.takeIf { it > 0 }
                                    ?.let { row.progressSeconds.toFloat() / it },
                                modifier = Modifier.padding(top = 10.dp)
                            ) { onOpen(video(row.videoId, row.title, row.channelTitle, row.thumbnailUrl)) }
                        }
                    }
                }

                1 -> {
                    val open = openPlaylist

                    if (open == null) {
                        item {
                            Row(
                                Modifier.padding(16.dp),
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Box(
                                    Modifier.weight(1f).height(52.dp).background(Ay.Slate)
                                        .border(1.dp, Ay.Steel).padding(horizontal = 14.dp),
                                    contentAlignment = Alignment.CenterStart
                                ) {
                                    BasicTextField(
                                        value = newName,
                                        onValueChange = { newName = it },
                                        singleLine = true,
                                        textStyle = TextStyle(fontFamily = Sans, fontSize = 16.sp, color = Ay.Paper),
                                        cursorBrush = SolidColor(Ay.Pink),
                                        decorationBox = { inner ->
                                            if (newName.isEmpty()) Text("New playlist name", color = Ay.Dim)
                                            inner()
                                        }
                                    )
                                }
                                AyButton("Create", primary = true, onClick = {
                                    scope.launch {
                                        try {
                                            library.createPlaylist(newName)
                                            newName = ""
                                            refresh += 1
                                        } catch (_: IllegalArgumentException) {
                                            // Empty names are ignored.
                                        }
                                    }
                                })
                            }
                        }

                        if (playlists.isEmpty()) {
                            item { Text("No playlists yet.", color = Ay.Fog, modifier = Modifier.padding(16.dp)) }
                        }

                        items(playlists, key = { it.id }) { playlist ->
                            val total = progress[playlist.id]?.total ?: 0

                            Row(
                                Modifier.fillMaxWidth().clickable { openPlaylist = playlist }.padding(16.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(playlist.name, fontWeight = FontWeight.SemiBold, fontSize = 17.sp)
                                    Text("$total ${if (total == 1) "video" else "videos"}", color = Ay.Dim, fontSize = 13.sp)
                                }
                            }
                        }
                    } else {
                        item {
                            Row(
                                Modifier.padding(16.dp),
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(open.name, fontSize = 20.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                                AyButton("Back", onClick = { openPlaylist = null })
                                AyButton("Delete", danger = true, onClick = {
                                    scope.launch {
                                        library.deletePlaylist(open.id)
                                        openPlaylist = null
                                        refresh += 1
                                    }
                                })
                            }
                        }

                        if (playlistItems.isEmpty()) {
                            item { Text("This playlist is empty.", color = Ay.Fog, modifier = Modifier.padding(16.dp)) }
                        }

                        items(playlistItems, key = { "p-" + it.id }) { item ->
                            VideoCard(item, modifier = Modifier.padding(top = 10.dp)) { onOpen(item) }
                        }
                    }
                }

                2 -> {
                    if (later.isEmpty()) item { Text("Nothing saved for later.", color = Ay.Fog, modifier = Modifier.padding(16.dp)) }
                    items(later, key = { "l-" + it.id }) { item ->
                        VideoCard(item, modifier = Modifier.padding(top = 10.dp)) { onOpen(item) }
                    }
                }

                3 -> {
                    if (liked.isEmpty()) item { Text("No liked videos yet.", color = Ay.Fog, modifier = Modifier.padding(16.dp)) }
                    items(liked, key = { "k-" + it.id }) { item ->
                        VideoCard(item, modifier = Modifier.padding(top = 10.dp)) { onOpen(item) }
                    }
                }

                4 -> {
                    item {
                        if (history.isNotEmpty()) {
                            Box(Modifier.padding(16.dp)) {
                                AyButton("Clear history", danger = true, onClick = {
                                    scope.launch {
                                        library.clearHistory()
                                        refresh += 1
                                    }
                                })
                            }
                        } else {
                            Text("Nothing watched yet.", color = Ay.Fog, modifier = Modifier.padding(16.dp))
                        }
                    }
                    items(history, key = { "hh-" + it.videoId }) { row ->
                        val entry = video(row.videoId, row.title, row.channelTitle, row.thumbnailUrl)

                        VideoCard(
                            entry,
                            progress = row.durationSeconds?.takeIf { it > 0 }?.let { row.progressSeconds.toFloat() / it },
                            modifier = Modifier.padding(top = 10.dp)
                        ) { onOpen(entry) }
                    }
                }

                else -> {
                    if (follows.isEmpty()) item { Text("You are not following anyone yet.", color = Ay.Fog, modifier = Modifier.padding(16.dp)) }
                    items(follows, key = { it.channelKey }) { pref ->
                        Row(
                            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            ChannelAvatar(pref.channelName, pref.avatar.orEmpty(), pref.channelKey, size = 48)
                            Text(
                                pref.channelName,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1,
                                modifier = Modifier.weight(1f).padding(horizontal = 14.dp)
                            )
                            AyButton("Unfollow", onClick = {
                                scope.launch {
                                    library.removeChannelPref(pref.channelKey)
                                    refresh += 1
                                }
                            })
                        }
                    }
                }
            }
        }
    }
}
