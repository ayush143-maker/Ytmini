package com.ayutube.kt.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ayutube.kt.AyuApp
import com.ayutube.kt.data.FeedBuilder
import com.ayutube.kt.data.HomeTopics
import com.ayutube.kt.data.VideoItem
import com.ayutube.kt.data.ExtractorRepository
import com.ayutube.kt.data.Feed
import com.ayutube.kt.data.mixedHomeFeed
import com.ayutube.kt.data.TrendingPolicy
import kotlin.random.Random
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class StudyConfig(val exam: String, val subjects: List<String>)

data class HomeState(
    val chips: List<String> = emptyList(),
    val chip: Int = 0,
    val loading: Boolean = true,
    val items: List<VideoItem> = emptyList(),
    val note: String? = null,
    val error: String? = null,
    val sections: Boolean = true,
    val continueWatching: List<ContinueItem> = emptyList(),
    val trending: List<VideoItem> = emptyList(),
    val trendingLoading: Boolean = true,
    val because: BecauseShelf? = null
)

/** "Because you watched ...": a few videos related to the last one that was properly watched. */
data class BecauseShelf(val title: String, val videos: List<VideoItem>)

/** A video that was started but not finished, with how far the person got (0 to 1). */
data class ContinueItem(val video: VideoItem, val progress: Float)

class HomeViewModel : ViewModel() {
    private val normalChips = listOf("All", "Following") + HomeTopics.topics.map { it.label }

    private val _state = MutableStateFlow(HomeState(chips = normalChips))
    val state: StateFlow<HomeState> = _state

    private var study: StudyConfig? = null
    private var builder: Feed? = null
    private var loadingMore = false
    private var generation = 0
    private var trendingBuilder: Feed? = null
    private var loadingMoreTrending = false
    private var shelfFor: String? = null

    init {
        select(0)
        loadTrending()
    }

    private fun shortTitle(title: String): String =
        title.split('|', '-', '(', '[', '\u2013', '\u2014').first()
            .replace(Regex("[^\\p{L}\\p{N}\\s']"), " ")
            .trim().split(Regex("\\s+")).take(6).joinToString(" ")

    /** What Home is built from: a fresh search (hot), recent interests, ordinary topics, and the videos to leave out. */
    private class Taste(
        val hot: List<String>,
        val hotBudget: Int,
        val interest: List<String>,
        val explore: List<String>,
        val accept: (VideoItem) -> Boolean
    ) {
        fun feed(): Feed = mixedHomeFeed(hot, hotBudget, interest, explore, accept)
    }

