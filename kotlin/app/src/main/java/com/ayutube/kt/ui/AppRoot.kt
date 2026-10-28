package com.ayutube.kt.ui

import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
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
import androidx.compose.ui.platform.LocalContext
import com.ayutube.kt.data.VideoItem
import com.ayutube.kt.ui.account.AccountScreen
import com.ayutube.kt.ui.components.AyTabBar
import com.ayutube.kt.ui.components.Tab
import com.ayutube.kt.ui.home.HomeScreen
import com.ayutube.kt.ui.library.LibraryScreen
import com.ayutube.kt.ui.search.SearchScreen
import com.ayutube.kt.ui.theme.Ay
import com.ayutube.kt.ui.watch.WatchScreen

@Composable
fun AppRoot() {
    val activity = LocalContext.current as? Activity
    var tab by rememberSaveable { mutableStateOf(Tab.Home) }
    var watching by remember { mutableStateOf<VideoItem?>(null) }

    // Back closes the video, then goes Home, then sends the app to the background.
    BackHandler(enabled = watching != null) { watching = null }
    BackHandler(enabled = watching == null && tab != Tab.Home) { tab = Tab.Home }
    BackHandler(enabled = watching == null && tab == Tab.Home) { activity?.moveTaskToBack(true) }

    Box(Modifier.fillMaxSize().background(Ay.Ink)) {
        Column(Modifier.fillMaxSize().statusBarsPadding()) {
            Box(Modifier.weight(1f)) {
                when (tab) {
                    Tab.Home -> HomeScreen(
                        onOpen = { watching = it },
                        onChannel = { /* channel page: next step */ },
                        onMore = { /* card menu: next step */ }
                    )
                    Tab.Search -> SearchScreen(
                        onOpen = { watching = it },
                        onChannel = { /* channel page: next step */ },
                        onMore = { /* card menu: next step */ }
                    )
                    Tab.Library -> LibraryScreen(onOpen = { watching = it })
                    Tab.Account -> AccountScreen()
                }
            }

            AyTabBar(current = tab, onSelect = { tab = it })
        }

        watching?.let { video ->
            WatchScreen(video = video, onClose = { watching = null })
        }
    }
}
