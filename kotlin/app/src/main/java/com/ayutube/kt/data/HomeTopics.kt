package com.ayutube.kt.data

data class Topic(val label: String, val queries: List<String>)

/** What Home offers by default: a normal mix of music, fun and everyday topics. */
object HomeTopics {
    val topics: List<Topic> = listOf(
        Topic("Music", listOf("new hindi songs", "punjabi songs", "lofi music", "bollywood songs")),
        Topic("Fun", listOf("funny videos", "comedy sketches", "stand up comedy india", "memes compilation")),
        Topic("Gaming", listOf("gameplay", "bgmi highlights", "minecraft survival", "gaming funny moments")),
        Topic("Movies", listOf("new movie trailers", "movie scenes", "web series trailer")),
        Topic("News", listOf("news today", "india news live", "world news")),
        Topic("Sports", listOf("cricket highlights", "football highlights", "ipl best moments")),
        Topic("Tech", listOf("tech review", "smartphone review", "gadgets under 20000")),
        Topic("Food", listOf("street food india", "easy recipes", "cooking vlog")),
        Topic("Travel", listOf("travel vlog india", "hidden places", "trip guide")),
        Topic("Learn", listOf("science explained", "facts you did not know", "documentary short"))
    )

    val trending = listOf("trending now india", "trending videos today", "viral videos")
}
