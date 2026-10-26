package com.ayutube.kt.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ayutube.kt.data.ExtractorRepository
import com.ayutube.kt.data.VideoItem
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.schabi.newpipe.extractor.Page

data class UiState(
    val query: String = "",
    val loading: Boolean = false,
    val items: List<VideoItem> = emptyList(),
    val error: String? = null,
    val selected: VideoItem? = null
)

class MainViewModel : ViewModel() {
    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state

    private var nextPage: Page? = null
    private var activeQuery = ""
    private var loadingMore = false

    init {
        search("trending now")
    }

    fun onQueryChange(query: String) {
        _state.update { it.copy(query = query) }
    }

    fun search(query: String = _state.value.query) {
        val text = query.trim()

        if (text.isEmpty()) return

        activeQuery = text
        nextPage = null
        _state.update { it.copy(query = text, loading = true, error = null, items = emptyList()) }

        viewModelScope.launch {
            try {
                val page = ExtractorRepository.search(text)

                if (text != activeQuery) return@launch

                nextPage = page.next
                _state.update { it.copy(loading = false, items = page.items) }
            } catch (error: Exception) {
                _state.update {
                    it.copy(loading = false, error = error.message ?: error.javaClass.simpleName)
                }
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

    fun open(item: VideoItem) {
        _state.update { it.copy(selected = item) }
    }

    fun close() {
        _state.update { it.copy(selected = null) }
    }
}
