package com.ayutube.kt.ui.theme

import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.ayutube.kt.R

/** The web app's palette (style.css :root), unchanged. */
object Ay {
    val Ink = Color(0xFF000000)
    val Slate = Color(0xFF121212)
    val SlateHi = Color(0xFF1D1D1D)
    val Steel = Color(0xFF2E2E2E)
    val SteelHi = Color(0xFF5C5C5C)
    val Paper = Color(0xFFF2F2F2)
    val Fog = Color(0xFFA6A6A6)
    val Dim = Color(0xFF8C8C8C)
    val Pink = Color(0xFFFB2A5F)
    val PinkPress = Color(0xFFFF4D76)
    val Bone = Color(0xFFEDEBE4)
    val Obsidian = Color(0xFF0E0E10)
}

@OptIn(ExperimentalTextApi::class)
val Sans = FontFamily(
    Font(R.font.schibsted_grotesk, FontWeight.Normal, variationSettings = FontVariation.Settings(FontVariation.weight(400))),
    Font(R.font.schibsted_grotesk, FontWeight.Medium, variationSettings = FontVariation.Settings(FontVariation.weight(500))),
    Font(R.font.schibsted_grotesk, FontWeight.SemiBold, variationSettings = FontVariation.Settings(FontVariation.weight(600))),
    Font(R.font.schibsted_grotesk, FontWeight.Bold, variationSettings = FontVariation.Settings(FontVariation.weight(700))),
    Font(R.font.schibsted_grotesk, FontWeight.ExtraBold, variationSettings = FontVariation.Settings(FontVariation.weight(800)))
)

val Script = FontFamily(Font(R.font.sacramento))

@Composable
fun AyuTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Ay.Pink,
            onPrimary = Ay.Ink,
            background = Ay.Ink,
            onBackground = Ay.Paper,
            surface = Ay.Slate,
            onSurface = Ay.Paper,
            surfaceVariant = Ay.SlateHi,
            outline = Ay.Steel
        )
    ) {
        CompositionLocalProvider(
            LocalTextStyle provides TextStyle(fontFamily = Sans, color = Ay.Paper, fontSize = 16.sp)
        ) {
            content()
        }
    }
}
