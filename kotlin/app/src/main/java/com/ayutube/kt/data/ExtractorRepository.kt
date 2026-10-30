package com.ayutube.kt.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.schabi.newpipe.extractor.Image
import org.schabi.newpipe.extractor.Page
import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.InfoItem
import org.schabi.newpipe.extractor.channel.ChannelInfo
import org.schabi.newpipe.extractor.channel.ChannelInfoItem
import org.schabi.newpipe.extractor.channel.tabs.ChannelTabInfo
import org.schabi.newpipe.extractor.channel.tabs.ChannelTabs
import org.schabi.newpipe.extractor.linkhandler.ListLinkHandler
import org.schabi.newpipe.extractor.playlist.PlaylistInfo
import org.schabi.newpipe.extractor.playlist.PlaylistInfoItem
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

data class ChannelSummary(
    val id: String,
    val name: String,
    val avatar: String,
    val subscribers: Long,
    val description: String
)

data class ChannelDetail(
    val id: String,
    val name: String,
    val avatar: String,
    val banner: String,
    val subscribers: Long,
    val description: String,
    val verified: Boolean,
    val videos: VideoPage
)

data class PlaylistSummary(
    val id: String,
    val name: String,
    val thumbnail: String,
    val count: Long,
    val uploader: String
)

data class PlaylistDetail(
    val id: String,
    val name: String,
    val uploader: String,
    val count: Long,
    val videos: VideoPage
)

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

    private val playlistId = Regex("[?&]list=([A-Za-z0-9_-]{10,64})")

    private fun tab(info: ChannelInfo, filter: String): ListLinkHandler? =
        info.tabs.firstOrNull { it.contentFilters?.contains(filter) == true }

    private fun videosOf(items: List<InfoItem>?): List<VideoItem> =
        items.orEmpty().filterIsInstance<StreamInfoItem>().mapNotNull(::toItem)

    suspend fun channel(id: String): ChannelDetail = withContext(Dispatchers.IO) {
        val info = ChannelInfo.getInfo("https://www.youtube.com/channel/$id")
        val videosTab = tab(info, ChannelTabs.VIDEOS)
        val first = videosTab?.let { ChannelTabInfo.getInfo(youtube, it) }

        ChannelDetail(
            id = id,
            name = info.name.orEmpty(),
            avatar = bestImage(info.avatars),
            banner = bestImage(info.banners),
            subscribers = info.subscriberCount,
            description = info.description.orEmpty(),
            verified = info.isVerified,
            videos = VideoPage(
                videosOf(first?.relatedItems).map { v ->
                    if (v.channel.isEmpty()) v.copy(channel = info.name.orEmpty(), channelId = id) else v
                },
                first?.nextPage?.takeIf { Page.isValid(it) }
            )
        )
    }

    suspend fun channelMore(id: String, page: Page, channelName: String): VideoPage = withContext(Dispatchers.IO) {
        val extractor = youtube.getChannelTabExtractorFromId(id, ChannelTabs.VIDEOS)
        val more = extractor.getPage(page)

        VideoPage(
            videosOf(more.items).map { v ->
                if (v.channel.isEmpty()) v.copy(channel = channelName, channelId = id) else v
            },
            more.nextPage?.takeIf { Page.isValid(it) }
        )
    }

    suspend fun channelPlaylists(id: String): List<PlaylistSummary> = withContext(Dispatchers.IO) {
        val info = ChannelInfo.getInfo("https://www.youtube.com/channel/$id")
        val playlists = tab(info, ChannelTabs.PLAYLISTS) ?: return@withContext emptyList()

        ChannelTabInfo.getInfo(youtube, playlists).relatedItems
            .filterIsInstance<PlaylistInfoItem>()
            .mapNotNull { item ->
                val listId = playlistId.find(item.url)?.groupValues?.get(1) ?: return@mapNotNull null

                PlaylistSummary(listId, item.name.orEmpty(), bestImage(item.thumbnails), item.streamCount, item.uploaderName.orEmpty())
            }
    }

    suspend fun playlist(id: String): PlaylistDetail = withContext(Dispatchers.IO) {
        val info = PlaylistInfo.getInfo(youtube, "https://www.youtube.com/playlist?list=$id")

        PlaylistDetail(
            id = id,
            name = info.name.orEmpty(),
            uploader = info.uploaderName.orEmpty(),
            count = info.streamCount,
            videos = VideoPage(
                videosOf(info.relatedItems),
                info.nextPage?.takeIf { Page.isValid(it) }
            )
        )
    }

    suspend fun playlistMore(id: String, page: Page): VideoPage = withContext(Dispatchers.IO) {
        val more = PlaylistInfo.getMoreItems(youtube, "https://www.youtube.com/playlist?list=$id", page)

        VideoPage(videosOf(more.items), more.nextPage?.takeIf { Page.isValid(it) })
    }

    /** YouTube's own "related" list for a video. */
    fun related(info: StreamInfo): List<VideoItem> = videosOf(info.relatedItems)

    /** Finds a channel's picture by its name (older saved videos have no channel id). */
    suspend fun channelAvatarByName(name: String): String = withContext(Dispatchers.IO) {
        val handler = youtube.searchQHFactory.fromQuery(name, listOf("channels"), "")
        val found = SearchInfo.getInfo(youtube, handler).relatedItems.filterIsInstance<ChannelInfoItem>()
        val match = found.firstOrNull { it.name.equals(name, ignoreCase = true) } ?: found.firstOrNull()

        bestImage(match?.thumbnails)
    }

    suspend fun searchChannels(query: String): List<ChannelSummary> = withContext(Dispatchers.IO) {
        val handler = youtube.searchQHFactory.fromQuery(query, listOf("channels"), "")

        SearchInfo.getInfo(youtube, handler).relatedItems.filterIsInstance<ChannelInfoItem>().mapNotNull { item ->
            val id = channelId.find(item.url)?.groupValues?.get(1) ?: return@mapNotNull null

            ChannelSummary(id, item.name.orEmpty(), bestImage(item.thumbnails), item.subscriberCount, item.description.orEmpty())
        }
    }

    suspend fun searchPlaylists(query: String): List<PlaylistSummary> = withContext(Dispatchers.IO) {
        val handler = youtube.searchQHFactory.fromQuery(query, listOf("playlists"), "")

        SearchInfo.getInfo(youtube, handler).relatedItems.filterIsInstance<PlaylistInfoItem>().mapNotNull { item ->
            val id = playlistId.find(item.url)?.groupValues?.get(1) ?: return@mapNotNull null

            PlaylistSummary(id, item.name.orEmpty(), bestImage(item.thumbnails), item.streamCount, item.uploaderName.orEmpty())
        }
    }
}
