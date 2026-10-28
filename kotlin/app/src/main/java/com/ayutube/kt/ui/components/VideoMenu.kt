package com.ayutube.kt.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ayutube.kt.AyuApp
import com.ayutube.kt.data.VideoItem
import com.ayutube.kt.data.db.PlaylistEntity
import com.ayutube.kt.ui.theme.Ay
import com.ayutube.kt.ui.theme.Sans
import kotlinx.coroutines.launch

@Composable
private fun MenuRow(icon: ImageVector, label: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 20.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, contentDescription = null, tint = Ay.Paper, modifier = Modifier.size(22.dp))
        Text(label, fontSize = 15.sp, modifier = Modifier.padding(start = 16.dp))
    }
}

/** The three-dot menu: Watch later, Add to playlist, Go to channel. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VideoMenuSheet(video: VideoItem, onDismiss: () -> Unit, onChannel: (VideoItem) -> Unit) {
    val library = remember { AyuApp.container.library }
    val scope = rememberCoroutineScope()

    var saved by remember { mutableStateOf(false) }
    var picking by remember { mutableStateOf(false) }
    var playlists by remember { mutableStateOf<List<PlaylistEntity>>(emptyList()) }
    var newName by remember { mutableStateOf("") }
    var note by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(video.id, picking) {
        saved = library.isWatchLater(video.id)
        playlists = library.playlists()
    }

    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Ay.Slate) {
        Column(Modifier.padding(bottom = 24.dp)) {
            Text(
                video.title,
                fontSize = 14.sp,
                color = Ay.Fog,
                maxLines = 1,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp)
            )

            if (!picking) {
                MenuRow(AyIcons.Clock, if (saved) "Remove from Watch later" else "Save to Watch later") {
                    scope.launch {
                        if (saved) library.removeWatchLater(video.id) else library.addWatchLater(video)
                        onDismiss()
                    }
                }
                MenuRow(AyIcons.Playlist, "Add to playlist") { picking = true }

                if (video.channelId.isNotEmpty()) {
                    MenuRow(AyIcons.People, "Go to ${video.channel}") {
                        onDismiss()
                        onChannel(video)
                    }
                }
            } else {
                Text(
                    "Add to playlist",
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp)
                )

                for (playlist in playlists) {
                    MenuRow(AyIcons.Playlist, playlist.name) {
                        scope.launch {
                            library.addToPlaylist(playlist.id, video)
                            onDismiss()
                        }
                    }
                }

                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    BasicTextField(
                        value = newName,
                        onValueChange = { newName = it },
                        singleLine = true,
                        textStyle = TextStyle(fontFamily = Sans, fontSize = 15.sp, color = Ay.Paper),
                        cursorBrush = SolidColor(Ay.Pink),
                        modifier = Modifier.weight(1f).padding(end = 12.dp),
                        decorationBox = { inner ->
                            if (newName.isEmpty()) Text("New playlist name", color = Ay.Dim, fontSize = 15.sp)
                            inner()
                        }
                    )
                    AyButton("Create", primary = true, onClick = {
                        scope.launch {
                            try {
                                val created = library.createPlaylist(newName)

                                library.addToPlaylist(created.id, video)
                                onDismiss()
                            } catch (_: IllegalArgumentException) {
                                note = "Give the playlist a name."
                            }
                        }
                    })
                }

                note?.let { Text(it, color = Ay.Pink, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 20.dp)) }
            }
        }
    }
}
