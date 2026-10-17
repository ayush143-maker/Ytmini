"use strict";

// GET /api/playlist?id=PL...[&page=TOKEN]
// Piped is the primary provider; Invidious is a fallback for playlist metadata.

const { piped } = require("./_piped");
const { invidiousPlaylist } = require("./_invidious");
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

// Piped gets a head start. If it has not answered after `hedgeMs`, Invidious is
// asked too, and whichever gives a usable playlist first is used. If Piped
// fails sooner than that, Invidious starts straight away. This keeps the total
// well under the 10 second limit in vercel.json.
const TIMING = { hedgeMs: 2500 };

function firstPage(id) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let invidiousStarted = false;
    let pipedError = null;
    let invidiousError = null;
    let timer = null;

    const win = (result) => {
      if (settled) return;

      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const lose = () => {
      if (settled || !pipedError || !invidiousError) return;

      settled = true;
      clearTimeout(timer);

      console.error("Playlist providers failed:", {
        id,
        piped: pipedError?.details || pipedError?.message || "Piped failed",
        invidious:
          invidiousError?.details || invidiousError?.message || "Invidious failed"
      });

      reject(new Error("All playlist providers failed."));
    };

    const startInvidious = () => {
      if (settled || invidiousStarted) return;

      invidiousStarted = true;
      clearTimeout(timer);

      invidiousPlaylist(id, 1).then(win, (error) => {
        invidiousError = error || new Error("Invidious failed");
        lose();
      });
    };

    timer = setTimeout(startInvidious, TIMING.hedgeMs);

    piped(`/playlists/${id}`)
      .then((data) => normalizePipedPlaylist(data, id))
      .then(win)
      .catch((error) => {
        pipedError = error || new Error("Piped failed");
        startInvidious();
        lose();
      });
  });
}

function single(value) {
  return typeof value === "string" ? value : "";
}

function normalizePipedPlaylist(data, id) {
  if (!data || !Array.isArray(data.relatedStreams)) {
    throw new Error("Piped returned an invalid playlist response.");
  }

  const owner = text(data.uploader || data.uploaderName, LIMITS.maxChannelLength);
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

  const count = wholeNumber(data.videos);
  // Any empty first-page response is ambiguous, even when one instance reports
  // a zero count. Try the independent provider before telling the UI it's empty.
  if (!items.length) throw new Error("Piped returned no usable playlist videos.");

  const ownerMatch = ownerUrl.match(LIMITS.channelIdPattern);
  return {
    id,
    name: text(data.name, CONFIG.maxNameLength),
    uploaderName: owner,
    channelId: ownerMatch?.[1] || "",
    thumbnail: secureUrl(data.thumbnailUrl || data.thumbnail),
    count,
    items,
    nextpage:
      typeof data.nextpage === "string" && data.nextpage && data.nextpage.length <= CONFIG.maxPageTokenLength
        ? data.nextpage
        : null,
    provider: "piped"
  };
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
    let result;

    // Continuation tokens issued by the Invidious fallback are explicitly
    // namespaced so they can never be mistaken for a Piped opaque token.
    const invidiousPage = page.match(/^iv:([1-9]\d{0,3})$/);

    if (invidiousPage) {
      result = await invidiousPlaylist(id, Number(invidiousPage[1]));
    } else if (page) {
      // A Piped continuation token only makes sense to Piped.
      result = normalizePipedPlaylist(
        await piped(`/nextpage/playlists/${id}?nextpage=${encodeURIComponent(page)}`),
        id
      );
    } else {
      result = await firstPage(id);
    }

    res.setHeader(
      "Cache-Control",
      "public, s-maxage=120, stale-while-revalidate=600"
    );
    return res.status(200).json(result);
  } catch (error) {
    console.error("Playlist lookup failed:", error?.details || error?.message || error);
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({
      error: "The playlist service could not retrieve this playlist from its available providers. Please retry shortly."
    });
  }
};

module.exports.TIMING = TIMING;
