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
}
