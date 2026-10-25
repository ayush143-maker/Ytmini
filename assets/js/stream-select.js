/*
 * AyuTube - choosing which video and audio streams to play.
 * Pure functions, no DOM. Licensed under the GNU GPL v3.0 (see LICENSE).
 */
(() => {
  "use strict";

  const heightOf = (stream) =>
    Number(stream.height) || parseInt(String(stream.quality || ""), 10) || 0;

  // Widely hardware-decoded codecs first; AV1 last because older phones lack it.
  function codecRank(stream) {
    const codec = String(stream.codec || "").toLowerCase();
    const mime = String(stream.mimeType || "").toLowerCase();

    if (codec.startsWith("avc1") || (mime.includes("mp4") && !codec.startsWith("av01"))) {
      return 3;
    }

    if (codec.startsWith("vp09") || codec.includes("vp9")) return 2;
    if (codec.startsWith("av01")) return 1;

    return 0;
  }

  function labelOf(height, fps) {
    return `${height}p${fps > 30 ? (fps >= 50 ? 60 : fps) : ""}`;
  }

  const better = (a, b) =>
    codecRank(a) - codecRank(b) || (Number(a.bitrate) || 0) - (Number(b.bitrate) || 0);

  /**
   * Returns { qualities, muxed }:
   *  - qualities: adaptive (video-only) choices, best first, one per height/fps
   *  - muxed: the best stream that already contains audio, or null
   * When a video offers no adaptive streams, the muxed ones become the choices.
   */
  function buildQualities(info) {
    const adaptive = new Map();
    const muxedByHeight = new Map();

    for (const stream of Array.isArray(info?.videoStreams) ? info.videoStreams : []) {
      if (!stream || typeof stream.url !== "string" || !stream.url) continue;

      const height = heightOf(stream);

      if (!height) continue;

      const fps = Number(stream.fps) > 30 ? 60 : 30;
      const key = `${height}-${fps}`;
      const target = stream.videoOnly ? adaptive : muxedByHeight;
      const current = target.get(key);

      if (!current || better(stream, current) > 0) {
        target.set(key, stream);
      }
    }

    const toEntry = (stream, muxed) => ({
      height: heightOf(stream),
      fps: Number(stream.fps) > 30 ? 60 : 30,
      label: labelOf(heightOf(stream), Number(stream.fps) || 30),
      stream,
      muxed
    });

    const order = (a, b) => b.height - a.height || b.fps - a.fps;
    const adaptiveList = [...adaptive.values()].map((s) => toEntry(s, false)).sort(order);
    const muxedList = [...muxedByHeight.values()].map((s) => toEntry(s, true)).sort(order);

    return {
      qualities: adaptiveList.length ? adaptiveList : muxedList,
      muxed: muxedList[0] || null
    };
  }

  /** The best audio stream, preferring the original-language track. */
  function pickAudio(info, preferMp4 = true) {
    let audio = (Array.isArray(info?.audioStreams) ? info.audioStreams : []).filter(
      (stream) => stream && typeof stream.url === "string" && stream.url
    );

    if (!audio.length) return null;

    const original = audio.filter((stream) =>
      /original/i.test(`${stream.trackId || ""} ${stream.trackName || ""}`)
    );

    if (original.length) audio = original;

    const wanted = audio.filter((stream) =>
      String(stream.mimeType || "").includes(preferMp4 ? "mp4" : "webm")
    );
    const pool = wanted.length ? wanted : audio;

    return [...pool].sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0))[0];
  }

  /** Highest quality not above `maxHeight`, else the smallest one above it. */
  function defaultQuality(qualities, maxHeight = 720) {
    if (!qualities.length) return null;

    const within = qualities.filter((entry) => entry.height <= maxHeight);

    return within.length ? within[0] : qualities[qualities.length - 1];
  }

  window.AyuStreamSelect = Object.freeze({
    buildQualities,
    pickAudio,
    defaultQuality
  });
})();
