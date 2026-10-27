package com.ayutube.kt.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Upsert

@Dao
interface LibraryDao {
    // ---- playlists
    @Query("SELECT * FROM playlists ORDER BY created_at DESC")
    suspend fun playlists(): List<PlaylistEntity>

    @Query("SELECT * FROM playlists WHERE id = :id")
    suspend fun playlist(id: String): PlaylistEntity?

    @Upsert
    suspend fun upsertPlaylist(playlist: PlaylistEntity)

    @Query("DELETE FROM playlists WHERE id = :id")
    suspend fun deletePlaylist(id: String)

    @Query("DELETE FROM playlist_items WHERE playlist_id = :id")
    suspend fun deleteItemsOf(id: String)

    @Query(
        "SELECT * FROM playlist_items WHERE playlist_id = :id " +
            "ORDER BY position ASC, added_at ASC LIMIT :limit OFFSET :offset"
    )
    suspend fun items(id: String, limit: Int, offset: Int): List<PlaylistItemEntity>

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertItem(item: PlaylistItemEntity): Long

    @Query("SELECT COALESCE(MAX(position), -1) FROM playlist_items WHERE playlist_id = :id")
    suspend fun maxPosition(id: String): Int

    @Query("DELETE FROM playlist_items WHERE id = :id")
    suspend fun deleteItem(id: String)

    @Query("UPDATE playlist_items SET position = :position WHERE id = :id")
    suspend fun setPosition(id: String, position: Int)

    @Query(
        "SELECT i.playlist_id AS playlistId, COUNT(*) AS total, " +
            "SUM(CASE WHEN h.duration_seconds > 0 AND h.progress_seconds * 10 >= h.duration_seconds * 9 " +
            "THEN 1 ELSE 0 END) AS completed " +
            "FROM playlist_items i LEFT JOIN watch_history h ON h.video_id = i.video_id " +
            "GROUP BY i.playlist_id"
    )
    suspend fun progress(): List<PlaylistProgress>

    // ---- watch later
    @Query("SELECT * FROM watch_later ORDER BY added_at DESC LIMIT :limit OFFSET :offset")
    suspend fun watchLater(limit: Int, offset: Int): List<WatchLaterEntity>

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertWatchLater(entry: WatchLaterEntity): Long

    @Query("DELETE FROM watch_later WHERE video_id = :videoId")
    suspend fun deleteWatchLater(videoId: String)

    @Query("SELECT COUNT(*) FROM watch_later WHERE video_id = :videoId")
    suspend fun isWatchLater(videoId: String): Int

    // ---- history
    @Query("SELECT * FROM watch_history ORDER BY watched_at DESC LIMIT :limit OFFSET :offset")
    suspend fun history(limit: Int, offset: Int): List<HistoryEntity>

    @Query("SELECT * FROM watch_history WHERE video_id = :videoId")
    suspend fun historyOf(videoId: String): HistoryEntity?

    @Upsert
    suspend fun upsertHistory(entry: HistoryEntity)

    @Query("DELETE FROM watch_history WHERE video_id = :videoId")
    suspend fun deleteHistory(videoId: String)

    @Query("DELETE FROM watch_history")
    suspend fun clearHistory()

    // ---- likes
    @Query("SELECT * FROM video_likes ORDER BY created_at DESC LIMIT :limit")
    suspend fun likes(limit: Int): List<LikeEntity>

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertLike(entry: LikeEntity): Long

    @Query("DELETE FROM video_likes WHERE video_id = :videoId")
    suspend fun deleteLike(videoId: String)

    @Query("SELECT COUNT(*) FROM video_likes WHERE video_id = :videoId")
    suspend fun isLiked(videoId: String): Int

    // ---- channel preferences
    @Query("SELECT * FROM channel_preferences ORDER BY created_at DESC")
    suspend fun channelPrefs(): List<ChannelPrefEntity>

    @Upsert
    suspend fun upsertChannelPref(pref: ChannelPrefEntity)

    @Query("DELETE FROM channel_preferences WHERE channel_key = :key")
    suspend fun deleteChannelPref(key: String)

    // ---- notes
    @Query("SELECT * FROM video_notes WHERE video_id = :videoId ORDER BY seconds ASC, created_at ASC")
    suspend fun notes(videoId: String): List<NoteEntity>

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertNote(note: NoteEntity): Long

    @Query("DELETE FROM video_notes WHERE id = :id")
    suspend fun deleteNote(id: String)

    // ---- counts
    @Query("SELECT COUNT(*) FROM playlists")
    suspend fun playlistCount(): Int

    @Query("SELECT COUNT(*) FROM watch_later")
    suspend fun watchLaterCount(): Int

    @Query("SELECT COUNT(*) FROM watch_history")
    suspend fun historyCount(): Int

    @Query("SELECT COUNT(*) FROM video_likes")
    suspend fun likeCount(): Int

    @Query("SELECT COUNT(*) FROM channel_preferences WHERE kind = 'follow'")
    suspend fun followCount(): Int

    // ---- export, import, erase
    @Query("SELECT * FROM playlist_items")
    suspend fun allItems(): List<PlaylistItemEntity>

    @Query("SELECT * FROM watch_later")
    suspend fun allWatchLater(): List<WatchLaterEntity>

    @Query("SELECT * FROM watch_history")
    suspend fun allHistory(): List<HistoryEntity>

    @Query("SELECT * FROM video_likes")
    suspend fun allLikes(): List<LikeEntity>

    @Query("SELECT * FROM video_notes")
    suspend fun allNotes(): List<NoteEntity>

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertPlaylist(playlist: PlaylistEntity): Long

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertHistory(entry: HistoryEntity): Long

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertChannelPref(pref: ChannelPrefEntity): Long

    @Query("DELETE FROM playlists")
    suspend fun erasePlaylists()

    @Query("DELETE FROM playlist_items")
    suspend fun eraseItems()

    @Query("DELETE FROM watch_later")
    suspend fun eraseWatchLater()

    @Query("DELETE FROM video_likes")
    suspend fun eraseLikes()

    @Query("DELETE FROM channel_preferences")
    suspend fun erasePrefs()

    @Query("DELETE FROM video_notes")
    suspend fun eraseNotes()
}
