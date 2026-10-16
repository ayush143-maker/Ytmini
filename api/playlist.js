"use strict";

// GET /api/playlist?id=PL...[&page=TOKEN]
// One page of a YouTube playlist, in the same video shape as search.

const { piped } = require("./_piped");
const {
  normalizeResult,
  secureUrl,
  text,
  wholeNumber,
  LIMITS
} = require("./_normalize");

const CONFIG = Object.freeze({
  idPattern: /^[A-Za-z0-9_-]{10,64}$/,
  maxPageTokenLength: 4000,
  maxNameLength: 200
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

  if (!CONFIG.idPattern.test(id)) {
    res.setHeader("Cache-Control", "no-store");

    return res.status(400).json({ error: "A valid playlist ID is required." });
  }

  if (page.length > CONFIG.maxPageTokenLength) {
    res.setHeader("Cache-Control", "no-store");

    return res.status(400).json({ error: "Invalid page token." });
  }

  try {
    const data = await piped(
      page
        ? `/nextpage/playlists/${id}?nextpage=${encodeURIComponent(page)}`
        : `/playlists/${id}`
    );

    // Playlist entries often omit the uploader; fall back to the owner.
    const owner = text(
      data.uploader || data.uploaderName,
      LIMITS.maxChannelLength
    );
    const ownerUrl = text(data.uploaderUrl, LIMITS.maxUrlLength);

    const seen = new Set();
    const items = [];

    for (const raw of data.relatedStreams) {
      if (!raw || typeof raw !== "object") continue;

      const item = normalizeResult({
        ...raw,
        uploaderName: raw.uploaderName || owner,
        uploaderUrl: raw.uploaderUrl || ownerUrl
      });

      if (!item || seen.has(item.id)) continue;

      seen.add(item.id);
      items.push(item);
    }

    const ownerMatch = ownerUrl.match(LIMITS.channelIdPattern);
    const count = wholeNumber(data.videos);

    // A first page with no videos, for a playlist that is not empty, means the
    // video service failed to list them. Do not present that as "no videos".
    if (!page && !items.length && count !== 0) {
      console.error(
        "Playlist lookup returned no videos:",
        id,
        "reported count:",
        data.videos
      );

      res.setHeader("Cache-Control", "no-store");

      return res.status(502).json({
        error:
          "The video service returned no videos for this playlist. It may be a temporary problem, try again later."
      });
    }

    res.setHeader(
      "Cache-Control",
      "public, s-maxage=600, stale-while-revalidate=3600"
    );

    return res.status(200).json({
      id,
      name: text(data.name, CONFIG.maxNameLength),
      uploaderName: owner,
      channelId: ownerMatch?.[1] || "",
      thumbnail: secureUrl(data.thumbnailUrl || data.thumbnail),
      // null when the provider does not report a count.
      count,
      items,
      nextpage:
        typeof data.nextpage === "string" &&
        data.nextpage &&
        data.nextpage.length <= CONFIG.maxPageTokenLength
          ? data.nextpage
          : null
    });
  } catch (error) {
    console.error("Playlist lookup failed:", error?.details || error?.message || error);

    res.setHeader("Cache-Control", "no-store");

    return res.status(502).json({
      error: "This playlist is unavailable right now."
    });
  }
};
