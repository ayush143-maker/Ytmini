package com.ayutube.kt.data

/** One kind of content in Trending Now: what to search for and how long a video must be. */
class TrendLane(val queries: List<String>, val minDurationSec: Long)

/**
 * What "Trending Now" shows. YouTube no longer has a trending page, so this is built by hand from
 * several kinds of content that take turns, so no channel or topic can fill the rows:
 * a new place in the rows goes to the next kind, the same channel is not repeated within five
 * places, and political titles are kept to about one in six. Strict filters keep clickbait,
 * gambling, "earn money" and adult videos out. Change the lists below to tune it.
 */
object TrendingPolicy {
    private const val MIN_VIEWS = 20_000L
    private const val MAX_AGE_MIN = 30L * 24 * 60
    private const val MAX_AGE_TRUSTED_MIN = 60L * 24 * 60

    /** In the order they take turns: the first is the first place of the top row, the second the first of the bottom row. */
    val lanes = listOf(
        TrendLane(listOf("dhruv rathee"), 480L),
        TrendLane(listOf("raj shamani podcast", "hindi podcast full episode"), 900L),
        TrendLane(listOf("veritasium", "science explained"), 480L),
        TrendLane(listOf("new hindi songs official video"), 120L),
        TrendLane(listOf("psychology explained hindi"), 480L),
        TrendLane(listOf("discovery channel documentary", "documentary hindi"), 480L),
        TrendLane(listOf("india economy explained", "history explained hindi"), 480L)
    )

    /** Always welcome: a lower view limit and a longer window. Matched on the channel name. */
    val trustedChannels = listOf(
        "dhruv rathee", "raj shamani", "ted", "tedx", "kurzgesagt", "veritasium", "vox", "national geographic"
    )

    /** Any of these in the title or channel name keeps a video out (lower case). */
    val blockedWords = listOf(
        "casino", "betting", "satta", "matka", "jackpot", "teen patti", "rummy", "dream11", "lottery", "gambling",
        "paisa kaise kamaye", "paise kaise kamaye", "paisa kamao", "paise kamao", "earn money", "make money",
        "online earning", "passive income", "earn rs", "earn ₹",
        "18+", "nude", "nudity", "porn", "xxx", "onlyfans", "uncensored", "bikini", "leaked video", "mms"
    )

    /** Titles with these count as political; only about one in six places may be one. */
    val politicalWords = listOf(
        "modi", "bjp", "congress", "election", "parliament", "government", "minister", "rahul gandhi", "kejriwal",
        "nrc", "caa", "opposition", "propaganda", "rss", "trump", "indian media", "godi media", "hindu muslim"
    )

    fun isTrusted(channel: String): Boolean {
        val name = channel.lowercase().trim()

        return trustedChannels.any { name == it || name.startsWith("$it ") || name.contains(" $it") }
    }

    fun isBlocked(video: VideoItem): Boolean {
        val text = (video.title + " " + video.channel).lowercase()

        return blockedWords.any { text.contains(it) }
    }

    fun isPolitical(video: VideoItem): Boolean {
        val title = video.title.lowercase()

        return politicalWords.any { title.contains(it) }
    }

    /** The filter. [relaxed] drops the age and view limits, for when the strict one leaves almost nothing. */
    fun accept(relaxed: Boolean): (VideoItem) -> Boolean = { video ->
        val trusted = isTrusted(video.channel)
        val limit = if (trusted) MAX_AGE_TRUSTED_MIN else MAX_AGE_MIN

        !isBlocked(video) &&
            (relaxed || VideoAge.minutes(video.uploaded) <= limit) &&
            (relaxed || trusted || video.views >= MIN_VIEWS)
    }

    /** Views per day since upload: a newer video with many views beats an old one. */
    fun score(video: VideoItem): Double {
        val days = (VideoAge.minutes(video.uploaded) / 1440.0).coerceAtLeast(1.0)

        return video.views.coerceAtLeast(0L) / days
    }

    /** The Trending Now feed: the kinds above take turns, best (by [score]) first within each kind. */
    fun feed(relaxed: Boolean): Feed {
        val fits = accept(relaxed)
        val built = lanes.map { kind ->
            Lane(FeedBuilder(kind.queries, kind.minDurationSec, fits), rank = { video -> score(video) })
        }

        return LaneFeed(
            built,
            slots = { position -> List(built.size) { (position + it) % built.size } },
            allow = { video, recent, _ ->
                recent.takeLast(5).none { it.channel == video.channel } &&
                    !(isPolitical(video) && recent.takeLast(6).any { isPolitical(it) })
            }
        )
    }
}

/** Turns "3 days ago" into minutes. Text that cannot be read counts as very old. */
object VideoAge {
    private val pattern = Regex("(\\d+)\\s+(second|minute|hour|day|week|month|year)")

    fun minutes(text: String): Long {
        val match = pattern.find(text.lowercase()) ?: return Long.MAX_VALUE / 2
        val unit = when (match.groupValues[2]) {
            "second" -> 0L
            "minute" -> 1L
            "hour" -> 60L
            "day" -> 1_440L
            "week" -> 10_080L
            "month" -> 43_200L
            else -> 525_600L
        }

        return match.groupValues[1].toLong() * unit
    }
}
