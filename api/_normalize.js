"use strict";

// Shared result normalization for /api/search and /api/feed.
// Files starting with "_" are not exposed as Vercel routes.

const LIMITS = Object.freeze({
  maxTitleLength: 500,
  maxChannelLength: 300,
  maxUrlLength: 2000,
  maxThumbnailLength: 2000,
  maxAgeTextLength: 40,
  maxDurationSeconds: 60 * 60 * 24 * 7,
  videoIdPattern: /^[A-Za-z0-9_-]{6,20}$/,
  channelIdPattern: /\/channel\/([A-Za-z0-9_-]{10,40})(?:$|[/?#])/,
  playlistIdPattern: /[?&]list=([A-Za-z0-9_-]{10,64})(?=$|[&#])/,
  maxPlaylistNameLength: 200,
  maxDescriptionLength: 300
});

function text(value, maxLength, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  const result = value.trim().slice(0, maxLength);

  return result || fallback;
}

function wholeNumber(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const number = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(number) || number < min || number > max) {
    return null;
  }

  return Math.floor(number);
}

function getVideoId(item) {
  if (
    typeof item.id === "string" &&
    LIMITS.videoIdPattern.test(item.id)
  ) {
    return item.id;
  }

  const url = typeof item.url === "string" ? item.url : "";

  const match = url.match(
    /(?:[?&]v=|youtu\.be\/|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{6,20})(?=$|[&#/?])/i
  );

  return match?.[1] || "";
}

function secureThumbnail(value) {
  if (typeof value !== "string" || value.length > LIMITS.maxThumbnailLength) {
    return "";
  }

  try {
    const url = new URL(value);

    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return "";
    }

    return url.href;
  } catch {
    return "";
  }
}

function getChannelId(item) {
  const fromUrl =
    typeof item.uploaderUrl === "string"
      ? item.uploaderUrl.match(LIMITS.channelIdPattern)
      : null;

  return fromUrl?.[1] || "";
}

function getUploadedAt(item) {
  const value = wholeNumber(item.uploaded, { min: 1 });

  // Providers report milliseconds; reject anything in the far future.
  return value !== null && value <= Date.now() + 86400000 ? value : null;
}

/**
 * Returns the public shape of one video, or null when the entry cannot be
 * identified as a video. Original fields are unchanged; the extra fields
 * (duration, views, uploaded, channelId, short) are additive and optional.
 */
function normalizeResult(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return null;
  }

  const id = getVideoId(item);

  // Ignore entries that cannot identify a valid YouTube video.
  if (!id) {
    return null;
  }

  const title = text(item.title, LIMITS.maxTitleLength, "Untitled video");

  const channel = text(
    item.uploaderName || item.channelTitle || item.channel,
    LIMITS.maxChannelLength,
    "Unknown channel"
  );

  const originalUrl = text(
    item.url,
    LIMITS.maxUrlLength,
    `https://www.youtube.com/watch?v=${id}`
  );

  const thumbnail = secureThumbnail(item.thumbnail || item.thumbnailUrl);

  return {
    id,
    url: originalUrl,
    title,
    uploaderName: channel,
    channel,
    thumbnail,
    thumbnailUrl: thumbnail,

    // Seconds. 0 means unknown or a live stream.
    duration:
      wholeNumber(item.duration, {
        min: 1,
        max: LIMITS.maxDurationSeconds
      }) ?? 0,

    // null means the provider did not report a view count.
    views: wholeNumber(item.views),

    // Human text such as "3 years ago", straight from the provider.
    uploaded: text(item.uploadedDate, LIMITS.maxAgeTextLength),

    channelId: getChannelId(item),
    short: item.isShort === true,

    // Upload time in milliseconds since 1970, or null when unknown.
    uploadedAt: getUploadedAt(item)
  };
}

/** Playlist id from a provider item such as { url: "/playlist?list=PL..." }. */
function getPlaylistId(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return "";

  const url = typeof item.url === "string" ? item.url : "";
  const match = url.match(LIMITS.playlistIdPattern);

  return match?.[1] || "";
}

/** Channel id from a provider item such as { url: "/channel/UC..." }. */
function getChannelRef(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return "";

  const url = typeof item.url === "string" ? item.url : "";
  const match = url.match(LIMITS.channelIdPattern);

  return match?.[1] || "";
}

/** Public shape of one playlist search result, or null. */
function normalizePlaylist(item) {
  const id = getPlaylistId(item);

  if (!id) return null;

  return {
    id,
    name: text(
      item.name || item.title,
      LIMITS.maxPlaylistNameLength,
      "Untitled playlist"
    ),
    thumbnail: secureThumbnail(item.thumbnail || item.thumbnailUrl),
    uploaderName: text(
      item.uploaderName || item.uploader,
      LIMITS.maxChannelLength
    ),
    channelId: getChannelId(item),
    // null when the provider does not know (it may report -1).
    count: wholeNumber(item.videos ?? item.videoCount)
  };
}

/** Public shape of one channel search result, or null. */
function normalizeChannel(item) {
  const id = getChannelRef(item);

  if (!id) return null;

  return {
    id,
    name: text(item.name, LIMITS.maxChannelLength, "Unknown channel"),
    thumbnail: secureThumbnail(item.thumbnail || item.avatarUrl),
    description: text(item.description, LIMITS.maxDescriptionLength),
    subscribers: wholeNumber(item.subscribers),
    videos: wholeNumber(item.videos),
    verified: item.verified === true
  };
}

module.exports = {
  getPlaylistId,
  getChannelRef,
  normalizePlaylist,
  normalizeChannel,
  normalizeResult, secureUrl: secureThumbnail, text, wholeNumber, LIMITS };
