const { piped } = require("./_piped");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) {
    return res.status(400).json({ error: "Invalid video ID." });
  }
  try {
    const data = await piped(`/streams/${encodeURIComponent(id)}`);
    const videoStreams = Array.isArray(data.videoStreams) ? data.videoStreams : [];
    return res.status(200).json({
      videoStreams: videoStreams.map(s => ({
        url: s.url,
        mimeType: s.mimeType || "",
        quality: s.quality || "",
        videoOnly: Boolean(s.videoOnly)
      })).filter(s => typeof s.url === "string" && /^https?:\/\//i.test(s.url))
    });
  } catch (error) {
    console.error("MiniTube stream lookup failed", error.details || error.message);
    return res.status(502).json({ error: "Playback service unavailable. Try the YouTube link below." });
  }
};
