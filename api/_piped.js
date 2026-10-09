const DEFAULT_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.reallyaweso.me",
  "https://pipedapi.leptons.xyz"
];

function getInstances() {
  const configured = (process.env.PIPED_INSTANCES || "")
    .split(",").map(s => s.trim().replace(/\/+$/, "")).filter(Boolean);
  return [...new Set([...configured, ...DEFAULT_INSTANCES])];
}

async function piped(path) {
  const failures = [];
  for (const base of getInstances()) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6500);
      try {
        const response = await fetch(`${base}${path}`, {
          headers: { "Accept": "application/json", "User-Agent": "MiniTube/1.0" },
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return data;
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      failures.push(`${new URL(base).host}: ${error.name === "AbortError" ? "timeout" : error.message}`);
    }
  }
  const error = new Error("All video search services are temporarily unavailable.");
  error.details = failures;
  throw error;
}

module.exports = { piped };
