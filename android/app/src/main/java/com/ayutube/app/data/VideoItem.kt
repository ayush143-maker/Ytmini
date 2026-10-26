package com.ayutube.app.data

data class VideoItem(
    val id: String,
    val title: String,
    val url: String,
    val channelName: String = "",
    val channelUrl: String = "",
    val thumbnailUrl: String = "",
    val durationSeconds: Long = 0L,
    val views: Long = -1L,
    val isShort: Boolean = false,
    val channelThumbnailUrl: String = ""
) {
    val durationLabel: String
        get() {
            if (durationSeconds <= 0) return "Duration unavailable"
            val hours = durationSeconds / 3600
            val minutes = (durationSeconds % 3600) / 60
            val seconds = durationSeconds % 60
            return if (hours > 0) "%d:%02d:%02d".format(hours, minutes, seconds)
            else "%d:%02d".format(minutes, seconds)
        }

    val viewsLabel: String
        get() = when {
            views < 0 -> ""
            views >= 1_000_000_000 -> "%.1fB views".format(views / 1_000_000_000.0)
            views >= 1_000_000 -> "%.1fM views".format(views / 1_000_000.0)
            views >= 1_000 -> "%.1fK views".format(views / 1_000.0)
            else -> "$views views"
        }
}
