package com.ayutube.kt

import android.os.Bundle
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
}
