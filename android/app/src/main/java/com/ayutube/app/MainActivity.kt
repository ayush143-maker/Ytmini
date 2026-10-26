package com.ayutube.app

import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.LruCache
import android.view.Gravity
import android.view.inputmethod.EditorInfo
import android.view.View
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.view.ViewCompat
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit
import com.ayutube.app.data.LocalLibraryRepository
import com.ayutube.app.data.NewPipeRepository
import com.ayutube.app.data.PlaybackController
import com.ayutube.app.data.VideoItem
import org.schabi.newpipe.extractor.Page
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import android.text.SpannableString
import android.text.Spanned
import android.text.style.ForegroundColorSpan

/** Native-only AyuTube host. No WebView, JavaScript bridge or Capacitor runtime. */
class MainActivity : AppCompatActivity() {
    // Restored from the read-only Capacitor design tokens: ink/slate/paper/pink.
    private val ink = Color.rgb(0, 0, 0)
    private val panel = Color.rgb(18, 18, 18)
    private val panel2 = Color.rgb(29, 29, 29)
    private val steel = Color.rgb(46, 46, 46)
    private val paper = Color.rgb(242, 242, 242)
    private val muted = Color.rgb(166, 166, 166)
    private val dim = Color.rgb(140, 140, 140)
    private val accent = Color.rgb(251, 42, 95)
    private val accentPressed = Color.rgb(255, 77, 118)
    private val io: ExecutorService = Executors.newFixedThreadPool(3)
    private val imageIo: ExecutorService = Executors.newFixedThreadPool(3)
    private val thumbnailClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS).readTimeout(12, TimeUnit.SECONDS).callTimeout(15, TimeUnit.SECONDS).build()
    private val thumbnailCache = object : LruCache<String, Bitmap>(12 * 1024) {
        override fun sizeOf(key: String, value: Bitmap): Int = value.byteCount / 1024
    }
    private lateinit var appBar: LinearLayout
    private var homeFeedHost: LinearLayout? = null
    private var homeEpoch = 0
    private var relatedEpoch = 0
    private var libraryTab = "History"
    private val main = Handler(Looper.getMainLooper())
    private lateinit var screenHost: FrameLayout
    private lateinit var nav: LinearLayout
    private var miniPlayer: LinearLayout? = null
    private var miniThumbnail: ImageView? = null
    private var miniTitle: TextView? = null
    private var miniSubtitle: TextView? = null
    private var miniPlayButton: ImageView? = null
    private var descriptionToggleView: TextView? = null
    private var watchChannelAvatar: FrameLayout? = null
    private var watchChannelNameView: TextView? = null
    private var descriptionContent = ""
    private var descriptionExpanded = false
    private var qualityOptions: List<NewPipeRepository.PlaybackStream> = emptyList()
    private var autoQuality: NewPipeRepository.PlaybackStream? = null
    private var selectedQuality: NewPipeRepository.PlaybackStream? = null
    private var qualityButton: TextView? = null
    private var speedButton: TextView? = null
    private var currentSpeed = 1.0f
    private lateinit var library: LocalLibraryRepository
    private var playback: PlaybackController? = null
    private var playerView: PlayerView? = null
    private var activeVideo: VideoItem? = null
    private var playlistFirstVideo: VideoItem? = null
    private var playerStatus: TextView? = null
    private var descriptionView: TextView? = null
    private var currentScreen = "Home"
    private var previousScreen = "Search"
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
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }
        buildShell()
        previousScreen = savedInstanceState?.getString("previousScreen") ?: "Search"
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val target = when (currentScreen) {
                    "Watch" -> previousScreen
                    "Channel", "Playlist" -> "Search"
                    "Home" -> null
                    else -> "Home"
                }
                if (target == null) {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                } else showScreen(target)
            }
        })
        showScreen(savedInstanceState?.getString("screen") ?: "Home")
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putString("screen", currentScreen)
        outState.putString("previousScreen", previousScreen)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        activeVideo?.let { video -> playback?.player?.currentPosition?.div(1000L)?.let { library.updateProgress(video.id, it) } }
        releasePlayback()
        io.shutdownNow()
        imageIo.shutdownNow()
        super.onDestroy()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun buildShell() {
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(ink) }
        appBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(16), dp(8), dp(12), dp(8)); setBackgroundColor(ink)
        }
        val mark = TextView(this).apply {
            text = "▶"; textSize = 14f; gravity = Gravity.CENTER; setTextColor(Color.BLACK)
            background = rounded(accent, 5); setPadding(dp(2), 0, 0, 0); contentDescription = "AyuTube"
        }
        appBar.addView(mark, LinearLayout.LayoutParams(dp(30), dp(28)))
        val wordmark = TextView(this).apply {
            text = SpannableString("AyuTube").apply {
                setSpan(ForegroundColorSpan(paper), 0, 3, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                setSpan(ForegroundColorSpan(accent), 3, 7, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            }
            textSize = 21f; setTypeface(typeface, android.graphics.Typeface.BOLD); setPadding(dp(9), 0, 0, 0)
            letterSpacing = -0.025f
        }
        appBar.addView(wordmark, LinearLayout.LayoutParams(0, -2, 1f))
        appBar.addView(iconButton(R.drawable.ic_lucide_search, "Search") {
            searchMode = "Videos"; showScreen("Search")
        }, LinearLayout.LayoutParams(dp(42), dp(40)).apply { rightMargin = dp(7) })
        appBar.addView(TextView(this).apply {
            text = "A"; textSize = 15f; gravity = Gravity.CENTER; setTextColor(ink)
            background = rounded(paper, 18); setTypeface(typeface, android.graphics.Typeface.BOLD)
            contentDescription = "You / Account"; setOnClickListener { showScreen("Account") }
        }, LinearLayout.LayoutParams(dp(34), dp(34)))
        root.addView(appBar, LinearLayout.LayoutParams(-1, dp(60)))
        root.addView(View(this).apply { setBackgroundColor(steel) }, LinearLayout.LayoutParams(-1, dp(1)))

        screenHost = FrameLayout(this)
        root.addView(screenHost, LinearLayout.LayoutParams(-1, 0, 1f))

        miniPlayer = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(10), dp(7), dp(10), dp(7)); setBackgroundColor(panel)
            visibility = View.GONE; isClickable = true; isFocusable = true
            setOnClickListener { if (activeVideo != null) showScreen("Watch") }
        }
        miniThumbnail = ImageView(this).apply { scaleType = ImageView.ScaleType.CENTER_CROP; background = rounded(panel2, 3); clipToOutline = true }
        miniPlayer!!.addView(miniThumbnail, LinearLayout.LayoutParams(dp(58), dp(34)).apply { rightMargin = dp(10) })
        val miniCopy = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_VERTICAL }
        miniTitle = label("Nothing playing", 12f, paper, true).apply { maxLines = 1; ellipsize = android.text.TextUtils.TruncateAt.END }
        miniSubtitle = label("AyuTube", 10f, muted, false).apply { maxLines = 1; ellipsize = android.text.TextUtils.TruncateAt.END; setPadding(0, dp(3), 0, 0) }
        miniCopy.addView(miniTitle); miniCopy.addView(miniSubtitle)
        miniPlayer!!.addView(miniCopy, LinearLayout.LayoutParams(0, -2, 1f))
        miniPlayButton = iconView(R.drawable.ic_lucide_play, accent, "Play")
        miniPlayButton!!.setPadding(dp(8), dp(5), dp(5), dp(5))
        miniPlayButton!!.setOnClickListener {
            val player = playback?.player ?: return@setOnClickListener
            if (player.isPlaying || player.playWhenReady) player.pause() else player.play()
            updateMiniPlayer()
        }
        miniPlayer!!.addView(miniPlayButton, LinearLayout.LayoutParams(dp(42), dp(40)))
        val miniClose = iconView(R.drawable.ic_lucide_x, muted, "Dismiss mini-player").apply {
            setPadding(dp(10), dp(10), dp(7), dp(10))
            isClickable = true; isFocusable = true
            setOnClickListener {
                activeVideo?.let { video -> playback?.player?.currentPosition?.div(1000L)?.let { library.updateProgress(video.id, it) } }
                releasePlayback()
                activeVideo = null
                updateMiniPlayer()
            }
        }
        miniPlayer!!.addView(miniClose, LinearLayout.LayoutParams(dp(38), dp(40)))
        root.addView(miniPlayer, LinearLayout.LayoutParams(-1, dp(54)))
        root.addView(View(this).apply { setBackgroundColor(steel) }, LinearLayout.LayoutParams(-1, dp(1)))

        nav = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER; setBackgroundColor(ink)
            setPadding(dp(8), dp(3), dp(8), dp(4))
        }
        val destinations = listOf(
            Triple("Home", "Home", R.drawable.ic_lucide_house),
            Triple("Search", "Search", R.drawable.ic_lucide_search),
            Triple("Library", "Library", R.drawable.ic_lucide_library),
            Triple("Account", "You", R.drawable.ic_lucide_user_round)
        )
        destinations.forEach { (route, title, iconRes) ->
            val tab = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
                setPadding(dp(2), dp(4), dp(2), dp(3)); tag = route
                isClickable = true; isFocusable = true
                setOnClickListener { if (route == "Search") searchMode = "Videos"; showScreen(route) }
            }
            tab.addView(iconView(iconRes, muted, title).apply { tag = "icon" },
                LinearLayout.LayoutParams(dp(22), dp(22)).apply { bottomMargin = dp(3) })
            tab.addView(TextView(this).apply { text = title; textSize = 10f; gravity = Gravity.CENTER; setTextColor(muted); tag = "label" })
            nav.addView(tab, LinearLayout.LayoutParams(0, dp(48), 1f))
        }
        root.addView(nav, LinearLayout.LayoutParams(-1, dp(56)))
        setContentView(root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, windowInsets ->
            val bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            // Only the root absorbs left/right cutout space. The top bar grows by the
            // status-bar inset and the bottom bar by the navigation/gesture inset.
            view.setPadding(bars.left, 0, bars.right, 0)
            appBar.setPadding(dp(16), dp(8) + bars.top, dp(12), dp(8))
            appBar.layoutParams = appBar.layoutParams.apply { height = dp(60) + bars.top }
            nav.setPadding(dp(8), dp(3), dp(8), dp(4) + bars.bottom)
            nav.layoutParams = nav.layoutParams.apply { height = dp(56) + bars.bottom }
            windowInsets
        }
        ViewCompat.requestApplyInsets(root)
    }

    private fun showScreen(name: String) {
        if (currentScreen == "Watch" && name != "Watch") {
            activeVideo?.let { video -> playback?.player?.currentPosition?.div(1000L)?.let { library.updateProgress(video.id, it) } }
            // Keep ExoPlayer alive; detach the full-size surface and expose the compact player.
            runCatching { playerView?.player = null }
            playerView = null
        }
        currentScreen = name
        searchInput = null; resultsHost = null; searchStatus = null
        playerStatus = null; descriptionView = null; playerView = null; homeFeedHost = null
        watchChannelAvatar = null; watchChannelNameView = null
        screenHost.removeAllViews()
        val body = when (name) {
            "Home" -> homeScreen()
            "Search" -> searchScreen()
            "Watch" -> activeVideo?.let { watchScreen(it) } ?: placeholder("Watch", "No video selected.", "Select a video from search.")
            "Channel" -> if (selectedCatalogUrl.isNotBlank()) channelScreen(selectedCatalogUrl) else placeholder("Channel", "No channel selected.", "Search for a channel first.")
            "Playlist" -> if (selectedCatalogUrl.isNotBlank()) playlistScreen(selectedCatalogUrl) else placeholder("Playlist", "No playlist selected.", "Search for a playlist first.")
            "Library" -> libraryScreen()
            "Study" -> studyScreen()
            else -> accountScreen()
        }
        screenHost.addView(body, FrameLayout.LayoutParams(-1, -1))
        val selectedRoute = when (name) {
            "Watch" -> if (previousScreen in listOf("Home", "Search", "Library", "Study", "Account")) previousScreen else "Home"
            "Channel", "Playlist" -> "Search"
            else -> name
        }
        for (i in 0 until nav.childCount) {
            val tab = nav.getChildAt(i) as LinearLayout
            val selected = tab.tag == selectedRoute
            tab.background = rounded(if (selected) panel else ink, 4)
            for (j in 0 until tab.childCount) {
                val child = tab.getChildAt(j)
                if (child is ImageView && child.tag == "icon") child.setColorFilter(if (selected) accent else muted)
                if (child is TextView) child.setTextColor(if (selected) accent else muted)
            }
        }
        updateMiniPlayer()
    }

    private fun homeScreen(): View = page { content ->
        content.addView(label("Explore", 18f, paper, true).apply { setPadding(0, 0, 0, dp(2)) })
        val chips = listOf("All" to "", "Trending" to "trending videos", "Music" to "popular music videos",
            "Gaming" to "gaming highlights", "Learning" to "math tutorials", "Podcasts" to "popular podcasts")
        content.addView(chipRail(chips.map { it.first }, 0) { index ->
            val query = chips[index].second
            if (query.isNotBlank()) searchFor(query) else showScreen("Home")
        }.apply { layoutParams = LinearLayout.LayoutParams(-1, dp(43)).apply { topMargin = dp(12); bottomMargin = dp(14) } })
        content.addView(label("For you", 16f, paper, true).apply { setPadding(0, dp(8), 0, dp(9)) })
        homeFeedHost = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        content.addView(homeFeedHost)
        loadHomeFeed(homeFeedHost!!)
    }

    private fun loadHomeFeed(target: LinearLayout) {
        val token = ++homeEpoch
        target.removeAllViews()
        target.addView(label("Loading your feed…", 12f, muted, false).apply { setPadding(0, dp(12), 0, dp(12)) })
        val groups = listOf("Trending now" to "trending videos", "Music picks" to "popular music videos", "Learn something" to "math science technology explainers")
        var completedGroups = 0
        var hasFeedContent = false
        groups.forEach { (title, query) ->
            io.execute {
                val result = runCatching { NewPipeRepository.search(query).items.take(4) }
                main.post {
                    if (token != homeEpoch || currentScreen != "Home" || homeFeedHost !== target) return@post
                    completedGroups++
                    val items = result.getOrNull().orEmpty()
                    if (items.isEmpty()) {
                        if (!hasFeedContent && completedGroups == groups.size) {
                            target.removeAllViews()
                            target.addView(card("Feed unavailable", "Check the connection, or use Search to retry."))
                        }
                        return@post
                    }
                    if (!hasFeedContent) {
                        target.removeAllViews()
                        hasFeedContent = true
                    }
                    target.addView(label(title, 17f, paper, true).apply { setPadding(0, dp(16), 0, dp(9)) })
                    items.forEach { target.addView(videoCard(it)) }
                    target.addView(View(this).apply { setBackgroundColor(steel) }, LinearLayout.LayoutParams(-1, dp(1)).apply { topMargin = dp(6); bottomMargin = dp(4) })
                }
            }
        }
    }

    private fun searchScreen(): View = page { content ->
        content.addView(sectionHeading("Search", "Videos, channels and playlists."))
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val input = EditText(this).apply {
            hint = "Search YouTube"; setHintTextColor(dim); setTextColor(paper); textSize = 14f; isSingleLine = true
            imeOptions = EditorInfo.IME_ACTION_SEARCH; inputType = android.text.InputType.TYPE_CLASS_TEXT
            setPadding(dp(13), dp(10), dp(13), dp(10)); background = outlineRounded(panel2, 4, steel)
            setOnEditorActionListener { _, action, _ ->
                if (action == EditorInfo.IME_ACTION_SEARCH) { performSearch(text.toString(), false); true } else false
            }
        }
        searchInput = input
        row.addView(input, LinearLayout.LayoutParams(0, dp(48), 1f))
        row.addView(pill("Search", accent, Color.BLACK) { performSearch(input.text.toString(), false) },
            LinearLayout.LayoutParams(dp(82), dp(48)).apply { leftMargin = dp(7) })
        content.addView(row, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(15) })
        val modes = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        listOf("Videos", "Channels", "Playlists").forEach { mode ->
            modes.addView(pill(mode, if (searchMode == mode) accent else panel, if (searchMode == mode) Color.BLACK else paper) {
                changeSearchMode(mode)
            }, LinearLayout.LayoutParams(0, dp(38), 1f).apply { if (mode != "Videos") leftMargin = dp(6) })
        }
        content.addView(modes, LinearLayout.LayoutParams(-1, dp(38)).apply { topMargin = dp(12); bottomMargin = dp(6) })
        searchStatus = label("Search videos, channels or playlists.", 12f, muted, false).apply { setPadding(0, dp(12), 0, dp(8)) }
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
                    result.items.forEach { video -> resultsHost?.addView(videoCard(video)) }
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

    private fun catalogRow(title: String, subtitle: String, imageUrl: String, onClick: () -> Unit): View = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
        setPadding(0, dp(7), 0, dp(7)); background = rounded(ink, 0)
        isClickable = true; isFocusable = true; setOnClickListener { onClick() }
        addView(thumbnailImage(imageUrl, null), LinearLayout.LayoutParams(dp(104), dp(66)))
        val copy = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL; setPadding(dp(12), 0, dp(5), 0)
            addView(label(title, 14f, paper, true).apply { maxLines = 2; ellipsize = android.text.TextUtils.TruncateAt.END })
            addView(label(subtitle, 11f, muted, false).apply { setPadding(0, dp(5), 0, 0); maxLines = 2 })
        }
        addView(copy, LinearLayout.LayoutParams(0, -2, 1f))
        layoutParams = LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(9) }
    }

    private fun openChannel(url: String) {
        selectedCatalogUrl = url
        showScreen("Channel")
    }

    private fun openPlaylist(url: String) {
        selectedCatalogUrl = url
        showScreen("Playlist")
    }

    private fun channelScreen(url: String): View = page { content ->
        content.addView(pill("← Back to results", panel2, paper) { showScreen("Search") }.apply {
            layoutParams = LinearLayout.LayoutParams(-1, dp(40))
        })
        val cover = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; setPadding(dp(14), dp(16), dp(14), dp(14))
            background = outlineRounded(panel, 4, steel)
        }
        val head = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val avatar = thumbnailImage("", null)
        avatar.setImageDrawable(null)
        avatar.background = rounded(panel2, 4)
        head.addView(avatar, LinearLayout.LayoutParams(dp(78), dp(78)).apply { rightMargin = dp(13) })
        val headingCopy = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(label("Loading channel…", 20f, paper, true))
            addView(label("Getting channel details", 11f, muted, false).apply { setPadding(0, dp(6), 0, 0) })
        }
        head.addView(headingCopy, LinearLayout.LayoutParams(0, -2, 1f))
        cover.addView(head)
        val statusView = label("Loading videos…", 12f, muted, false).apply {
            setPadding(0, dp(12), 0, dp(2)); maxLines = 3; ellipsize = android.text.TextUtils.TruncateAt.END
        }
        var channelDescriptionExpanded = false
        val aboutToggle = label("More", 12f, accent, true).apply {
            visibility = View.GONE; gravity = Gravity.END; setPadding(0, dp(6), 0, dp(8))
            setOnClickListener {
                channelDescriptionExpanded = !channelDescriptionExpanded
                statusView.maxLines = if (channelDescriptionExpanded) Int.MAX_VALUE else 3
                statusView.ellipsize = if (channelDescriptionExpanded) null else android.text.TextUtils.TruncateAt.END
                text = if (channelDescriptionExpanded) "Less" else "More"
            }
        }
        cover.addView(statusView)
        cover.addView(aboutToggle)
        cover.addView(pill("Search this channel", accent, Color.BLACK) {
            val name = headingCopy.getChildAt(0) as TextView
            searchFor(name.text.toString())
        }.apply { layoutParams = LinearLayout.LayoutParams(-1, dp(40)) })
        content.addView(cover)
        content.addView(label("Videos", 18f, paper, true).apply { setPadding(0, dp(22), 0, dp(9)) })
        val list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        content.addView(list)
        io.execute {
            try {
                val details = NewPipeRepository.channelDetails(url)
                main.post {
                    if (currentScreen != "Channel" || selectedCatalogUrl != url) return@post
                    val item = details.channel
                    (headingCopy.getChildAt(0) as TextView).text = item.title
                    (headingCopy.getChildAt(1) as TextView).text = (if (item.verified) "✓ Verified  ·  " else "") +
                        (item.subscribers.takeIf { it >= 0 }?.let { compactCount(it) + " subscribers" } ?: "YouTube channel")
                    loadThumbnail(avatar, item.thumbnailUrl, null)
                    val channelAbout = item.description.ifBlank { "Latest videos from this channel." }.take(12000)
                    statusView.text = channelAbout
                    statusView.maxLines = if (channelDescriptionExpanded) Int.MAX_VALUE else 3
                    statusView.ellipsize = if (channelDescriptionExpanded) null else android.text.TextUtils.TruncateAt.END
                    aboutToggle.visibility = if (channelAbout.length > 140) View.VISIBLE else View.GONE
                    if (details.videos.isEmpty()) list.addView(card("No videos available", "This channel did not expose a video tab."))
                    details.videos.forEach { list.addView(videoCard(it)) }
                }
            } catch (error: Throwable) {
                main.post { if (currentScreen == "Channel" && selectedCatalogUrl == url) statusView.text = "Channel load failed: ${error.message?.take(140) ?: "Extractor error"}" }
            }
        }
    }

    private fun playlistScreen(url: String): View = page { content ->
        playlistFirstVideo = null
        content.addView(pill("← Back to results", panel2, paper) { showScreen("Search") }.apply {
            layoutParams = LinearLayout.LayoutParams(-1, dp(40))
        })
        val hero = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; setPadding(dp(12), dp(12), dp(12), dp(12))
            background = outlineRounded(panel, 4, steel)
        }
        val thumb = thumbnailImage("", null)
        hero.addView(thumb, LinearLayout.LayoutParams(-1, dp(178)))
        val title = label("Loading playlist…", 20f, paper, true).apply { setPadding(0, dp(12), 0, dp(5)) }
        val subtitle = label("Fetching playlist items", 11f, muted, false)
        hero.addView(title); hero.addView(subtitle)
        val playFirstButton = pill("Loading playlist…", panel2, paper) {
            playlistFirstVideo?.let { openVideo(it) } ?: Toast.makeText(this@MainActivity, "No video available yet", Toast.LENGTH_SHORT).show()
        }
        playFirstButton.isEnabled = false
        playFirstButton.alpha = 0.7f
        hero.addView(playFirstButton.apply { layoutParams = LinearLayout.LayoutParams(-1, dp(42)).apply { topMargin = dp(12) } })
        content.addView(hero)
        content.addView(label("Playlist videos", 18f, paper, true).apply { setPadding(0, dp(22), 0, dp(9)) })
        val list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        content.addView(list)
        io.execute {
            try {
                val details = NewPipeRepository.playlistDetails(url)
                main.post {
                    if (currentScreen != "Playlist" || selectedCatalogUrl != url) return@post
                    title.text = details.playlist.title
                    subtitle.text = "${details.playlist.uploader.ifBlank { "YouTube playlist" }} · ${details.playlist.videoCount.takeIf { it >= 0 }?.let { "$it videos" } ?: "Playlist"}"
                    loadThumbnail(thumb, details.playlist.thumbnailUrl, null)
                    playlistFirstVideo = details.videos.firstOrNull()
                    playFirstButton.isEnabled = playlistFirstVideo != null
                    playFirstButton.alpha = if (playlistFirstVideo != null) 1f else 0.65f
                    playFirstButton.text = if (playlistFirstVideo != null) "▶  Play first video" else "No videos available"
                    if (details.videos.isEmpty()) list.addView(card("Playlist is empty", "No video items were returned."))
                    details.videos.forEach { list.addView(videoRow(it)) }
                }
            } catch (error: Throwable) {
                main.post { if (currentScreen == "Playlist" && selectedCatalogUrl == url) subtitle.text = "Playlist load failed: ${error.message?.take(140) ?: "Extractor error"}" }
            }
        }
    }

    private fun videoRow(video: VideoItem): View = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
        setPadding(dp(8), dp(8), dp(8), dp(8)); setBackgroundColor(panel)
        isClickable = true; isFocusable = true; setOnClickListener { openVideo(video) }
        val media = FrameLayout(context).apply {
            background = rounded(panel2, 3); clipToOutline = true
            addView(thumbnailImage(video.thumbnailUrl, video.id), FrameLayout.LayoutParams(-1, -1))
            if (video.durationSeconds > 0) addView(durationBadge(video.durationLabel), FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM or Gravity.END).apply { rightMargin = dp(4); bottomMargin = dp(4) })
        }
        addView(media, LinearLayout.LayoutParams(dp(120), dp(68)))
        val details = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL; setPadding(dp(10), dp(1), dp(3), dp(1))
            addView(label(video.title, 13f, paper, true).apply { maxLines = 3; ellipsize = android.text.TextUtils.TruncateAt.END })
            addView(label(video.channelName.ifBlank { "YouTube" }, 11f, muted, false).apply { setPadding(0, dp(5), 0, 0); maxLines = 1 })
            val facts = listOf(video.viewsLabel, video.durationLabel).filter { it.isNotBlank() }.joinToString(" · ")
            addView(label(facts, 10f, dim, false).apply { setPadding(0, dp(3), 0, 0); maxLines = 1 })
        }
        addView(details, LinearLayout.LayoutParams(0, -2, 1f))
        layoutParams = LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(5) }
    }

    private fun videoCard(video: VideoItem): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(0, 0, 0, dp(10))
        val media = FrameLayout(this@MainActivity).apply {
            background = rounded(panel2, 3); clipToOutline = true
            addView(thumbnailImage(video.thumbnailUrl, video.id), FrameLayout.LayoutParams(-1, -1))
            if (video.durationSeconds > 0) addView(durationBadge(video.durationLabel),
                FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM or Gravity.END).apply { rightMargin = dp(6); bottomMargin = dp(6) })
            if (video.isShort) addView(label("SHORTS", 9f, paper, true).apply {
                background = rounded(accent, 2); setPadding(dp(6), dp(4), dp(6), dp(4))
            }, FrameLayout.LayoutParams(-2, -2, Gravity.TOP or Gravity.START).apply { leftMargin = dp(6); topMargin = dp(6) })
            setOnClickListener { openVideo(video) }
        }
        addView(media, LinearLayout.LayoutParams(-1, dp(200)))
        val row = LinearLayout(this@MainActivity).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.TOP; setPadding(dp(2), dp(10), 0, 0)
        }
        val avatar = channelAvatar(video.channelName, video.channelThumbnailUrl, 35)
        row.addView(avatar, LinearLayout.LayoutParams(dp(35), dp(35)).apply { rightMargin = dp(10) })
        val copy = LinearLayout(this@MainActivity).apply {
            orientation = LinearLayout.VERTICAL
            val title = label(video.title, 14f, paper, true).apply { maxLines = 2; ellipsize = android.text.TextUtils.TruncateAt.END; setOnClickListener { openVideo(video) } }
            addView(title)
            val metaText = listOf(video.channelName, video.viewsLabel, video.durationLabel).filter { it.isNotBlank() }.joinToString(" · ")
            val meta = label(metaText, 11f, muted, false).apply { setPadding(0, dp(5), 0, 0); maxLines = 2; ellipsize = android.text.TextUtils.TruncateAt.END }
            addView(meta)
        }
        row.addView(copy, LinearLayout.LayoutParams(0, -2, 1f))
        val more = iconView(R.drawable.ic_lucide_more_vertical, muted, "More video actions").apply {
            setPadding(dp(5), dp(4), dp(3), dp(4)); setOnClickListener { videoActions(video) }
        }
        row.addView(more, LinearLayout.LayoutParams(dp(30), dp(36)))
        addView(row)
        layoutParams = LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(5) }
    }

    private fun videoActions(video: VideoItem) {
        val options = arrayOf("Play video", if (library.isLiked(video.id)) "Remove like" else "Like video", "Save to Watch later", "Add to playlist", "Share link", "Video note")
        AlertDialog.Builder(this).setItems(options) { _, which ->
            when (which) {
                0 -> openVideo(video)
                1 -> { library.toggleLike(video); Toast.makeText(this, "Like updated", Toast.LENGTH_SHORT).show() }
                2 -> { val added = library.addWatchLater(video); Toast.makeText(this, if (added) "Saved to Watch Later" else "Already saved", Toast.LENGTH_SHORT).show() }
                3 -> choosePlaylist(video)
                4 -> shareVideo(video)
                5 -> editVideoNote(video)
            }
        }.show()
    }

    private fun shareVideo(video: VideoItem) {
        val intent = Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, video.url); putExtra(Intent.EXTRA_SUBJECT, video.title) }
        startActivity(Intent.createChooser(intent, "Share video"))
    }

    private fun durationBadge(value: String): TextView = label(value, 10f, Color.WHITE, true).apply {
        background = rounded(Color.rgb(0, 0, 0), 2); setPadding(dp(5), dp(3), dp(5), dp(3))
    }

    private fun thumbnailImage(rawUrl: String, videoId: String?): ImageView = ImageView(this).apply {
        scaleType = ImageView.ScaleType.CENTER_CROP
        setBackgroundColor(panel2)
        contentDescription = "Video thumbnail"
        loadThumbnail(this, rawUrl, videoId)
    }

    private fun loadThumbnail(target: ImageView, rawUrl: String, videoId: String?) {
        val url = when {
            rawUrl.startsWith("https://") -> rawUrl
            !videoId.isNullOrBlank() -> "https://i.ytimg.com/vi/$videoId/hqdefault.jpg"
            else -> ""
        }
        if (url.isBlank()) return
        target.tag = url
        thumbnailCache.get(url)?.let { target.setImageBitmap(it); return }
        imageIo.execute {
            val bitmap = try {
                thumbnailClient.newCall(Request.Builder().url(url).header("User-Agent", "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36")
                    .header("Accept", "image/avif,image/webp,image/apng,image/*,*/*;q=0.8").build()).execute().use { response ->
                    if (!response.isSuccessful) null else {
                        val bytes = response.body?.bytes()
                        if (bytes == null || bytes.size > 3 * 1024 * 1024) null else BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                    }
                }
            } catch (_: Throwable) { null }
            if (bitmap != null) thumbnailCache.put(url, bitmap)
            main.post { if (target.tag == url && bitmap != null) target.setImageBitmap(bitmap) }
        }
    }

    private fun openVideo(video: VideoItem) {
        previousScreen = currentScreen
        releasePlayback()
        activeVideo = video
        qualityOptions = emptyList(); autoQuality = null; selectedQuality = null
        descriptionContent = ""; descriptionExpanded = false
        currentSpeed = 1.0f; speedButton?.text = "1×"; qualityButton?.text = "Auto"
        showScreen("Watch")
        val token = ++watchEpoch
        playerStatus?.text = "Getting video streams from YouTube…"
        io.execute {
            try {
                val details = NewPipeRepository.details(video)
                main.post {
                    if (token != watchEpoch || currentScreen != "Watch" || activeVideo?.id != video.id) return@post
                    qualityOptions = details.qualityOptions
                    autoQuality = details.qualityOptions.filter { it.height in 1..720 }.maxByOrNull { it.height }
                        ?: details.qualityOptions.firstOrNull()
                    selectedQuality = autoQuality
                    qualityButton?.text = selectedQuality?.label ?: "Auto"
                    val resolvedVideo = details.item
                    activeVideo = resolvedVideo
                    watchChannelNameView?.text = resolvedVideo.channelName.ifBlank { "YouTube channel" }
                    watchChannelAvatar?.let { frame ->
                        (frame.getChildAt(1) as? ImageView)?.let { avatarImage ->
                            loadThumbnail(avatarImage, resolvedVideo.channelThumbnailUrl, null)
                        }
                    }
                    miniTitle?.text = resolvedVideo.title
                    miniSubtitle?.text = resolvedVideo.channelName.ifBlank { "AyuTube" }
                    miniThumbnail?.let { loadThumbnail(it, resolvedVideo.thumbnailUrl, resolvedVideo.id) }
                    playerStatus?.text = if (details.videoUrl != null) "Preparing video…" else "Trying audio stream…"
                    renderDescription(details.description.ifBlank { "No description available." })
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
                                playerStatus?.text = if (isPlaying) "Now playing" else "Paused"
                            }
                            updateMiniPlayer()
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
                        updateMiniPlayer()
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
        val playerFrame = FrameLayout(this).apply { background = rounded(Color.BLACK, 3); clipToOutline = true }
        val view = PlayerView(this).apply {
            useController = true; setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING)
            setBackgroundColor(Color.BLACK); resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
            player = playback?.player
        }
        playerView = view
        playerFrame.addView(view, FrameLayout.LayoutParams(-1, -1))
        content.addView(playerFrame, LinearLayout.LayoutParams(-1, dp(208)).apply { bottomMargin = dp(10) })
        content.addView(label(video.title, 17f, paper, true).apply {
            maxLines = 2; ellipsize = android.text.TextUtils.TruncateAt.END; setPadding(0, dp(2), 0, dp(5))
        })
        content.addView(label(listOf(video.viewsLabel, video.durationLabel).filter { it.isNotBlank() }.joinToString(" · "), 11f, muted, false))
        playerStatus = label(if (playback != null) { if (playback?.player?.isPlaying == true) "Now playing" else "Paused" } else "Getting the best available stream…", 10f, dim, false)
            .apply { setPadding(0, dp(6), 0, dp(9)) }
        content.addView(playerStatus)

        val playerTools = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        playerTools.addView(controlChip(R.drawable.ic_lucide_rotate_ccw, "10s") { seekBy(-10_000L) }, LinearLayout.LayoutParams(0, dp(42), 1f).apply { rightMargin = dp(4) })
        val speedChip = controlChip(R.drawable.ic_lucide_gauge, if (currentSpeed == 1f) "1×" else "${currentSpeed}×") { choosePlaybackSpeed() }
        speedButton = (speedChip as LinearLayout).getChildAt(1) as TextView
        playerTools.addView(speedChip, LinearLayout.LayoutParams(0, dp(42), 1f).apply { leftMargin = dp(2); rightMargin = dp(2) })
        val qualityChip = controlChip(R.drawable.ic_lucide_settings_2, selectedQuality?.label ?: "Auto") { choosePlaybackQuality() }
        qualityButton = (qualityChip as LinearLayout).getChildAt(1) as TextView
        playerTools.addView(qualityChip, LinearLayout.LayoutParams(0, dp(42), 1f).apply { leftMargin = dp(2); rightMargin = dp(2) })
        playerTools.addView(controlChip(R.drawable.ic_lucide_rotate_cw, "10s") { seekBy(10_000L) }, LinearLayout.LayoutParams(0, dp(42), 1f).apply { leftMargin = dp(4) })
        content.addView(playerTools, LinearLayout.LayoutParams(-1, dp(42)).apply { bottomMargin = dp(12) })

        val ownerRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(0, dp(5), 0, dp(8)) }
        watchChannelAvatar = channelAvatar(video.channelName, video.channelThumbnailUrl, 38) as FrameLayout
        ownerRow.addView(watchChannelAvatar, LinearLayout.LayoutParams(dp(38), dp(38)).apply { rightMargin = dp(10) })
        val channelCopy = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            watchChannelNameView = label(video.channelName.ifBlank { "YouTube channel" }, 13f, paper, true).apply { maxLines = 1; ellipsize = android.text.TextUtils.TruncateAt.END }
            addView(watchChannelNameView)
            addView(label("Creator", 10f, muted, false).apply { setPadding(0, dp(3), 0, 0) })
        }
        ownerRow.addView(channelCopy, LinearLayout.LayoutParams(0, -2, 1f))
        ownerRow.addView(pill("Channel", panel2, paper) {
            if (video.channelUrl.isNotBlank()) openChannel(video.channelUrl) else searchFor(video.channelName)
        })
        content.addView(ownerRow)

        val actions = HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; overScrollMode = View.OVER_SCROLL_NEVER }
        val actionRail = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        actionRail.addView(iconTextButton(R.drawable.ic_lucide_heart, if (library.isLiked(video.id)) "Liked" else "Like") {
            val liked = library.toggleLike(activeVideo ?: video)
            Toast.makeText(this@MainActivity, if (liked) "Added to liked videos" else "Removed from liked videos", Toast.LENGTH_SHORT).show()
        }, LinearLayout.LayoutParams(-2, dp(38)).apply { rightMargin = dp(7) })
        actionRail.addView(iconTextButton(R.drawable.ic_lucide_bookmark, "Save") {
            val added = library.addWatchLater(activeVideo ?: video)
            Toast.makeText(this@MainActivity, if (added) "Saved to Watch Later" else "Already saved", Toast.LENGTH_SHORT).show()
        }, LinearLayout.LayoutParams(-2, dp(38)).apply { rightMargin = dp(7) })
        actionRail.addView(iconTextButton(R.drawable.ic_lucide_share_2, "Share") { shareVideo(activeVideo ?: video) },
            LinearLayout.LayoutParams(-2, dp(38)).apply { rightMargin = dp(7) })
        actionRail.addView(iconTextButton(R.drawable.ic_lucide_more_vertical, "More") { videoActions(activeVideo ?: video) }, LinearLayout.LayoutParams(-2, dp(38)))
        actions.addView(actionRail)
        content.addView(actions, LinearLayout.LayoutParams(-1, dp(44)).apply { topMargin = dp(4); bottomMargin = dp(8) })

        val descriptionHeader = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        descriptionHeader.addView(label("Description", 15f, paper, true), LinearLayout.LayoutParams(0, -2, 1f))
        descriptionToggleView = label("More", 12f, accent, true).apply {
            gravity = Gravity.END; setPadding(dp(10), dp(6), dp(2), dp(6))
            setOnClickListener { descriptionExpanded = !descriptionExpanded; renderDescription(descriptionContent) }
        }
        descriptionHeader.addView(descriptionToggleView)
        content.addView(descriptionHeader, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(7); bottomMargin = dp(5) })
        descriptionView = label("Loading description…", 12f, muted, false).apply {
            maxLines = 3; ellipsize = android.text.TextUtils.TruncateAt.END; setLineSpacing(dp(2).toFloat(), 1f)
        }
        content.addView(descriptionView)
        if (descriptionContent.isNotBlank()) renderDescription(descriptionContent)
        content.addView(label("Up next", 16f, paper, true).apply { setPadding(0, dp(20), 0, dp(7)) })
        val relatedHost = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        content.addView(relatedHost)
        loadRelatedVideos(video, relatedHost)
    }

    private fun loadRelatedVideos(video: VideoItem, host: LinearLayout) {
        val token = ++relatedEpoch
        host.removeAllViews(); host.addView(card("Finding related videos", "Based on this video's title."))
        io.execute {
            val items = runCatching { NewPipeRepository.search(video.title.take(100)).items.filter { it.id != video.id }.take(5) }
            main.post {
                if (token != relatedEpoch || currentScreen != "Watch" || activeVideo?.id != video.id) return@post
                host.removeAllViews()
                val rows = items.getOrNull().orEmpty()
                if (rows.isEmpty()) host.addView(card("No recommendations yet", "Try another search to discover more videos."))
                rows.forEach { host.addView(videoRow(it)) }
            }
        }
    }

    private fun releasePlayback() {
        runCatching { playerView?.player = null }
        runCatching { playback?.pause() }
        runCatching { playback?.release() }
        playback = null
        playerView = null
        updateMiniPlayer()
    }

    private fun libraryScreen(): View = page { content ->
        content.addView(sectionHeading("Library", "Everything you saved, stored on this phone."))
        val tabs = listOf("History", "Liked", "Watch Later", "Playlists")
        content.addView(chipRail(tabs, tabs.indexOf(libraryTab).coerceAtLeast(0)) { index ->
            libraryTab = tabs[index]; showScreen("Library")
        }.apply { layoutParams = LinearLayout.LayoutParams(-1, dp(40)).apply { topMargin = dp(14); bottomMargin = dp(12) } })
        val controls = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        controls.addView(pill("＋ New playlist", accent, Color.BLACK) { createPlaylistDialog() },
            LinearLayout.LayoutParams(0, dp(40), 1f).apply { rightMargin = dp(5) })
        controls.addView(pill("Export backup", panel2, paper) { shareLibraryBackup() },
            LinearLayout.LayoutParams(0, dp(40), 1f).apply { leftMargin = dp(5) })
        content.addView(controls)
        content.addView(pill("Import JSON backup", panel2, paper) { importLibraryBackupDialog() }.apply {
            layoutParams = LinearLayout.LayoutParams(-1, dp(38)).apply { topMargin = dp(7); bottomMargin = dp(14) }
        })
        when (libraryTab) {
            "History" -> renderLibraryVideos(content, "Recently watched", library.history(), "Your watch history will appear here.")
            "Liked" -> renderLibraryVideos(content, "Liked videos", library.likes(), "Tap Like on a video to keep it here.")
            "Watch Later" -> renderLibraryVideos(content, "Watch Later", library.watchLater(), "Save a video to watch it later.")
            else -> {
                content.addView(label("Your playlists", 18f, paper, true).apply { setPadding(0, dp(8), 0, dp(8)) })
                val custom = library.playlists()
                if (custom.isEmpty()) content.addView(card("No playlists yet", "Create one, then add videos from the Watch screen."))
                custom.forEach { playlist ->
                    val block = LinearLayout(this).apply {
                        orientation = LinearLayout.VERTICAL; setPadding(dp(11), dp(11), dp(11), dp(11))
                        background = outlineRounded(panel, 4, steel)
                    }
                    block.addView(label(playlist.name, 15f, paper, true))
                    block.addView(label("${playlist.videos.size} videos · saved locally", 11f, muted, false).apply { setPadding(0, dp(4), 0, dp(8)) })
                    playlist.videos.take(12).forEach { block.addView(videoRow(it)) }
                    block.addView(pill("Delete playlist", panel2, muted) {
                        AlertDialog.Builder(this).setTitle("Delete ${playlist.name}?")
                            .setMessage("Only this local playlist will be removed.")
                            .setNegativeButton("Cancel", null)
                            .setPositiveButton("Delete") { _, _ -> library.deletePlaylist(playlist.id); showScreen("Library") }.show()
                    }.apply { layoutParams = LinearLayout.LayoutParams(-1, dp(38)).apply { topMargin = dp(8) } })
                    content.addView(block, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(10) })
                }
            }
        }
        if (libraryTab == "History") content.addView(pill("Clear watch history", panel2, paper) {
            AlertDialog.Builder(this).setTitle("Clear history?").setMessage("This only clears local watch history on this device.")
                .setNegativeButton("Cancel", null).setPositiveButton("Clear") { _, _ -> library.clearHistory(); showScreen("Library") }.show()
        }.apply { layoutParams = LinearLayout.LayoutParams(-1, dp(40)).apply { topMargin = dp(14) } })
    }

    private fun renderLibraryVideos(content: LinearLayout, title: String, videos: List<VideoItem>, emptyMessage: String) {
        content.addView(label(title, 18f, paper, true).apply { setPadding(0, dp(9), 0, dp(8)) })
        if (videos.isEmpty()) content.addView(card("Nothing here yet", emptyMessage))
        else videos.forEach { content.addView(videoRow(it)) }
    }

    private fun createPlaylistDialog() {
        val field = EditText(this).apply {
            hint = "Playlist name"; setTextColor(paper); setHintTextColor(muted); isSingleLine = true
            setPadding(dp(12), dp(10), dp(12), dp(10)); background = rounded(panel2, 10)
        }
        val wrapper = LinearLayout(this).apply { setPadding(dp(20), dp(10), dp(20), 0); addView(field) }
        AlertDialog.Builder(this).setTitle("Create local playlist").setView(wrapper)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Create") { _, _ ->
                val id = library.createPlaylist(field.text.toString())
                Toast.makeText(this, if (id != null) "Playlist created" else "Enter a name (max 100 playlists)", Toast.LENGTH_SHORT).show()
                showScreen("Library")
            }.show()
    }

    private fun choosePlaylist(video: VideoItem) {
        val items = library.playlists()
        if (items.isEmpty()) {
            AlertDialog.Builder(this).setTitle("No playlists yet")
                .setMessage("Create a local playlist first?")
                .setNegativeButton("Not now", null)
                .setPositiveButton("Create") { _, _ -> createPlaylistDialog() }.show()
            return
        }
        AlertDialog.Builder(this).setTitle("Add to playlist")
            .setItems(items.map { it.name }.toTypedArray()) { _, index ->
                val success = library.addToPlaylist(items[index].id, activeVideo ?: video)
                Toast.makeText(this, if (success) "Added to ${items[index].name}" else "Already saved or playlist full", Toast.LENGTH_SHORT).show()
            }.show()
    }

    private fun editVideoNote(video: VideoItem) {
        val field = EditText(this).apply {
            hint = "Write a note about this video"; setTextColor(paper); setHintTextColor(muted)
            setText(library.note(video.id)); minLines = 4; gravity = Gravity.TOP
            setPadding(dp(12), dp(10), dp(12), dp(10)); background = rounded(panel2, 10)
        }
        val wrapper = LinearLayout(this).apply { setPadding(dp(20), dp(6), dp(20), 0); addView(field) }
        AlertDialog.Builder(this).setTitle("Video note · max 5,000 characters").setView(wrapper)
            .setNegativeButton("Cancel", null)
            .setNeutralButton("Delete") { _, _ -> library.saveNote(video.id, ""); Toast.makeText(this, "Note deleted", Toast.LENGTH_SHORT).show() }
            .setPositiveButton("Save") { _, _ -> library.saveNote(video.id, field.text.toString()); Toast.makeText(this, "Note saved locally", Toast.LENGTH_SHORT).show() }
            .show()
    }

    private fun shareLibraryBackup() {
        val backup = library.exportBackup()
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "application/json"
            putExtra(Intent.EXTRA_SUBJECT, "AyuTube local library backup")
            putExtra(Intent.EXTRA_TEXT, backup)
        }
        startActivity(Intent.createChooser(intent, "Export AyuTube backup"))
    }

    private fun importLibraryBackupDialog() {
        val field = EditText(this).apply {
            hint = "Paste the complete AyuTube backup JSON"; setTextColor(paper); setHintTextColor(muted)
            minLines = 6; maxLines = 12; gravity = Gravity.TOP
            setPadding(dp(12), dp(10), dp(12), dp(10)); background = rounded(panel2, 10)
        }
        val wrapper = LinearLayout(this).apply { setPadding(dp(20), dp(6), dp(20), 0); addView(field) }
        AlertDialog.Builder(this).setTitle("Import local backup").setView(wrapper)
            .setMessage("A valid v1 backup replaces the local library. Invalid input leaves current data unchanged.")
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Validate & import") { _, _ ->
                val imported = library.importBackup(field.text.toString())
                Toast.makeText(this, if (imported) "Backup imported" else "Invalid backup · current library unchanged", Toast.LENGTH_LONG).show()
                if (imported) showScreen("Library")
            }.show()
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

    private fun accountScreen(): View = page { content ->
        content.addView(sectionHeading("You", "Your preferences and app settings."))
        val profile = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(14), dp(14), dp(14), dp(14)); background = outlineRounded(panel, 4, steel)
        }
        profile.addView(TextView(this).apply {
            text = "A"; textSize = 23f; gravity = Gravity.CENTER; setTextColor(Color.BLACK)
            setTypeface(typeface, android.graphics.Typeface.BOLD); background = rounded(accent, 4)
        }, LinearLayout.LayoutParams(dp(52), dp(52)).apply { rightMargin = dp(12) })
        profile.addView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(label("AyuTube on this device", 15f, paper, true))
            addView(label("No sign-in · no cloud profile", 11f, muted, false).apply { setPadding(0, dp(5), 0, 0) })
        })
        content.addView(profile, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(17); bottomMargin = dp(18) })
        content.addView(label("Your app", 17f, paper, true).apply { setPadding(0, 0, 0, dp(8)) })
        content.addView(actionRow("Study mode", "Exam countdown and subject settings") { showScreen("Study") })
        content.addView(actionRow("Library & backups", "Likes, history, playlists and JSON export") { showScreen("Library") })
        content.addView(actionRow("Search YouTube", "Find videos, channels and playlists") { searchMode = "Videos"; showScreen("Search") })
        content.addView(label("Privacy", 17f, paper, true).apply { setPadding(0, dp(20), 0, dp(8)) })
        content.addView(card("Local-first", "Your likes, watch history, playlists, study settings and notes are saved on this device. There is no account or cloud sync in this native build."))
        content.addView(label("About AyuTube", 17f, paper, true).apply { setPadding(0, dp(20), 0, dp(8)) })
        content.addView(card("Native Android", "Built with Kotlin, NewPipeExtractor and AndroidX Media3. YouTube extraction can change upstream; some stream formats may not be available."))
        content.addView(label("AyuTube · Native preview", 10f, dim, false).apply { gravity = Gravity.CENTER; setPadding(0, dp(22), 0, 0) })
    }

    private fun placeholder(title: String, subtitle: String, detail: String): View = page { content ->
        content.addView(label(title, 27f, paper, true))
        content.addView(label(subtitle, 15f, paper, false).apply { setPadding(0, dp(8), 0, dp(16)) })
        content.addView(card("Native migration", detail))
    }

    private fun iconView(resource: Int, tint: Int, description: String): ImageView = ImageView(this).apply {
        setImageResource(resource); setColorFilter(tint); contentDescription = description; scaleType = ImageView.ScaleType.FIT_CENTER
    }

    private fun iconButton(resource: Int, description: String, action: () -> Unit): ImageView = iconView(resource, paper, description).apply {
        background = rounded(panel2, 7); setPadding(dp(10), dp(9), dp(10), dp(9))
        isClickable = true; isFocusable = true; setOnClickListener { action() }
    }

    private fun controlChip(resource: Int, title: String, action: () -> Unit): View = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER
        background = rounded(panel2, 8); setPadding(dp(6), dp(5), dp(6), dp(5))
        isClickable = true; isFocusable = true; contentDescription = title
        addView(iconView(resource, paper, title), LinearLayout.LayoutParams(dp(16), dp(16)))
        addView(label(title, 10f, paper, true).apply { maxLines = 1; ellipsize = android.text.TextUtils.TruncateAt.END },
            LinearLayout.LayoutParams(-2, -2).apply { leftMargin = dp(4) })
        setOnClickListener { action() }
    }

    private fun iconTextButton(resource: Int, title: String, action: () -> Unit): View = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER
        background = rounded(panel2, 18); setPadding(dp(12), dp(7), dp(12), dp(7))
        isClickable = true; isFocusable = true; contentDescription = title
        addView(iconView(resource, paper, title), LinearLayout.LayoutParams(dp(16), dp(16)))
        addView(label(title, 11f, paper, true), LinearLayout.LayoutParams(-2, -2).apply { leftMargin = dp(6) })
        setOnClickListener { action() }
    }

    private fun channelAvatar(name: String, url: String, sizeDp: Int): View = FrameLayout(this).apply {
        background = roundCircle(steel); clipToOutline = true
        addView(TextView(this@MainActivity).apply {
            text = name.firstOrNull()?.uppercaseChar()?.toString() ?: "▶"
            textSize = if (sizeDp >= 38) 13f else 11f; gravity = Gravity.CENTER; setTextColor(paper)
            background = roundCircle(steel); setTypeface(typeface, android.graphics.Typeface.BOLD)
        }, FrameLayout.LayoutParams(-1, -1))
        val image = ImageView(this@MainActivity).apply { scaleType = ImageView.ScaleType.CENTER_CROP; contentDescription = "$name channel avatar" }
        addView(image, FrameLayout.LayoutParams(-1, -1))
        loadThumbnail(image, url, null)
    }

    private fun roundCircle(color: Int) = android.graphics.drawable.GradientDrawable().apply {
        shape = android.graphics.drawable.GradientDrawable.OVAL; setColor(color)
    }

    private fun updateMiniPlayer() {
        val host = miniPlayer ?: return
        val video = activeVideo
        val player = playback?.player
        val show = currentScreen != "Watch" && video != null && player != null
        host.visibility = if (show) View.VISIBLE else View.GONE
        if (!show || video == null || player == null) return
        miniTitle?.text = video.title
        miniSubtitle?.text = (if (player.isPlaying) "Playing" else "Paused") + " · " + video.channelName.ifBlank { "AyuTube" }
        miniPlayButton?.setImageResource(if (player.isPlaying || player.playWhenReady) R.drawable.ic_lucide_pause else R.drawable.ic_lucide_play)
        miniPlayButton?.setColorFilter(accent)
        if (video.thumbnailUrl.isNotBlank() && miniThumbnail?.tag != video.thumbnailUrl) miniThumbnail?.let { loadThumbnail(it, video.thumbnailUrl, video.id) }
    }

    private fun seekBy(deltaMs: Long) {
        val player = playback?.player ?: run { Toast.makeText(this, "Wait for the stream to load", Toast.LENGTH_SHORT).show(); return }
        val duration = player.duration.takeIf { it > 0L } ?: Long.MAX_VALUE
        player.seekTo((player.currentPosition + deltaMs).coerceIn(0L, duration))
    }

    private fun choosePlaybackSpeed() {
        val speeds = listOf(0.5f, 0.75f, 1.0f, 1.25f, 1.5f, 1.75f, 2.0f)
        val labels = speeds.map { if (it == 1f) "Normal · 1×" else "${it}×" }.toTypedArray()
        val selected = speeds.indexOf(currentSpeed).coerceAtLeast(0)
        AlertDialog.Builder(this).setTitle("Playback speed").setSingleChoiceItems(labels, selected) { dialog, which ->
            currentSpeed = speeds[which]
            runCatching { playback?.setSpeed(currentSpeed) }
            speedButton?.text = if (currentSpeed == 1f) "1×" else "${currentSpeed}×"
            dialog.dismiss()
        }.setNegativeButton("Cancel", null).show()
    }

    private fun choosePlaybackQuality() {
        if (qualityOptions.isEmpty()) {
            Toast.makeText(this, "No alternate compatible quality was found for this stream", Toast.LENGTH_SHORT).show(); return
        }
        val options = listOf("Auto · Recommended") + qualityOptions.map { it.label }
        AlertDialog.Builder(this).setTitle("Video quality").setItems(options.toTypedArray()) { _, which ->
            val choice = if (which == 0) autoQuality else qualityOptions.getOrNull(which - 1)
            if (choice != null) changePlaybackQuality(choice)
        }.show()
    }

    private fun changePlaybackQuality(option: NewPipeRepository.PlaybackStream) {
        val controller = playback ?: return
        val player = controller.player
        val position = player.currentPosition.coerceAtLeast(0L)
        val resume = player.playWhenReady
        selectedQuality = option
        qualityButton?.text = option.label
        try { controller.play(option.url, position, resume) }
        catch (error: Throwable) { Toast.makeText(this, "Could not change quality: ${error.message?.take(90) ?: "stream error"}", Toast.LENGTH_LONG).show() }
    }

    private fun renderDescription(raw: String) {
        descriptionContent = raw.trim().ifBlank { "No description available." }.take(12000)
        val view = descriptionView ?: return
        val needsToggle = descriptionContent.length > 170
        view.text = descriptionContent
        view.maxLines = if (descriptionExpanded) Int.MAX_VALUE else 3
        view.ellipsize = if (descriptionExpanded) null else android.text.TextUtils.TruncateAt.END
        descriptionToggleView?.visibility = if (needsToggle) View.VISIBLE else View.GONE
        descriptionToggleView?.text = if (descriptionExpanded) "Less" else "More"
    }

    private fun status(message: String) { searchStatus?.text = message }

    private fun page(build: (LinearLayout) -> Unit): View {
        val scroll = ScrollView(this).apply { clipToPadding = false; isFillViewport = true; overScrollMode = View.OVER_SCROLL_IF_CONTENT_SCROLLS }
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(16), dp(14), dp(26))
        }
        scroll.addView(content, FrameLayout.LayoutParams(-1, -2))
        build(content)
        return scroll
    }

    private fun sectionHeading(title: String, subtitle: String = ""): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        addView(label(title, 25f, paper, true).apply { letterSpacing = -0.02f })
        if (subtitle.isNotBlank()) addView(label(subtitle, 12f, muted, false).apply { setPadding(0, dp(5), 0, 0) })
    }

    private fun chipRail(items: List<String>, selected: Int, action: (Int) -> Unit): HorizontalScrollView {
        val rail = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        items.forEachIndexed { index, item ->
            val chip = pill(item, if (index == selected) accent else panel2, if (index == selected) Color.BLACK else paper) { action(index) }
            rail.addView(chip, LinearLayout.LayoutParams(-2, dp(34)).apply { rightMargin = dp(7) })
        }
        return HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(rail) }
    }

    private fun label(value: String, size: Float, color: Int, bold: Boolean): TextView = TextView(this).apply {
        text = value; textSize = size; setTextColor(color); includeFontPadding = false
        if (bold) setTypeface(typeface, android.graphics.Typeface.BOLD)
    }

    private fun card(title: String, detail: String): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL; setPadding(dp(14), dp(13), dp(14), dp(13))
        background = outlineRounded(panel, 4, steel)
        addView(label(title, 14f, paper, true))
        addView(label(detail, 12f, muted, false).apply { setPadding(0, dp(6), 0, 0) })
        layoutParams = LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(8) }
    }

    private fun actionRow(title: String, subtitle: String, onClick: () -> Unit): View = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
        setPadding(dp(12), dp(12), dp(12), dp(12)); background = outlineRounded(panel, 4, steel)
        isClickable = true; isFocusable = true; setOnClickListener { onClick() }
        val symbol = label("▶", 13f, accent, true).apply { gravity = Gravity.CENTER; background = rounded(panel2, 3) }
        addView(symbol, LinearLayout.LayoutParams(dp(35), dp(35)).apply { rightMargin = dp(11) })
        val copy = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            addView(label(title, 14f, paper, true))
            addView(label(subtitle, 11f, muted, false).apply { setPadding(0, dp(4), 0, 0) })
        }
        addView(copy, LinearLayout.LayoutParams(0, -2, 1f))
        addView(label("›", 24f, accent, false))
        layoutParams = LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(7) }
    }

    private fun pill(title: String, backgroundColor: Int, textColor: Int, action: () -> Unit): TextView = TextView(this).apply {
        text = title; textSize = 12f; gravity = Gravity.CENTER; setTextColor(textColor); includeFontPadding = false
        background = outlineRounded(backgroundColor, 4, if (backgroundColor == accent) accent else steel)
        isClickable = true; isFocusable = true; setPadding(dp(11), dp(7), dp(11), dp(7)); setOnClickListener { action() }
    }

    private fun outlineRounded(color: Int, radius: Int, stroke: Int) = android.graphics.drawable.GradientDrawable().apply {
        setColor(color); cornerRadius = dp(radius).toFloat(); setStroke(dp(1), stroke)
    }

    private fun rounded(color: Int, radius: Int) = android.graphics.drawable.GradientDrawable().apply {
        setColor(color); cornerRadius = dp(radius.coerceAtMost(6)).toFloat()
    }
}
