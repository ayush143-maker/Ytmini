
"use strict";

const { piped } = require("./_piped");
const { normalizeResult } = require("./_normalize");

const CONFIG = Object.freeze({
  maxQueryLength: 200,
  maxResults: 100
});

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

    // Normalize, drop invalid entries and remove duplicate video IDs.
    // The first occurrence wins so the provider's ranking is preserved.
    const seenIds = new Set();
    const items = [];

    for (const rawItem of rawItems) {
      const item = normalizeResult(rawItem);

      if (!item || seenIds.has(item.id)) {
        continue;
      }

      seenIds.add(item.id);
      items.push(item);

      if (items.length >= CONFIG.maxResults) {
        break;
      }
    }

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
