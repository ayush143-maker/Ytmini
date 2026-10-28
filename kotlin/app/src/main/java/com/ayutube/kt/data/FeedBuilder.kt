package com.ayutube.kt.data

import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import org.schabi.newpipe.extractor.Page

/**
 * Builds a feed from several searches and interleaves them, so no single topic
 * (or channel) floods the list. Each call to [nextBatch] continues where the
 * last one stopped.
 */
class FeedBuilder(queries: List<String>) {
    private class Source(val query: String) {
        var next: Page? = null
        var started = false
        var done = false
        val buffer = ArrayDeque<VideoItem>()
    }

    private val sources = queries.distinct().map { Source(it) }
    private val seen = HashSet<String>()
    private val recentChannels = ArrayDeque<String>()

    private suspend fun refill() = coroutineScope {
        sources.filter { it.buffer.isEmpty() && !it.done }.map { source ->
            async {
                try {
                    val page = ExtractorRepository.search(source.query, if (source.started) source.next else null)

                    source.started = true
                    source.next = page.next

                    if (page.next == null) source.done = true

                    source.buffer.addAll(page.items.filter { it.durationSec >= 20 })
                } catch (_: Exception) {
                    source.done = true
                }
            }
        }.awaitAll()
    }

    private fun take(source: Source): VideoItem? {
        val iterator = source.buffer.iterator()

        while (iterator.hasNext()) {
            val video = iterator.next()

            if (video.id in seen) {
                iterator.remove()
                continue
            }

            // At most two in a row from the same channel.
            if (recentChannels.count { it == video.channel } >= 2) continue

            iterator.remove()
            seen += video.id
            recentChannels.addLast(video.channel)

            if (recentChannels.size > 6) recentChannels.removeFirst()

            return video
        }

        return null
    }

    suspend fun nextBatch(count: Int): List<VideoItem> {
        val out = mutableListOf<VideoItem>()
        var rounds = 0

        while (out.size < count && rounds < 6) {
            rounds += 1
            refill()

            var progressed = false

            for (source in sources) {
                val video = take(source) ?: continue

                out += video
                progressed = true

                if (out.size >= count) break
            }

            if (!progressed && sources.all { it.done && it.buffer.isEmpty() }) break
        }

        return out
    }
}
