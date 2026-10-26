package com.ayutube.app.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** Versioned, device-only storage for native library features. No network access. */
class LocalLibraryRepository(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("ayutube_native_library_v1", Context.MODE_PRIVATE)
    private val lock = Any()

    fun toggleLike(video: VideoItem): Boolean = synchronized(lock) {
        val items = readItems("likes")
        val removed = items.removeAll { it.optString("id") == video.id }
        if (!removed) items.add(0, encode(video))
        writeItems("likes", items.take(MAX_SAVED))
        !removed
    }

    fun isLiked(videoId: String): Boolean = synchronized(lock) {
        readItems("likes").any { it.optString("id") == videoId }
    }

    fun addWatchLater(video: VideoItem): Boolean = synchronized(lock) {
        val items = readItems("watch_later")
        if (items.any { it.optString("id") == video.id }) return@synchronized false
        items.add(0, encode(video))
        writeItems("watch_later", items.take(MAX_SAVED))
        true
    }

    fun removeWatchLater(videoId: String) = synchronized(lock) {
        writeItems("watch_later", readItems("watch_later").filterNot { it.optString("id") == videoId })
    }

    fun recordHistory(video: VideoItem, positionSeconds: Long = 0L) = synchronized(lock) {
        val items = readItems("history")
        val previous = items.firstOrNull { it.optString("id") == video.id }
        items.removeAll { it.optString("id") == video.id }
        val entry = encode(video).put("position_seconds", positionSeconds.coerceAtLeast(0L))
            .put("watched_at", System.currentTimeMillis())
        if (previous != null && positionSeconds <= 0L) {
            entry.put("position_seconds", previous.optLong("position_seconds", 0L))
        }
        items.add(0, entry)
        writeItems("history", items.take(MAX_HISTORY))
    }

    fun updateProgress(videoId: String, seconds: Long) = synchronized(lock) {
        val items = readItems("history")
        items.firstOrNull { it.optString("id") == videoId }?.put("position_seconds", seconds.coerceAtLeast(0L))
            ?.put("watched_at", System.currentTimeMillis())
        writeItems("history", items.take(MAX_HISTORY))
    }

    fun historyProgress(videoId: String): Long = synchronized(lock) {
        readItems("history").firstOrNull { it.optString("id") == videoId }?.optLong("position_seconds", 0L) ?: 0L
    }

    fun likes(): List<VideoItem> = synchronized(lock) { decodeItems(readItems("likes")) }
    fun watchLater(): List<VideoItem> = synchronized(lock) { decodeItems(readItems("watch_later")) }
    fun history(): List<VideoItem> = synchronized(lock) { decodeItems(readItems("history")) }
    fun clearHistory() = synchronized(lock) { writeItems("history", emptyList()) }

    fun studySettings(): JSONObject = synchronized(lock) {
        runCatching { JSONObject(prefs.getString("study_settings", "{}") ?: "{}") }.getOrDefault(JSONObject())
    }

    fun saveStudySettings(exam: String, dateIso: String, subjects: List<String>, enabled: Boolean) = synchronized(lock) {
        val clean = subjects.map { it.trim().take(80) }.filter { it.isNotBlank() }.distinct().take(8)
        val settings = JSONObject().put("exam", exam.trim().take(120))
            .put("date", dateIso.take(10)).put("subjects", JSONArray(clean)).put("enabled", enabled)
        prefs.edit().putString("study_settings", settings.toString()).apply()
    }

    private fun readItems(key: String): MutableList<JSONObject> = try {
        val array = JSONArray(prefs.getString(key, "[]") ?: "[]")
        (0 until array.length()).mapNotNull { array.optJSONObject(it) }.toMutableList()
    } catch (_: Throwable) { mutableListOf() }

    private fun writeItems(key: String, items: List<JSONObject>) {
        prefs.edit().putString(key, JSONArray(items.take(MAX_HISTORY)).toString()).apply()
    }

    private fun encode(video: VideoItem) = JSONObject()
        .put("id", video.id.take(30)).put("title", video.title.take(500))
        .put("url", video.url.take(2000)).put("channel", video.channelName.take(300))
        .put("channel_url", video.channelUrl.take(2000)).put("thumbnail", video.thumbnailUrl.take(2000))
        .put("duration", video.durationSeconds.coerceAtLeast(0L)).put("views", video.views)
        .put("short", video.isShort)

    private fun decodeItems(items: List<JSONObject>): List<VideoItem> = items.mapNotNull { value ->
        val id = value.optString("id", "")
        if (!VIDEO_ID.matches(id)) return@mapNotNull null
        VideoItem(
            id = id,
            title = value.optString("title", "Untitled video").take(500),
            url = "https://www.youtube.com/watch?v=" + id,
            channelName = value.optString("channel", "").take(300),
            channelUrl = value.optString("channel_url", "").take(2000),
            thumbnailUrl = value.optString("thumbnail", "").take(2000),
            durationSeconds = value.optLong("duration", 0L).coerceAtLeast(0L),
            views = value.optLong("views", -1L),
            isShort = value.optBoolean("short", false)
        )
    }

    companion object {
        private const val MAX_SAVED = 500
        private const val MAX_HISTORY = 1000
        private val VIDEO_ID = Regex("^[A-Za-z0-9_-]{6,20}$")
    }
}
