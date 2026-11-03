package com.ayutube.kt.data

/**
 * What "Trending Now" shows. YouTube no longer has a trending page, so this is built by hand:
 * searches for talks, podcasts and explainers, then strict filters so clickbait, gambling,
 * "earn money" and adult videos stay out. Change the lists below to tune it.
 */
object TrendingPolicy {
    /** Podcasts and explainers are long; "2 minute" get-rich videos are not. */
    const val MIN_DURATION_SEC = 480L

    private const val MIN_VIEWS = 20_000L
    private const val MAX_AGE_MIN = 30L * 24 * 60
    private const val MAX_AGE_TRUSTED_MIN = 60L * 24 * 60

    val queries = listOf(
        "hindi podcast full episode",
        "psychology explained hindi",
        "documentary hindi",
        "dhruv rathee",
        "india economy explained",
        "history explained hindi",
        "science explained"
    )

    /** Always welcome: a lower view limit, a longer window and a higher rank. Matched on the channel name. */
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

    fun isTrusted(channel: String): Boolean {
        val name = channel.lowercase().trim()

        return trustedChannels.any { name == it || name.startsWith("$it ") || name.contains(" $it") }
    }

    fun isBlocked(video: VideoItem): Boolean {
        val text = (video.title + " " + video.channel).lowercase()

        return blockedWords.any { text.contains(it) }
    }

    /** The filter. [relaxed] drops the age and view limits, for when the strict one leaves almost nothing. */
    fun accept(relaxed: Boolean): (VideoItem) -> Boolean = { video ->
        val trusted = isTrusted(video.channel)
        val limit = if (trusted) MAX_AGE_TRUSTED_MIN else MAX_AGE_MIN

        !isBlocked(video) &&
            video.durationSec >= MIN_DURATION_SEC &&
            (relaxed || VideoAge.minutes(video.uploaded) <= limit) &&
            (relaxed || trusted || video.views >= MIN_VIEWS)
    }

    /** Views per day since upload (a new video with many views beats an old one), doubled for trusted channels. */
    fun score(video: VideoItem): Double {
        val days = (VideoAge.minutes(video.uploaded) / 1440.0).coerceAtLeast(1.0)
        val perDay = video.views.coerceAtLeast(0L) / days

        return if (isTrusted(video.channel)) perDay * 2 else perDay
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
