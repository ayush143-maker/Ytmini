package com.ayutube.kt.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface DownloadDao {
    @Query("SELECT * FROM downloads ORDER BY created_at DESC")
    fun observeAll(): Flow<List<DownloadEntity>>

    @Query("SELECT * FROM downloads WHERE status IN ('QUEUED', 'RUNNING') ORDER BY created_at")
    fun observeActive(): Flow<List<DownloadEntity>>

    @Query("SELECT * FROM downloads WHERE video_id = :id")
    suspend fun get(id: String): DownloadEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(download: DownloadEntity)

    @Query("UPDATE downloads SET status = :status, error = :error WHERE video_id = :id")
    suspend fun setStatus(id: String, status: String, error: String?)

    @Query("UPDATE downloads SET progress = :progress WHERE video_id = :id")
    suspend fun setProgress(id: String, progress: Int)

    @Query(
        "UPDATE downloads SET status = 'DONE', progress = 1000, error = NULL, size_bytes = :size, " +
            "video_path = :video, audio_path = :audio, thumb_path = :thumb WHERE video_id = :id"
    )
    suspend fun finish(id: String, size: Long, video: String?, audio: String?, thumb: String?)

    /** After the app was killed mid-download: nothing is running any more. */
    @Query("UPDATE downloads SET status = 'PAUSED' WHERE status IN ('QUEUED', 'RUNNING')")
    suspend fun pauseStale()

    @Query("DELETE FROM downloads WHERE video_id = :id")
    suspend fun delete(id: String)

    @Query("DELETE FROM downloads")
    suspend fun deleteAll()
}
