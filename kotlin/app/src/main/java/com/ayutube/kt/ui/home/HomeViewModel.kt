package com.ayutube.kt.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ayutube.kt.AyuApp
import com.ayutube.kt.data.FeedBuilder
import com.ayutube.kt.data.HomeTopics
import com.ayutube.kt.data.VideoItem
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class HomeState(
    val chip: Int = 0,
    val loading: Boolean = true,
    val items: List<VideoItem> = emptyList(),
    val error: String? = null
)

class HomeViewModel : ViewModel() {
    private val _state = MutableStateFlow(HomeState())
    val state: StateFlow<HomeState> = _state

    val chips: List<String> = listOf("All") + HomeTopics.topics.map { it.label }

    private var builder: FeedBuilder? = null
    private var loadingMore = false
    private var generation = 0

    init {
        select(0)
    }

    private fun shortTitle(title: String): String =
        title.split('|', '-', '(', '[', '\u2013', '\u2014').first()
            .replace(Regex("[^\\p{L}\\p{N}\\s']"), " ")
            .trim().split(Regex("\\s+")).take(6).joinToString(" ")

    /** Trending, a bit of every topic, and what was watched lately. */
    private suspend fun allQueries(): List<String> {
        val history = try {
            AyuApp.container.library.history(12)
        } catch (_: Exception) {
            emptyList()
        }

        val related = history.map { shortTitle(it.title) }.filter { it.length > 3 }.distinct().take(2)
        val favourite = history.groupingBy { it.channelTitle }.eachCount()
            .maxByOrNull { it.value }?.key?.takeIf { it.isNotBlank() }
        val topics = HomeTopics.topics.shuffled().take(6).map { it.queries.random() }

        return related + listOfNotNull(favourite) + HomeTopics.trending.take(2) + topics
    }

    fun select(index: Int) {
        generation += 1
        val mine = generation

        _state.update { it.copy(chip = index, loading = true, items = emptyList(), error = null) }

        viewModelScope.launch {
            val queries = if (index == 0) allQueries() else HomeTopics.topics[index - 1].queries
            val feed = FeedBuilder(queries)

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

    fun refresh() = select(_state.value.chip)

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
