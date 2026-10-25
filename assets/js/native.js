/*
 * AyuTube - bridge between the web UI and the Android app.
 *
 * Inside the app there is no server: every /api/* request the UI makes is
 * answered on the device by the NewPipeExtractor plugin (the same approach
 * LibreTube uses). In a normal browser this file does nothing.
 *
 * Licensed under the GNU General Public License v3.0 (see LICENSE).
 */
(() => {
  "use strict";

  const cap = window.Capacitor;

  if (!cap || typeof cap.isNativePlatform !== "function" || !cap.isNativePlatform()) {
    return;
  }

  const extractor = cap.registerPlugin("AyuExtractor");
  const player = cap.registerPlugin("AyuPlayer");
  const share = cap.registerPlugin("AyuNative");

  window.AyuNativeBridge = Object.freeze({ extractor, player, share });
  document.documentElement.classList.add("is-native");

  // ---------------------------------------------------------------------------
  // Result normalisation (same public shapes the UI always received)
  // ---------------------------------------------------------------------------

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
    maxDescriptionLength: 300,
    maxResults: 100,
    maxQueryLength: 200,
    maxQueries: 6,
    perGroup: 14
  });

  function text(value, maxLength, fallback = "") {
    if (typeof value !== "string") return fallback;

    return value.trim().slice(0, maxLength) || fallback;
  }

  function wholeNumber(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
    const number = typeof value === "number" ? value : Number(value);

    if (!Number.isFinite(number) || number < min || number > max) return null;

    return Math.floor(number);
  }

  function secureUrl(value) {
    if (typeof value !== "string" || !value || value.length > LIMITS.maxThumbnailLength) {
      return "";
    }

    try {
      const url = new URL(value);

      if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
        return "";
      }

      return url.href;
    } catch {
      return "";
    }
  }

  function videoIdOf(item) {
    if (typeof item.id === "string" && LIMITS.videoIdPattern.test(item.id)) {
      return item.id;
    }

    const url = typeof item.url === "string" ? item.url : "";
    const match = url.match(
      /(?:[?&]v=|youtu\.be\/|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{6,20})(?=$|[&#/?])/i
    );

    return match?.[1] || "";
  }

  function channelIdOf(item) {
    const url = typeof item.uploaderUrl === "string" ? item.uploaderUrl : "";

    return url.match(LIMITS.channelIdPattern)?.[1] || "";
  }

  function normalizeVideo(item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;

    const id = videoIdOf(item);

    if (!id) return null;

    const channel = text(
      item.uploaderName || item.channelTitle || item.channel,
      LIMITS.maxChannelLength,
      "Unknown channel"
    );
    const thumbnail = secureUrl(item.thumbnail || item.thumbnailUrl);
    const uploaded = wholeNumber(item.uploaded, { min: 1 });

    return {
      id,
      url: text(item.url, LIMITS.maxUrlLength, `https://www.youtube.com/watch?v=${id}`),
      title: text(item.title, LIMITS.maxTitleLength, "Untitled video"),
      uploaderName: channel,
      channel,
      thumbnail,
      thumbnailUrl: thumbnail,
      duration: wholeNumber(item.duration, { min: 1, max: LIMITS.maxDurationSeconds }) ?? 0,
      views: wholeNumber(item.views),
      uploaded: text(item.uploadedDate, LIMITS.maxAgeTextLength),
      channelId: channelIdOf(item),
      short: item.isShort === true,
      uploadedAt: uploaded !== null && uploaded <= Date.now() + 86400000 ? uploaded : null
    };
  }

  function normalizePlaylist(item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;

    const url = typeof item.url === "string" ? item.url : "";
    const id = url.match(LIMITS.playlistIdPattern)?.[1] || "";

    if (!id) return null;

    return {
      id,
      name: text(item.name || item.title, LIMITS.maxPlaylistNameLength, "Untitled playlist"),
      thumbnail: secureUrl(item.thumbnail || item.thumbnailUrl),
      uploaderName: text(item.uploaderName || item.uploader, LIMITS.maxChannelLength),
      channelId: channelIdOf(item),
      count: wholeNumber(item.videos ?? item.videoCount)
    };
  }

  function normalizeChannel(item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;

    const url = typeof item.url === "string" ? item.url : "";
    const id = url.match(LIMITS.channelIdPattern)?.[1] || "";

    if (!id) return null;

    return {
      id,
      name: text(item.name, LIMITS.maxChannelLength, "Unknown channel"),
      thumbnail: secureUrl(item.thumbnail || item.avatarUrl),
      description: text(item.description, LIMITS.maxDescriptionLength),
      subscribers: wholeNumber(item.subscribers),
      videos: wholeNumber(item.videos),
      verified: item.verified === true
    };
  }

  function collect(rawItems, normalize, key, limit = Infinity) {
    const seen = new Set();
    const items = [];

    for (const raw of Array.isArray(rawItems) ? rawItems : []) {
      const item = normalize(raw);

      if (!item || seen.has(item[key])) continue;

      seen.add(item[key]);
      items.push(item);

      if (items.length >= limit) break;
    }

    return items;
  }

  // ---------------------------------------------------------------------------
  // Tiny cache so repeated screens do not hit YouTube again straight away
  // ---------------------------------------------------------------------------

  const cache = new Map();

  async function memo(key, ttlMs, load) {
    const hit = cache.get(key);

    if (hit && Date.now() - hit.at < ttlMs) return hit.value;

    const value = await load();

    cache.set(key, { at: Date.now(), value });

    if (cache.size > 80) {
      cache.delete(cache.keys().next().value);
    }

    return value;
  }

  // ---------------------------------------------------------------------------
  // Route handlers
  // ---------------------------------------------------------------------------

  class HttpError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }

  const TYPES = Object.freeze({
    video: { filter: "videos", normalize: normalizeVideo, key: "id" },
    playlist: { filter: "playlists", normalize: normalizePlaylist, key: "id" },
    channel: { filter: "channels", normalize: normalizeChannel, key: "id" }
  });

  async function search(params) {
    const query = (params.get("q") || "").trim();

    if (!query) throw new HttpError(400, "Enter a search query.");
    if (query.length > LIMITS.maxQueryLength) {
      throw new HttpError(400, `Search must be ${LIMITS.maxQueryLength} characters or fewer.`);
    }

    const type = TYPES[params.get("type") || "video"];

    if (!type) throw new HttpError(400, "Unknown result type.");

    const page = params.get("page") || "";
    const data = await memo(`s:${type.filter}:${query}:${page}`, 60000, () =>
      extractor.search({ q: query, filter: type.filter, page })
    );

    return {
      items: collect(data.items, type.normalize, type.key, LIMITS.maxResults),
      nextpage: typeof data.nextpage === "string" && data.nextpage ? data.nextpage : null
    };
  }

  async function feed(params) {
    const queries = [...new Set(params.getAll("q").map((value) => value.trim()).filter(Boolean))];

    if (!queries.length) throw new HttpError(400, "No topics were requested.");
    if (queries.length > LIMITS.maxQueries) {
      throw new HttpError(400, `Request at most ${LIMITS.maxQueries} topics at a time.`);
    }

    const settled = await Promise.allSettled(
      queries.map(async (query) => {
        const data = await memo(`f:${query}`, 300000, () =>
          extractor.search({ q: query, filter: "videos" })
        );

        return {
          query,
          items: collect(data.items, normalizeVideo, "id", LIMITS.perGroup)
        };
      })
    );

    const groups = settled
      .filter((entry) => entry.status === "fulfilled" && entry.value.items.length)
      .map((entry) => entry.value);

    if (!groups.length) throw new HttpError(502, "Videos are unavailable right now.");

    return { groups, failed: queries.length - groups.length };
  }

  async function channel(params) {
    const id = (params.get("id") || "").trim();

    if (!/^[A-Za-z0-9_-]{10,40}$/.test(id)) {
      throw new HttpError(400, "A valid channel ID is required.");
    }

    const nameHint = text(params.get("name") || "", LIMITS.maxChannelLength);

    if (params.get("tab") === "playlists") {
      const data = await memo(`cp:${id}`, 600000, () => extractor.channelPlaylists({ id }));
      const owner = text(data.name, LIMITS.maxChannelLength);
      const playlists = collect(
        (data.playlists || []).map((raw) => ({ ...raw, uploaderName: raw.uploaderName || owner })),
        normalizePlaylist,
        "id"
      );

      // `source: "none"` tells the page to look for playlists another way.
      return { id, playlists, source: data.hasTab ? "tab" : "none" };
    }

    const page = params.get("page") || "";
    const data = await memo(`c:${id}:${page}`, 600000, () => extractor.channel({ id, page }));
    const name = text(data.name, LIMITS.maxChannelLength) || nameHint || "Unknown channel";
    const items = collect(
      (data.relatedStreams || []).map((raw) => ({
        ...raw,
        uploaderName: raw.uploaderName || name,
        uploaderUrl: raw.uploaderUrl || `/channel/${id}`
      })),
      normalizeVideo,
      "id"
    );

    return {
      id,
      name,
      avatar: secureUrl(data.avatarUrl),
      verified: data.verified === true,
      subscribers: wholeNumber(data.subscriberCount),
      items,
      nextpage: typeof data.nextpage === "string" && data.nextpage ? data.nextpage : null
    };
  }

  async function playlist(params) {
    const id = (params.get("id") || "").trim();

    if (!/^[A-Za-z0-9_-]{10,64}$/.test(id)) {
      throw new HttpError(400, "A valid playlist ID is required.");
    }

    const page = params.get("page") || "";
    const data = await memo(`p:${id}:${page}`, 120000, () => extractor.playlist({ id, page }));
    const owner = text(data.uploader, LIMITS.maxChannelLength);
    const ownerUrl = text(data.uploaderUrl, LIMITS.maxUrlLength);
    const items = collect(
      (data.relatedStreams || []).map((raw) => ({
        ...raw,
        uploaderName: raw.uploaderName || owner,
        uploaderUrl: raw.uploaderUrl || ownerUrl
      })),
      normalizeVideo,
      "id"
    );

    if (!page && !items.length) {
      throw new HttpError(502, "This playlist has no videos that can be shown.");
    }

    return {
      id,
      name: text(data.name, LIMITS.maxPlaylistNameLength),
      uploaderName: owner,
      channelId: ownerUrl.match(LIMITS.channelIdPattern)?.[1] || "",
      thumbnail: secureUrl(data.thumbnailUrl),
      count: wholeNumber(data.videos),
      items,
      nextpage: typeof data.nextpage === "string" && data.nextpage ? data.nextpage : null,
      provider: "device"
    };
  }

  async function streams(params) {
    const id = (params.get("id") || "").trim();

    if (!LIMITS.videoIdPattern.test(id)) {
      throw new HttpError(400, "A valid video ID is required.");
    }

    return memo(`v:${id}`, 120000, () => extractor.streams({ id }));
  }

  const ROUTES = Object.freeze({
    "/api/search": search,
    "/api/feed": feed,
    "/api/channel": channel,
    "/api/playlist": playlist,
    "/api/streams": streams
  });

  function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
    });
  }

  async function handleApi(url) {
    const route = ROUTES[url.pathname];

    if (!route) return json({ error: "Not found." }, 404);

    try {
      return json(await route(url.searchParams));
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ error: error.message }, error.status);
      }

      const detail = text(String(error?.message || error?.errorMessage || ""), 160);

      console.error("AyuTube extractor failed:", detail);

      return json(
        { error: detail ? `YouTube did not answer: ${detail}` : "YouTube did not answer. Try again." },
        502
      );
    }
  }

  const baseFetch = window.fetch.bind(window);

  window.fetch = (input, init) => {
    const raw = typeof input === "string" ? input : input?.url;

    if (typeof raw === "string" && raw.startsWith("/api/")) {
      return handleApi(new URL(raw, "https://app.local"));
    }

    return baseFetch(input, init);
  };
})();
