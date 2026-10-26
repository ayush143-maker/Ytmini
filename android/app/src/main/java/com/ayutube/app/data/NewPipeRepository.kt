package com.ayutube.app.data

import okhttp3.MediaType
import okhttp3.OkHttpClient
import okhttp3.RequestBody
import org.schabi.newpipe.extractor.NewPipe
import org.schabi.newpipe.extractor.Page
import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.downloader.Downloader
import org.schabi.newpipe.extractor.downloader.Request
import org.schabi.newpipe.extractor.downloader.Response
import org.schabi.newpipe.extractor.exceptions.ReCaptchaException
import org.schabi.newpipe.extractor.localization.ContentCountry
import org.schabi.newpipe.extractor.localization.Localization
import org.schabi.newpipe.extractor.search.SearchInfo
import org.schabi.newpipe.extractor.stream.StreamInfo
import org.schabi.newpipe.extractor.stream.StreamInfoItem
import java.io.IOException
import java.util.Collections
import java.util.concurrent.TimeUnit

/** Direct, on-device NewPipeExtractor access. All callers must run this on an IO thread. */
object NewPipeRepository {
    data class SearchPage(val items: List<VideoItem>, val nextPage: Page?)
    data class VideoDetails(
        val item: VideoItem,
        val description: String,
        val uploaderVerified: Boolean,
        val subscriberCount: Long,
        val videoUrl: String?,
        val audioUrl: String?
    )

    private const val USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0"
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .callTimeout(45, TimeUnit.SECONDS)
        .build()
    @Volatile private var initialized = false

    private val downloader = object : Downloader() {
        @Throws(IOException::class, ReCaptchaException::class)
        override fun execute(request: Request): Response {
            val body = request.dataToSend()?.let { RequestBody.create(null as MediaType?, it) }
            val builder = okhttp3.Request.Builder()
                .url(request.url())
                .method(request.httpMethod(), body)
                .header("User-Agent", USER_AGENT)
            request.headers().forEach { (name, values) ->
                builder.removeHeader(name)
                values?.forEach { builder.addHeader(name, it) }
            }
            client.newCall(builder.build()).execute().use { response ->
                if (response.code == 429) throw ReCaptchaException("reCaptcha Challenge requested", request.url())
                return Response(
                    response.code,
                    response.message,
                    response.headers.toMultimap(),
                    response.body?.string(),
                    response.request.url.toString()
                )
            }
        }
    }

    @Synchronized
    private fun initialize() {
        if (initialized) return
        NewPipe.init(downloader, Localization("en", "US"), ContentCountry("US"))
        initialized = true
    }

    fun search(query: String, page: Page? = null): SearchPage {
        require(query.isNotBlank()) { "Enter something to search for." }
        require(query.length <= 200) { "Search must be 200 characters or fewer." }
        initialize()
        val service = ServiceList.YouTube
        val handler = service.searchQHFactory.fromQuery(query.trim(), Collections.singletonList("videos"), "")
        val items: List<org.schabi.newpipe.extractor.InfoItem>
        val next: Page?
        if (page == null) {
            val info = SearchInfo.getInfo(service, handler)
            items = info.relatedItems ?: emptyList()
            next = info.nextPage
        } else {
            val result = SearchInfo.getMoreItems(service, handler, page)
            items = result.items ?: emptyList()
            next = result.nextPage
        }
        return SearchPage(items.filterIsInstance<StreamInfoItem>().mapNotNull(::mapItem), next)
    }

    fun suggestions(query: String): List<String> {
        initialize()
        return ServiceList.YouTube.suggestionExtractor.suggestionList(query).orEmpty().take(8)
    }

    fun details(video: VideoItem): VideoDetails {
        initialize()
        val info = StreamInfo.getInfo("https://www.youtube.com/watch?v=${video.id}")
        val thumb = bestImage(info.thumbnails).ifBlank { video.thumbnailUrl }
        val resolved = video.copy(
            title = info.name ?: video.title,
            url = "https://www.youtube.com/watch?v=${video.id}",
            channelName = info.uploaderName ?: video.channelName,
            channelUrl = info.uploaderUrl ?: video.channelUrl,
            thumbnailUrl = thumb,
            durationSeconds = info.duration.takeIf { it > 0 } ?: video.durationSeconds,
            views = info.viewCount.takeIf { it >= 0 } ?: video.views
        )
        // Prefer a progressive stream that contains both audio and video. Video-only
        // DASH tracks need a muxed audio source and are deliberately not misplayed as full video.
        val videoStream = info.videoStreams.orEmpty().firstOrNull {
            it.isUrl && it.deliveryMethod == org.schabi.newpipe.extractor.stream.DeliveryMethod.PROGRESSIVE_HTTP && !it.isVideoOnly && safeMediaUrl(it.content)
        }
        val audioStream = info.audioStreams.orEmpty().firstOrNull {
            it.isUrl && it.deliveryMethod == org.schabi.newpipe.extractor.stream.DeliveryMethod.PROGRESSIVE_HTTP && safeMediaUrl(it.content)
        }
        return VideoDetails(
            item = resolved,
            description = info.description?.content ?: "",
            uploaderVerified = info.isUploaderVerified,
            subscriberCount = info.uploaderSubscriberCount,
            videoUrl = videoStream?.content,
            audioUrl = audioStream?.content
        )
    }

    private fun safeMediaUrl(value: String?): Boolean = try {
        value != null && value.length <= 2000 && value.startsWith("https://")
    } catch (_: Throwable) { false }

    private fun mapItem(item: StreamInfoItem): VideoItem? {
        val rawUrl = item.url ?: return null
        val id = extractVideoId(rawUrl) ?: return null
        return VideoItem(
            id = id,
            title = (item.name ?: "Untitled video").take(500),
            url = "https://www.youtube.com/watch?v=$id",
            channelName = (item.uploaderName ?: "").take(300),
            channelUrl = item.uploaderUrl ?: "",
            thumbnailUrl = bestImage(item.thumbnails),
            durationSeconds = item.duration.coerceAtLeast(0),
            views = item.viewCount,
            isShort = item.isShortFormContent
        )
    }

    private fun bestImage(images: List<org.schabi.newpipe.extractor.Image>?): String {
        return images.orEmpty().filterNotNull()
            .filter { safeImageUrl(it.url) }
            .maxByOrNull { it.height.coerceAtLeast(0) }
            ?.url.orEmpty()
    }

    private fun safeImageUrl(url: String?): Boolean = url != null && url.startsWith("https://") && url.length <= 2000

    private fun extractVideoId(url: String): String? {
        val patterns = listOf(
            Regex("[?&]v=([A-Za-z0-9_-]{6,20})"),
            Regex("youtu\\.be/([A-Za-z0-9_-]{6,20})"),
            Regex("/(?:shorts|embed)/([A-Za-z0-9_-]{6,20})")
        )
        return patterns.firstNotNullOfOrNull { it.find(url)?.groupValues?.getOrNull(1) }
    }
}
