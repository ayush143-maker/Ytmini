package com.ayutube.kt.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ayutube.kt.data.Categories
import com.ayutube.kt.data.ExtractorRepository
import com.ayutube.kt.data.VideoItem
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.schabi.newpipe.extractor.Page

data class ExploreState(
    val query: String = "",
    val category: Int = 0,
    val loading: Boolean = false,
    val items: List<VideoItem> = emptyList(),
    val error: String? = null
)

class ExploreViewModel : ViewModel() {
    private val _state = MutableStateFlow(ExploreState())
    val state: StateFlow<ExploreState> = _state

    /** "All" first, then Music, Games and Fun (the web defaults), then the rest. */
    val labels: List<String> = listOf("All") + Categories.all
        .sortedBy { category ->
            val rank = Categories.defaultIds.indexOf(category.id)

            if (rank >= 0) rank else Int.MAX_VALUE
        }
        .map { it.label }

    private val ordered = Categories.all.sortedBy { category ->
        val rank = Categories.defaultIds.indexOf(category.id)

        if (rank >= 0) rank else Int.MAX_VALUE
    }

    private var nextPage: Page? = null
    private var activeQuery = ""
    private var loadingMore = false

    init {
        selectCategory(0)
    }

    fun onQueryChange(query: String) {
        _state.update { it.copy(query = query) }
    }

    fun selectCategory(index: Int) {
        _state.update { it.copy(category = index, query = "") }
        run(if (index == 0) "trending now" else ordered[index - 1].defaultQuery)
    }

    fun search() {
        val text = _state.value.query.trim()

        if (text.isNotEmpty()) run(text)
    }

    private fun run(query: String) {
        activeQuery = query
        nextPage = null
        _state.update { it.copy(loading = true, error = null, items = emptyList()) }

        viewModelScope.launch {
            try {
                val page = ExtractorRepository.search(query)

                if (query != activeQuery) return@launch

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
}
