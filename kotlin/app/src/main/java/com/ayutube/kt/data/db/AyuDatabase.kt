package com.ayutube.kt.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [
        PlaylistEntity::class,
        PlaylistItemEntity::class,
        WatchLaterEntity::class,
        HistoryEntity::class,
        LikeEntity::class,
        ChannelPrefEntity::class,
        NoteEntity::class
    ],
    version = 1,
    exportSchema = false
)
abstract class AyuDatabase : RoomDatabase() {
    abstract fun library(): LibraryDao

    companion object {
        fun create(context: Context): AyuDatabase =
            Room.databaseBuilder(context, AyuDatabase::class.java, "ayutube.db").build()
    }
}