    /**
     * What the person seems to like, worked out from data on the phone.
     *
     * Hot: what they searched in the last day. A search from the last hour puts 3 videos of it into the
     * feed, spread out; 2 up to six hours; 1 up to a day; after that it is just one of the signals.
     * Interest: searches, likes, videos watched (how far they got counts), the most watched channel and
     * followed channels, each a search with a weight (newer and stronger weigh more), a few picked at random,
     * so one video never takes over the feed. Explore: ordinary topics, so there is always variety.
     * Videos already watched, and the last few opened, are left out.
     */
    private suspend fun taste(): Taste {
        val library = AyuApp.container.library
        val history = try { library.history(150) } catch (_: Exception) { emptyList() }
        val likes = try { library.likes(8) } catch (_: Exception) { emptyList() }
        val prefs = try { library.channelPrefs() } catch (_: Exception) { emptyList() }
        val searches = try { AyuApp.container.recents.all().take(4) } catch (_: Exception) { emptyList() }
        val fresh = try { AyuApp.container.recents.recent(24L * 60 * 60 * 1000) } catch (_: Exception) { emptyList() }

        fun completion(progress: Int, length: Int?): Float = when {
            length != null && length > 0 -> (progress.toFloat() / length).coerceIn(0f, 1f)
            progress >= 120 -> 0.6f
            else -> 0.2f
        }

        val watched = (
            history.filter { completion(it.progressSeconds, it.durationSeconds) >= 0.7f }.map { it.videoId } +
                history.take(3).map { it.videoId }
            ).toSet()

        // Hot: the newest searches, plus the artist or channel of what was just watched.
        val hot = mutableListOf<String>()
        var hotBudget = 0

        fresh.take(2).forEach { hot += it.first }

        if (hot.isNotEmpty()) {
            val age = fresh.first().second

            hotBudget = when {
                age <= 3_600_000L -> 3
                age <= 6 * 3_600_000L -> 2
                else -> 1
            }

            val last = history.firstOrNull()

            if (last != null && last.channelTitle.isNotBlank() && hot.none { it.equals(last.channelTitle, ignoreCase = true) }) {
                val at = try { java.time.Instant.parse(last.watchedAt).toEpochMilli() } catch (_: Exception) { 0L }

                if (System.currentTimeMillis() - at <= 3 * 3_600_000L) hot += last.channelTitle
            }
        }

        val signals = mutableListOf<Pair<String, Float>>()

        searches.forEachIndexed { i, text -> signals += text to (4f - i * 0.8f) }
        likes.take(5).forEachIndexed { i, like -> signals += shortTitle(like.title) to (3f - i * 0.4f) }

        history.take(20).forEachIndexed { i, row ->
            val done = completion(row.progressSeconds, row.durationSeconds)

            if (done >= 0.15f) signals += shortTitle(row.title) to ((1f + 2f * done) * (1f - i * 0.03f))
        }

        history
            .filter { completion(it.progressSeconds, it.durationSeconds) >= 0.3f }
            .take(30)
            .groupingBy { it.channelTitle }
            .eachCount()
            .maxByOrNull { it.value }
            ?.key
            ?.takeIf { it.isNotBlank() }
            ?.let { signals += it to 2.5f }

        prefs.filter { it.kind == "follow" }.shuffled().take(3).forEach { signals += it.channelName to 2f }

        val pool = signals.filter { it.first.length > 3 }.toMutableList()
        val picked = mutableListOf<String>()

        while (picked.size < 5 && pool.isNotEmpty()) {
            var roll = Random.nextDouble() * pool.sumOf { it.second.toDouble() }
            var index = pool.lastIndex

            for (i in pool.indices) {
                roll -= pool[i].second

                if (roll <= 0.0) {
                    index = i
                    break
                }
            }

            val choice = pool.removeAt(index)

            if (picked.none { it.equals(choice.first, ignoreCase = true) } && hot.none { it.equals(choice.first, ignoreCase = true) }) {
                picked += choice.first
            }
        }

        val topics = HomeTopics.topics.shuffled().take(if (picked.isEmpty() && hot.isEmpty()) 8 else 5).map { it.queries.random() }

        return Taste(hot, hotBudget, picked, topics) { video -> video.id !in watched }
    }

    /** "Because you watched ...": a few videos YouTube lists as related to the last video that was properly watched. */
    private fun loadBecause(rows: List<com.ayutube.kt.data.db.HistoryEntity>) {
        if (study != null) return

        val last = rows.firstOrNull { row ->
            val length = row.durationSeconds ?: 0

            row.progressSeconds >= 45 && (length <= 0 || row.progressSeconds * 100 >= length * 30)
        } ?: return

        if (last.videoId == shelfFor) return

        shelfFor = last.videoId

        viewModelScope.launch {
            try {
                val info = ExtractorRepository.streams(last.videoId)
                val mine = taste()
                val picks = ExtractorRepository.related(info)
                    .filter { it.id != last.videoId && it.durationSec >= 60 && mine.accept(it) }
                    .distinctBy { it.id }
                    .take(5)

                _state.update {
                    it.copy(because = if (picks.size >= 3) BecauseShelf(shortTitle(last.title), picks) else null)
                }
            } catch (failure: kotlinx.coroutines.CancellationException) {
                throw failure
            } catch (_: Exception) {
                // Try again the next time Home opens.
                shelfFor = null
            }
        }
    }

    /** Switches Home between the normal mix and the study subjects. */
    fun configure(next: StudyConfig?) {
        if (next == study) return

        study = next
        _state.update {
            it.copy(chips = if (next == null) normalChips else listOf("All") + next.subjects)
        }
        select(0)
    }

    private fun studyQueries(config: StudyConfig, index: Int): List<String> {
        fun exam(subject: String) = listOf(config.exam, subject).filter { it.isNotBlank() }.joinToString(" ")

        return if (index == 0) {
            config.subjects.map { exam(it) }
        } else {
            val subject = config.subjects[index - 1]

            listOf(exam(subject), "$subject lecture", "$subject important questions")
        }
    }

    fun select(index: Int) {
        generation += 1
        val mine = generation

        _state.update {
            it.copy(
                chip = index,
                loading = true,
                items = emptyList(),
                note = null,
                error = null,
                sections = study == null && index == 0
            )
        }

        viewModelScope.launch {
            val config = study
            if (config == null && index == 1) {
                loadFollowing(mine)
                return@launch
            }

            // Study mode keeps its own subject feed exactly as before; only the normal mix is personal.
            val personal = if (config == null) taste() else null
            val feed: Feed = when {
                config != null -> FeedBuilder(studyQueries(config, index))
                personal != null && index == 0 -> personal.feed()
                personal != null -> FeedBuilder(HomeTopics.topics[index - 2].queries, accept = personal.accept)
                else -> FeedBuilder(emptyList())
            }

            builder = feed

            try {
                val first = feed.nextBatch(12)

                if (mine != generation) return@launch

                _state.update { it.copy(loading = false, items = first) }
            } catch (error: Exception) {
                if (mine == generation) {
                    _state.update { it.copy(loading = false, error = error.message ?: error.javaClass.simpleName) }
                }
            }
        }
    }

