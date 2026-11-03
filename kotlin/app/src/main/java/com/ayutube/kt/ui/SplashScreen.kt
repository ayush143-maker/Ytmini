package com.ayutube.kt.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import com.ayutube.kt.ui.components.AyuLogo
import com.ayutube.kt.ui.components.drawMascot
import kotlinx.coroutines.delay

private const val LETTERS = 7

// The wordmark's own space (see AyuLogo): its first letter starts at WORD_SRC_X0, the last one ends here.
private const val WORD_SRC_X1 = 925f

// The system splash (Android 12+) draws drawable/ic_launcher_foreground, a 108 unit canvas, at 288 dp,
// centred on the screen. The mark in that drawable is 47.6 units wide; in the logo it is 105.4 wide.
// Drawing the mark at exactly that size and place makes the hand-over from the system splash invisible.
private const val ICON_CANVAS_DP = 288f
private const val ICON_CANVAS_UNITS = 108f
private const val ICON_MARK_UNITS = 47.6f
private const val LOGO_MARK_UNITS = 105.4f

private const val PULSE_MAX = 1.09f

/**
 * Opening animation, shown right after the system splash. The mark starts exactly where and how big
 * the system splash drew it, then pulses; "ayutube" is typed quickly below it (same letters as the
 * logo), then the screen fades into the app.
 */
@Composable
fun SplashOverlay(onDone: () -> Unit) {
    val typed = remember { Animatable(0f) }
    val fade = remember { Animatable(1f) }

    val pulse by rememberInfiniteTransition(label = "pulse").animateFloat(
        initialValue = 1f,
        targetValue = PULSE_MAX,
        animationSpec = infiniteRepeatable(tween(460, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "pulseScale"
    )

    LaunchedEffect(Unit) {
        delay(140)
        typed.animateTo(LETTERS + 0.4f, tween(560, easing = LinearEasing))
        delay(380)
        fade.animateTo(0f, tween(260))
        onDone()
    }

    Box(
        Modifier.fillMaxSize()
            .graphicsLayer { alpha = fade.value }
            .background(AyuLogo.Background)
            .pointerInput(Unit) { detectTapGestures { } }
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val cx = size.width / 2f
            val cy = size.height / 2f

            // Same size as the system splash's mark, same centre.
            val unit = ICON_CANVAS_DP.dp.toPx() / ICON_CANVAS_UNITS
            val markK = unit * ICON_MARK_UNITS / LOGO_MARK_UNITS
            val markW = LOGO_MARK_UNITS * markK
            val markH = AyuLogo.HEIGHT * markK

            withTransform({
                translate(cx, cy)
                scale(markK * pulse, markK * pulse, Offset.Zero)
                translate(-AyuLogo.MARK_CX, -AyuLogo.MARK_CY)
            }) {
                drawMascot()
            }

            // The word sits below the mark, clear of it even at the biggest point of the pulse.
            val wordK = markW * 1.3f / (WORD_SRC_X1 - AyuLogo.WORD_SRC_X0)
            val wordH = AyuLogo.HEIGHT * wordK
            val wordCy = cy + markH / 2f * PULSE_MAX + markH * 0.28f + wordH / 2f

            withTransform({
                translate(cx, wordCy)
                scale(wordK, wordK, Offset.Zero)
                translate(-(AyuLogo.WORD_SRC_X0 + WORD_SRC_X1) / 2f, -AyuLogo.WORD_CY)
            }) {
                for (i in 0 until LETTERS) {
                    val a = ((typed.value - i) * 3f).coerceIn(0f, 1f)

                    if (a > 0f) drawPath(AyuLogo.letters[i], AyuLogo.WordColor, alpha = a)
                }
            }
        }
    }
}
