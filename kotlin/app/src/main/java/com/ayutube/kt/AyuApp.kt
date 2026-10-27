package com.ayutube.kt

import android.app.Application
import com.ayutube.kt.data.AppContainer
import com.ayutube.kt.data.AvatarCache
import com.ayutube.kt.data.ExtractorDownloader
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import org.schabi.newpipe.extractor.NewPipe
import org.schabi.newpipe.extractor.localization.ContentCountry
import org.schabi.newpipe.extractor.localization.Localization

class AyuApp : Application() {
    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        AvatarCache.init(this)
        NewPipe.init(ExtractorDownloader, Localization("en", "US"), ContentCountry("US"))
    }

    companion object {
        lateinit var container: AppContainer
            private set

        /** For work that must finish even after a screen is closed (saving progress). */
        val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    }
}
