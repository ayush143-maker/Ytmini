package com.ayutube.app

import android.app.AlertDialog
import android.content.Context
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
import com.ayutube.app.data.NewPipeRepository
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
    private var currentScreen = "Home"
    private var searchInput: EditText? = null
    private var resultsHost: LinearLayout? = null
    private var searchStatus: TextView? = null
    private var currentSearchQuery = ""
    private var nextSearchPage: Page? = null
    private var searchEpoch = 0
    private var loadingSearch = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
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
        io.shutdownNow()
        super.onDestroy()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun buildShell() {
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(ink) }
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
                text = item; textSize = 11f; gravity = Gravity.CENTER
                setPadding(dp(2), dp(13), dp(2), dp(13)); tag = item
                setOnClickListener { showScreen(item) }
            }
            nav.addView(button, LinearLayout.LayoutParams(0, dp(44), 1f))
        }
        root.addView(nav, LinearLayout.LayoutParams(-1, dp(58)))
        setContentView(root)
    }

    private fun showScreen(name: String) {
        currentScreen = name
        searchInput = null; resultsHost = null; searchStatus = null
        screenHost.removeAllViews()
        val body = when (name) {
            "Home" -> homeScreen()
            "Search" -> searchScreen()
            "Library" -> localPlaceholder("Your library", "Your library is device-local.", "Likes, watch later, history, playlists and notes will be added in the next milestone.")
            "Study" -> localPlaceholder("Study mode", "Build a subject-first feed.", "Choose an exam, enter your date and pick up to eight subjects. This screen will be wired in a later milestone.")
            else -> localPlaceholder("AyuTube", "No account. No cloud profile.", "Native Kotlin build · data stored on this device.")
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
            letterSpacing = 0.12f; setPadding(0, dp(4), 0, dp(24))
        })
        content.addView(card("Native Android", "Kotlin UI · NewPipeExtractor · local-first by design"))
        content.addView(label("Explore", 19f, paper, true).apply { setPadding(0, dp(24), 0, dp(10)) })
        val topics = listOf(
            "Trending videos" to "trending videos", "Maths" to "maths tutorials",
            "Coding projects" to "coding projects", "Science" to "science documentaries",
            "JEE preparation" to "JEE preparation", "Music" to "music videos",
            "Documentaries" to "documentaries"
        )
        topics.forEach { (title, query) -> content.addView(actionRow(title, "Search YouTube · $query") { searchFor(query) }) }
        content.addView(label("Milestone 2 · Native search", 12f, muted, false).apply { setPadding(0, dp(18), 0, 0) })
    }

    private fun searchScreen(): View = page { content ->
        content.addView(label("Search", 27f, paper, true))
        content.addView(label("Results are extracted on-device through NewPipeExtractor.", 12f, muted, false).apply { setPadding(0, dp(6), 0, dp(18)) })
        val searchRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val input = EditText(this).apply {
            hint = "Search videos"; setHintTextColor(muted); setTextColor(paper); textSize = 14f
            singleLine = true; imeOptions = EditorInfo.IME_ACTION_SEARCH
            setPadding(dp(13), dp(11), dp(13), dp(11)); background = rounded(panel2, 11)
            setSelectAllOnFocus(false)
            setOnEditorActionListener { _, action, _ ->
                if (action == EditorInfo.IME_ACTION_SEARCH) { performSearch(text.toString(), false); true } else false
            }
        }
        searchInput = input
        searchRow.addView(input, LinearLayout.LayoutParams(0, dp(48), 1f))
        val go = pillButton("Go", accent, ink) { performSearch(input.text.toString(), false) }
        searchRow.addView(go, LinearLayout.LayoutParams(dp(66), dp(48)).apply { leftMargin = dp(8) })
        content.addView(searchRow)
        searchStatus = label("Search directly; results will appear here.", 12f, muted, false).apply { setPadding(0, dp(16), 0, dp(8)) }
        content.addView(searchStatus)
        resultsHost = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        content.addView(resultsHost)
    }

    private fun searchFor(query: String) {
        showScreen("Search")
        searchInput?.setText(query)
        performSearch(query, false)
    }

    private fun performSearch(raw: String, append: Boolean) {
        if (loadingSearch) return
        val query = raw.trim()
        if (query.isEmpty()) { status("Enter a search query."); return }
        if (query.length > 200) { status("Search is limited to 200 characters."); return }
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
                    status("${result.items.size} results loaded${if (result.nextPage != null) " · more available" else ""}")
                    if (!append && result.items.isEmpty()) resultsHost?.addView(card("No videos found", "Try a shorter or different search."))
                    result.items.forEach { video -> resultsHost?.addView(videoRow(video)) }
                    if (result.nextPage != null) {
                        resultsHost?.addView(pillButton("Load more", panel2, paper) { performSearch(currentSearchQuery, true) }.apply {
                            layoutParams = LinearLayout.LayoutParams(-1, dp(46)).apply { topMargin = dp(12) }
                        })
                    }
                    if (result.items.isEmpty() && result.nextPage == null) status("No results. Try another query.")
                }
            } catch (error: Throwable) {
                main.post {
                    if (token != searchEpoch || currentScreen != "Search") return@post
                    loadingSearch = false
                    status("Search failed: ${error.message?.take(160) ?: "Unknown extraction error"}. Check your connection and retry.")
                    if (!append) resultsHost?.addView(pillButton("Retry", panel2, paper) { performSearch(currentSearchQuery, false) })
                }
            }
        }
    }

    private fun videoRow(video: VideoItem): View = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
        setPadding(dp(11), dp(10), dp(11), dp(10)); background = rounded(panel, 12)
        isClickable = true; isFocusable = true
        val thumb = TextView(context).apply {
            text = "▶"; textSize = 20f; gravity = Gravity.CENTER; setTextColor(paper)
            background = rounded(panel2, 9)
        }
        addView(thumb, LinearLayout.LayoutParams(dp(72), dp(54)))
        val details = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL; setPadding(dp(11), 0, dp(2), 0)
            addView(label(video.title, 13f, paper, true))
            addView(label(video.channelName.ifBlank { "YouTube video" }, 11f, muted, false).apply { setPadding(0, dp(5), 0, 0) })
            val facts = listOf(video.durationLabel, video.viewsLabel).filter { it.isNotBlank() }.joinToString(" · ")
            addView(label(facts, 10f, muted, false).apply { setPadding(0, dp(3), 0, 0) })
        }
        addView(details, LinearLayout.LayoutParams(0, -2, 1f))
        setOnClickListener { showVideoPreview(video) }
        layoutParams = LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(7) }
    }

    private fun showVideoPreview(video: VideoItem) {
        AlertDialog.Builder(this)
            .setTitle(video.title)
            .setMessage("${video.channelName}\n${video.durationLabel}\n\nVideo extraction succeeded. Playback controls are being added in the next milestone.")
            .setPositiveButton("OK", null)
            .show()
    }

    private fun status(message: String) { searchStatus?.text = message }

    private fun localPlaceholder(title: String, subtitle: String, detail: String): View = page { content ->
        content.addView(label(title, 27f, paper, true))
        content.addView(label(subtitle, 15f, paper, false).apply { setPadding(0, dp(8), 0, dp(16)) })
        content.addView(card("Native migration", detail))
    }

    private fun page(build: (LinearLayout) -> Unit): View {
        val scroll = ScrollView(this).apply { clipToPadding = false }
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(28), dp(20), dp(28))
        }
        scroll.addView(content, ScrollView.LayoutParams(-1, -2))
        build(content)
        return scroll
    }

    private fun label(value: String, size: Float, color: Int, bold: Boolean): TextView = TextView(this).apply {
        text = value; textSize = size; setTextColor(color)
        if (bold) setTypeface(typeface, android.graphics.Typeface.BOLD)
    }

    private fun card(title: String, detail: String): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL; setPadding(dp(16), dp(16), dp(16), dp(16)); background = rounded(panel, 14)
        addView(label(title, 15f, paper, true))
        addView(label(detail, 12f, muted, false).apply { setPadding(0, dp(6), 0, 0) })
        layoutParams = LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(8) }
    }

    private fun actionRow(title: String, subtitle: String, onClick: () -> Unit): View = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
        setPadding(dp(14), dp(13), dp(14), dp(13)); background = rounded(panel, 12)
        isClickable = true; isFocusable = true; setOnClickListener { onClick() }
        val copy = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            addView(label(title, 14f, paper, true))
            addView(label(subtitle, 11f, muted, false).apply { setPadding(0, dp(4), 0, 0) })
        }
        addView(copy, LinearLayout.LayoutParams(0, -2, 1f))
        addView(label("→", 22f, accent, false))
        layoutParams = LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(7) }
    }

    private fun pillButton(title: String, backgroundColor: Int, textColor: Int, action: () -> Unit): TextView = TextView(this).apply {
        text = title; textSize = 13f; gravity = Gravity.CENTER; setTextColor(textColor)
        background = rounded(backgroundColor, 11); isClickable = true; isFocusable = true
        setPadding(dp(10), dp(7), dp(10), dp(7)); setOnClickListener { action() }
    }

    private fun rounded(color: Int, radius: Int) = android.graphics.drawable.GradientDrawable().apply {
        setColor(color); cornerRadius = dp(radius).toFloat()
    }
}
