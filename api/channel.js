"use strict";

// GET /api/channel?id=UC...[&page=TOKEN][&name=Channel]
// One page of a channel's uploads, in the same video shape as search.

const { piped } = require("./_piped");
const {
  normalizeResult,
  normalizePlaylist,
  secureUrl,
  text,
  wholeNumber
} = require("./_normalize");

const CONFIG = Object.freeze({
  idPattern: /^[A-Za-z0-9_-]{10,40}$/,
  maxPageTokenLength: 4000,
  maxNameLength: 300
});

function single(value) {
  return typeof value === "string" ? value : "";
}

module.exports = async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.setHeader("Cache-Control", "no-store");

    return res.status(405).json({ error: "Method not allowed." });
  }

  const id = single(req.query.id).trim();
  const page = single(req.query.page);
  const nameHint = text(single(req.query.name), CONFIG.maxNameLength);

  if (!CONFIG.idPattern.test(id)) {
    res.setHeader("Cache-Control", "no-store");

    return res.status(400).json({ error: "A valid channel ID is required." });
  }

  if (page.length > CONFIG.maxPageTokenLength) {
    res.setHeader("Cache-Control", "no-store");

    return res.status(400).json({ error: "Invalid page token." });
  }

  // The channel's playlists tab. The first channel response lists its tabs;
  // the tab's own `data` value is then handed to the provider.
  if (single(req.query.tab) === "playlists") {
    try {
      const first = await piped(`/channel/${id}`);
      const tabs = Array.isArray(first.tabs) ? first.tabs : [];
      const tab = tabs.find(
        (entry) =>
          entry &&
          typeof entry.name === "string" &&
          /playlist/i.test(entry.name) &&
          typeof entry.data === "string" &&
          entry.data
      );

      let playlists = [];

      if (tab) {
        const data = await piped(
          `/channels/tabs?data=${encodeURIComponent(tab.data)}`
        );
        const seen = new Set();

        for (const raw of data.content) {
          const item = normalizePlaylist({
            ...raw,
            uploaderName:
              raw?.uploaderName || text(first.name, CONFIG.maxNameLength)
          });

          if (!item || seen.has(item.id)) continue;

          seen.add(item.id);
          playlists.push(item);
        }
      }

      res.setHeader(
        "Cache-Control",
        "public, s-maxage=600, stale-while-revalidate=3600"
      );

      // `source: "none"` tells the page to look for playlists another way.
      return res.status(200).json({
        id,
        playlists,
        source: tab ? "tab" : "none"
      });
    } catch (error) {
      console.error("Channel playlists failed:", error?.details || error?.message || error);

      res.setHeader("Cache-Control", "no-store");

      return res.status(502).json({
        error: "This channel's playlists are unavailable right now."
      });
    }
  }

  try {
    const data = await piped(
      page
        ? `/nextpage/channel/${id}?nextpage=${encodeURIComponent(page)}`
        : `/channel/${id}`
    );

    const name =
      text(data.name, CONFIG.maxNameLength) || nameHint || "Unknown channel";

    const seen = new Set();
    const items = [];

    for (const raw of data.relatedStreams) {
      if (!raw || typeof raw !== "object") continue;

      // Channel listings often omit who uploaded each video; fill it in.
      const item = normalizeResult({
        ...raw,
        uploaderName: raw.uploaderName || name,
        uploaderUrl: raw.uploaderUrl || `/channel/${id}`
      });

      if (!item || seen.has(item.id)) continue;

      seen.add(item.id);
      items.push(item);
    }

    res.setHeader(
      "Cache-Control",
      "public, s-maxage=600, stale-while-revalidate=3600"
    );

    return res.status(200).json({
      id,
      name,
      avatar: secureUrl(data.avatarUrl),
      verified: data.verified === true,
      subscribers: wholeNumber(data.subscriberCount),
      verified: data.verified === true,
      items,
      nextpage:
        typeof data.nextpage === "string" &&
        data.nextpage &&
        data.nextpage.length <= CONFIG.maxPageTokenLength
          ? data.nextpage
          : null
    });
  } catch (error) {
    console.error("Channel lookup failed:", error?.message || error);

    res.setHeader("Cache-Control", "no-store");

    return res.status(502).json({
      error: "This channel is unavailable right now."
    });
  }
};
