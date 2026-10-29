package com.ayutube.kt

import android.app.PictureInPictureParams
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import android.util.Rational
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.ayutube.kt.ui.AppRoot
import com.ayutube.kt.ui.theme.AyuTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            AyuTheme {
                AppRoot()
            }
        }
    }

    /** Leaving the app while a video plays shrinks it into a floating window. */
    override fun onUserLeaveHint() {
        super.onUserLeaveHint()

        val session = AyuApp.container.playback

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && session.video != null && session.playing) {
            enterPictureInPictureMode(
                PictureInPictureParams.Builder().setAspectRatio(Rational(16, 9)).build()
            )
        }
    }

    override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: Configuration) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        AyuApp.container.playback.inPip = isInPictureInPictureMode
    }
}
