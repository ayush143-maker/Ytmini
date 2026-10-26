package com.ayutube.kt

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.ayutube.kt.ui.AyuTheme
import com.ayutube.kt.ui.AyuTubeApp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            AyuTheme {
                AyuTubeApp()
            }
        }
    }
}
