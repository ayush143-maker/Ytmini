package com.ayutube.kt.data

import android.content.Context

/** The last searches, kept on the phone. */
class RecentSearches(context: Context) {
    private val prefs = context.getSharedPreferences("recent_searches", Context.MODE_PRIVATE)

    fun all(): List<String> =
        prefs.getString("items", "")?.split('\n')?.filter { it.isNotBlank() } ?: emptyList()

    fun add(query: String) {
        val text = query.trim()

        if (text.isEmpty()) return

        val next = (listOf(text) + all().filter { !it.equals(text, ignoreCase = true) }).take(12)

        prefs.edit().putString("items", next.joinToString("\n")).apply()
    }

    fun remove(query: String) {
        prefs.edit().putString("items", all().filter { it != query }.joinToString("\n")).apply()
    }

    fun clear() {
        prefs.edit().remove("items").apply()
    }
}
