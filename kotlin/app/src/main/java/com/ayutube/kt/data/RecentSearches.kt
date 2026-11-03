package com.ayutube.kt.data

import android.content.Context

/** The last searches, kept on the phone, each with the time it was made (so a fresh search can colour the feed for a while). */
class RecentSearches(context: Context) {
    private val prefs = context.getSharedPreferences("recent_searches", Context.MODE_PRIVATE)

    private class Entry(val text: String, val at: Long)

    private fun entries(): List<Entry> =
        prefs.getString("items", "")?.split('\n')?.filter { it.isNotBlank() }?.map { line ->
            val tab = line.indexOf('\t')
            val stamp = if (tab > 0) line.substring(0, tab).toLongOrNull() else null

            // Lines saved before times were kept are just the text.
            if (stamp != null) Entry(line.substring(tab + 1), stamp) else Entry(line, 0L)
        } ?: emptyList()

    private fun save(list: List<Entry>) {
        prefs.edit().putString("items", list.joinToString("\n") { "${it.at}\t${it.text}" }).apply()
    }

    fun all(): List<String> = entries().map { it.text }

    /** Searches made within the last [maxAgeMs] milliseconds, newest first, each with how long ago it was made. */
    fun recent(maxAgeMs: Long): List<Pair<String, Long>> {
        val now = System.currentTimeMillis()

        return entries().filter { it.at > 0L && now - it.at <= maxAgeMs }.map { it.text to (now - it.at) }
    }

    fun add(query: String) {
        val text = query.trim()

        if (text.isEmpty()) return

        val next = (listOf(Entry(text, System.currentTimeMillis())) + entries().filter { !it.text.equals(text, ignoreCase = true) }).take(12)

        save(next)
    }

    fun remove(query: String) {
        save(entries().filter { it.text != query })
    }

    fun clear() {
        prefs.edit().remove("items").apply()
    }
}
