package com.ayutube.kt.data.db

import com.ayutube.kt.data.Profile
import com.ayutube.kt.data.SettingsStore
import com.ayutube.kt.data.VideoItem
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.UUID

data class LibraryStats(
    val playlists: Int,
    val watchLater: Int,
    val history: Int,
    val likes: Int,
    val following: Int
)

/** Everything the person saves lives here, on the phone. */
class LibraryRepository(
    private val dao: LibraryDao,
    private val settings: SettingsStore
) {
    private fun now() = Instant.now().toString()
    private fun newId() = UUID.randomUUID().toString()

    // ---- playlists
    suspend fun playlists() = dao.playlists()

    suspend fun createPlaylist(name: String, description: String = ""): PlaylistEntity {
        val title = name.trim()

        require(title.isNotEmpty()) { "Give the playlist a name." }
        require(title.length <= 100) { "Playlist names can be up to 100 characters." }

        val stamp = now()
        val playlist = PlaylistEntity(newId(), title, description.trim(), false, stamp, stamp)

        dao.upsertPlaylist(playlist)

        return playlist
    }

    suspend fun renamePlaylist(id: String, name: String) {
        val current = dao.playlist(id) ?: return

        dao.upsertPlaylist(current.copy(name = name.trim().ifEmpty { current.name }, updatedAt = now()))
    }

    suspend fun setFavorite(id: String, favorite: Boolean) {
        val current = dao.playlist(id) ?: return

        dao.upsertPlaylist(current.copy(isFavorite = favorite, updatedAt = now()))
    }

    suspend fun deletePlaylist(id: String) {
        dao.deleteItemsOf(id)
        dao.deletePlaylist(id)
    }

    suspend fun playlistItems(id: String, limit: Int = 100, offset: Int = 0) = dao.items(id, limit, offset)

    /** Returns false when the video is already in the playlist. */
    suspend fun addToPlaylist(playlistId: String, video: VideoItem): Boolean {
        val position = dao.maxPosition(playlistId) + 1
        val row = PlaylistItemEntity(
            newId(), playlistId, video.id, video.title, video.channel, video.thumbnail, position, now(), video.channelId
        )

        return dao.insertItem(row) != -1L
    }

    suspend fun removeFromPlaylist(itemId: String) = dao.deleteItem(itemId)

    suspend fun playlistProgress(): Map<String, PlaylistProgress> =
        dao.progress().associateBy { it.playlistId }

    // ---- watch later
    suspend fun watchLater(limit: Int = 100, offset: Int = 0) = dao.watchLater(limit, offset)

    suspend fun isWatchLater(videoId: String) = dao.isWatchLater(videoId) > 0

    suspend fun addWatchLater(video: VideoItem): Boolean =
        dao.insertWatchLater(
            WatchLaterEntity(newId(), video.id, video.title, video.channel, video.thumbnail, now(), video.channelId)
        ) != -1L

    suspend fun removeWatchLater(videoId: String) = dao.deleteWatchLater(videoId)

    // ---- history
    suspend fun history(limit: Int = 100, offset: Int = 0) = dao.history(limit, offset)

    suspend fun historyOf(videoId: String) = dao.historyOf(videoId)

    suspend fun saveProgress(video: VideoItem, progressSeconds: Int, durationSeconds: Int?) {
        if (settings.settings.value.pauseHistory) return

        val existing = dao.historyOf(video.id)

        dao.upsertHistory(
            HistoryEntity(
                id = existing?.id ?: newId(),
                videoId = video.id,
                title = video.title,
                channelTitle = video.channel,
                thumbnailUrl = video.thumbnail,
                watchedAt = now(),
                progressSeconds = progressSeconds.coerceAtLeast(0),
                durationSeconds = durationSeconds?.takeIf { it > 0 },
                channelId = video.channelId.ifEmpty { existing?.channelId.orEmpty() }
            )
        )
    }

    suspend fun removeHistory(videoId: String) = dao.deleteHistory(videoId)

    suspend fun clearHistory() = dao.clearHistory()

    // ---- likes
    suspend fun likes(limit: Int = 300) = dao.likes(limit)

    suspend fun isLiked(videoId: String) = dao.isLiked(videoId) > 0

    suspend fun like(video: VideoItem) {
        dao.insertLike(LikeEntity(newId(), video.id, video.title, video.channel, video.thumbnail, now(), video.channelId))
    }

    suspend fun unlike(videoId: String) = dao.deleteLike(videoId)

    // ---- follows and blocks
    suspend fun channelPrefs() = dao.channelPrefs()

    suspend fun setChannelPref(key: String, name: String, kind: String, avatar: String? = null) {
        val existing = dao.channelPrefs().firstOrNull { it.channelKey == key }

        dao.upsertChannelPref(
            ChannelPrefEntity(
                key,
                name,
                kind,
                avatar?.takeIf { it.startsWith("https://") } ?: existing?.avatar,
                existing?.createdAt ?: now()
            )
        )
    }

    suspend fun removeChannelPref(key: String) = dao.deleteChannelPref(key)

    // ---- notes
    suspend fun notes(videoId: String) = dao.notes(videoId)

    suspend fun addNote(videoId: String, seconds: Int, body: String) {
        val text = body.trim()

        require(text.isNotEmpty()) { "Write something first." }
        require(text.length <= 1000) { "Notes can be up to 1000 characters." }

        dao.insertNote(NoteEntity(newId(), videoId, seconds.coerceAtLeast(0), text, now()))
    }

    suspend fun deleteNote(id: String) = dao.deleteNote(id)

    // ---- stats, backup, erase
    suspend fun stats() = LibraryStats(
        dao.playlistCount(),
        dao.watchLaterCount(),
        dao.historyCount(),
        dao.likeCount(),
        dao.followCount()
    )

    /** Same file format as the web app's "Export backup". */
    suspend fun exportJson(): String {
        val root = JSONObject()
            .put("app", "ayutube")
            .put("exported_at", now())
            .put("version", 1)

        root.put("playlists", JSONArray().also { array ->
            dao.playlists().forEach {
                array.put(
                    JSONObject().put("id", it.id).put("name", it.name).put("description", it.description)
                        .put("is_favorite", it.isFavorite).put("created_at", it.createdAt)
                        .put("updated_at", it.updatedAt)
                )
            }
        })
        root.put("playlist_items", JSONArray().also { array ->
            dao.allItems().forEach {
                array.put(
                    JSONObject().put("id", it.id).put("playlist_id", it.playlistId).put("video_id", it.videoId)
                        .put("title", it.title).put("channel_title", it.channelTitle)
                        .put("thumbnail_url", it.thumbnailUrl).put("position", it.position)
                        .put("added_at", it.addedAt).put("channel_id", it.channelId)
                )
            }
        })
        root.put("watch_later", JSONArray().also { array ->
            dao.allWatchLater().forEach {
                array.put(
                    JSONObject().put("id", it.id).put("video_id", it.videoId).put("title", it.title)
                        .put("channel_title", it.channelTitle).put("thumbnail_url", it.thumbnailUrl)
                        .put("added_at", it.addedAt).put("channel_id", it.channelId)
                )
            }
        })
        root.put("watch_history", JSONArray().also { array ->
            dao.allHistory().forEach {
                array.put(
                    JSONObject().put("id", it.id).put("video_id", it.videoId).put("title", it.title)
                        .put("channel_title", it.channelTitle).put("thumbnail_url", it.thumbnailUrl)
                        .put("watched_at", it.watchedAt).put("progress_seconds", it.progressSeconds)
                        .put("duration_seconds", it.durationSeconds ?: JSONObject.NULL).put("channel_id", it.channelId)
                )
            }
        })
        root.put("video_likes", JSONArray().also { array ->
            dao.allLikes().forEach {
                array.put(
                    JSONObject().put("id", it.id).put("video_id", it.videoId).put("title", it.title)
                        .put("channel_title", it.channelTitle).put("thumbnail_url", it.thumbnailUrl)
                        .put("created_at", it.createdAt).put("channel_id", it.channelId)
                )
            }
        })
        root.put("channel_preferences", JSONArray().also { array ->
            dao.channelPrefs().forEach {
                array.put(
                    JSONObject().put("channel_key", it.channelKey).put("channel_name", it.channelName)
                        .put("kind", it.kind).put("avatar", it.avatar ?: JSONObject.NULL)
                        .put("created_at", it.createdAt)
                )
            }
        })
        root.put("video_notes", JSONArray().also { array ->
            dao.allNotes().forEach {
                array.put(
                    JSONObject().put("id", it.id).put("video_id", it.videoId).put("seconds", it.seconds)
                        .put("body", it.body).put("created_at", it.createdAt)
                )
            }
        })
        root.put("profile", SettingsStore.profileToJson(settings.profile.value))

        return root.toString(2)
    }

    /** Adds anything that is not already stored. Returns how many records were added. */
    suspend fun importJson(text: String): Int {
        val root = try {
            JSONObject(text)
        } catch (_: Exception) {
            throw IllegalArgumentException("That file is not a valid AyuTube backup.")
        }

        require(root.optString("app") == "ayutube") { "That file is not a valid AyuTube backup." }

        var added = 0

        fun rows(key: String): List<JSONObject> {
            val array = root.optJSONArray(key) ?: return emptyList()

            return (0 until array.length()).mapNotNull { array.optJSONObject(it) }
        }

        fun JSONObject.str(key: String) = optString(key, "")
        fun JSONObject.id() = str("id").ifEmpty { newId() }

        for (row in rows("playlists")) {
            if (dao.insertPlaylist(
                    PlaylistEntity(
                        row.id(), row.str("name").ifEmpty { "Playlist" }, row.str("description"),
                        row.optBoolean("is_favorite"), row.str("created_at").ifEmpty { now() },
                        row.str("updated_at").ifEmpty { now() }
                    )
                ) != -1L
            ) added += 1
        }

        for (row in rows("playlist_items")) {
            if (row.str("video_id").isEmpty() || row.str("playlist_id").isEmpty()) continue

            if (dao.insertItem(
                    PlaylistItemEntity(
                        row.id(), row.str("playlist_id"), row.str("video_id"), row.str("title"),
                        row.str("channel_title"), row.str("thumbnail_url"), row.optInt("position"),
                        row.str("added_at").ifEmpty { now() }, row.str("channel_id")
                    )
                ) != -1L
            ) added += 1
        }

        for (row in rows("watch_later")) {
            if (row.str("video_id").isEmpty()) continue

            if (dao.insertWatchLater(
                    WatchLaterEntity(
                        row.id(), row.str("video_id"), row.str("title"), row.str("channel_title"),
                        row.str("thumbnail_url"), row.str("added_at").ifEmpty { now() }, row.str("channel_id")
                    )
                ) != -1L
            ) added += 1
        }

        for (row in rows("watch_history")) {
            if (row.str("video_id").isEmpty()) continue

            if (dao.insertHistory(
                    HistoryEntity(
                        row.id(), row.str("video_id"), row.str("title"), row.str("channel_title"),
                        row.str("thumbnail_url"), row.str("watched_at").ifEmpty { now() },
                        row.optInt("progress_seconds"),
                        if (row.isNull("duration_seconds")) null else row.optInt("duration_seconds"),
                        row.str("channel_id")
                    )
                ) != -1L
            ) added += 1
        }

        for (row in rows("video_likes")) {
            if (row.str("video_id").isEmpty()) continue

            if (dao.insertLike(
                    LikeEntity(
                        row.id(), row.str("video_id"), row.str("title"), row.str("channel_title"),
                        row.str("thumbnail_url"), row.str("created_at").ifEmpty { now() }, row.str("channel_id")
                    )
                ) != -1L
            ) added += 1
        }

        for (row in rows("channel_preferences")) {
            val key = row.str("channel_key")

            if (key.isEmpty() || row.str("kind") !in setOf("follow", "block")) continue

            if (dao.insertChannelPref(
                    ChannelPrefEntity(
                        key, row.str("channel_name").ifEmpty { key }, row.str("kind"),
                        row.str("avatar").takeIf { it.startsWith("https://") },
                        row.str("created_at").ifEmpty { now() }
                    )
                ) != -1L
            ) added += 1
        }

        for (row in rows("video_notes")) {
            if (row.str("video_id").isEmpty() || row.str("body").isEmpty()) continue

            if (dao.insertNote(
                    NoteEntity(
                        row.id(), row.str("video_id"), row.optInt("seconds"), row.str("body"),
                        row.str("created_at").ifEmpty { now() }
                    )
                ) != -1L
            ) added += 1
        }

        root.optJSONObject("profile")?.let { json ->
            if (settings.profile.value.onboardedAt == null) {
                val imported = SettingsStore.profileFromJson(json)

                settings.updateProfile { imported }
            }
        }

        return added
    }

    suspend fun eraseAll() {
        dao.clearHistory()
        dao.eraseItems()
        dao.erasePlaylists()
        dao.eraseWatchLater()
        dao.eraseLikes()
        dao.erasePrefs()
        dao.eraseNotes()
        settings.updateProfile { Profile() }
    }
}
