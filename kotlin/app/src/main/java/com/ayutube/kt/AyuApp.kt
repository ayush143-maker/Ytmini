package com.ayutube.kt

import android.app.Application
import com.ayutube.kt.data.ExtractorDownloader
import org.schabi.newpipe.extractor.NewPipe
import org.schabi.newpipe.extractor.localization.ContentCountry
import org.schabi.newpipe.extractor.localization.Localization

class AyuApp : Application() {
    override fun onCreate() {
        super.onCreate()
        NewPipe.init(ExtractorDownloader, Localization("en", "US"), ContentCountry("US"))
    }
}
