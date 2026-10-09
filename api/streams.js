
"use strict";

const { piped } = require("./_piped");

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{6,20}$/;
const MAX_STREAMS = 50;

function normalizeStream(stream) {
  if (!stream || typeof stream !== "object") {
    return null;
  }

  if (typeof stream.url !== "string" || !stream.url.trim()) {
    return null;
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(stream.url);
  } catch {
    return null;
  }

  // Only allow secure stream URLs in the browser player.
  if (
    parsedUrl.protocol !== "https:" ||
    !parsedUrl.hostname ||
    parsedUrl.username ||
    parsedUrl.password
  ) {
    return null;
  }

  const mimeType =
    typeof stream.mimeType === "string"
      ? stream.mimeType.slice(0, 120)
      : "";

  const quality =
    typeof stream.quality === "string"
      ? stream.quality.slice(0, 80)
      : "";

  return {
    url: parsedUrl.href,
    mimeType,
    quality,
    videoOnly: Boolean(stream.videoOnly)
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

  const id =
    typeof req.query.id === "string"
      ? req.query.id.trim()
      : "";

  if (!VIDEO_ID_PATTERN.test(id)) {
    return res.status(400).json({
      error: "Invalid video ID."
    });
  }

  try {
    const data = await piped(
      `/streams/${encodeURIComponent(id)}`
    );

    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data)
    ) {
      throw new Error("Invalid stream response.");
    }

    const rawStreams = Array.isArray(data.videoStreams)
      ? data.videoStreams
      : [];

    const seenUrls = new Set();
    const videoStreams = [];

    for (const rawStream of rawStreams) {
      const stream = normalizeStream(rawStream);

      if (!stream || seenUrls.has(stream.url)) {
        continue;
      }

      seenUrls.add(stream.url);
      videoStreams.push(stream);

      if (videoStreams.length >= MAX_STREAMS) {
        break;
      }
    }

    return res.status(200).json({
      videoStreams
    });
  } catch (error) {
    console.error(
      "AyuTube stream lookup failed:",
      error.details || error.message
    );

    return res.status(502).json({
      error:
        "Playback service unavailable. Try the YouTube player instead."
    });
  }
};
