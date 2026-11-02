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
        NoteEntity::class,
        DownloadEntity::class
    ],
    version = 3,
    exportSchema = false
)
abstract class AyuDatabase : RoomDatabase() {
    abstract fun library(): LibraryDao
    abstract fun downloads(): DownloadDao

    companion object {
        /** Rows now remember which channel a video came from (for its picture). */
        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                for (table in listOf("playlist_items", "watch_later", "watch_history", "video_likes")) {
                    db.execSQL("ALTER TABLE $table ADD COLUMN channel_id TEXT NOT NULL DEFAULT ''")
                }
            }
        }

        /** Adds the table that remembers downloaded videos. */
        private val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS downloads (" +
                        "video_id TEXT NOT NULL, " +
                        "title TEXT NOT NULL, " +
                        "channel_title TEXT NOT NULL, " +
                        "channel_id TEXT NOT NULL, " +
                        "thumbnail_url TEXT NOT NULL, " +
                        "thumb_path TEXT, " +
                        "duration_seconds INTEGER NOT NULL, " +
                        "status TEXT NOT NULL, " +
                        "quality INTEGER NOT NULL, " +
                        "progress INTEGER NOT NULL, " +
                        "size_bytes INTEGER NOT NULL, " +
                        "video_path TEXT, " +
                        "audio_path TEXT, " +
                        "error TEXT, " +
                        "created_at INTEGER NOT NULL, " +
                        "PRIMARY KEY(video_id))"
                )
            }
        }

        fun create(context: Context): AyuDatabase =
            Room.databaseBuilder(context, AyuDatabase::class.java, "ayutube.db")
                .addMigrations(MIGRATION_1_2, MIGRATION_2_3)
                .build()
    }
}
