package com.ayutube.kt.ui.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ayutube.kt.AyuApp
import com.ayutube.kt.data.ExtractorRepository
import com.ayutube.kt.data.VideoItem
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.schabi.newpipe.extractor.Page

data class SearchState(
    val query: String = "",
    val searched: Boolean = false,
    val loading: Boolean = false,
    val items: List<VideoItem> = emptyList(),
    val suggestions: List<String> = emptyList(),
    val recents: List<String> = emptyList(),
    val error: String? = null
)

class SearchViewModel : ViewModel() {
    private val recents = AyuApp.container.recents

    private val _state = MutableStateFlow(SearchState(recents = recents.all()))
    val state: StateFlow<SearchState> = _state

    private var nextPage: Page? = null
    private var activeQuery = ""
    private var loadingMore = false
    private var suggestJob: Job? = null

    fun onQueryChange(query: String) {
        _state.update { it.copy(query = query, searched = false) }
        suggestJob?.cancel()

        if (query.isBlank()) {
            _state.update { it.copy(suggestions = emptyList()) }
            return
        }

        suggestJob = viewModelScope.launch {
            delay(250)

            try {
                val found = ExtractorRepository.suggestions(query.trim())

                _state.update { if (it.query == query) it.copy(suggestions = found.take(8)) else it }
            } catch (_: Exception) {
                // Suggestions are optional.
            }
        }
    }

    fun search(query: String = _state.value.query) {
        val text = query.trim()

        if (text.isEmpty()) return

        recents.add(text)
        activeQuery = text
        nextPage = null
        suggestJob?.cancel()

        _state.update {
            it.copy(
                query = text, searched = true, loading = true, error = null, items = emptyList(),
                suggestions = emptyList(), recents = recents.all()
            )
        }

        viewModelScope.launch {
            try {
                val page = ExtractorRepository.search(text)

                if (text != activeQuery) return@launch

                nextPage = page.next
                _state.update { it.copy(loading = false, items = page.items) }
            } catch (error: Exception) {
                _state.update { it.copy(loading = false, error = error.message ?: error.javaClass.simpleName) }
            }
        }
    }

    fun loadMore() {
        val page = nextPage ?: return

        if (loadingMore || _state.value.loading) return

        loadingMore = true
        val query = activeQuery

        viewModelScope.launch {
            try {
                val more = ExtractorRepository.search(query, page)

                if (query == activeQuery) {
                    nextPage = more.next

                    val known = _state.value.items.map { it.id }.toSet()

                    _state.update { it.copy(items = it.items + more.items.filter { v -> v.id !in known }) }
                }
            } catch (_: Exception) {
                // The next scroll tries again.
            } finally {
                loadingMore = false
            }
        }
    }

    fun removeRecent(query: String) {
        recents.remove(query)
        _state.update { it.copy(recents = recents.all()) }
    }

    fun clearRecents() {
        recents.clear()
        _state.update { it.copy(recents = emptyList()) }
    }
}
