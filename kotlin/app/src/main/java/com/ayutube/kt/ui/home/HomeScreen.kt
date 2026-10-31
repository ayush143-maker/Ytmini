package com.ayutube.kt.ui.home

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import com.ayutube.kt.ui.components.AyIcons
import com.ayutube.kt.ui.components.FilterChipRow
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.ayutube.kt.AyuApp
import com.ayutube.kt.data.Study
import com.ayutube.kt.data.VideoItem
import com.ayutube.kt.ui.components.AyButton
import com.ayutube.kt.ui.components.AyuLogoLockup
import com.ayutube.kt.ui.components.VideoListSkeleton
import com.ayutube.kt.ui.components.TopicChips
import com.ayutube.kt.ui.components.VideoCard
import com.ayutube.kt.ui.theme.Ay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onOpen: (VideoItem) -> Unit,
    onChannel: (VideoItem) -> Unit,
    onMore: (VideoItem) -> Unit,
    onSearch: () -> Unit,
    vm: HomeViewModel = viewModel()
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val container = remember { AyuApp.container }
    val settings by container.settings.settings.collectAsStateWithLifecycle()
    val profile by container.settings.profile.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()
    var durationFilter by rememberSaveable { mutableStateOf(0) }
    var showFilter by remember { mutableStateOf(false) }

    val shown = remember(state.items, durationFilter) {
        when (durationFilter) {
            1 -> state.items.filter { it.durationSec in 1L..239L }
            2 -> state.items.filter { it.durationSec in 240L..1200L }
            3 -> state.items.filter { it.durationSec > 1200L }
            else -> state.items
        }
    }

    val study = if (settings.studyMode && profile.subjects.isNotEmpty()) {
        StudyConfig(profile.examName.orEmpty(), profile.subjects)
    } else {
        null
    }

    LaunchedEffect(study) { vm.configure(study) }

    val nearEnd by remember {
        derivedStateOf {
            val last = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            last >= listState.layoutInfo.totalItemsCount - 3
        }
    }

    LaunchedEffect(nearEnd, state.items.size) {
        if (nearEnd) vm.loadMore()
    }

    val days = if (settings.studyMode) Study.daysUntil(profile.examDate) else null

    Column(Modifier.fillMaxSize()) {
        // Logo on the left, search on the right.
        Row(
            Modifier.fillMaxWidth().padding(start = 16.dp, end = 6.dp, top = 12.dp, bottom = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            AyuLogoLockup(height = 28.dp)
            Spacer(Modifier.weight(1f))
            Box(Modifier.size(44.dp).clickable(onClick = onSearch), contentAlignment = Alignment.Center) {
                Icon(AyIcons.Search, contentDescription = "Search", tint = Ay.Paper, modifier = Modifier.size(26.dp))
            }
        }

        if (days != null && days >= 0) {
            Row(
                Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.Bottom
            ) {
                Text(if (days == 0L) "Today" else "$days", fontSize = 40.sp, fontWeight = FontWeight.ExtraBold, lineHeight = 44.sp)
                Text(
                    if (days == 0L) profile.examName.orEmpty()
                    else "${if (days == 1L) "day" else "days"} to ${profile.examName ?: "your exam"}",
                    color = Ay.Fog,
                    fontSize = 14.sp,
                    modifier = Modifier.padding(bottom = 6.dp)
                )
            }
        }

        FilterChipRow(
            labels = state.chips,
            selected = state.chip,
            onSelect = vm::select,
            filterActive = durationFilter != 0,
            onFilter = { showFilter = true }
        )
        HorizontalDivider(color = Ay.Steel)

        state.error?.let {
            Column(Modifier.padding(16.dp)) {
                Text(it, color = Ay.Pink, fontSize = 13.sp, modifier = Modifier.padding(bottom = 10.dp))
                AyButton("Try again", primary = true, onClick = vm::refresh)
            }
        }

        state.note?.let {
            Text(it, color = Ay.Fog, fontSize = 14.sp, modifier = Modifier.padding(24.dp))
        }

        if (showFilter) {
            ModalBottomSheet(onDismissRequest = { showFilter = false }, containerColor = Ay.Slate) {
                Column(Modifier.padding(bottom = 24.dp)) {
                    Text(
                        "Video length",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp)
                    )

                    DURATION_FILTERS.forEachIndexed { index, label ->
                        Row(
                            Modifier.fillMaxWidth().clickable { durationFilter = index; showFilter = false }
                                .padding(horizontal = 20.dp, vertical = 14.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                label,
                                fontSize = 15.sp,
                                color = if (index == durationFilter) Ay.Pink else Ay.Paper,
                                modifier = Modifier.weight(1f)
                            )

                            if (index == durationFilter) {
                                Icon(AyIcons.Check, contentDescription = null, tint = Ay.Pink, modifier = Modifier.size(20.dp))
                            }
                        }
                    }
                }
            }
        }

        if (durationFilter != 0 && shown.isEmpty() && state.items.isNotEmpty()) {
            Column(Modifier.padding(24.dp)) {
                Text("No videos of this length here yet.", color = Ay.Fog, fontSize = 14.sp, modifier = Modifier.padding(bottom = 10.dp))
                AyButton("Clear filter", onClick = { durationFilter = 0 })
            }
        }

        if (state.loading && state.items.isEmpty()) {
            VideoListSkeleton(Modifier.weight(1f))
        } else {
            LazyColumn(state = listState, modifier = Modifier.weight(1f).fillMaxWidth()) {
                items(shown, key = { it.id }) { video ->
                    VideoCard(
                        video = video,
                        modifier = Modifier.padding(top = 8.dp),
                        onMore = { onMore(video) },
                        onChannel = { onChannel(video) }
                    ) { onOpen(video) }
                }
            }
        }
    }
}

private val DURATION_FILTERS = listOf("Any length", "Under 4 minutes", "4 \u2013 20 minutes", "Over 20 minutes")
