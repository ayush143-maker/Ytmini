"use strict";

// GET /api/search?q=...[&type=video|playlist|channel][&page=TOKEN]
// Returns { items, nextpage }. `type` defaults to video. `page` is the opaque
// token a previous response gave as `nextpage`.

const { piped } = require("./_piped");
const {
  normalizeResult,
  normalizePlaylist,
  normalizeChannel
} = require("./_normalize");

const CONFIG = Object.freeze({
  maxQueryLength: 200,
  maxResults: 100,
  maxPageTokenLength: 4000
});

const TYPES = Object.freeze({
  video: { filter: "videos", normalize: normalizeResult, key: "id" },
  playlist: { filter: "playlists", normalize: normalizePlaylist, key: "id" },
  channel: { filter: "channels", normalize: normalizeChannel, key: "id" }
});

function single(value) {
  return typeof value === "string" ? value : "";
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

  const typeName = single(req.query.type) || "video";
  const type = Object.hasOwn(TYPES, typeName) ? TYPES[typeName] : null;

  if (!type) {
    return res.status(400).json({ error: "Unknown result type." });
  }

  const page = single(req.query.page);

  if (page.length > CONFIG.maxPageTokenLength) {
    return res.status(400).json({ error: "Invalid page token." });
  }

  try {
    const path = page
      ? `/nextpage/search?nextpage=${encodeURIComponent(page)}` +
        `&q=${encodeURIComponent(query)}&filter=${type.filter}`
      : `/search?q=${encodeURIComponent(query)}&filter=${type.filter}`;

    const data = await piped(path);

    const rawItems = Array.isArray(data)
      ? data
      : data && Array.isArray(data.items)
        ? data.items
        : null;

    if (!rawItems) {
      throw new Error("Search provider returned an invalid response.");
    }

    // Normalize, drop invalid entries and remove duplicate ids.
    // The first occurrence wins so the provider's ranking is preserved.
    const seenIds = new Set();
    const items = [];

    for (const rawItem of rawItems) {
      const item = type.normalize(rawItem);

      if (!item || seenIds.has(item[type.key])) {
        continue;
      }

      seenIds.add(item[type.key]);
      items.push(item);

      if (items.length >= CONFIG.maxResults) {
        break;
      }
    }

    const nextpage =
      !Array.isArray(data) &&
      typeof data?.nextpage === "string" &&
      data.nextpage &&
      data.nextpage.length <= CONFIG.maxPageTokenLength
        ? data.nextpage
        : null;

    // Allow short-lived CDN caching for successful searches.
    // Errors and invalid requests remain non-cacheable.
    res.setHeader(
      "Cache-Control",
      "s-maxage=30, stale-while-revalidate=60"
    );

    return res.status(200).json({ items, nextpage });
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
