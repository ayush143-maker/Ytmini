package com.ayutube.kt.data

import android.content.Context
import com.ayutube.kt.data.db.AyuDatabase
import com.ayutube.kt.data.db.LibraryRepository
import com.ayutube.kt.player.PlaybackSession

/** Wires the app's parts together (no dependency-injection framework needed). */
class AppContainer(context: Context) {
    val settings = SettingsStore(context)
    private val database = AyuDatabase.create(context)
    val library = LibraryRepository(database.library(), settings)
    val recents = RecentSearches(context)
    val playback = PlaybackSession(context, settings, library)
}
