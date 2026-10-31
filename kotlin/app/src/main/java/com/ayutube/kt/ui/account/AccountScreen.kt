package com.ayutube.kt.ui.account

import androidx.compose.foundation.layout.Box
import com.ayutube.kt.ui.components.AyIcons
import com.ayutube.kt.ui.components.SectionHead
import com.ayutube.kt.ui.components.SlitRow
import com.ayutube.kt.ui.components.SlitSwitchRow
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.ayutube.kt.AyuApp
import com.ayutube.kt.data.db.LibraryStats
import com.ayutube.kt.ui.components.AyButton
import com.ayutube.kt.ui.components.Panel
import com.ayutube.kt.ui.components.PanelTitle
import com.ayutube.kt.ui.components.ScreenTitle
import com.ayutube.kt.ui.components.SwitchRow
import com.ayutube.kt.ui.theme.Ay
import kotlinx.coroutines.launch
import java.time.LocalDate

@Composable
fun AccountScreen() {
    val context = LocalContext.current
    val container = remember { AyuApp.container }
    val library = container.library
    val settings by container.settings.settings.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()

    var stats by remember { mutableStateOf<LibraryStats?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    var confirmErase by remember { mutableStateOf(false) }
    var refresh by remember { mutableStateOf(0) }

    LaunchedEffect(refresh) { stats = library.stats() }

    val exporter = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/json")
    ) { uri ->
        if (uri != null) {
            scope.launch {
                try {
                    val text = library.exportJson()

                    context.contentResolver.openOutputStream(uri)?.use { it.write(text.toByteArray()) }
                    message = "Backup saved."
                } catch (error: Exception) {
                    message = error.message ?: "Could not save the backup."
                }
            }
        }
    }

    val importer = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            scope.launch {
                try {
                    val text = context.contentResolver.openInputStream(uri)?.use { it.readBytes().toString(Charsets.UTF_8) }
                        ?: throw IllegalArgumentException("Could not read that file.")

                    message = "Imported ${library.importJson(text)} items."
                    refresh += 1
                } catch (error: Exception) {
                    message = error.message ?: "Could not import that file."
                }
            }
        }
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Box(Modifier.padding(horizontal = 16.dp)) { ScreenTitle("Account") }

        Text(
            "Stored only on this phone. There is no account and nothing is synced.",
            color = Ay.Fog,
            fontSize = 13.sp,
            modifier = Modifier.padding(horizontal = 16.dp)
        )

        stats?.let {
            Text(
                "${it.history} watched \u00B7 ${it.playlists} playlists \u00B7 ${it.watchLater} watch later \u00B7 " +
                    "${it.likes} liked \u00B7 ${it.following} following",
                color = Ay.Dim,
                fontSize = 12.sp,
                modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 4.dp)
            )
        }

        Box(Modifier.padding(horizontal = 16.dp)) { SectionHead("Your data") }

        SlitRow(AyIcons.Share, "Export backup", "Save your library as a file") {
            exporter.launch("ayutube-backup-${LocalDate.now()}.json")
        }
        SlitRow(AyIcons.Download, "Import backup", "Load a backup file") {
            importer.launch(arrayOf("application/json", "*/*"))
        }
        SlitRow(AyIcons.Trash, "Erase all data", "Remove history, playlists, likes and follows", danger = true) {
            confirmErase = true
        }

        message?.let { Text(it, color = Ay.Bone, modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp)) }

        Box(Modifier.padding(horizontal = 16.dp)) { SectionHead("Study") }

        StudyPanel()

        Box(Modifier.padding(horizontal = 16.dp)) { SectionHead("Preferences") }

        SlitSwitchRow(AyIcons.History, "Pause history", "Watched videos are not saved.", settings.pauseHistory) { on ->
            container.settings.update { it.copy(pauseHistory = on) }
        }
        SlitSwitchRow(AyIcons.Play, "Autoplay next video", "Play the next video when one ends.", settings.autoplayNext) { on ->
            container.settings.update { it.copy(autoplayNext = on) }
        }
        SlitSwitchRow(AyIcons.Forward, "Skip sponsor segments", "Skips sponsor and self-promotion parts.", settings.sponsorBlock) { on ->
            container.settings.update { it.copy(sponsorBlock = on) }
        }
        SlitSwitchRow(AyIcons.Minimize, "Clean controls", "Hide extra buttons on the player.", settings.cleanControls) { on ->
            container.settings.update { it.copy(cleanControls = on) }
        }

        Box(Modifier.padding(horizontal = 16.dp)) { SectionHead("About") }

        SlitRow(
            AyIcons.Info,
            "AyuTube",
            "Free software under the GNU GPL v3, modelled on LibreTube and powered by NewPipeExtractor.",
            chevron = false
        )

        Spacer(Modifier.height(24.dp))
    }

    if (confirmErase) {
        AlertDialog(
            onDismissRequest = { confirmErase = false },
            title = { Text("Erase all data?") },
            text = { Text("Your history, playlists, likes and follows are removed from this phone.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmErase = false
                    scope.launch {
                        library.eraseAll()
                        message = "Everything was erased."
                        refresh += 1
                    }
                }) { Text("Erase", color = Ay.Pink) }
            },
            dismissButton = { TextButton(onClick = { confirmErase = false }) { Text("Cancel") } },
            containerColor = Ay.Slate
        )
    }
}
