package com.ayutube.app

import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/** First native-only milestone. No WebView, JavaScript bridge or Capacitor runtime. */
class MainActivity : AppCompatActivity() {
    private val ink = Color.rgb(8, 8, 9)
    private val panel = Color.rgb(19, 19, 21)
    private val panel2 = Color.rgb(28, 28, 31)
    private val paper = Color.rgb(244, 243, 239)
    private val muted = Color.rgb(158, 158, 161)
    private val accent = Color.rgb(224, 94, 79)
    private lateinit var screenHost: FrameLayout
    private lateinit var nav: LinearLayout
    private var currentScreen = "Home"

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
                setOnClickListener { showScreen(item) }
                tag = item
            }
            nav.addView(button, LinearLayout.LayoutParams(0, dp(44), 1f))
        }
        root.addView(nav, LinearLayout.LayoutParams(-1, dp(58)))
        setContentView(root)
    }

    private fun showScreen(name: String) {
        currentScreen = name
        screenHost.removeAllViews()
        val body = when (name) {
            "Home" -> homeScreen()
            "Search" -> simpleScreen("Search", "Native search is the next milestone.", "The search layer will use NewPipeExtractor directly on this device.")
            "Library" -> simpleScreen("Your library", "Your data stays on this phone.", "Likes, watch later, history, playlists and notes will be stored locally.")
            "Study" -> simpleScreen("Study mode", "Build a subject-first feed.", "Choose an exam, set a date and pick subjects in a later milestone.")
            else -> simpleScreen("AyuTube", "No account. No cloud profile.", "This is a native Kotlin build. Your personal data will remain on-device.")
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
        content.addView(card("Native Android", "Built in Kotlin · local-first by design"))
        content.addView(label("Explore", 19f, paper, true).apply { setPadding(0, dp(24), 0, dp(10)) })
        listOf("Trending videos", "Maths", "Coding projects", "Science", "JEE preparation", "Music", "Documentaries").forEachIndexed { index, title ->
            content.addView(actionRow(title, if (index == 0) "Discover something new" else "Explore $title videos") {
                showScreen("Search")
            })
        }
        content.addView(label("Migration status", 15f, paper, true).apply { setPadding(0, dp(24), 0, dp(6)) })
        content.addView(label("Phase 1 · Native shell and build foundation", 12f, muted, false))
    }

    private fun simpleScreen(title: String, subtitle: String, detail: String): View = page { content ->
        content.addView(label(title, 27f, paper, true))
        content.addView(label(subtitle, 15f, paper, false).apply { setPadding(0, dp(8), 0, dp(16)) })
        content.addView(card("Coming in the next build", detail))
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
    }.apply {
        val params = LinearLayout.LayoutParams(-1, -2)
        params.bottomMargin = dp(8)
        layoutParams = params
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

    private fun rounded(color: Int, radius: Int) = android.graphics.drawable.GradientDrawable().apply {
        setColor(color)
        cornerRadius = dp(radius).toFloat()
    }
}
