package com.ayutube.kt.ui

import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
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
import com.ayutube.kt.ui.components.BrandHeader
import com.ayutube.kt.ui.components.Tab
import com.ayutube.kt.ui.home.ExploreScreen
import com.ayutube.kt.ui.library.LibraryScreen
import com.ayutube.kt.ui.theme.Ay
import com.ayutube.kt.ui.watch.WatchScreen

@Composable
fun AppRoot() {
    val activity = LocalContext.current as? Activity
    var tab by rememberSaveable { mutableStateOf(Tab.Explore) }
    var watching by remember { mutableStateOf<VideoItem?>(null) }

    // Back closes the video, then goes to Explore, then sends the app to the background.
    BackHandler(enabled = watching != null) { watching = null }
    BackHandler(enabled = watching == null && tab != Tab.Explore) { tab = Tab.Explore }
    BackHandler(enabled = watching == null && tab == Tab.Explore) { activity?.moveTaskToBack(true) }

    Box(Modifier.fillMaxSize().background(Ay.Ink)) {
        Column(Modifier.fillMaxSize()) {
            BrandHeader()

            Box(Modifier.weight(1f)) {
                when (tab) {
                    Tab.Explore -> ExploreScreen(onOpen = { watching = it })
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
