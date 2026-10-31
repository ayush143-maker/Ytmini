package com.ayutube.kt.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import com.ayutube.kt.ui.components.AyuLogo
import com.ayutube.kt.ui.components.drawLogoLetter
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private const val LETTERS = 7

/**
 * Opening animation: the mark shows alone in the middle, then slides left while
 * "ayutube" is typed out beside it, then the screen fades into the app.
 */
@Composable
fun SplashOverlay(onDone: () -> Unit) {
    val appear = remember { Animatable(0f) }
    val slide = remember { Animatable(0f) }
    val typed = remember { Animatable(0f) }
    val fade = remember { Animatable(1f) }

    LaunchedEffect(Unit) {
        appear.animateTo(1f, tween(380, easing = FastOutSlowInEasing))
        delay(320)

        coroutineScope {
            launch { slide.animateTo(1f, tween(950, easing = FastOutSlowInEasing)) }
            launch {
                delay(260)
                typed.animateTo(LETTERS.toFloat(), tween(780, easing = LinearEasing))
            }
        }

        delay(520)
        fade.animateTo(0f, tween(320))
        onDone()
    }

    Box(
        Modifier.fillMaxSize()
            .graphicsLayer { alpha = fade.value }
            .background(AyuLogo.Background)
            .pointerInput(Unit) { detectTapGestures { } }
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val s = slide.value
            val markWidth = AyuLogo.MARK_X1 - AyuLogo.MARK_X0
            val startScale = size.width * 0.22f / markWidth
            val endScale = size.width * 0.55f / AyuLogo.WIDTH
            val k = (startScale + (endScale - startScale) * s) * (0.75f + 0.25f * appear.value)

            // The point of the logo in the middle of the screen: the mark first, the whole lockup at the end.
            val lockCx = (AyuLogo.X0 + AyuLogo.X1) / 2f
            val lockCy = (AyuLogo.Y0 + AyuLogo.Y1) / 2f
            val cx = AyuLogo.MARK_CX + (lockCx - AyuLogo.MARK_CX) * s
            val cy = AyuLogo.MARK_CY + (lockCy - AyuLogo.MARK_CY) * s

            withTransform({
                translate(size.width / 2f, size.height / 2f)
                scale(k, k, Offset.Zero)
                translate(-cx, -cy)
            }) {
                drawPath(AyuLogo.mark, AyuLogo.MarkColor, alpha = appear.value)

                for (i in 0 until LETTERS) drawLogoLetter(i, typed.value - i)
            }
        }
    }
}
