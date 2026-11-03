package com.ayutube.kt.data

import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope

/** One stream of videos inside a mixed feed, with a few kept back for later. */
class Lane(private val feed: FeedBuilder, private val rank: ((VideoItem) -> Double)? = null) {
    internal val spare = ArrayDeque<VideoItem>()
    internal var empty = false

    suspend fun ensure(n: Int) {
        while (spare.size < n && !empty) {
            val more = feed.nextBatch(maxOf(n - spare.size, 4))

            if (more.isEmpty()) {
                empty = true
            } else {
                spare.addAll(if (rank != null) more.sortedByDescending(rank) else more)
            }
        }
    }

    /** Takes the first kept-back video that [fits]. */
    fun pop(fits: (VideoItem) -> Boolean): VideoItem? {
        val iterator = spare.iterator()

        while (iterator.hasNext()) {
            val video = iterator.next()

            if (fits(video)) {
                iterator.remove()
                return video
            }
        }

        return null
    }
}

/**
 * A feed made of several lanes. [slots] says, for each position in the feed, which lanes to try (in order);
 * [allow] keeps the same channel from piling up; [onPick] is told which lane a video came from.
 */
class LaneFeed(
    private val lanes: List<Lane>,
    private val slots: (position: Int) -> List<Int>,
    private val allow: (video: VideoItem, recent: List<VideoItem>, lane: Int) -> Boolean = { _, _, _ -> true },
    private val onPick: (lane: Int) -> Unit = {}
) : Feed {
    private val seen = HashSet<String>()
    private val recent = ArrayList<VideoItem>()
    private var emitted = 0

    override suspend fun nextBatch(count: Int): List<VideoItem> {
        // Ask the lanes that will be needed first for their videos, all at once.
        val want = IntArray(lanes.size)

        for (i in 0 until count) {
            val first = slots(emitted + i).firstOrNull()

            if (first != null) want[first] += 1
        }

        coroutineScope {
            lanes.indices.filter { want[it] > 0 }.map { index -> async { lanes[index].ensure(want[index] + 2) } }.awaitAll()
        }

        val out = ArrayList<VideoItem>()

        while (out.size < count) {
            val order = slots(emitted + out.size)
            var picked: VideoItem? = null
            var from = -1

            for (index in order) {
                val lane = lanes[index]

                if (lane.spare.isEmpty()) lane.ensure(1)

                val found = lane.pop { it.id !in seen && allow(it, recent, index) }

                if (found != null) {
                    picked = found
                    from = index
                    break
                }
            }

            if (picked == null) {
                // Nothing fits the spacing rule: take anything unseen rather than stop short.
                for (index in order) {
                    val found = lanes[index].pop { it.id !in seen }

                    if (found != null) {
                        picked = found
                        from = index
                        break
                    }
                }
            }

            if (picked == null) break

            seen += picked.id
            recent += picked
            out += picked
            onPick(from)
        }

        emitted += out.size

        return out
    }
}

/**
 * Home's normal feed. Three lanes, fixed places:
 *  - hot: what was just searched for, a few videos spread out (every 4th place), only while [hotBudget] lasts
 *  - interest: things the person has been into lately
 *  - explore: ordinary topics, so there is always variety
 */
fun mixedHomeFeed(
    hotQueries: List<String>,
    hotBudget: Int,
    interestQueries: List<String>,
    exploreQueries: List<String>,
    accept: (VideoItem) -> Boolean
): Feed {
    var hotLeft = hotBudget

    val lanes = listOf(
        Lane(FeedBuilder(hotQueries, accept = accept, maxSameChannel = 3)),
        Lane(FeedBuilder(interestQueries, accept = accept)),
        Lane(FeedBuilder(exploreQueries, accept = accept))
    )

    return LaneFeed(
        lanes,
        slots = { position ->
            when {
                hotLeft > 0 && position % 4 == 2 -> listOf(0, 1, 2)
                position % 2 == 0 -> listOf(1, 2)
                else -> listOf(2, 1)
            }
        },
        allow = { video, recent, lane ->
            recent.takeLast(6).count { it.channel == video.channel } < (if (lane == 0) 3 else 2)
        },
        onPick = { lane -> if (lane == 0) hotLeft -= 1 }
    )
}
