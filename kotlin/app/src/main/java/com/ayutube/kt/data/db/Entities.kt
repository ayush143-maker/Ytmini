package com.ayutube.kt.data.db

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

// Column names match the web app's export file so backups move across.

@Entity(tableName = "playlists")
data class PlaylistEntity(
    @PrimaryKey val id: String,
    val name: String,
    val description: String,
    @ColumnInfo(name = "is_favorite") val isFavorite: Boolean,
    @ColumnInfo(name = "created_at") val createdAt: String,
    @ColumnInfo(name = "updated_at") val updatedAt: String
)

@Entity(
    tableName = "playlist_items",
    indices = [Index("playlist_id"), Index(value = ["playlist_id", "video_id"], unique = true)]
)
data class PlaylistItemEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "playlist_id") val playlistId: String,
    @ColumnInfo(name = "video_id") val videoId: String,
    val title: String,
    @ColumnInfo(name = "channel_title") val channelTitle: String,
    @ColumnInfo(name = "thumbnail_url") val thumbnailUrl: String,
    val position: Int,
    @ColumnInfo(name = "added_at") val addedAt: String,
    @ColumnInfo(name = "channel_id", defaultValue = "") val channelId: String = ""
)

@Entity(tableName = "watch_later", indices = [Index(value = ["video_id"], unique = true)])
data class WatchLaterEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "video_id") val videoId: String,
    val title: String,
    @ColumnInfo(name = "channel_title") val channelTitle: String,
    @ColumnInfo(name = "thumbnail_url") val thumbnailUrl: String,
    @ColumnInfo(name = "added_at") val addedAt: String,
    @ColumnInfo(name = "channel_id", defaultValue = "") val channelId: String = ""
)

@Entity(tableName = "watch_history", indices = [Index(value = ["video_id"], unique = true)])
data class HistoryEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "video_id") val videoId: String,
    val title: String,
    @ColumnInfo(name = "channel_title") val channelTitle: String,
    @ColumnInfo(name = "thumbnail_url") val thumbnailUrl: String,
    @ColumnInfo(name = "watched_at") val watchedAt: String,
    @ColumnInfo(name = "progress_seconds") val progressSeconds: Int,
    @ColumnInfo(name = "duration_seconds") val durationSeconds: Int?,
    @ColumnInfo(name = "channel_id", defaultValue = "") val channelId: String = ""
)

@Entity(tableName = "video_likes", indices = [Index(value = ["video_id"], unique = true)])
data class LikeEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "video_id") val videoId: String,
    val title: String,
    @ColumnInfo(name = "channel_title") val channelTitle: String,
    @ColumnInfo(name = "thumbnail_url") val thumbnailUrl: String,
    @ColumnInfo(name = "created_at") val createdAt: String,
    @ColumnInfo(name = "channel_id", defaultValue = "") val channelId: String = ""
)

@Entity(tableName = "channel_preferences")
data class ChannelPrefEntity(
    @PrimaryKey @ColumnInfo(name = "channel_key") val channelKey: String,
    @ColumnInfo(name = "channel_name") val channelName: String,
    val kind: String,
    val avatar: String?,
    @ColumnInfo(name = "created_at") val createdAt: String
)

@Entity(tableName = "video_notes", indices = [Index("video_id")])
data class NoteEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "video_id") val videoId: String,
    val seconds: Int,
    val body: String,
    @ColumnInfo(name = "created_at") val createdAt: String
)

data class PlaylistProgress(val playlistId: String, val total: Int, val completed: Int)
