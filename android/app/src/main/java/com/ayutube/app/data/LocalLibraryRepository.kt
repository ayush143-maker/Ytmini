package com.ayutube.app.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** Versioned, device-only storage for native library features. No network access. */
data class LocalPlaylist(val id: String, val name: String, val videos: List<VideoItem>, val createdAt: Long)

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

    fun playlists(): List<LocalPlaylist> = synchronized(lock) {
        val array = runCatching { JSONArray(prefs.getString("custom_playlists", "[]") ?: "[]") }.getOrDefault(JSONArray())
        (0 until array.length()).mapNotNull { index ->
            val value = array.optJSONObject(index) ?: return@mapNotNull null
            val id = value.optString("id", "")
            val name = value.optString("name", "").take(80)
            if (id.isBlank() || name.isBlank()) return@mapNotNull null
            val items = value.optJSONArray("videos") ?: JSONArray()
            val rows = (0 until items.length()).mapNotNull { items.optJSONObject(it) }
            LocalPlaylist(id, name, decodeItems(rows), value.optLong("created_at", 0L))
        }
    }

    fun createPlaylist(rawName: String): String? = synchronized(lock) {
        val name = rawName.trim().take(80)
        if (name.isBlank()) return@synchronized null
        val array = readObjectArray("custom_playlists")
        if (array.length() >= MAX_PLAYLISTS) return@synchronized null
        val id = UUID.randomUUID().toString()
        array.put(JSONObject().put("id", id).put("name", name).put("created_at", System.currentTimeMillis()).put("videos", JSONArray()))
        prefs.edit().putString("custom_playlists", array.toString()).commit()
        id
    }

    fun addToPlaylist(playlistId: String, video: VideoItem): Boolean = synchronized(lock) {
        val array = readObjectArray("custom_playlists")
        for (i in 0 until array.length()) {
            val row = array.optJSONObject(i) ?: continue
            if (row.optString("id") != playlistId) continue
            val entries = row.optJSONArray("videos") ?: JSONArray()
            if ((0 until entries.length()).any { entries.optJSONObject(it)?.optString("id") == video.id }) return@synchronized false
            if (entries.length() >= MAX_SAVED) return@synchronized false
            entries.put(encode(video))
            row.put("videos", entries)
            prefs.edit().putString("custom_playlists", array.toString()).commit()
            return@synchronized true
        }
        false
    }

    fun removeFromPlaylist(playlistId: String, videoId: String): Boolean = synchronized(lock) {
        val array = readObjectArray("custom_playlists")
        for (i in 0 until array.length()) {
            val row = array.optJSONObject(i) ?: continue
            if (row.optString("id") != playlistId) continue
            val entries = row.optJSONArray("videos") ?: JSONArray()
            val kept = JSONArray()
            var removed = false
            for (j in 0 until entries.length()) {
                val item = entries.optJSONObject(j) ?: continue
                if (item.optString("id") == videoId) removed = true else kept.put(item)
            }
            if (removed) {
                row.put("videos", kept)
                prefs.edit().putString("custom_playlists", array.toString()).commit()
            }
            return@synchronized removed
        }
        false
    }

    fun deletePlaylist(playlistId: String): Boolean = synchronized(lock) {
        val all = readObjectArray("custom_playlists")
        val kept = JSONArray()
        var removed = false
        for (i in 0 until all.length()) {
            val item = all.optJSONObject(i) ?: continue
            if (item.optString("id") == playlistId) removed = true else kept.put(item)
        }
        if (removed) prefs.edit().putString("custom_playlists", kept.toString()).commit()
        removed
    }

    fun note(videoId: String): String = synchronized(lock) {
        runCatching { JSONObject(prefs.getString("video_notes", "{}") ?: "{}").optString(videoId, "") }.getOrDefault("")
    }

    fun saveNote(videoId: String, rawText: String) = synchronized(lock) {
        if (!VIDEO_ID.matches(videoId)) return@synchronized
        val notes = runCatching { JSONObject(prefs.getString("video_notes", "{}") ?: "{}") }.getOrDefault(JSONObject())
        val text = rawText.trim().take(MAX_NOTE_CHARS)
        if (text.isEmpty()) notes.remove(videoId) else notes.put(videoId, text)
        prefs.edit().putString("video_notes", notes.toString()).commit()
    }

    fun exportBackup(): String = synchronized(lock) {
        JSONObject().put("format", "ayutube-native-library").put("version", 1)
            .put("exported_at", System.currentTimeMillis())
            .put("likes", readObjectArray("likes"))
            .put("watch_later", readObjectArray("watch_later"))
            .put("history", readObjectArray("history"))
            .put("custom_playlists", readObjectArray("custom_playlists"))
            .put("video_notes", runCatching { JSONObject(prefs.getString("video_notes", "{}") ?: "{}") }.getOrDefault(JSONObject()))
            .put("study_settings", studySettings()).toString(2)
    }

    /** Validates a whole backup before touching preferences; malformed imports preserve current data. */
    fun importBackup(raw: String): Boolean = synchronized(lock) {
        if (raw.length > MAX_BACKUP_CHARS) return@synchronized false
        try {
            val root = JSONObject(raw)
            if (root.optString("format") != "ayutube-native-library" || root.optInt("version", -1) != 1) return@synchronized false
            val likes = validatedVideoArray(root.optJSONArray("likes"), MAX_SAVED) ?: return@synchronized false
            val watchLater = validatedVideoArray(root.optJSONArray("watch_later"), MAX_SAVED) ?: return@synchronized false
            val history = validatedVideoArray(root.optJSONArray("history"), MAX_HISTORY) ?: return@synchronized false
            val playlists = validatedPlaylists(root.optJSONArray("custom_playlists")) ?: return@synchronized false
            val notes = root.optJSONObject("video_notes") ?: return@synchronized false
            if (notes.length() > MAX_NOTES) return@synchronized false
            val cleanNotes = JSONObject()
            val keys = notes.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                val value = notes.optString(key, "")
                if (!VIDEO_ID.matches(key) || value.length > MAX_NOTE_CHARS) return@synchronized false
                if (value.isNotBlank()) cleanNotes.put(key, value)
            }
            val study = root.optJSONObject("study_settings") ?: JSONObject()
            val editor = prefs.edit()
                .putString("likes", likes.toString())
                .putString("watch_later", watchLater.toString())
                .putString("history", history.toString())
                .putString("custom_playlists", playlists.toString())
                .putString("video_notes", cleanNotes.toString())
                .putString("study_settings", study.toString())
            editor.commit()
        } catch (_: Throwable) { false }
    }

    private fun readObjectArray(key: String): JSONArray = try {
        JSONArray(prefs.getString(key, "[]") ?: "[]")
    } catch (_: Throwable) { JSONArray() }

    private fun validatedVideoArray(input: JSONArray?, limit: Int): JSONArray? {
        if (input == null || input.length() > limit) return null
        val result = JSONArray()
        val seen = HashSet<String>()
        for (i in 0 until input.length()) {
            val row = input.optJSONObject(i) ?: return null
            val id = row.optString("id", "")
            if (!VIDEO_ID.matches(id) || !seen.add(id)) return null
            result.put(JSONObject(row.toString()).put("title", row.optString("title", "Untitled video").take(500)))
        }
        return result
    }

    private fun validatedPlaylists(input: JSONArray?): JSONArray? {
        if (input == null || input.length() > MAX_PLAYLISTS) return null
        val result = JSONArray(); val ids = HashSet<String>()
        for (i in 0 until input.length()) {
            val row = input.optJSONObject(i) ?: return null
            val id = row.optString("id", "").take(80)
            val name = row.optString("name", "").trim().take(80)
            val videos = validatedVideoArray(row.optJSONArray("videos"), MAX_SAVED) ?: return null
            if (id.isBlank() || name.isBlank() || !ids.add(id)) return null
            result.put(JSONObject().put("id", id).put("name", name)
                .put("created_at", row.optLong("created_at", 0L)).put("videos", videos))
        }
        return result
    }

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
        private const val MAX_PLAYLISTS = 100
        private const val MAX_NOTE_CHARS = 5000
        private const val MAX_NOTES = 1000
        private const val MAX_BACKUP_CHARS = 2_000_000
        private val VIDEO_ID = Regex("^[A-Za-z0-9_-]{6,20}$")
    }
}
