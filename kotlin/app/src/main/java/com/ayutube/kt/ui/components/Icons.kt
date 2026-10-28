package com.ayutube.kt.ui.components

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.dp

/** Lucide icons (ISC licence), the same ones the web app uses. */
private fun lucide(name: String, vararg paths: String): ImageVector {
    val builder = ImageVector.Builder(
        name = name,
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f
    )

    for (d in paths) {
        builder.addPath(
            pathData = PathParser().parsePathString(d).toNodes(),
            fill = null,
            stroke = SolidColor(Color.White),
            strokeLineWidth = 1.8f,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round
        )
    }

    return builder.build()
}

private fun circle(cx: Float, cy: Float, r: Float) =
    "M${cx - r},$cy a$r,$r 0 1,0 ${2 * r},0 a$r,$r 0 1,0 ${-2 * r},0"

object AyIcons {
    val Home = lucide(
        "home",
        "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8",
        "M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
    )

    val Explore = lucide(
        "explore",
        "m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z",
        circle(12f, 12f, 10f)
    )
    val Library = lucide("library", "m16 6 4 14", "M12 6v14", "M8 8v12", "M4 4v16")
    val Account = lucide(
        "account",
        circle(12f, 12f, 10f),
        circle(12f, 10f, 3f),
        "M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"
    )
    val Search = lucide("search", circle(10.5f, 10.5f, 6.5f), "m15.5 15.5 5.5 5.5")
    val More = lucide("more", circle(12f, 5f, 0.6f), circle(12f, 12f, 0.6f), circle(12f, 19f, 0.6f))
    val Clock = lucide("clock", circle(12f, 12f, 10f), "M12 6v6l4 2")
    val Heart = lucide(
        "heart",
        "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
    )
    val Playlist = lucide("playlist", "M3 6h12", "M3 12h12", "M3 18h8", "m16 12 6 4-6 4Z")
    val History = lucide("history", "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", "M3 3v5h5", "M12 7v5l4 2")
    val People = lucide(
        "people",
        "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
        circle(9f, 7f, 4f),
        "M22 21v-2a4 4 0 0 0-3-3.87",
        "M16 3.13a4 4 0 0 1 0 7.75"
    )
    val Close = lucide("close", "M18 6 6 18", "m6 6 12 12")
    val Back = lucide("back", "m12 19-7-7 7-7", "M19 12H5")
}
