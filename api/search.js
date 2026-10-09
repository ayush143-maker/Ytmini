
const INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://yt.chocolatemoo53.com",
  "https://invidious.tiekoetter.com"
];

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const q = typeof req.query.q === "string"
    ? req.query.q.trim().slice(0, 160)
    : "";

  if (!q) {
    return res.status(400).json({ error: "Enter a search query." });
  }

  const controllers = [];

  try {
    const attempts = INSTANCES.map(async (base) => {
      const controller = new AbortController();
      controllers.push(controller);

      const timer = setTimeout(() => controller.abort(), 4500);

      try {
        const url = `${base}/api/v1/search?q=${encodeURIComponent(q)}&type=video`;

        const response = await fetch(url, {
          headers: { Accept: "application/json" },
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
          throw new Error("Invalid API response");
        }

        return data
          .filter(item => item.videoId && item.title)
          .map(item => ({
            id: item.videoId,
            title: item.title,
            uploaderName: item.author || "Unknown channel",
            thumbnail:
              item.videoThumbnails?.find(t => t.quality === "high")?.url ||
              item.videoThumbnails?.[0]?.url ||
              "",
            url: `https://www.youtube.com/watch?v=${item.videoId}`
          }));
      } finally {
        clearTimeout(timer);
      }
    });

    const items = await Promise.any(attempts);

    controllers.forEach(c => c.abort());

    return res.status(200).json({ items });
  } catch (error) {
    console.error("All search instances failed:", error.message);

    return res.status(502).json({
      error: "Search providers are unavailable. Please try again later."
    });
  } finally {
    controllers.forEach(c => c.abort());
  }
};
