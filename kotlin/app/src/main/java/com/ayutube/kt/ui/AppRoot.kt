package com.ayutube.kt.ui

import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import com.ayutube.kt.data.VideoItem
import com.ayutube.kt.ui.account.AccountScreen
import com.ayutube.kt.ui.channel.ChannelScreen
import com.ayutube.kt.ui.channel.PlaylistScreen
import com.ayutube.kt.AyuApp
import com.ayutube.kt.ui.components.AyTabBar
import com.ayutube.kt.ui.components.MiniPlayer
import com.ayutube.kt.ui.components.Tab
import com.ayutube.kt.ui.components.VideoMenuSheet
import com.ayutube.kt.ui.home.HomeScreen
import com.ayutube.kt.ui.library.LibraryScreen
import com.ayutube.kt.ui.search.SearchScreen
import com.ayutube.kt.ui.theme.Ay
import com.ayutube.kt.ui.watch.PipPlayer
import com.ayutube.kt.ui.watch.WatchScreen

/** Full-screen pages that open over the tabs. Back closes the top one. */
sealed interface Overlay {
    data object Watch : Overlay
    data class Channel(val id: String, val name: String) : Overlay
    data class Playlist(val id: String, val name: String) : Overlay
}

@Composable
fun AppRoot() {
    val activity = LocalContext.current as? Activity
    var tab by rememberSaveable { mutableStateOf(Tab.Home) }
    var stack by remember { mutableStateOf(listOf<Overlay>()) }
    var menuVideo by remember { mutableStateOf<VideoItem?>(null) }

    fun push(overlay: Overlay) {
        stack = stack + overlay
    }

    fun pop() {
        stack = stack.dropLast(1)
    }

    val session = remember { AyuApp.container.playback }

    fun watch(video: VideoItem) {
        // The session starts the video (or keeps it if it is already playing).
        session.open(video)

        if (stack.lastOrNull() !is Overlay.Watch) push(Overlay.Watch)
    }

    fun channel(video: VideoItem) {
        if (video.channelId.isNotEmpty()) push(Overlay.Channel(video.channelId, video.channel))
    }

    BackHandler(enabled = stack.isNotEmpty()) { pop() }
    BackHandler(enabled = stack.isEmpty() && tab != Tab.Home) { tab = Tab.Home }
    BackHandler(enabled = stack.isEmpty() && tab == Tab.Home) { activity?.moveTaskToBack(true) }

    if (session.inPip) {
        PipPlayer()
        return
    }

    Box(Modifier.fillMaxSize().background(Ay.Ink)) {
        Column(Modifier.fillMaxSize().statusBarsPadding()) {
            Box(Modifier.weight(1f)) {
                when (tab) {
                    Tab.Home -> HomeScreen(
                        onOpen = ::watch,
                        onChannel = ::channel,
                        onMore = { menuVideo = it }
                    )
                    Tab.Search -> SearchScreen(
                        onOpen = ::watch,
                        onChannel = ::channel,
                        onMore = { menuVideo = it }
                    )
                    Tab.Library -> LibraryScreen(onOpen = ::watch)
                    Tab.Account -> AccountScreen()
                }
            }

            // A fresh player view each time it appears, so the picture is drawn into it.
            if (stack.none { it is Overlay.Watch }) MiniPlayer(onExpand = { push(Overlay.Watch) })
            AyTabBar(current = tab, onSelect = { tab = it })
        }

        for (overlay in stack) {
            Box(Modifier.fillMaxSize().background(Ay.Ink).pointerInput(Unit) { detectTapGestures { } }) {
                when (overlay) {
                    is Overlay.Watch -> WatchScreen(
                        onClose = ::pop,
                        onChannel = ::channel,
                        onOpen = ::watch
                    )
                    is Overlay.Channel -> Box(Modifier.statusBarsPadding()) {
                        ChannelScreen(
                            channelId = overlay.id,
                            nameHint = overlay.name,
                            onBack = ::pop,
                            onOpen = ::watch,
                            onMore = { menuVideo = it },
                            onPlaylist = { push(Overlay.Playlist(it.id, it.name)) }
                        )
                    }
                    is Overlay.Playlist -> Box(Modifier.statusBarsPadding()) {
                        PlaylistScreen(
                            playlistId = overlay.id,
                            nameHint = overlay.name,
                            onBack = ::pop,
                            onOpen = ::watch,
                            onMore = { menuVideo = it }
                        )
                    }
                }
            }
        }

        menuVideo?.let { video ->
            VideoMenuSheet(video, onDismiss = { menuVideo = null }, onChannel = ::channel)
        }
    }
}
