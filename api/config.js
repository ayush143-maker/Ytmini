module.exports = (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");

    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(503).json({
      error: "Supabase configuration is missing."
    });
  }

  try {
    const parsedUrl = new URL(supabaseUrl);

    if (
      parsedUrl.protocol !== "https:" ||
      parsedUrl.hostname !== "ydpeuorhetnehpssxhao.supabase.co" ||
      parsedUrl.pathname !== "/" ||
      parsedUrl.search ||
      parsedUrl.hash
    ) {
      return res.status(503).json({
        error: "Supabase configuration is invalid."
      });
    }
  } catch {
    return res.status(503).json({
      error: "Supabase configuration is invalid."
    });
  }

  if (!supabaseKey.startsWith("sb_publishable_")) {
    return res.status(503).json({
      error: "A Supabase publishable key is required."
    });
  }

  return res.status(200).json({
    supabaseUrl,
    supabaseKey
  });
};
