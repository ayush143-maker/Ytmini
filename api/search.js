
const { piped } = require("./_piped");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 160) : "";
  if (!q) return res.status(400).json({ error: "Enter a search query." });
  try {
    const data = await piped(`/search?q=${encodeURIComponent(q)}&filter=videos`);
    const items = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : [];
    return res.status(200).json({ items });
  } catch (error) {
    console.error("MiniTube search failed", error.details || error.message);
    return res.status(502).json({ error: "Search service unavailable. Try again in a moment." });
  }
};
