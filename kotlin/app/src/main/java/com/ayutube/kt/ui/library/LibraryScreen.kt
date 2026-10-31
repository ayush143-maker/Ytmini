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
import androidx.activity.compose.BackHandler
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
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
import com.ayutube.kt.ui.components.AyField
import com.ayutube.kt.ui.components.AyIcons
import com.ayutube.kt.ui.components.ChannelAvatar
import com.ayutube.kt.ui.components.MenuRow
import com.ayutube.kt.ui.components.ScreenTitle
import com.ayutube.kt.ui.components.SectionHead
import com.ayutube.kt.ui.components.TabStrip
import com.ayutube.kt.ui.components.VideoCard
import com.ayutube.kt.ui.theme.Ay
import com.ayutube.kt.ui.theme.Sans
import kotlinx.coroutines.launch

private class Entry(val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector, val target: Int, val count: Int)

private val SECTIONS = listOf("Overview", "Playlists", "Watch later", "Liked", "History", "Following")

private fun video(id: String, title: String, channel: String, thumbnail: String, channelId: String = "") = VideoItem(
    id = id, title = title, channel = channel, channelId = channelId, thumbnail = thumbnail,
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

@OptIn(ExperimentalMaterial3Api::class)
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
    var playlistItemIds by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var newName by remember { mutableStateOf("") }
    var renaming by remember { mutableStateOf<String?>(null) }
    var menuFor by remember { mutableStateOf<Pair<VideoItem, String>?>(null) }

    BackHandler(enabled = section != 0) {
        if (openPlaylist != null) openPlaylist = null else section = 0
    }

    LaunchedEffect(refresh, section, openPlaylist) {
        stats = library.stats()
        history = library.history(100)
        later = library.watchLater(100).map { video(it.videoId, it.title, it.channelTitle, it.thumbnailUrl, it.channelId) }
        liked = library.likes(100).map { video(it.videoId, it.title, it.channelTitle, it.thumbnailUrl, it.channelId) }
        playlists = library.playlists()
        progress = library.playlistProgress()
        follows = library.channelPrefs().filter { it.kind == "follow" }

        val rows = openPlaylist?.let { library.playlistItems(it.id) }.orEmpty()

        playlistItems = rows.map { video(it.videoId, it.title, it.channelTitle, it.thumbnailUrl, it.channelId) }
        playlistItemIds = rows.associate { it.videoId to it.id }
    }

    Column(Modifier.fillMaxSize()) {
        if (section == 0) {
            Box(Modifier.padding(horizontal = 16.dp)) { ScreenTitle("Library") }
        } else {
            Row(Modifier.fillMaxWidth().height(56.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(52.dp).clickable { section = 0; openPlaylist = null; renaming = null },
                    contentAlignment = Alignment.Center
                ) { Icon(AyIcons.Back, contentDescription = "Back", tint = Ay.Paper, modifier = Modifier.size(24.dp)) }

                Text(SECTIONS[section], fontSize = 22.sp, fontWeight = FontWeight.Bold)
            }
        }

        LazyColumn(Modifier.fillMaxSize()) {
            when (section) {
                0 -> {
                    val entries = listOf(
                        Entry("Watch later", AyIcons.Clock, 2, stats?.watchLater ?: 0),
                        Entry("Playlists", AyIcons.Playlist, 1, stats?.playlists ?: 0),
                        Entry("Liked videos", AyIcons.Heart, 3, stats?.likes ?: 0),
                        Entry("History", AyIcons.History, 4, stats?.history ?: 0),
                        Entry("Following", AyIcons.People, 5, stats?.following ?: 0)
                    )

                    items(entries, key = { "e-" + it.label }) { entry ->
                        Column(Modifier.fillMaxWidth().clickable { section = entry.target }) {
                            Row(
                                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 16.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(entry.icon, contentDescription = null, tint = Ay.Paper, modifier = Modifier.size(24.dp))
                                Column(Modifier.weight(1f).padding(horizontal = 18.dp)) {
                                    Text(entry.label, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                                    Text(
                                        "${entry.count} ${if (entry.count == 1) "item" else "items"}",
                                        fontSize = 12.sp,
                                        color = Ay.Dim
                                    )
                                }
                                Icon(AyIcons.Chevron, contentDescription = null, tint = Ay.Dim, modifier = Modifier.size(20.dp))
                            }
                            HorizontalDivider(color = Ay.Steel, modifier = Modifier.padding(start = 58.dp))
                        }
                    }

                    item {
                        Box(Modifier.padding(horizontal = 16.dp)) {
                            SectionHead("Recently played", if (history.size > 10) "See all" else null) { section = 4 }
                        }
                    }

                    if (history.isEmpty()) {
                        item { Text("Videos you watch show up here.", color = Ay.Fog, modifier = Modifier.padding(16.dp)) }
                    }

                    items(history.take(10), key = { "r-" + it.videoId }) { row ->
                        val entry = video(row.videoId, row.title, row.channelTitle, row.thumbnailUrl, row.channelId)

                        VideoCard(
                            entry,
                            progress = row.durationSeconds?.takeIf { it > 0 }?.let { row.progressSeconds.toFloat() / it },
                            modifier = Modifier.padding(top = 10.dp),
                            onMore = { menuFor = entry to "history" }
                        ) { onOpen(entry) }
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
                            Column(Modifier.padding(16.dp)) {
                                Text(open.name, fontSize = 20.sp, fontWeight = FontWeight.Bold)

                                Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    AyButton("Back", onClick = { openPlaylist = null; renaming = null })
                                    AyButton("Rename", onClick = { renaming = renaming ?: open.name })
                                    AyButton("Delete", danger = true, onClick = {
                                        scope.launch {
                                            library.deletePlaylist(open.id)
                                            openPlaylist = null
                                            refresh += 1
                                        }
                                    })
                                }

                                renaming?.let { name ->
                                    Row(Modifier.padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                                        Row(Modifier.weight(1f).padding(end = 8.dp)) {
                                            AyField(name, { renaming = it }, "Playlist name")
                                        }
                                        AyButton("Save", primary = true, onClick = {
                                            scope.launch {
                                                library.renamePlaylist(open.id, name)
                                                openPlaylist = library.playlists().firstOrNull { it.id == open.id }
                                                renaming = null
                                                refresh += 1
                                            }
                                        })
                                    }
                                }
                            }
                        }

                        if (playlistItems.isEmpty()) {
                            item { Text("This playlist is empty.", color = Ay.Fog, modifier = Modifier.padding(16.dp)) }
                        }

                        items(playlistItems, key = { "p-" + it.id }) { item ->
                            VideoCard(
                                item,
                                modifier = Modifier.padding(top = 10.dp),
                                onMore = { menuFor = item to "playlist" }
                            ) { onOpen(item) }
                        }
                    }
                }

                2 -> {
                    if (later.isEmpty()) item { Text("Nothing saved for later.", color = Ay.Fog, modifier = Modifier.padding(16.dp)) }
                    items(later, key = { "l-" + it.id }) { item ->
                        VideoCard(item, modifier = Modifier.padding(top = 10.dp), onMore = { menuFor = item to "later" }) { onOpen(item) }
                    }
                }

                3 -> {
                    if (liked.isEmpty()) item { Text("No liked videos yet.", color = Ay.Fog, modifier = Modifier.padding(16.dp)) }
                    items(liked, key = { "k-" + it.id }) { item ->
                        VideoCard(item, modifier = Modifier.padding(top = 10.dp), onMore = { menuFor = item to "liked" }) { onOpen(item) }
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
                        val entry = video(row.videoId, row.title, row.channelTitle, row.thumbnailUrl, row.channelId)

                        VideoCard(
                            entry,
                            progress = row.durationSeconds?.takeIf { it > 0 }?.let { row.progressSeconds.toFloat() / it },
                            modifier = Modifier.padding(top = 10.dp),
                            onMore = { menuFor = entry to "history" }
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

    menuFor?.let { (item, kind) ->
        ModalBottomSheet(onDismissRequest = { menuFor = null }, containerColor = Ay.Slate) {
            Column(Modifier.padding(bottom = 24.dp)) {
                Text(
                    item.title,
                    fontSize = 14.sp,
                    color = Ay.Fog,
                    maxLines = 1,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp)
                )

                val label = when (kind) {
                    "history" -> "Remove from history"
                    "later" -> "Remove from Watch later"
                    "liked" -> "Remove from liked videos"
                    else -> "Remove from playlist"
                }

                MenuRow(AyIcons.Close, label) {
                    scope.launch {
                        when (kind) {
                            "history" -> library.removeHistory(item.id)
                            "later" -> library.removeWatchLater(item.id)
                            "liked" -> library.unlike(item.id)
                            else -> playlistItemIds[item.id]?.let { library.removeFromPlaylist(it) }
                        }

                        menuFor = null
                        refresh += 1
                    }
                }
            }
        }
    }
}
