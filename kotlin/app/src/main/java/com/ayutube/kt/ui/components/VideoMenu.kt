package com.ayutube.kt.ui.components

import android.widget.Toast
import com.ayutube.kt.data.ExtractorRepository
import com.ayutube.kt.data.downloadChoices
import com.ayutube.kt.data.db.DownloadEntity
import android.content.Intent
import androidx.compose.ui.platform.LocalContext
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
fun MenuRow(icon: ImageVector, label: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 20.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, contentDescription = null, tint = Ay.Paper, modifier = Modifier.size(22.dp))
        Text(label, fontSize = 15.sp, modifier = Modifier.padding(start = 16.dp))
    }
}

/** The three-dot menu: Watch later, Add to playlist, Download, Share, Go to channel. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VideoMenuSheet(video: VideoItem, onDismiss: () -> Unit, onChannel: (VideoItem) -> Unit) {
    val library = remember { AyuApp.container.library }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    var saved by remember { mutableStateOf(false) }
    var picking by remember { mutableStateOf(false) }
    var playlists by remember { mutableStateOf<List<PlaylistEntity>>(emptyList()) }
    var newName by remember { mutableStateOf("") }
    var note by remember { mutableStateOf<String?>(null) }

    var downloading by remember { mutableStateOf(false) }
    var download by remember { mutableStateOf<DownloadEntity?>(null) }
    var qualities by remember { mutableStateOf<List<Pair<Int, String>>?>(null) }
    var qualityError by remember { mutableStateOf(false) }

    LaunchedEffect(video.id, picking) {
        saved = library.isWatchLater(video.id)
        playlists = library.playlists()
        download = AyuApp.container.downloads.get(video.id)
    }

    LaunchedEffect(downloading) {
        if (downloading && qualities == null) {
            try {
                qualities = downloadChoices(ExtractorRepository.streams(video.id))
            } catch (_: Exception) {
                qualityError = true
            }
        }
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

            if (downloading) {
                Text(
                    "Download",
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp)
                )

                val choices = qualities

                when {
                    qualityError -> Text(
                        "Could not load the available qualities.",
                        color = Ay.Pink,
                        fontSize = 13.sp,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp)
                    )

                    choices == null -> Text(
                        "Loading\u2026",
                        color = Ay.Fog,
                        fontSize = 13.sp,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp)
                    )

                    else -> choices.forEach { (height, label) ->
                        MenuRow(AyIcons.Download, label) {
                            AyuApp.container.downloader.enqueue(video, height)
                            Toast.makeText(context, "Download started", Toast.LENGTH_SHORT).show()
                            onDismiss()
                        }
                    }
                }
            } else if (!picking) {
                MenuRow(AyIcons.Clock, if (saved) "Remove from Watch later" else "Save to Watch later") {
                    scope.launch {
                        if (saved) library.removeWatchLater(video.id) else library.addWatchLater(video)
                        onDismiss()
                    }
                }
                MenuRow(AyIcons.Playlist, "Add to playlist") { picking = true }

                val current = download

                if (current == null) {
                    MenuRow(AyIcons.Download, "Download") { downloading = true }
                } else {
                    when (current.status) {
                        "DONE" -> MenuRow(AyIcons.Trash, "Remove download") {
                            AyuApp.container.downloader.delete(video.id)
                            onDismiss()
                        }

                        "PAUSED", "FAILED" -> MenuRow(AyIcons.Download, "Resume download") {
                            AyuApp.container.downloader.resume(video.id)
                            onDismiss()
                        }

                        else -> MenuRow(AyIcons.Pause, "Downloading\u2026 tap to pause") {
                            AyuApp.container.downloader.pause(video.id)
                            onDismiss()
                        }
                    }
                }
                MenuRow(AyIcons.Share, "Share") {
                    val send = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_TEXT, "https://youtu.be/${video.id}")
                    }

                    context.startActivity(Intent.createChooser(send, "Share"))
                    onDismiss()
                }

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
