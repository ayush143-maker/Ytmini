package com.ayutube.kt.data.db

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * One saved video. Only its state lives here; the video itself is a file on disk.
 * status: QUEUED, RUNNING, PAUSED, FAILED or DONE. quality is the picture height (0 = audio only).
 * progress runs from 0 to 1000.
 */
@Entity(tableName = "downloads")
data class DownloadEntity(
    @PrimaryKey @ColumnInfo(name = "video_id") val videoId: String,
    val title: String,
    @ColumnInfo(name = "channel_title") val channelTitle: String,
    @ColumnInfo(name = "channel_id") val channelId: String,
    @ColumnInfo(name = "thumbnail_url") val thumbnailUrl: String,
    @ColumnInfo(name = "thumb_path") val thumbPath: String?,
    @ColumnInfo(name = "duration_seconds") val durationSeconds: Int,
    val status: String,
    val quality: Int,
    val progress: Int,
    @ColumnInfo(name = "size_bytes") val sizeBytes: Long,
    @ColumnInfo(name = "video_path") val videoPath: String?,
    @ColumnInfo(name = "audio_path") val audioPath: String?,
    val error: String?,
    @ColumnInfo(name = "created_at") val createdAt: Long
)
