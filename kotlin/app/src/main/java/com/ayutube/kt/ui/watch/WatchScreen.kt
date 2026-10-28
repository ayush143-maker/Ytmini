package com.ayutube.kt.ui.watch

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.ActivityInfo
import android.media.AudioManager
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.ayutube.kt.AyuApp
import com.ayutube.kt.data.ExtractorRepository
import com.ayutube.kt.data.FeedBuilder
import com.ayutube.kt.data.HomeTopics
import com.ayutube.kt.data.VideoItem
import com.ayutube.kt.player.AyuPlayer
import com.ayutube.kt.player.QualityOption
import com.ayutube.kt.ui.components.AyButton
import com.ayutube.kt.ui.components.AyIcons
import com.ayutube.kt.ui.components.ChannelAvatar
import com.ayutube.kt.ui.components.VideoCard
import com.ayutube.kt.ui.components.VideoMenuSheet
import com.ayutube.kt.ui.components.formatClock
import com.ayutube.kt.ui.components.viewsText
import com.ayutube.kt.ui.theme.Ay
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.schabi.newpipe.extractor.stream.AudioStream
import org.schabi.newpipe.extractor.stream.StreamInfo
import kotlin.math.roundToInt

private val SPEEDS = listOf(0.25f, 0.5f, 0.75f, 1f, 1.25f, 1.5f, 1.75f, 2f)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WatchScreen(
    video: VideoItem,
    onClose: () -> Unit,
    onChannel: (VideoItem) -> Unit,
    onOpen: (VideoItem) -> Unit
) {
    val context = LocalContext.current
    val activity = context as? Activity
    val hostView = LocalView.current
    val container = remember { AyuApp.container }
    val library = container.library
    val settings by container.settings.settings.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val ayu = remember { AyuPlayer(context) }

    var info by remember { mutableStateOf<StreamInfo?>(null) }
    var options by remember { mutableStateOf<List<QualityOption>>(emptyList()) }
    var audios by remember { mutableStateOf<List<AudioStream>>(emptyList()) }
    var quality by remember { mutableStateOf<QualityOption?>(null) }
    var audio by remember { mutableStateOf<AudioStream?>(null) }
    var speed by remember { mutableFloatStateOf(1f) }
    var error by remember { mutableStateOf<String?>(null) }
    var liked by remember { mutableStateOf(false) }
    var saved by remember { mutableStateOf(false) }
    var following by remember { mutableStateOf(false) }
    var related by remember { mutableStateOf<List<VideoItem>>(emptyList()) }

    var fullscreen by remember { mutableStateOf(false) }
    var controls by remember { mutableStateOf(true) }
    var controlsTick by remember { mutableIntStateOf(0) }
    var sheet by remember { mutableStateOf<String?>(null) }
    var menuOpen by remember { mutableStateOf(false) }
    var descOpen by remember { mutableStateOf(false) }
    var hud by remember { mutableStateOf<String?>(null) }

    var position by remember { mutableLongStateOf(0L) }
    var duration by remember { mutableLongStateOf(0L) }
    var playing by remember { mutableStateOf(false) }
    var buffering by remember { mutableStateOf(true) }
    var scrubbing by remember { mutableStateOf<Float?>(null) }

    val upNext by rememberUpdatedState(related)
    val autoplay by rememberUpdatedState(settings.autoplayNext)
    val open by rememberUpdatedState(onOpen)

    fun touchControls() {
        controls = true
        controlsTick += 1
    }

    fun setFullscreen(on: Boolean) {
        fullscreen = on

        val window = activity?.window ?: return
        val inset = WindowCompat.getInsetsController(window, hostView)

        activity.requestedOrientation =
            if (on) ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE else ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED

        if (on) {
            inset.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            inset.hide(WindowInsetsCompat.Type.systemBars())
        } else {
            inset.show(WindowInsetsCompat.Type.systemBars())
        }
    }

    fun seekBy(ms: Long) {
        val target = (ayu.exo.currentPosition + ms).coerceIn(0L, ayu.exo.duration.coerceAtLeast(0L))

        ayu.exo.seekTo(target)
        position = target
    }

    fun apply(nextQuality: QualityOption, nextAudio: AudioStream?) {
        val at = ayu.exo.currentPosition

        quality = nextQuality
        audio = nextAudio
        error = null
        ayu.play(nextQuality, nextAudio, at)
        ayu.setSpeed(speed)
    }

    BackHandler(enabled = sheet != null) { sheet = null }
    BackHandler(enabled = fullscreen) { setFullscreen(false) }

    DisposableEffect(ayu) {
        val listener = object : Player.Listener {
            override fun onPlayerError(playbackError: PlaybackException) {
                error = "${playbackError.errorCodeName}\n${playbackError.cause}"
            }

            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_ENDED && autoplay) {
                    upNext.firstOrNull()?.let { open(it) }
                }
            }
        }

        ayu.exo.addListener(listener)

        onDispose {
            val seconds = (ayu.exo.currentPosition / 1000).toInt()
            val length = (ayu.exo.duration.coerceAtLeast(0) / 1000).toInt()

            if (seconds > 0) {
                AyuApp.appScope.launch { library.saveProgress(video, seconds, length) }
            }

            ayu.exo.removeListener(listener)
            ayu.release()

            activity?.let { host ->
                host.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                WindowCompat.getInsetsController(host.window, hostView).show(WindowInsetsCompat.Type.systemBars())
            }
        }
    }

    LaunchedEffect(video.id) {
        liked = library.isLiked(video.id)
        saved = library.isWatchLater(video.id)
        following = video.channelId.isNotEmpty() &&
            library.channelPrefs().any { it.channelKey == video.channelId && it.kind == "follow" }

        val resume = library.historyOf(video.id)?.progressSeconds?.takeIf { it > 5 }?.let { it * 1000L } ?: 0L

        try {
            val streams = ExtractorRepository.streams(video.id)

            info = streams
            options = ayu.qualities(streams)
            audios = ayu.audios(streams)

            val first = ayu.defaultQuality(options)

            if (first != null) {
                quality = first
                audio = ayu.defaultAudio(audios)
                ayu.play(first, audio, resume)
            } else if (!streams.hlsUrl.isNullOrEmpty()) {
                ayu.playHls(streams.hlsUrl)
            } else {
                error = "No playable stream was found for this video."
            }

            // Up Next: a few of YouTube's related videos, then a mix of other topics.
            val official = ExtractorRepository.related(streams).filter { it.id != video.id }

            related = official.take(4)

            val mixed = try {
                FeedBuilder(
                    listOf(video.channel) + HomeTopics.topics.shuffled().take(5).map { it.queries.random() }
                ).nextBatch(14)
            } catch (_: Exception) {
                emptyList()
            }

            val seen = (official.take(4) + video).map { it.id }.toSet()

            related = official.take(4) +
                (official.drop(4).take(2) + mixed).filter { it.id !in seen }.distinctBy { it.id }
        } catch (failure: Exception) {
            error = failure.message ?: failure.javaClass.simpleName
        }
    }

    LaunchedEffect(ayu) {
        var sinceSave = 0

        while (true) {
            playing = ayu.exo.isPlaying
            buffering = ayu.exo.playbackState == Player.STATE_BUFFERING
            duration = ayu.exo.duration.coerceAtLeast(0L)

            if (scrubbing == null) position = ayu.exo.currentPosition

            delay(250)
            sinceSave += 1

            if (sinceSave >= 40 && ayu.exo.isPlaying) {
                sinceSave = 0
                library.saveProgress(video, (ayu.exo.currentPosition / 1000).toInt(), (duration / 1000).toInt())
            }
        }
    }

    LaunchedEffect(controls, playing, controlsTick, sheet) {
        if (controls && playing && sheet == null) {
            delay(3000)
            controls = false
        }
    }

    LaunchedEffect(hud) {
        if (hud != null) {
            delay(900)
            hud = null
        }
    }

    val audioManager = remember { context.getSystemService(Context.AUDIO_SERVICE) as AudioManager }
    var brightness by remember { mutableFloatStateOf(-1f) }
    var volume by remember { mutableFloatStateOf(-1f) }

    fun adjustBrightness(delta: Float) {
        val window = activity?.window ?: return
        val attributes = window.attributes

        if (brightness < 0f) brightness = if (attributes.screenBrightness < 0f) 0.5f else attributes.screenBrightness

        brightness = (brightness + delta).coerceIn(0.02f, 1f)
        attributes.screenBrightness = brightness
        window.attributes = attributes
        hud = "Brightness ${(brightness * 100).roundToInt()}%"
    }

    fun adjustVolume(delta: Float) {
        val max = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)

        if (volume < 0f) volume = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC) / max.toFloat()

        volume = (volume + delta).coerceIn(0f, 1f)
        audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, (volume * max).roundToInt(), 0)
        hud = "Volume ${(volume * 100).roundToInt()}%"
    }

    Column(Modifier.fillMaxSize().background(Ay.Ink)) {
        // ---- the player
        Box(
            Modifier.fillMaxWidth()
                .then(if (fullscreen) Modifier.fillMaxHeight() else Modifier.statusBarsPadding().aspectRatio(16f / 9f))
                .background(Color.Black)
                .pointerInput(Unit) {
                    detectTapGestures(
                        onTap = {
                            controls = !controls
                            controlsTick += 1
                        },
                        onDoubleTap = { offset ->
                            val left = offset.x < size.width / 2

                            seekBy(if (left) -10_000L else 10_000L)
                            hud = if (left) "-10 s" else "+10 s"
                        },
                        onPress = {
                            var boosted = false
                            val job = scope.launch {
                                delay(450)
                                boosted = true
                                ayu.setSpeed(2f)
                                hud = "2x speed"
                            }

                            tryAwaitRelease()
                            job.cancel()

                            if (boosted) ayu.setSpeed(speed)
                        }
                    )
                }
                .pointerInput(Unit) {
                    var left = true

                    detectVerticalDragGestures(
                        onDragStart = { left = it.x < size.width / 2 },
                        onVerticalDrag = { _, dy ->
                            val change = -dy / size.height.toFloat()

                            if (left) adjustBrightness(change) else adjustVolume(change)
                        }
                    )
                }
        ) {
            AndroidView(
                factory = { ctx ->
                    PlayerView(ctx).apply {
                        player = ayu.exo
                        useController = false
                        resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                        setShutterBackgroundColor(android.graphics.Color.BLACK)
                    }
                },
                modifier = Modifier.fillMaxSize()
            )

            if (buffering && error == null) {
                CircularProgressIndicator(color = Ay.Pink, modifier = Modifier.align(Alignment.Center).size(36.dp))
            }

            hud?.let {
                Text(
                    it,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.align(Alignment.TopCenter).padding(top = 28.dp)
                        .background(Color(0xAA000000)).padding(horizontal = 14.dp, vertical = 6.dp)
                )
            }

            error?.let {
                Text(
                    it,
                    color = Ay.Pink,
                    fontSize = 12.sp,
                    modifier = Modifier.align(Alignment.Center).padding(24.dp)
                        .background(Color(0xCC000000)).padding(12.dp)
                )
            }

            if (controls) {
                Box(
                    Modifier.fillMaxWidth().align(Alignment.TopCenter)
                        .background(Brush.verticalGradient(listOf(Color(0xAA000000), Color.Transparent)))
                ) {
                    Row(Modifier.fillMaxWidth().padding(4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            Modifier.size(44.dp).clickable { if (fullscreen) setFullscreen(false) else onClose() },
                            contentAlignment = Alignment.Center
                        ) { Icon(AyIcons.Back, "Back", tint = Color.White, modifier = Modifier.size(24.dp)) }

                        Text(
                            video.title,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f).padding(horizontal = 4.dp)
                        )

                        Box(
                            Modifier.size(44.dp).clickable { sheet = "main"; touchControls() },
                            contentAlignment = Alignment.Center
                        ) { Icon(AyIcons.Settings, "Settings", tint = Color.White, modifier = Modifier.size(22.dp)) }
                    }
                }

                Row(
                    Modifier.align(Alignment.Center),
                    horizontalArrangement = Arrangement.spacedBy(36.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        Modifier.size(48.dp).clickable { seekBy(-10_000L); touchControls() },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(AyIcons.Replay, "Back 10 seconds", tint = Color.White, modifier = Modifier.size(34.dp))
                        Text("10", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color.White)
                    }

                    Box(
                        Modifier.size(60.dp).background(Color(0x66000000), CircleShape).clickable {
                            if (ayu.isEnded) ayu.exo.seekTo(0)

                            if (ayu.exo.isPlaying) ayu.exo.pause() else ayu.exo.play()
                            touchControls()
                        },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            if (playing) AyIcons.Pause else AyIcons.Play,
                            if (playing) "Pause" else "Play",
                            tint = Color.White,
                            modifier = Modifier.size(32.dp)
                        )
                    }

                    Box(
                        Modifier.size(48.dp).clickable { seekBy(10_000L); touchControls() },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(AyIcons.Forward, "Forward 10 seconds", tint = Color.White, modifier = Modifier.size(34.dp))
                        Text("10", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color.White)
                    }
                }

                Column(
                    Modifier.fillMaxWidth().align(Alignment.BottomCenter)
                        .background(Brush.verticalGradient(listOf(Color.Transparent, Color(0xAA000000))))
                ) {
                    Row(Modifier.padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        val shown = ((scrubbing?.times(duration) ?: position.toFloat()) / 1000).toLong()

                        Text("${formatClock(shown)} / ${formatClock(duration / 1000)}", fontSize = 12.sp, color = Color.White)
                        Box(Modifier.weight(1f))
                        Box(
                            Modifier.size(40.dp).clickable { setFullscreen(!fullscreen); touchControls() },
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                if (fullscreen) AyIcons.Minimize else AyIcons.Maximize,
                                "Fullscreen",
                                tint = Color.White,
                                modifier = Modifier.size(22.dp)
                            )
                        }
                    }

                    Slider(
                        value = scrubbing ?: if (duration > 0) position.toFloat() / duration else 0f,
                        onValueChange = {
                            scrubbing = it
                            touchControls()
                        },
                        onValueChangeFinished = {
                            scrubbing?.let { fraction ->
                                val target = (fraction * duration).toLong()

                                ayu.exo.seekTo(target)
                                position = target
                            }

                            scrubbing = null
                        },
                        colors = SliderDefaults.colors(
                            thumbColor = Ay.Pink,
                            activeTrackColor = Ay.Pink,
                            inactiveTrackColor = Color(0x55FFFFFF)
                        ),
                        modifier = Modifier.padding(horizontal = 4.dp).fillMaxWidth().height(28.dp)
                    )
                }
            }
        }

        // ---- everything below the player
        if (!fullscreen) {
            LazyColumn(Modifier.fillMaxSize()) {
                item {
                    Column(Modifier.clickable { descOpen = !descOpen }.padding(horizontal = 16.dp, vertical = 12.dp)) {
                        Text(
                            video.title,
                            fontSize = 17.sp,
                            fontWeight = FontWeight.SemiBold,
                            lineHeight = 23.sp,
                            maxLines = if (descOpen) Int.MAX_VALUE else 2
                        )
                        Text(
                            listOf(viewsText(video.views), video.uploaded).filter { it.isNotEmpty() }.joinToString(" \u00B7 "),
                            color = Ay.Dim,
                            fontSize = 12.sp,
                            modifier = Modifier.padding(top = 4.dp)
                        )

                        if (descOpen) {
                            val text = info?.description?.content.orEmpty().replace(Regex("<[^>]*>"), "").trim()

                            if (text.isNotEmpty()) {
                                Text(text, color = Ay.Fog, fontSize = 13.sp, lineHeight = 19.sp, modifier = Modifier.padding(top = 10.dp))
                            }
                        } else {
                            Text("...more", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp))
                        }
                    }
                }

                item {
                    Row(Modifier.padding(horizontal = 16.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.clickable { onChannel(video) }) {
                            ChannelAvatar(video.channel, video.avatar, video.channelId, size = 38)
                        }
                        Text(
                            video.channel,
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 14.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f).clickable { onChannel(video) }.padding(horizontal = 12.dp)
                        )
                        AyButton(
                            text = if (following) "Following" else "Follow",
                            primary = !following,
                            onClick = {
                                if (video.channelId.isNotEmpty()) {
                                    scope.launch {
                                        if (following) library.removeChannelPref(video.channelId)
                                        else library.setChannelPref(video.channelId, video.channel, "follow", video.avatar)

                                        following = !following
                                    }
                                }
                            }
                        )
                    }
                }

                item {
                    Row(
                        Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 10.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        AyButton(if (liked) "Liked" else "Like", primary = liked, onClick = {
                            scope.launch {
                                if (liked) library.unlike(video.id) else library.like(video)
                                liked = !liked
                            }
                        })
                        AyButton(if (saved) "Saved" else "Watch later", primary = saved, onClick = {
                            scope.launch {
                                if (saved) library.removeWatchLater(video.id) else library.addWatchLater(video)
                                saved = !saved
                            }
                        })
                        AyButton("Playlist", onClick = { menuOpen = true })
                        AyButton("Share", onClick = {
                            val send = Intent(Intent.ACTION_SEND).apply {
                                type = "text/plain"
                                putExtra(Intent.EXTRA_TEXT, "https://youtu.be/${video.id}")
                            }

                            context.startActivity(Intent.createChooser(send, "Share"))
                        })
                    }
                }

                item {
                    Text(
                        "Up next",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(start = 16.dp, top = 14.dp, bottom = 8.dp)
                    )
                }

                if (related.isEmpty()) {
                    item {
                        Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = Ay.Pink, modifier = Modifier.size(24.dp))
                        }
                    }
                }

                items(related, key = { "n-" + it.id }) { next ->
                    VideoCard(next, modifier = Modifier.padding(top = 4.dp), onChannel = { onChannel(next) }) { onOpen(next) }
                }
            }
        }
    }

    if (menuOpen) {
        VideoMenuSheet(video, onDismiss = { menuOpen = false }, onChannel = onChannel)
    }

    sheet?.let { page ->
        ModalBottomSheet(onDismissRequest = { sheet = null }, containerColor = Ay.Slate) {
            Column(Modifier.padding(bottom = 24.dp)) {
                @Composable
                fun row(label: String, value: String? = null, selected: Boolean = false, onClick: () -> Unit) {
                    Row(
                        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 20.dp, vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(label, fontSize = 15.sp, modifier = Modifier.weight(1f), color = if (selected) Ay.Pink else Ay.Paper)

                        if (value != null) Text(value, fontSize = 13.sp, color = Ay.Dim)

                        if (selected) Icon(AyIcons.Check, null, tint = Ay.Pink, modifier = Modifier.size(20.dp))
                    }
                }

                when (page) {
                    "main" -> {
                        Text("Playback", fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
                        row("Quality", quality?.label ?: "Auto") { sheet = "quality" }
                        row("Speed", if (speed == 1f) "Normal" else "${speed}x") { sheet = "speed" }
                        row("Audio", audio?.let { "${it.averageBitrate} kbps" } ?: "Default") { sheet = "audio" }
                    }
                    "quality" -> {
                        Text("Quality", fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
                        options.forEach { option ->
                            row(option.label, selected = option == quality) {
                                apply(option, if (option.muxed) null else audio ?: ayu.defaultAudio(audios))
                                sheet = null
                            }
                        }
                    }
                    "speed" -> {
                        Text("Speed", fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
                        SPEEDS.forEach { value ->
                            row(if (value == 1f) "Normal" else "${value}x", selected = value == speed) {
                                speed = value
                                ayu.setSpeed(value)
                                sheet = null
                            }
                        }
                    }
                    else -> {
                        Text("Audio", fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
                        audios.forEach { track ->
                            row("${track.averageBitrate} kbps", track.format?.name, track == audio) {
                                quality?.let { apply(it, if (it.muxed) null else track) }
                                sheet = null
                            }
                        }
                    }
                }
            }
        }
    }
}
