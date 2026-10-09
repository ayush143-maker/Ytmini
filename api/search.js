
const { piped } = require("./_piped");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");

    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  const q = typeof req.query.q === "string"
    ? req.query.q.trim().slice(0, 160)
    : "";

  const debug = req.query.debug === "1";

  if (!q) {
    return res.status(400).json({
      error: "Enter a search query."
    });
  }

  try {
    const data = await piped(
      `/search?q=${encodeURIComponent(q)}&filter=videos`
    );

    const items = Array.isArray(data)
      ? data
      : data && Array.isArray(data.items)
        ? data.items
        : null;

    if (!items) {
      throw new Error("Search provider returned an invalid response");
    }

    res.setHeader(
      "Cache-Control",
      "s-maxage=30, stale-while-revalidate=60"
    );

    return res.status(200).json({ items });
  } catch (error) {
    console.error(
      "MiniTube search failed:",
      error.details || error.message
    );

    const result = {
      error: "Search service unavailable."
    };

    if (debug) {
      result.providerErrors = Array.isArray(error.details)
        ? error.details
        : [{ error: error.message }];
    }

    return res.status(502).json(result);
  }
};
