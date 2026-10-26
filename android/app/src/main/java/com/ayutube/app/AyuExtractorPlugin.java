/*
 * AyuTube - Capacitor plugin that talks to YouTube through NewPipeExtractor,
 * on the device, with no server in between (the same approach LibreTube uses).
 *
 * Copyright (C) AyuTube contributors
 * Licensed under the GNU General Public License v3.0 (see LICENSE).
 */
package com.ayutube.app;

import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.schabi.newpipe.extractor.Image;
import org.schabi.newpipe.extractor.InfoItem;
import org.schabi.newpipe.extractor.ListExtractor;
import org.schabi.newpipe.extractor.NewPipe;
import org.schabi.newpipe.extractor.Page;
import org.schabi.newpipe.extractor.ServiceList;
import org.schabi.newpipe.extractor.StreamingService;
import org.schabi.newpipe.extractor.channel.ChannelInfo;
import org.schabi.newpipe.extractor.channel.ChannelInfoItem;
import org.schabi.newpipe.extractor.channel.tabs.ChannelTabExtractor;
import org.schabi.newpipe.extractor.channel.tabs.ChannelTabInfo;
import org.schabi.newpipe.extractor.channel.tabs.ChannelTabs;
import org.schabi.newpipe.extractor.linkhandler.ListLinkHandler;
import org.schabi.newpipe.extractor.linkhandler.SearchQueryHandler;
import org.schabi.newpipe.extractor.localization.ContentCountry;
import org.schabi.newpipe.extractor.localization.DateWrapper;
import org.schabi.newpipe.extractor.localization.Localization;
import org.schabi.newpipe.extractor.playlist.PlaylistInfo;
import org.schabi.newpipe.extractor.playlist.PlaylistInfoItem;
import org.schabi.newpipe.extractor.search.SearchInfo;
import org.schabi.newpipe.extractor.stream.AudioStream;
import org.schabi.newpipe.extractor.stream.DeliveryMethod;
import org.schabi.newpipe.extractor.stream.Stream;
import org.schabi.newpipe.extractor.stream.StreamInfo;
import org.schabi.newpipe.extractor.stream.StreamInfoItem;
import org.schabi.newpipe.extractor.stream.StreamSegment;
import org.schabi.newpipe.extractor.stream.StreamType;
import org.schabi.newpipe.extractor.stream.SubtitlesStream;
import org.schabi.newpipe.extractor.stream.VideoStream;

import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "AyuExtractor")
public class AyuExtractorPlugin extends Plugin {
    private interface Job {
        JSObject run() throws Exception;
    }

    private final ExecutorService executor = Executors.newCachedThreadPool();
    private boolean initialised = false;

    private synchronized void ensureInit() {
        if (!initialised) {
            NewPipe.init(
                    ExtractorDownloader.get(),
                    new Localization("en", "US"),
                    new ContentCountry("US"));
            initialised = true;
        }
    }

    private void run(final PluginCall call, final Job job) {
        executor.execute(() -> {
            try {
                ensureInit();
                call.resolve(job.run());
            } catch (final Throwable error) {
                final String message = error.getMessage();
                call.reject(message != null && !message.isEmpty()
                        ? message
                        : error.getClass().getSimpleName());
            }
        });
    }

    // ------------------------------------------------------------------ JSON helpers

    private static String path(final String url) {
        return url == null ? "" : url.replaceFirst("^https?://[^/]+", "");
    }

    private static String bestImage(final List<Image> images) {
        if (images == null || images.isEmpty()) {
            return "";
        }

        Image best = null;

        for (final Image image : images) {
            if (image == null || image.getUrl() == null) {
                continue;
            }

            final int height = image.getHeight();

            if (best == null) {
                best = image;
            } else if (height > 0 && height <= 720 && height >= best.getHeight()) {
                best = image;
            }
        }

        return best == null ? "" : best.getUrl();
    }

    private static long uploadedMillis(final DateWrapper date) {
        try {
            return date == null ? -1 : date.offsetDateTime().toInstant().toEpochMilli();
        } catch (final Throwable ignored) {
            return -1;
        }
    }

    private static JSObject streamItem(final StreamInfoItem item) {
        final JSObject out = new JSObject();

        out.put("url", path(item.getUrl()));
        out.put("title", item.getName());
        out.put("thumbnail", bestImage(item.getThumbnails()));
        out.put("uploaderName", item.getUploaderName());
        out.put("uploaderUrl", path(item.getUploaderUrl()));
        out.put("uploaderAvatar", bestImage(item.getUploaderAvatars()));
        out.put("uploadedDate", item.getTextualUploadDate());
        out.put("duration", item.getDuration());
        out.put("views", item.getViewCount());
        out.put("isShort", item.isShortFormContent());

        final long uploaded = uploadedMillis(item.getUploadDate());

        if (uploaded > 0) {
            out.put("uploaded", uploaded);
        }

        return out;
    }

