package com.ayutube.kt.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

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
    version = 2,
    exportSchema = false
)
abstract class AyuDatabase : RoomDatabase() {
    abstract fun library(): LibraryDao

    companion object {
        /** Rows now remember which channel a video came from (for its picture). */
        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                for (table in listOf("playlist_items", "watch_later", "watch_history", "video_likes")) {
                    db.execSQL("ALTER TABLE $table ADD COLUMN channel_id TEXT NOT NULL DEFAULT ''")
                }
            }
        }

        fun create(context: Context): AyuDatabase =
            Room.databaseBuilder(context, AyuDatabase::class.java, "ayutube.db")
                .addMigrations(MIGRATION_1_2)
                .build()
    }
}
