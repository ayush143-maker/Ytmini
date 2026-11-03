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
import com.ayutube.kt.ui.components.AyuLogo
import com.ayutube.kt.ui.components.drawMascot
import kotlinx.coroutines.delay

private const val LETTERS = 7

// The wordmark's own space (see AyuLogo): its first letter starts at WORD_SRC_X0, the last one ends here.
private const val WORD_SRC_X1 = 925f

/**
 * Opening animation, shown right after the system splash: the mark sits in the middle at one fixed
 * size and pulses, "ayutube" is typed out quickly below it (same letters as the logo), then the
 * screen fades into the app.
 */
@Composable
fun SplashOverlay(onDone: () -> Unit) {
    val typed = remember { Animatable(0f) }
    val fade = remember { Animatable(1f) }

    val pulse by rememberInfiniteTransition(label = "pulse").animateFloat(
        initialValue = 1f,
        targetValue = 1.09f,
        animationSpec = infiniteRepeatable(tween(460, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "pulseScale"
    )

    LaunchedEffect(Unit) {
        delay(120)
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
            val w = size.width
            val h = size.height

            // The mark keeps the size it had when the old splash started; the pulse is the only movement.
            val markK = w * 0.26f / (AyuLogo.MARK_X1 - AyuLogo.MARK_X0)
            val wordK = w * 0.46f / (WORD_SRC_X1 - AyuLogo.WORD_SRC_X0)

            val markH = AyuLogo.HEIGHT * markK
            val wordH = AyuLogo.HEIGHT * wordK
            val gap = w * 0.06f

            // Mark and word are centred on the screen as one block.
            val top = (h - (markH + gap + wordH)) / 2f
            val markCy = top + markH / 2f
            val wordCy = top + markH + gap + wordH / 2f

            withTransform({
                translate(w / 2f, markCy)
                scale(markK * pulse, markK * pulse, Offset.Zero)
                translate(-AyuLogo.MARK_CX, -AyuLogo.MARK_CY)
            }) {
                drawMascot()
            }

            withTransform({
                translate(w / 2f, wordCy)
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
