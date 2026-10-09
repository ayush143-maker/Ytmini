
"use strict";

const { piped } = require("./_piped");

const CONFIG = Object.freeze({
  maxQueryLength: 200,
  maxResults: 100,
  maxTitleLength: 500,
  maxChannelLength: 300,
  maxUrlLength: 2000,
  maxThumbnailLength: 2000,
  videoIdPattern: /^[A-Za-z0-9_-]{6,20}$/
});

function text(value, maxLength, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  const result = value.trim().slice(0, maxLength);

  return result || fallback;
}

function getVideoId(item) {
  if (
    typeof item.id === "string" &&
    CONFIG.videoIdPattern.test(item.id)
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
  if (typeof value !== "string" || value.length > CONFIG.maxThumbnailLength) {
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

function normalizeResult(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return null;
  }

  const id = getVideoId(item);

  // Ignore entries that cannot identify a valid YouTube video.
  if (!id) {
    return null;
  }

  const title = text(
    item.title,
    CONFIG.maxTitleLength,
    "Untitled video"
  );

  const channel = text(
    item.uploaderName || item.channelTitle || item.channel,
    CONFIG.maxChannelLength,
    "Unknown channel"
  );

  const originalUrl = text(
    item.url,
    CONFIG.maxUrlLength,
    `https://www.youtube.com/watch?v=${id}`
  );

  const thumbnail = secureThumbnail(
    item.thumbnail || item.thumbnailUrl
  );

  return {
    id,
    url: originalUrl,
    title,
    uploaderName: channel,
    channel,
    thumbnail,
    thumbnailUrl: thumbnail
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");

    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  const rawQuery = req.query.q;

  if (typeof rawQuery !== "string") {
    return res.status(400).json({
      error: "Enter a search query."
    });
  }

  const query = rawQuery.trim();

  if (!query) {
    return res.status(400).json({
      error: "Enter a search query."
    });
  }

  if (query.length > CONFIG.maxQueryLength) {
    return res.status(400).json({
      error: `Search must be ${CONFIG.maxQueryLength} characters or fewer.`
    });
  }

  try {
    const data = await piped(
      `/search?q=${encodeURIComponent(query)}&filter=videos`
    );

    const rawItems = Array.isArray(data)
      ? data
      : data && Array.isArray(data.items)
        ? data.items
        : null;

    if (!rawItems) {
      throw new Error("Search provider returned an invalid response.");
    }

    const items = rawItems
      .slice(0, CONFIG.maxResults)
      .map(normalizeResult)
      .filter(Boolean);

    // Allow short-lived CDN caching for successful searches.
    // Errors and invalid requests remain non-cacheable.
    res.setHeader(
      "Cache-Control",
      "s-maxage=30, stale-while-revalidate=60"
    );

    return res.status(200).json({ items });
  } catch (error) {
    // Keep provider-specific details in server logs rather than exposing
    // internal upstream errors to public callers.
    console.error(
      "AyuTube search failed:",
      error.details || error.message
    );

    return res.status(502).json({
      error: "Search service unavailable. Please try again."
    });
  }
};
