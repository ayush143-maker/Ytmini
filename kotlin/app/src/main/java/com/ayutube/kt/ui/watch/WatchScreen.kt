package com.ayutube.kt.ui.watch

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.PlayerView
import com.ayutube.kt.AyuApp
import com.ayutube.kt.data.ExtractorRepository
import com.ayutube.kt.data.VideoItem
import com.ayutube.kt.player.AyuPlayer
import com.ayutube.kt.player.StreamMode
import com.ayutube.kt.ui.components.AyButton
import com.ayutube.kt.ui.components.ChannelAvatar
import com.ayutube.kt.ui.theme.Ay
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.schabi.newpipe.extractor.stream.StreamInfo

@androidx.annotation.OptIn(UnstableApi::class)
@Composable
fun WatchScreen(video: VideoItem, onClose: () -> Unit) {
    val context = LocalContext.current
    val library = remember { AyuApp.container.library }
    val scope = rememberCoroutineScope()
    val ayu = remember { AyuPlayer(context) }

    var info by remember { mutableStateOf<StreamInfo?>(null) }
    var mode by remember { mutableStateOf(StreamMode.ADAPTIVE) }
    var stream by remember { mutableStateOf("loading streams...") }
    var error by remember { mutableStateOf<String?>(null) }
    var readout by remember { mutableStateOf("") }
    var liked by remember { mutableStateOf(false) }
    var saved by remember { mutableStateOf(false) }
    var following by remember { mutableStateOf(false) }
    var resumeAt by remember { mutableStateOf<Long?>(null) }

    DisposableEffect(ayu) {
        val listener = object : Player.Listener {
            override fun onPlayerError(playbackError: PlaybackException) {
                error = "${playbackError.errorCodeName}\n${playbackError.cause}"
            }
        }

        ayu.exo.addListener(listener)

        onDispose {
            // Remember where the person stopped, even though this screen is going away.
            val seconds = (ayu.exo.currentPosition / 1000).toInt()
            val length = (ayu.exo.duration.coerceAtLeast(0) / 1000).toInt()

            if (seconds > 0) {
                AyuApp.appScope.launch { library.saveProgress(video, seconds, length) }
            }

            ayu.exo.removeListener(listener)
            ayu.release()
        }
    }

    LaunchedEffect(video.id) {
        liked = library.isLiked(video.id)
        saved = library.isWatchLater(video.id)
        following = video.channelId.isNotEmpty() &&
            library.channelPrefs().any { it.channelKey == video.channelId && it.kind == "follow" }

        val earlier = library.historyOf(video.id)

        resumeAt = earlier
            ?.takeIf { it.progressSeconds > 5 }
            ?.let { it.progressSeconds * 1000L }
            ?: 0L

        try {
            info = ExtractorRepository.streams(video.id)
        } catch (failure: Exception) {
            error = failure.message ?: failure.javaClass.simpleName
        }
    }

    LaunchedEffect(info, mode, resumeAt) {
        val streams = info ?: return@LaunchedEffect
        val start = resumeAt ?: return@LaunchedEffect
        val position = if (ayu.exo.currentPosition > 0) ayu.exo.currentPosition else start

        error = null

        val chosen = ayu.prepare(streams, mode, position)

        stream = chosen?.label ?: "no playable stream found"
    }

    LaunchedEffect(ayu) {
        var sinceSave = 0

        while (true) {
            readout = ayu.snapshot()
            delay(500)
            sinceSave += 1

            if (sinceSave >= 20 && ayu.exo.isPlaying) {
                sinceSave = 0
                library.saveProgress(
                    video,
                    (ayu.exo.currentPosition / 1000).toInt(),
                    (ayu.exo.duration.coerceAtLeast(0) / 1000).toInt()
                )
            }
        }
    }

    Column(Modifier.fillMaxSize().background(Ay.Ink).statusBarsPadding()) {
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    player = ayu.exo
                    useController = true
                }
            },
            modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f)
        )

        Text(
            "$readout\n$stream",
            color = Ay.Dim,
            fontFamily = FontFamily.Monospace,
            fontSize = 11.sp,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)
        )

        error?.let {
            Text(it, color = Ay.Pink, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 16.dp))
        }

        Text(
            video.title,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            lineHeight = 26.sp,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp)
        )

        Row(
            Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            ChannelAvatar(video.channel, video.avatar, video.channelId, size = 40)
            Text(
                video.channel,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                modifier = Modifier.weight(1f).padding(horizontal = 12.dp)
            )
            AyButton(
                text = if (following) "Following" else "Follow",
                primary = !following,
                onClick = {
                    if (video.channelId.isNotEmpty()) {
                        scope.launch {
                            if (following) {
                                library.removeChannelPref(video.channelId)
                            } else {
                                library.setChannelPref(video.channelId, video.channel, "follow", video.avatar)
                            }

                            following = !following
                        }
                    }
                }
            )
        }

        Row(
            Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            AyButton(
                text = if (liked) "Liked" else "Like",
                onClick = {
                    scope.launch {
                        if (liked) library.unlike(video.id) else library.like(video)
                        liked = !liked
                    }
                }
            )
            AyButton(
                text = if (saved) "Saved" else "Save",
                onClick = {
                    scope.launch {
                        if (saved) library.removeWatchLater(video.id) else library.addWatchLater(video)
                        saved = !saved
                    }
                }
            )
            AyButton(text = "Adaptive", primary = mode == StreamMode.ADAPTIVE, onClick = { mode = StreamMode.ADAPTIVE })
            AyButton(text = "360p+audio", primary = mode == StreamMode.MUXED, onClick = { mode = StreamMode.MUXED })
            AyButton(text = "Close", onClick = onClose)
        }
    }
}
