"use strict";

// GET /api/feed?q=one&q=two ...
// Runs several searches in parallel and returns them as separate groups, so
// the page can build a mixed home feed from a single request. The response is
// cached at the edge, which keeps the third-party providers lightly loaded.

const { piped } = require("./_piped");
const { normalizeResult } = require("./_normalize");

const CONFIG = Object.freeze({
  maxQueries: 6,
  maxQueryLength: 200,
  perGroup: 14
});

function readQueries(raw) {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  const seen = new Set();
  const queries = [];

  for (const value of list) {
    if (typeof value !== "string") continue;

    const query = value.trim();

    if (!query || seen.has(query)) continue;

    seen.add(query);
    queries.push(query);
  }

  return queries;
}

async function loadGroup(query) {
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

  const seen = new Set();
  const items = [];

  for (const rawItem of rawItems) {
    const item = normalizeResult(rawItem);

    if (!item || seen.has(item.id)) continue;

    seen.add(item.id);
    items.push(item);

    if (items.length >= CONFIG.perGroup) break;
  }

  return { query, items };
}

module.exports = async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.setHeader("Cache-Control", "no-store");

    return res.status(405).json({ error: "Method not allowed." });
  }

  const queries = readQueries(req.query.q);

  if (!queries.length) {
    res.setHeader("Cache-Control", "no-store");

    return res.status(400).json({ error: "No topics were requested." });
  }

  if (queries.length > CONFIG.maxQueries) {
    res.setHeader("Cache-Control", "no-store");

    return res.status(400).json({
      error: `Request at most ${CONFIG.maxQueries} topics at a time.`
    });
  }

  if (queries.some((query) => query.length > CONFIG.maxQueryLength)) {
    res.setHeader("Cache-Control", "no-store");

    return res.status(400).json({
      error: `Topics must be ${CONFIG.maxQueryLength} characters or fewer.`
    });
  }

  const settled = await Promise.allSettled(queries.map(loadGroup));

  const groups = [];
  let failed = 0;

  for (const result of settled) {
    if (result.status === "fulfilled" && result.value.items.length) {
      groups.push(result.value);
    } else {
      failed += 1;
    }
  }

  if (!groups.length) {
    res.setHeader("Cache-Control", "no-store");

    return res.status(502).json({
      error: "Videos are unavailable right now."
    });
  }

  // A complete answer can be cached for a while; a partial one only briefly.
  res.setHeader(
    "Cache-Control",
    failed
      ? "public, s-maxage=60, stale-while-revalidate=300"
      : "public, s-maxage=900, stale-while-revalidate=3600"
  );

  return res.status(200).json({ groups, failed });
};
