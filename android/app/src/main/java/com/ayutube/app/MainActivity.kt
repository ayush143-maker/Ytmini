package com.ayutube.app

import android.app.AlertDialog
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.inputmethod.EditorInfo
import android.view.View
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.ayutube.app.data.LocalLibraryRepository
import com.ayutube.app.data.NewPipeRepository
import com.ayutube.app.data.PlaybackController
import com.ayutube.app.data.VideoItem
import org.schabi.newpipe.extractor.Page
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/** Native-only AyuTube host. No WebView, JavaScript bridge or Capacitor runtime. */
class MainActivity : AppCompatActivity() {
    private val ink = Color.rgb(8, 8, 9)
    private val panel = Color.rgb(19, 19, 21)
    private val panel2 = Color.rgb(28, 28, 31)
    private val paper = Color.rgb(244, 243, 239)
    private val muted = Color.rgb(158, 158, 161)
    private val accent = Color.rgb(224, 94, 79)
    private val io: ExecutorService = Executors.newFixedThreadPool(3)
    private val main = Handler(Looper.getMainLooper())
    private lateinit var screenHost: FrameLayout
    private lateinit var nav: LinearLayout
    private lateinit var library: LocalLibraryRepository
    private var playback: PlaybackController? = null
    private var playerView: PlayerView? = null
    private var activeVideo: VideoItem? = null
    private var playerStatus: TextView? = null
    private var descriptionView: TextView? = null
    private var currentScreen = "Home"
    private var searchInput: EditText? = null
    private var resultsHost: LinearLayout? = null
    private var searchStatus: TextView? = null
    private var currentSearchQuery = ""
    private var searchMode = "Videos"
    private var selectedCatalogUrl = ""
    private var nextSearchPage: Page? = null
    private var searchEpoch = 0
    private var watchEpoch = 0
    private var loadingSearch = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        library = LocalLibraryRepository(applicationContext)
        window.statusBarColor = ink
        window.navigationBarColor = ink
        window.decorView.systemUiVisibility = 0
        buildShell()
        showScreen(savedInstanceState?.getString("screen") ?: "Home")
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putString("screen", currentScreen)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        activeVideo?.let { video -> playback?.player?.currentPosition?.div(1000L)?.let { library.updateProgress(video.id, it) } }
        releasePlayback()
        io.shutdownNow()
        super.onDestroy()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun buildShell() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(ink)
        }
        screenHost = FrameLayout(this)
        root.addView(screenHost, LinearLayout.LayoutParams(-1, 0, 1f))
        nav = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setBackgroundColor(ink)
            setPadding(dp(8), dp(7), dp(8), dp(8))
        }
        listOf("Home", "Search", "Library", "Study", "Account").forEach { item ->
            val button = TextView(this).apply {
                text = item
                textSize = 11f
                gravity = Gravity.CENTER
                setPadding(dp(2), dp(13), dp(2), dp(13))
                tag = item
                setOnClickListener { showScreen(item) }
            }
            nav.addView(button, LinearLayout.LayoutParams(0, dp(44), 1f))
        }
        root.addView(nav, LinearLayout.LayoutParams(-1, dp(58)))
        setContentView(root)
    }

    private fun showScreen(name: String) {
        if (currentScreen == "Watch" && name != "Watch") {
            activeVideo?.let { video ->
                playback?.player?.currentPosition?.div(1000L)?.let { library.updateProgress(video.id, it) }
            }
            releasePlayback()
        }
        currentScreen = name
        searchInput = null
        resultsHost = null
        searchStatus = null
        playerStatus = null
        descriptionView = null
        playerView = null
        screenHost.removeAllViews()
        val body = when (name) {
            "Home" -> homeScreen()
            "Search" -> searchScreen()
            "Watch" -> activeVideo?.let { watchScreen(it) } ?: placeholder("Watch", "No video selected.", "Select a video from search.")
            "Channel" -> if (selectedCatalogUrl.isNotBlank()) channelScreen(selectedCatalogUrl) else placeholder("Channel", "No channel selected.", "Search for a channel first.")
            "Playlist" -> if (selectedCatalogUrl.isNotBlank()) playlistScreen(selectedCatalogUrl) else placeholder("Playlist", "No playlist selected.", "Search for a playlist first.")
            "Library" -> libraryScreen()
            "Study" -> studyScreen()
            else -> placeholder("AyuTube", "No account. No cloud profile.", "Native Kotlin build · data stored on this device.")
        }
        screenHost.addView(body, FrameLayout.LayoutParams(-1, -1))
        for (i in 0 until nav.childCount) {
            val item = nav.getChildAt(i) as TextView
            val selected = item.tag == name
            item.setTextColor(if (selected) paper else muted)
            item.background = rounded(if (selected) panel2 else ink, 10)
        }
    }

    private fun homeScreen(): View = page { content ->
        content.addView(label("AyuTube", 30f, paper, true))
        content.addView(label("VIDEO, WITHOUT THE CLUTTER", 10f, muted, true).apply {
            letterSpacing = 0.12f
            setPadding(0, dp(4), 0, dp(24))
        })
        content.addView(card("Native Android", "Kotlin UI · NewPipeExtractor · Media3 playback · local-first"))
        content.addView(label("Explore", 19f, paper, true).apply { setPadding(0, dp(24), 0, dp(10)) })
        listOf(
            "Trending videos" to "trending videos",
            "Maths" to "maths tutorials",
            "Coding projects" to "coding projects",
            "Science" to "science documentaries",
            "JEE preparation" to "JEE preparation",
            "Music" to "music videos",
            "Documentaries" to "documentaries"
        ).forEach { (title, query) ->
            content.addView(actionRow(title, "Search YouTube · " + query) { searchFor(query) })
        }
        content.addView(label("Search and playback use the on-device extractor.", 12f, muted, false).apply {
            setPadding(0, dp(18), 0, 0)
        })
    }

    private fun searchScreen(): View = page { content ->
        content.addView(label("Search", 27f, paper, true))
        content.addView(label("On-device extraction · no content backend", 12f, muted, false).apply { setPadding(0, dp(6), 0, dp(16)) })
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val input = EditText(this).apply {
            hint = "Search YouTube"
            setHintTextColor(muted); setTextColor(paper); textSize = 14f; isSingleLine = true
            imeOptions = EditorInfo.IME_ACTION_SEARCH
            setPadding(dp(13), dp(11), dp(13), dp(11)); background = rounded(panel2, 11)
            setOnEditorActionListener { _, action, _ ->
                if (action == EditorInfo.IME_ACTION_SEARCH) { performSearch(text.toString(), false); true } else false
            }
        }
        searchInput = input
        row.addView(input, LinearLayout.LayoutParams(0, dp(48), 1f))
        row.addView(pill("Go", accent, ink) { performSearch(input.text.toString(), false) },
            LinearLayout.LayoutParams(dp(66), dp(48)).apply { leftMargin = dp(8) })
        content.addView(row)
        val modes = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        listOf("Videos", "Channels", "Playlists").forEach { mode ->
            modes.addView(pill(mode, if (searchMode == mode) accent else panel2,
                if (searchMode == mode) ink else paper) { changeSearchMode(mode) },
                LinearLayout.LayoutParams(0, dp(40), 1f).apply { if (mode != "Videos") leftMargin = dp(6) })
        }
        content.addView(modes, LinearLayout.LayoutParams(-1, dp(40)).apply { topMargin = dp(12) })
        searchStatus = label("Search videos, channels or playlists.", 12f, muted, false).apply { setPadding(0, dp(15), 0, dp(8)) }
        content.addView(searchStatus)
        resultsHost = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        content.addView(resultsHost)
    }

    private fun changeSearchMode(mode: String) {
        if (searchMode == mode) return
        searchMode = mode
        searchEpoch++
        loadingSearch = false
        nextSearchPage = null
        resultsHost?.removeAllViews()
        val query = searchInput?.text?.toString().orEmpty()
        // Recreate the chip states while retaining the user's current query.
        val queryToKeep = query
        showScreen("Search")
        searchInput?.setText(queryToKeep)
        if (queryToKeep.isNotBlank()) performSearch(queryToKeep, false)
    }

    private fun searchFor(query: String) {
        searchMode = "Videos"
        showScreen("Search")
        searchInput?.setText(query)
        performSearch(query, false)
    }

    private fun performSearch(raw: String, append: Boolean) {
        if (loadingSearch) return
        val query = raw.trim()
        if (query.isEmpty()) { status("Enter a search query."); return }
        if (query.length > 200) { status("Search is limited to 200 characters."); return }
        if (searchMode != "Videos") { performCatalogSearch(query); return }
        val token = ++searchEpoch
        val page = if (append) nextSearchPage else null
        if (append && page == null) return
        loadingSearch = true
        currentSearchQuery = query
        if (!append) { nextSearchPage = null; resultsHost?.removeAllViews() }
        status(if (append) "Loading more results…" else "Searching YouTube…")
        io.execute {
            try {
                val result = NewPipeRepository.search(query, page)
                main.post {
                    if (token != searchEpoch || currentScreen != "Search") return@post
                    loadingSearch = false
                    nextSearchPage = result.nextPage
                    status(result.items.size.toString() + " results loaded" +
                        if (result.nextPage != null) " · more available" else "")
                    if (!append && result.items.isEmpty()) {
                        resultsHost?.addView(card("No videos found", "Try a shorter or different search."))
                    }
                    result.items.forEach { video -> resultsHost?.addView(videoRow(video)) }
                    if (result.nextPage != null) {
                        resultsHost?.addView(pill("Load more", panel2, paper) {
                            performSearch(currentSearchQuery, true)
                        }.apply {
                            layoutParams = LinearLayout.LayoutParams(-1, dp(46)).apply { topMargin = dp(12) }
                        })
                    }
                    if (result.items.isEmpty() && result.nextPage == null) status("No results. Try another query.")
                }
            } catch (error: Throwable) {
                main.post {
                    if (token != searchEpoch || currentScreen != "Search") return@post
                    loadingSearch = false
                    status("Search failed: " + (error.message?.take(160) ?: "Unknown extraction error") +
                        ". Check your connection and retry.")
                    if (!append) resultsHost?.addView(pill("Retry", panel2, paper) {
                        performSearch(currentSearchQuery, false)
                    })
                }
            }
        }
    }

    private fun performCatalogSearch(query: String) {
        val token = ++searchEpoch
        currentSearchQuery = query
        nextSearchPage = null
        loadingSearch = true
        resultsHost?.removeAllViews()
        status("Searching YouTube ${searchMode.lowercase()}…")
        val mode = searchMode
        io.execute {
            try {
                if (mode == "Channels") {
                    val items = NewPipeRepository.searchChannels(query)
                    main.post {
                        if (token != searchEpoch || currentScreen != "Search" || searchMode != mode) return@post
                        loadingSearch = false
                        status("${items.size} channels found")
                        if (items.isEmpty()) resultsHost?.addView(card("No channels found", "Try another query."))
                        items.forEach { item -> resultsHost?.addView(catalogRow(item.title, "${if (item.verified) "Verified · " else ""}${item.subscribers.takeIf { it >= 0 }?.let { compactCount(it) + " subscribers" } ?: "Channel"}", item.thumbnailUrl) { openChannel(item.url) }) }
                    }
                } else {
                    val items = NewPipeRepository.searchPlaylists(query)
                    main.post {
                        if (token != searchEpoch || currentScreen != "Search" || searchMode != mode) return@post
                        loadingSearch = false
                        status("${items.size} playlists found")
                        if (items.isEmpty()) resultsHost?.addView(card("No playlists found", "Try another query."))
                        items.forEach { item -> resultsHost?.addView(catalogRow(item.title, "${item.uploader.ifBlank { "YouTube" }} · ${item.videoCount.takeIf { it >= 0 }?.let { "$it videos" } ?: "Playlist"}", item.thumbnailUrl) { openPlaylist(item.url) }) }
                    }
                }
            } catch (error: Throwable) {
                main.post {
                    if (token != searchEpoch || currentScreen != "Search" || searchMode != mode) return@post
                    loadingSearch = false
                    status("Search failed: ${error.message?.take(140) ?: "Extractor error"}")
                    resultsHost?.addView(pill("Retry", panel2, paper) { performSearch(currentSearchQuery, false) })
                }
            }
        }
    }

    private fun compactCount(value: Long): String = when {
        value >= 1_000_000_000 -> "%.1fB".format(value / 1_000_000_000.0)
        value >= 1_000_000 -> "%.1fM".format(value / 1_000_000.0)
        value >= 1_000 -> "%.1fK".format(value / 1_000.0)
        else -> value.toString()
    }

    private fun catalogRow(title: String, subtitle: String, imageUrl: String, onClick: () -> Unit): View =
        actionRow(title, subtitle.ifBlank { imageUrl.take(100) }, onClick)

    private fun openChannel(url: String) {
        selectedCatalogUrl = url
        showScreen("Channel")
    }

    private fun openPlaylist(url: String) {
        selectedCatalogUrl = url
        showScreen("Playlist")
    }

    private fun channelScreen(url: String): View = page { content ->
        content.addView(pill("← Back to search", panel2, paper) { showScreen("Search") }.apply {
            layoutParams = LinearLayout.LayoutParams(-1, dp(42))
        })
        val heading = label("Loading channel…", 22f, paper, true).apply { setPadding(0, dp(15), 0, dp(6)) }
        val statusView = label("Fetching channel information and latest videos.", 12f, muted, false)
        val list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        content.addView(heading); content.addView(statusView); content.addView(list)
        io.execute {
            try {
                val details = NewPipeRepository.channelDetails(url)
                main.post {
                    if (currentScreen != "Channel" || selectedCatalogUrl != url) return@post
                    heading.text = details.channel.title
                    statusView.text = "${details.channel.subscribers.takeIf { it >= 0 }?.let { compactCount(it) + " subscribers" } ?: "YouTube channel"}${if (details.channel.verified) " · Verified" else ""}"
                    if (details.channel.description.isNotBlank()) list.addView(label(details.channel.description.take(1800), 12f, muted, false).apply { setPadding(0, dp(12), 0, dp(14)) })
                    if (details.videos.isEmpty()) list.addView(card("No videos available", "The channel loaded but did not expose a video tab."))
                    details.videos.forEach { list.addView(videoRow(it)) }
                }
            } catch (error: Throwable) {
                main.post { if (currentScreen == "Channel" && selectedCatalogUrl == url) statusView.text = "Channel load failed: ${error.message?.take(140) ?: "Extractor error"}" }
            }
        }
    }

    private fun playlistScreen(url: String): View = page { content ->
        content.addView(pill("← Back to search", panel2, paper) { showScreen("Search") }.apply {
            layoutParams = LinearLayout.LayoutParams(-1, dp(42))
        })
        val heading = label("Loading playlist…", 22f, paper, true).apply { setPadding(0, dp(15), 0, dp(6)) }
        val statusView = label("Fetching playlist items.", 12f, muted, false)
        val list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        content.addView(heading); content.addView(statusView); content.addView(list)
        io.execute {
            try {
                val details = NewPipeRepository.playlistDetails(url)
                main.post {
                    if (currentScreen != "Playlist" || selectedCatalogUrl != url) return@post
                    heading.text = details.playlist.title
                    statusView.text = "${details.playlist.uploader.ifBlank { "YouTube playlist" }} · ${details.playlist.videoCount.takeIf { it >= 0 }?.let { "$it videos" } ?: "Playlist"}"
                    if (details.videos.isEmpty()) list.addView(card("Playlist is empty", "No video items were returned."))
                    details.videos.forEach { list.addView(videoRow(it)) }
                }
            } catch (error: Throwable) {
                main.post { if (currentScreen == "Playlist" && selectedCatalogUrl == url) statusView.text = "Playlist load failed: ${error.message?.take(140) ?: "Extractor error"}" }
            }
        }
    }

    private fun videoRow(video: VideoItem): View = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        setPadding(dp(11), dp(10), dp(11), dp(10))
        background = rounded(panel, 12)
        isClickable = true
        isFocusable = true
        addView(TextView(context).apply {
            text = "▶"
            textSize = 20f
            gravity = Gravity.CENTER
            setTextColor(paper)
            background = rounded(panel2, 9)
        }, LinearLayout.LayoutParams(dp(72), dp(54)))
        val details = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(11), 0, dp(2), 0)
            addView(label(video.title, 13f, paper, true))
            addView(label(video.channelName.ifBlank { "YouTube video" }, 11f, muted, false).apply {
                setPadding(0, dp(5), 0, 0)
            })
            val facts = listOf(video.durationLabel, video.viewsLabel).filter { it.isNotBlank() }.joinToString(" · ")
            addView(label(facts, 10f, muted, false).apply { setPadding(0, dp(3), 0, 0) })
        }
        addView(details, LinearLayout.LayoutParams(0, -2, 1f))
        setOnClickListener { openVideo(video) }
        layoutParams = LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(7) }
    }

    private fun openVideo(video: VideoItem) {
        releasePlayback()
        activeVideo = video
        showScreen("Watch")
        val token = ++watchEpoch
        playerStatus?.text = "Getting video streams from YouTube…"
        io.execute {
            try {
                val details = NewPipeRepository.details(video)
                main.post {
                    if (token != watchEpoch || currentScreen != "Watch" || activeVideo?.id != video.id) return@post
                    playerStatus?.text = if (details.videoUrl != null) "Preparing video…" else "Trying audio stream…"
                    descriptionView?.text = details.description.ifBlank { "No description available." }
                    val uri = details.videoUrl ?: details.audioUrl
                    if (uri.isNullOrBlank()) {
                        playerStatus?.text = "No compatible progressive stream was found. Try again later."
                        return@post
                    }
                    val controller = PlaybackController(this)
                    playback = controller
                    playerView?.player = controller.player
                    controller.player.addListener(object : Player.Listener {
                        override fun onIsPlayingChanged(isPlaying: Boolean) {
                            if (currentScreen == "Watch" && activeVideo?.id == video.id) {
                                playerStatus?.text = if (isPlaying) "Now playing" else "Paused / buffering"
                            }
                        }
                        override fun onPlayerError(error: PlaybackException) {
                            if (currentScreen == "Watch") {
                                playerStatus?.text = "Playback failed: " +
                                    (error.message?.take(130) ?: "stream error") + ". Try another video."
                            }
                        }
                    })
                    try {
                        val resumeSeconds = library.historyProgress(video.id)
                        controller.play(uri, resumeSeconds * 1000L)
                        library.recordHistory(details.item, resumeSeconds)
                        activeVideo = details.item
                    } catch (error: Throwable) {
                        playerStatus?.text = "Could not start stream: " +
                            (error.message?.take(120) ?: "unsupported stream")
                    }
                }
            } catch (error: Throwable) {
                main.post {
                    if (token != watchEpoch || currentScreen != "Watch") return@post
                    playerStatus?.text = "Video details failed: " +
                        (error.message?.take(160) ?: "Unknown extraction error") + ". Go back and retry."
                }
            }
        }
    }

    private fun watchScreen(video: VideoItem): View = page { content ->
        content.addView(pill("← Back to search", panel2, paper) { showScreen("Search") }.apply {
            layoutParams = LinearLayout.LayoutParams(-1, dp(42))
        })
        val view = PlayerView(this).apply {
            useController = true
            setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING)
            setBackgroundColor(Color.BLACK)
            resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
        }
        playerView = view
        content.addView(view, LinearLayout.LayoutParams(-1, dp(226)).apply {
            topMargin = dp(12)
            bottomMargin = dp(14)
        })
        content.addView(label(video.title, 18f, paper, true))
        content.addView(label(video.channelName, 12f, muted, false).apply {
            setPadding(0, dp(6), 0, dp(3))
        })
        playerStatus = label("Waiting for extractor…", 11f, muted, false).apply {
            setPadding(0, dp(8), 0, dp(12))
        }
        content.addView(playerStatus)
        val actions = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        actions.addView(pill(if (library.isLiked(video.id)) "♥ Liked" else "♡ Like", panel2, paper) {
            val liked = library.toggleLike(activeVideo ?: video)
            Toast.makeText(this@MainActivity, if (liked) "Added to liked videos" else "Removed from liked videos", Toast.LENGTH_SHORT).show()
        }, LinearLayout.LayoutParams(0, dp(42), 1f).apply { rightMargin = dp(5) })
        actions.addView(pill("＋ Watch later", panel2, paper) {
            val added = library.addWatchLater(activeVideo ?: video)
            Toast.makeText(this@MainActivity, if (added) "Saved to Watch later" else "Already in Watch later", Toast.LENGTH_SHORT).show()
        }, LinearLayout.LayoutParams(0, dp(42), 1f).apply { leftMargin = dp(5) })
        content.addView(actions)
        content.addView(label("About this video", 15f, paper, true).apply {
            setPadding(0, dp(22), 0, dp(8))
        })
        descriptionView = label("Loading description…", 12f, muted, false)
        content.addView(descriptionView)
    }

    private fun releasePlayback() {
        runCatching { playerView?.player = null }
        runCatching { playback?.pause() }
        runCatching { playback?.release() }
        playback = null
        playerView = null
    }

    private fun libraryScreen(): View = page { content ->
        content.addView(label("Your library", 27f, paper, true))
        content.addView(label("Saved locally on this device", 12f, muted, false).apply {
            setPadding(0, dp(5), 0, dp(16))
        })
        listOf("History" to library.history(), "Liked videos" to library.likes(), "Watch later" to library.watchLater()).forEach { pair ->
            content.addView(label(pair.first, 17f, paper, true).apply {
                setPadding(0, dp(14), 0, dp(8))
            })
            if (pair.second.isEmpty()) {
                content.addView(label("Nothing here yet", 12f, muted, false).apply {
                    setPadding(dp(6), dp(8), 0, dp(8))
                })
            } else {
                pair.second.take(12).forEach { content.addView(videoRow(it)) }
            }
        }
        content.addView(pill("Clear watch history", panel2, paper) {
            AlertDialog.Builder(this).setTitle("Clear history?")
                .setMessage("This only clears local watch history on this device.")
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Clear") { _, _ -> library.clearHistory(); showScreen("Library") }
                .show()
        }.apply { layoutParams = LinearLayout.LayoutParams(-1, dp(44)).apply { topMargin = dp(12) } })
    }

    private fun studyScreen(): View = page { content ->
        val saved = library.studySettings()
        val existing = saved.optJSONArray("subjects")
        val subjectNames = existing?.let { array -> (0 until array.length()).map { array.optString(it) } }.orEmpty()
        content.addView(label("Study mode", 27f, paper, true))
        content.addView(label("A calmer, subject-first video feed", 12f, muted, false).apply {
            setPadding(0, dp(6), 0, dp(16))
        })
        val exam = EditText(this).apply {
            hint = "Exam name (e.g. CUET)"; setTextColor(paper); setHintTextColor(muted)
            setText(saved.optString("exam", "")); setSingleLine(true)
            background = rounded(panel2, 10); setPadding(dp(12), dp(10), dp(12), dp(10))
        }
        content.addView(exam)
        val date = EditText(this).apply {
            hint = "Exam date YYYY-MM-DD"; setTextColor(paper); setHintTextColor(muted)
            setText(saved.optString("date", "")); setSingleLine(true)
            background = rounded(panel2, 10); setPadding(dp(12), dp(10), dp(12), dp(10))
            layoutParams = LinearLayout.LayoutParams(-1, dp(48)).apply { topMargin = dp(9) }
        }
        content.addView(date)
        content.addView(label("Subjects (comma-separated, max 8)", 12f, muted, false).apply {
            setPadding(0, dp(16), 0, dp(6))
        })
        val subjectInput = EditText(this).apply {
            hint = "Mathematics, Physics, ..."; setTextColor(paper); setHintTextColor(muted)
            setText(subjectNames.joinToString(", "))
            background = rounded(panel2, 10); setPadding(dp(12), dp(10), dp(12), dp(10))
        }
        content.addView(subjectInput)
        content.addView(pill("Save study plan", accent, ink) {
            val examName = exam.text.toString().trim()
            val dateText = date.text.toString().trim()
            val dateValid = runCatching { java.time.LocalDate.parse(dateText); true }.getOrDefault(false)
            if (examName.isBlank() || !dateValid) {
                Toast.makeText(this@MainActivity, "Enter an exam name and valid YYYY-MM-DD date", Toast.LENGTH_LONG).show()
            } else {
                val selected = subjectInput.text.toString().split(",").map { it.trim() }
                    .filter { it.isNotEmpty() }.distinct().take(8)
                library.saveStudySettings(examName, dateText, selected, true)
                Toast.makeText(this@MainActivity, "Study plan saved on this device", Toast.LENGTH_SHORT).show()
            }
        }.apply { layoutParams = LinearLayout.LayoutParams(-1, dp(46)).apply { topMargin = dp(14) } })
        val savedDate = runCatching { java.time.LocalDate.parse(saved.optString("date", "")) }.getOrNull()
        if (savedDate != null) {
            val days = java.time.temporal.ChronoUnit.DAYS.between(java.time.LocalDate.now(), savedDate)
            val line = if (days >= 0) days.toString() + " days until " + saved.optString("exam") else "Exam date has passed"
            content.addView(label(line, 14f, paper, true).apply { setPadding(0, dp(18), 0, dp(8)) })
            content.addView(label("Date entered by you · not an official exam-date feed", 11f, muted, false))
        }
        content.addView(label("Selected subjects: " + subjectNames.joinToString().ifBlank { "none yet" }, 12f, muted, false).apply {
            setPadding(0, dp(12), 0, 0)
        })
    }

    private fun placeholder(title: String, subtitle: String, detail: String): View = page { content ->
        content.addView(label(title, 27f, paper, true))
        content.addView(label(subtitle, 15f, paper, false).apply { setPadding(0, dp(8), 0, dp(16)) })
        content.addView(card("Native migration", detail))
    }

    private fun status(message: String) { searchStatus?.text = message }

    private fun page(build: (LinearLayout) -> Unit): View {
        val scroll = ScrollView(this).apply { clipToPadding = false }
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(28), dp(20), dp(28))
        }
        scroll.addView(content, FrameLayout.LayoutParams(-1, -2))
        build(content)
        return scroll
    }

    private fun label(value: String, size: Float, color: Int, bold: Boolean): TextView = TextView(this).apply {
        text = value
        textSize = size
        setTextColor(color)
        if (bold) setTypeface(typeface, android.graphics.Typeface.BOLD)
    }

    private fun card(title: String, detail: String): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(16), dp(16), dp(16), dp(16))
        background = rounded(panel, 14)
        addView(label(title, 15f, paper, true))
        addView(label(detail, 12f, muted, false).apply { setPadding(0, dp(6), 0, 0) })
        layoutParams = LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(8) }
    }

    private fun actionRow(title: String, subtitle: String, onClick: () -> Unit): View = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        setPadding(dp(14), dp(13), dp(14), dp(13))
        background = rounded(panel, 12)
        isClickable = true
        isFocusable = true
        setOnClickListener { onClick() }
        val copy = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            addView(label(title, 14f, paper, true))
            addView(label(subtitle, 11f, muted, false).apply { setPadding(0, dp(4), 0, 0) })
        }
        addView(copy, LinearLayout.LayoutParams(0, -2, 1f))
        addView(label("→", 22f, accent, false))
        layoutParams = LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(7) }
    }

    private fun pill(title: String, backgroundColor: Int, textColor: Int, action: () -> Unit): TextView = TextView(this).apply {
        text = title
        textSize = 13f
        gravity = Gravity.CENTER
        setTextColor(textColor)
        background = rounded(backgroundColor, 11)
        isClickable = true
        isFocusable = true
        setPadding(dp(10), dp(7), dp(10), dp(7))
        setOnClickListener { action() }
    }

    private fun rounded(color: Int, radius: Int) = android.graphics.drawable.GradientDrawable().apply {
        setColor(color)
        cornerRadius = dp(radius).toFloat()
    }
}