    private fun ageMinutes(text: String): Long {
        val match = Regex("(\\d+)\\s+(second|minute|hour|day|week|month|year)").find(text.lowercase())
            ?: return Long.MAX_VALUE / 2
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

    /** The newest videos from the channels the person follows. */
    private suspend fun loadFollowing(mine: Int) {
        builder = null

        val follows = try {
            AyuApp.container.library.channelPrefs().filter { it.kind == "follow" }.take(12)
        } catch (_: Exception) {
            emptyList()
        }

        if (follows.isEmpty()) {
            _state.update {
                it.copy(loading = false, note = "Follow channels and their newest videos show up here.")
            }
            return
        }

        val videos = coroutineScope {
            follows.map { pref ->
                async {
                    try {
                        ExtractorRepository.channel(pref.channelKey).videos.items.take(4)
                    } catch (_: Exception) {
                        emptyList()
                    }
                }
            }.awaitAll().flatten()
        }.distinctBy { it.id }.sortedBy { ageMinutes(it.uploaded) }

        if (mine != generation) return

        _state.update {
            it.copy(
                loading = false,
                items = videos,
                note = if (videos.isEmpty()) "Nothing new from the channels you follow." else null
            )
        }
    }

    fun refresh() {
        select(_state.value.chip)
        reloadContinue()

        if (_state.value.trending.isEmpty()) loadTrending()
    }

    /** Videos that were started but not finished, most recent first. */
    fun reloadContinue() {
        viewModelScope.launch {
            val rows = try {
                AyuApp.container.library.history(80)
            } catch (_: Exception) {
                emptyList()
            }

            val unfinished = rows
                .filter { row ->
                    val length = row.durationSeconds ?: 0

                    length > 0 && row.progressSeconds >= 10 && row.progressSeconds * 100 < length * 92
                }
                .take(8)
                .map { row ->
                    val length = row.durationSeconds ?: 1

                    ContinueItem(
                        VideoItem(
                            id = row.videoId,
                            title = row.title,
                            channel = row.channelTitle,
                            channelId = row.channelId,
                            thumbnail = row.thumbnailUrl,
                            durationSec = length.toLong(),
                            views = -1,
                            uploaded = "",
                            avatar = ""
                        ),
                        row.progressSeconds.toFloat() / length
                    )
                }

            _state.update { it.copy(continueWatching = unfinished) }

            loadBecause(rows)
        }
    }

    private fun loadTrending() {
        val feed = TrendingPolicy.feed(relaxed = false)

        trendingBuilder = feed
        _state.update { it.copy(trendingLoading = true) }

        viewModelScope.launch {
            var first = try {
                feed.nextBatch(9)
            } catch (_: Exception) {
                emptyList()
            }

            // A quiet week or a slow network can leave the strict filter almost empty: loosen the age and view limits once.
            if (first.size < 4) {
                val loose = TrendingPolicy.feed(relaxed = true)

                trendingBuilder = loose
                first = try {
                    loose.nextBatch(9)
                } catch (_: Exception) {
                    first
                }
            }

            _state.update { it.copy(trending = first, trendingLoading = false) }
        }
    }

    /** Called when the person scrolls the trending rows near their end. */
    fun loadMoreTrending() {
        val feed = trendingBuilder ?: return

        if (loadingMoreTrending || _state.value.trendingLoading) return

        loadingMoreTrending = true

        viewModelScope.launch {
            try {
                val more = feed.nextBatch(8)

                _state.update { current -> current.copy(trending = (current.trending + more).distinctBy { it.id }) }
            } catch (_: Exception) {
                // The next scroll tries again.
            } finally {
                loadingMoreTrending = false
            }
        }
    }

    fun loadMore() {
        val feed = builder ?: return

        if (loadingMore || _state.value.loading) return

        loadingMore = true
        val mine = generation

        viewModelScope.launch {
            try {
                val more = feed.nextBatch(10)

                if (mine == generation) _state.update { it.copy(items = it.items + more) }
            } catch (_: Exception) {
                // The next scroll tries again.
            } finally {
                loadingMore = false
            }
        }
    }
}
