package com.ayutube.kt.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Obsidian = Color(0xFF000000)
val Panel = Color(0xFF0E0E10)
val Bone = Color(0xFFEDEBE4)
val Dim = Color(0xFF8E8C86)
val Pink = Color(0xFFFF2D6F)

@Composable
fun AyuTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Pink,
            background = Obsidian,
            surface = Panel,
            onBackground = Bone,
            onSurface = Bone,
            onPrimary = Obsidian
        ),
        content = content
    )
}