    private static JSObject channelItem(final ChannelInfoItem item) {
        final JSObject out = new JSObject();

        out.put("url", path(item.getUrl()));
        out.put("name", item.getName());
        out.put("thumbnail", bestImage(item.getThumbnails()));
        out.put("description", item.getDescription());
        out.put("subscribers", item.getSubscriberCount());
        out.put("videos", item.getStreamCount());
        out.put("verified", item.isVerified());

        return out;
    }

    private static JSObject playlistItem(final PlaylistInfoItem item) {
        final JSObject out = new JSObject();

        out.put("url", path(item.getUrl()));
        out.put("name", item.getName());
        out.put("thumbnail", bestImage(item.getThumbnails()));
        out.put("uploaderName", item.getUploaderName());
        out.put("uploaderUrl", path(item.getUploaderUrl()));
        out.put("videos", item.getStreamCount());

        return out;
    }

    private static JSArray items(final List<? extends InfoItem> list) {
        final JSArray out = new JSArray();

        if (list == null) {
            return out;
        }

        for (final InfoItem item : list) {
            if (item instanceof StreamInfoItem) {
                out.put(streamItem((StreamInfoItem) item));
            } else if (item instanceof ChannelInfoItem) {
                out.put(channelItem((ChannelInfoItem) item));
            } else if (item instanceof PlaylistInfoItem) {
                out.put(playlistItem((PlaylistInfoItem) item));
            }
        }

        return out;
    }

