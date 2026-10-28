package com.ayutube.kt.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.schabi.newpipe.extractor.Image
import org.schabi.newpipe.extractor.Page
import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.channel.ChannelInfo
import org.schabi.newpipe.extractor.search.SearchInfo
import org.schabi.newpipe.extractor.stream.StreamInfo
import org.schabi.newpipe.extractor.stream.StreamInfoItem

data class VideoItem(
    val id: String,
    val title: String,
    val channel: String,
    val channelId: String,
    val thumbnail: String,
    val durationSec: Long,
    val views: Long,
    val uploaded: String,
    val avatar: String
)

data class VideoPage(val items: List<VideoItem>, val next: Page?)

/** All YouTube data comes from NewPipeExtractor, on the device. */
object ExtractorRepository {
    private val youtube get() = ServiceList.YouTube
    private val watchId = Regex("[?&]v=([A-Za-z0-9_-]{6,20})")
    private val shortsId = Regex("/shorts/([A-Za-z0-9_-]{6,20})")
    private val channelId = Regex("/channel/([A-Za-z0-9_-]{10,40})")

    private fun bestImage(images: List<Image>?): String {
        if (images.isNullOrEmpty()) return ""

        val sorted = images.filter { it.url.isNotEmpty() }
        val fitting = sorted.filter { it.height in 1..720 }.maxByOrNull { it.height }

        return (fitting ?: sorted.lastOrNull())?.url.orEmpty()
    }

    private fun toItem(item: StreamInfoItem): VideoItem? {
        val id = watchId.find(item.url)?.groupValues?.get(1)
            ?: shortsId.find(item.url)?.groupValues?.get(1)
            ?: return null

        return VideoItem(
            id = id,
            title = item.name.orEmpty(),
            channel = item.uploaderName.orEmpty(),
            channelId = channelId.find(item.uploaderUrl.orEmpty())?.groupValues?.get(1).orEmpty(),
            thumbnail = bestImage(item.thumbnails),
            durationSec = item.duration,
            views = item.viewCount,
            uploaded = item.textualUploadDate.orEmpty(),
            avatar = bestImage(item.uploaderAvatars)
        )
    }

    suspend fun search(query: String, page: Page? = null): VideoPage = withContext(Dispatchers.IO) {
        val handler = youtube.searchQHFactory.fromQuery(query, listOf("videos"), "")

        if (page == null) {
            val info = SearchInfo.getInfo(youtube, handler)

            VideoPage(
                info.relatedItems.filterIsInstance<StreamInfoItem>().mapNotNull(::toItem),
                info.nextPage?.takeIf { Page.isValid(it) }
            )
        } else {
            val more = SearchInfo.getMoreItems(youtube, handler, page)

            VideoPage(
                more.items.filterIsInstance<StreamInfoItem>().mapNotNull(::toItem),
                more.nextPage?.takeIf { Page.isValid(it) }
            )
        }
    }

    suspend fun streams(id: String): StreamInfo = withContext(Dispatchers.IO) {
        StreamInfo.getInfo("https://www.youtube.com/watch?v=$id")
    }

    /** Just the channel's picture, for cards that arrive without one. */
    suspend fun channelAvatar(id: String): String = withContext(Dispatchers.IO) {
        bestImage(ChannelInfo.getInfo("https://www.youtube.com/channel/$id").avatars)
    }

    suspend fun suggestions(query: String): List<String> = withContext(Dispatchers.IO) {
        youtube.suggestionExtractor.suggestionList(query).orEmpty()
    }
}
