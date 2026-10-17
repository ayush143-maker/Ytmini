"use strict";

// Playlist metadata fallback for when public Piped instances fail or return
// no usable items. The domains below are from Invidious' published instance
// list; operators can override them in Vercel with INVIDIOUS_INSTANCES.
const DEFAULT_INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://yt.chocolatemoo53.com",
  "https://invidious.tiekoetter.com"
];

const { normalizeResult, secureUrl, text, wholeNumber, LIMITS } = require("./_normalize");

const CONFIG = Object.freeze({
  timeoutMs: 2400,
  maxFailuresToReport: 4,
  playlistIdPattern: /^[A-Za-z0-9_-]{10,64}$/,
  pageSize: 100
});

function getInstances() {
  const configured = (process.env.INVIDIOUS_INSTANCES || "")
    .split(",")
    .map((value) => normalizeInstance(value))
    .filter(Boolean);

  return [...new Set([...configured, ...DEFAULT_INSTANCES.map(normalizeInstance).filter(Boolean)])];
}

function normalizeInstance(value) {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password ||
      (url.pathname !== "" && url.pathname !== "/") ||
      url.search ||
      url.hash
    ) return null;

    return url.origin;
  } catch {
    return null;
  }
}

// Invidious instances sometimes return relative or http thumbnail addresses,
// which the app rejects. YouTube keeps every thumbnail at a fixed https
// address built from the video id, so build it from the id instead.
function thumbnailOf(id) {
  return `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
}

function normalizePlaylist(data, playlistId, pageNumber) {
  if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.videos)) {
    throw new Error("Invidious returned an invalid playlist response.");
  }
  if (typeof data.playlistId === "string" && data.playlistId && data.playlistId !== playlistId) {
    throw new Error("Invidious returned a different playlist ID.");
  }

  const count = wholeNumber(data.videoCount);
  const owner = text(data.author, LIMITS.maxChannelLength);
  const ownerUrl = typeof data.authorUrl === "string"
    ? data.authorUrl
    : (typeof data.authorId === "string" && /^[A-Za-z0-9_-]{10,40}$/.test(data.authorId)
        ? `https://www.youtube.com/channel/${data.authorId}`
        : "");

  const seen = new Set();
  const items = [];

  for (const raw of data.videos) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const id = typeof raw.videoId === "string" ? raw.videoId : "";
    if (!LIMITS.videoIdPattern.test(id) || seen.has(id)) continue;
    seen.add(id);

    const item = normalizeResult({
      id,
      url: `https://www.youtube.com/watch?v=${id}&list=${playlistId}`,
      title: raw.title,
      uploaderName: raw.author || owner,
      uploaderUrl: raw.authorUrl || ownerUrl,
      thumbnail: thumbnailOf(id),
      duration: raw.lengthSeconds,
      views: raw.viewCount,
      uploadedDate: raw.publishedText
    });

    if (item) items.push(item);
  }

  // A non-empty playlist that produced no valid IDs is not a usable result;
  // allow another instance to answer instead of silently declaring it empty.
  if (!items.length && count !== 0) {
    throw new Error("Invidious returned no usable playlist videos.");
  }

  const hasMore = count !== null
    ? pageNumber * CONFIG.pageSize < count
    : data.videos.length >= CONFIG.pageSize;

  const ownerIdMatch = ownerUrl.match(LIMITS.channelIdPattern);

  return {
    id: playlistId,
    name: text(data.title, 200),
    uploaderName: owner,
    channelId: ownerIdMatch?.[1] || "",
    thumbnail: secureUrl(data.playlistThumbnail || data.thumbnail),
    count,
    items,
    nextpage: hasMore ? `iv:${pageNumber + 1}` : null,
    provider: "invidious"
  };
}

async function probeInstance(base, playlistId, pageNumber, controller = new AbortController()) {
  const timer = setTimeout(() => controller.abort(), CONFIG.timeoutMs);

  try {
    const url = new URL(`/api/v1/playlists/${encodeURIComponent(playlistId)}`, base);
    url.searchParams.set("page", String(pageNumber));

    const response = await fetch(url.href, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "AyuTube/1.0 playlist metadata fallback"
      },
      signal: controller.signal
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("Invalid JSON");
    }

    return normalizePlaylist(data, playlistId, pageNumber);
  } finally {
    clearTimeout(timer);
  }
}

async function invidiousPlaylist(playlistId, pageNumber = 1) {
  if (!CONFIG.playlistIdPattern.test(playlistId)) {
    throw new Error("A valid playlist ID is required.");
  }
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber > 1000) {
    throw new Error("Invalid Invidious playlist page.");
  }

  const hosts = getInstances();
  if (!hosts.length) throw new Error("No valid Invidious instances are configured.");

  const failures = [];
  const controllers = hosts.map(() => new AbortController());
  const attempts = hosts.map(async (host, index) => {
    try {
      const result = await probeInstance(host, playlistId, pageNumber, controllers[index]);
      // Empty playlists are only credible when the provider supplies a title.
      if (!result.name && !result.items.length) {
        throw new Error("Playlist response had no identifying metadata.");
      }
      return { host, result };
    } catch (error) {
      failures.push({ host: new URL(host).host, error: String(error?.message || "request failed").slice(0, 120) });
      throw error;
    }
  });

  try {
    const winner = await Promise.any(attempts);
    controllers.forEach((controller, index) => {
      if (hosts[index] !== winner.host) controller.abort();
    });
    return winner.result;
  } catch {
    controllers.forEach((controller) => controller.abort());
    const error = new Error("All Invidious playlist instances failed.");
    error.details = failures.slice(0, CONFIG.maxFailuresToReport);
    throw error;
  }
}

module.exports = { invidiousPlaylist, normalizePlaylist, getInstances, CONFIG };