    private static String pageToken(final Page page) throws JSONException {
        if (page == null || !Page.isValid(page)) {
            return null;
        }

        final JSONObject json = new JSONObject();

        json.put("url", page.getUrl());
        json.put("id", page.getId());

        if (page.getIds() != null) {
            json.put("ids", new JSONArray(page.getIds()));
        }

        if (page.getCookies() != null) {
            json.put("cookies", new JSONObject(page.getCookies()));
        }

        if (page.getBody() != null) {
            json.put("body", Base64.encodeToString(page.getBody(), Base64.NO_WRAP));
        }

        return Base64.encodeToString(
                json.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8),
                Base64.NO_WRAP | Base64.URL_SAFE);
    }

    private static Page tokenPage(final String token) throws JSONException {
        final String text = new String(
                Base64.decode(token, Base64.NO_WRAP | Base64.URL_SAFE),
                java.nio.charset.StandardCharsets.UTF_8);
        final JSONObject json = new JSONObject(text);

        final String url = json.has("url") ? json.getString("url") : null;
        final String id = json.has("id") ? json.getString("id") : null;

        List<String> ids = null;

        if (json.has("ids")) {
            final JSONArray array = json.getJSONArray("ids");
            ids = new java.util.ArrayList<>();

            for (int i = 0; i < array.length(); i += 1) {
                ids.add(array.getString(i));
            }
        }

        Map<String, String> cookies = null;

        if (json.has("cookies")) {
            final JSONObject object = json.getJSONObject("cookies");
            cookies = new java.util.HashMap<>();

            final java.util.Iterator<String> keys = object.keys();

            while (keys.hasNext()) {
                final String key = keys.next();
                cookies.put(key, object.getString(key));
            }
        }

        final byte[] body = json.has("body")
                ? Base64.decode(json.getString("body"), Base64.NO_WRAP)
                : null;

        return new Page(url, id, ids, cookies, body);
    }

    private static boolean has(final String value) {
        return value != null && !value.isEmpty();
    }

    // ------------------------------------------------------------------ search

    @PluginMethod
    public void search(final PluginCall call) {
        final String query = call.getString("q", "");
        final String filter = call.getString("filter", "videos");
        final String page = call.getString("page");

        run(call, () -> {
            final StreamingService youtube = ServiceList.YouTube;
            final SearchQueryHandler handler = youtube.getSearchQHFactory()
                    .fromQuery(query, Collections.singletonList(filter), "");

            final List<? extends InfoItem> found;
            final Page next;

            if (has(page)) {
                final ListExtractor.InfoItemsPage<InfoItem> result =
                        SearchInfo.getMoreItems(youtube, handler, tokenPage(page));
                found = result.getItems();
                next = result.getNextPage();
            } else {
                final SearchInfo info = SearchInfo.getInfo(youtube, handler);
                found = info.getRelatedItems();
                next = info.getNextPage();
            }

            final JSObject out = new JSObject();

            out.put("items", items(found));
            out.put("nextpage", pageToken(next));

            return out;
        });
    }

    @PluginMethod
    public void suggestions(final PluginCall call) {
        final String query = call.getString("q", "");

        run(call, () -> {
            final List<String> list =
                    ServiceList.YouTube.getSuggestionExtractor().suggestionList(query);
            final JSArray array = new JSArray();

            if (list != null) {
                for (final String value : list) {
                    array.put(value);
                }
            }

            final JSObject out = new JSObject();
            out.put("suggestions", array);

            return out;
        });
    }

    // ------------------------------------------------------------------ streams

    private static JSObject videoStream(final VideoStream stream, final boolean videoOnly) {
        final JSObject out = new JSObject();

        out.put("url", stream.getContent());
        out.put("mimeType", stream.getFormat() != null ? stream.getFormat().getMimeType() : "");
        out.put("quality", stream.getResolution());
        out.put("width", stream.getWidth());
        out.put("height", stream.getHeight());
        out.put("fps", stream.getFps());
        out.put("bitrate", stream.getBitrate());
        out.put("codec", stream.getCodec());
        out.put("itag", stream.getItag());
        out.put("videoOnly", videoOnly);

        return out;
    }

    private static JSObject audioStream(final AudioStream stream) {
        final JSObject out = new JSObject();
        final Locale locale = stream.getAudioLocale();

        out.put("url", stream.getContent());
        out.put("mimeType", stream.getFormat() != null ? stream.getFormat().getMimeType() : "");
        out.put("bitrate", stream.getAverageBitrate());
        out.put("codec", stream.getCodec());
        out.put("itag", stream.getItag());
        out.put("quality", stream.getQuality());
        out.put("trackId", stream.getAudioTrackId());
        out.put("trackName", stream.getAudioTrackName());
        out.put("locale", locale != null ? locale.toLanguageTag() : "");

        return out;
    }

    private static boolean progressive(final Stream stream) {
        return stream != null
                && stream.isUrl()
                && stream.getDeliveryMethod() == DeliveryMethod.PROGRESSIVE_HTTP;
    }

    @PluginMethod
    public void streams(final PluginCall call) {
        final String id = call.getString("id", "");

        run(call, () -> {
            final StreamInfo info = StreamInfo.getInfo("https://www.youtube.com/watch?v=" + id);
            final JSObject out = new JSObject();

            out.put("title", info.getName());
            out.put("uploader", info.getUploaderName());
            out.put("uploaderUrl", path(info.getUploaderUrl()));
            out.put("uploaderAvatar", bestImage(info.getUploaderAvatars()));
            out.put("uploaderVerified", info.isUploaderVerified());
            out.put("subscriberCount", info.getUploaderSubscriberCount());
            out.put("description",
                    info.getDescription() != null ? info.getDescription().getContent() : "");
            out.put("thumbnailUrl", bestImage(info.getThumbnails()));
            out.put("duration", info.getDuration());
            out.put("views", info.getViewCount());
            out.put("likes", info.getLikeCount());
            out.put("uploadDate", info.getTextualUploadDate());

            final StreamType type = info.getStreamType();

            out.put("livestream",
                    type == StreamType.LIVE_STREAM || type == StreamType.AUDIO_LIVE_STREAM);
            out.put("hls", info.getHlsUrl());
            out.put("dash", info.getDashMpdUrl());

            final JSArray video = new JSArray();

            if (info.getVideoStreams() != null) {
                for (final VideoStream stream : info.getVideoStreams()) {
                    if (progressive(stream)) {
                        video.put(videoStream(stream, false));
                    }
                }
            }

            if (info.getVideoOnlyStreams() != null) {
                for (final VideoStream stream : info.getVideoOnlyStreams()) {
                    if (progressive(stream)) {
                        video.put(videoStream(stream, true));
                    }
                }
            }

            final JSArray audio = new JSArray();

            if (info.getAudioStreams() != null) {
                for (final AudioStream stream : info.getAudioStreams()) {
                    if (progressive(stream)) {
                        audio.put(audioStream(stream));
                    }
                }
            }

            final JSArray subtitles = new JSArray();

            if (info.getSubtitles() != null) {
                for (final SubtitlesStream stream : info.getSubtitles()) {
                    if (stream == null || !stream.isUrl()) {
                        continue;
                    }

                    final JSObject subtitle = new JSObject();

                    subtitle.put("url", stream.getContent());
                    subtitle.put("mimeType",
                            stream.getFormat() != null ? stream.getFormat().getMimeType() : "");
                    subtitle.put("code", stream.getLanguageTag());
                    subtitle.put("name", stream.getDisplayLanguageName());
                    subtitle.put("autoGenerated", stream.isAutoGenerated());
                    subtitles.put(subtitle);
                }
            }

            final JSArray chapters = new JSArray();

            if (info.getStreamSegments() != null) {
                for (final StreamSegment segment : info.getStreamSegments()) {
                    final JSObject chapter = new JSObject();

                    chapter.put("title", segment.getTitle());
                    chapter.put("start", segment.getStartTimeSeconds());
                    chapters.put(chapter);
                }
            }

            final JSArray related = new JSArray();

            if (info.getRelatedItems() != null) {
                for (final InfoItem item : info.getRelatedItems()) {
                    if (item instanceof StreamInfoItem) {
                        related.put(streamItem((StreamInfoItem) item));
                    }
                }
            }

            out.put("videoStreams", video);
            out.put("audioStreams", audio);
            out.put("subtitles", subtitles);
            out.put("chapters", chapters);
            out.put("relatedStreams", related);

            return out;
        });
    }

    // ------------------------------------------------------------------ channel

    private static ListLinkHandler findTab(final ChannelInfo info, final String filter) {
        if (info.getTabs() == null) {
            return null;
        }

        for (final ListLinkHandler tab : info.getTabs()) {
            if (tab.getContentFilters() != null && tab.getContentFilters().contains(filter)) {
                return tab;
            }
        }

        return null;
    }

    @PluginMethod
    public void channel(final PluginCall call) {
        final String id = call.getString("id", "");
        final String page = call.getString("page");

        run(call, () -> {
            final StreamingService youtube = ServiceList.YouTube;
            final JSObject out = new JSObject();

            if (has(page)) {
                final ChannelTabExtractor extractor =
                        youtube.getChannelTabExtractorFromId(id, ChannelTabs.VIDEOS);
                final ListExtractor.InfoItemsPage<InfoItem> result =
                        extractor.getPage(tokenPage(page));

                out.put("relatedStreams", items(result.getItems()));
                out.put("nextpage", pageToken(result.getNextPage()));

                return out;
            }

            final ChannelInfo info = ChannelInfo.getInfo("https://www.youtube.com/channel/" + id);

            out.put("name", info.getName());
            out.put("avatarUrl", bestImage(info.getAvatars()));
            out.put("verified", info.isVerified());
            out.put("subscriberCount", info.getSubscriberCount());
            out.put("banner", bestImage(info.getBanners()));
            out.put("description", info.getDescription());

            final ListLinkHandler tab = findTab(info, ChannelTabs.VIDEOS);

            if (tab != null) {
                final ChannelTabInfo videos = ChannelTabInfo.getInfo(youtube, tab);

                out.put("relatedStreams", items(videos.getRelatedItems()));
                out.put("nextpage", pageToken(videos.getNextPage()));
            } else {
                out.put("relatedStreams", new JSArray());
                out.put("nextpage", (String) null);
            }

            return out;
        });
    }

    /** Just the channel's picture and name (used for cards that lack one). */
    @PluginMethod
    public void channelAvatar(final PluginCall call) {
        final String id = call.getString("id", "");

        run(call, () -> {
            final ChannelInfo info = ChannelInfo.getInfo("https://www.youtube.com/channel/" + id);
            final JSObject out = new JSObject();

            out.put("avatarUrl", bestImage(info.getAvatars()));
            out.put("name", info.getName());

            return out;
        });
    }

    @PluginMethod
    public void channelPlaylists(final PluginCall call) {
        final String id = call.getString("id", "");

        run(call, () -> {
            final ChannelInfo info = ChannelInfo.getInfo("https://www.youtube.com/channel/" + id);
            final ListLinkHandler tab = findTab(info, ChannelTabs.PLAYLISTS);
            final JSObject out = new JSObject();

            out.put("name", info.getName());

            if (tab == null) {
                out.put("playlists", new JSArray());
                out.put("hasTab", false);
            } else {
                final ChannelTabInfo playlists = ChannelTabInfo.getInfo(ServiceList.YouTube, tab);

                out.put("playlists", items(playlists.getRelatedItems()));
                out.put("hasTab", true);
            }

            return out;
        });
    }

    // ------------------------------------------------------------------ playlist

    @PluginMethod
    public void playlist(final PluginCall call) {
        final String id = call.getString("id", "");
        final String page = call.getString("page");

        run(call, () -> {
            final StreamingService youtube = ServiceList.YouTube;
            final String url = "https://www.youtube.com/playlist?list=" + id;
            final JSObject out = new JSObject();

            if (has(page)) {
                final ListExtractor.InfoItemsPage<StreamInfoItem> result =
                        PlaylistInfo.getMoreItems(youtube, url, tokenPage(page));

                out.put("relatedStreams", items(result.getItems()));
                out.put("nextpage", pageToken(result.getNextPage()));

                return out;
            }

            final PlaylistInfo info = PlaylistInfo.getInfo(youtube, url);

            out.put("name", info.getName());
            out.put("uploader", info.getUploaderName());
            out.put("uploaderUrl", path(info.getUploaderUrl()));
            out.put("thumbnailUrl", bestImage(info.getThumbnails()));
            out.put("videos", info.getStreamCount());
            out.put("relatedStreams", items(info.getRelatedItems()));
            out.put("nextpage", pageToken(info.getNextPage()));

            return out;
        });
    }
}
