package com.ayutube.kt.data

import android.content.Context
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import java.util.concurrent.ConcurrentHashMap

/** Channel pictures, fetched once per channel and remembered on the phone. */
object AvatarCache {
    private val memory = ConcurrentHashMap<String, String>()
    private val failed = ConcurrentHashMap.newKeySet<String>()
    private val gate = Semaphore(3)
    private var prefs: android.content.SharedPreferences? = null

    fun init(context: Context) {
        val store = context.getSharedPreferences("avatars", Context.MODE_PRIVATE)

        prefs = store
        store.all.forEach { (key, value) -> if (value is String) memory[key] = value }
    }

    suspend fun get(channelId: String): String {
        memory[channelId]?.let { return it }

        if (channelId in failed) return ""

        return gate.withPermit {
            memory[channelId]?.let { return@withPermit it }

            try {
                val url = ExtractorRepository.channelAvatar(channelId)

                if (url.startsWith("https://")) {
                    memory[channelId] = url
                    prefs?.edit()?.putString(channelId, url)?.apply()
                    url
                } else {
                    failed.add(channelId)
                    ""
                }
            } catch (_: Exception) {
                failed.add(channelId)
                ""
            }
        }
    }

    /** Picture by channel name, for rows saved before channel ids were kept. */
    suspend fun byName(name: String): String {
        val key = "name:" + name.trim().lowercase()

        if (name.isBlank()) return ""

        memory[key]?.let { return it }

        if (key in failed) return ""

        return gate.withPermit {
            memory[key]?.let { return@withPermit it }

            try {
                val url = ExtractorRepository.channelAvatarByName(name)

                if (url.startsWith("https://")) {
                    memory[key] = url
                    prefs?.edit()?.putString(key, url)?.apply()
                    url
                } else {
                    failed.add(key)
                    ""
                }
            } catch (_: Exception) {
                failed.add(key)
                ""
            }
        }
    }
}
