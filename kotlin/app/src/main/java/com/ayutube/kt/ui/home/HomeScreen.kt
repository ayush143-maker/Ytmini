package com.ayutube.kt.ui.home

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
import com.ayutube.kt.ui.components.TopicChips
import com.ayutube.kt.ui.components.VideoCard
import com.ayutube.kt.ui.theme.Ay

@Composable
fun HomeScreen(
    onOpen: (VideoItem) -> Unit,
    onChannel: (VideoItem) -> Unit,
    onMore: (VideoItem) -> Unit,
    vm: HomeViewModel = viewModel()
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val container = remember { AyuApp.container }
    val settings by container.settings.settings.collectAsStateWithLifecycle()
    val profile by container.settings.profile.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()

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

        TopicChips(state.chips, state.chip, vm::select)

        state.error?.let {
            Column(Modifier.padding(16.dp)) {
                Text(it, color = Ay.Pink, fontSize = 13.sp, modifier = Modifier.padding(bottom = 10.dp))
                AyButton("Try again", primary = true, onClick = vm::refresh)
            }
        }

        if (state.loading) {
            Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Ay.Pink)
            }
        }

        LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
            items(state.items, key = { it.id }) { video ->
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
