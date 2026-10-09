
"use strict";

const DEFAULT_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.leptons.xyz",
  "https://pipedapi.nosebs.ru",
  "https://pipedapi-libre.kavin.rocks",
  "https://piped-api.privacy.com.de",
  "https://pipedapi.adminforge.de",
  "https://api.piped.yt",
  "https://pipedapi.drgns.space",
  "https://pipedapi.owo.si",
  "https://pipedapi.ducks.party",
  "https://piped-api.codespace.cz",
  "https://pipedapi.reallyaweso.me",
  "https://api.piped.private.coffee",
  "https://pipedapi.darkness.services",
  "https://pipedapi.orangenet.cc"
];

const CONFIG = Object.freeze({
  batchSize: 5,
  timeoutMs: 2100,
  maxFailuresToReport: 15,
  videoIdPattern: /^[A-Za-z0-9_-]{6,20}$/
});

// -----------------------------------------------------------------------------
// Instance validation
// -----------------------------------------------------------------------------

function normalizeInstance(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

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
    ) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

function getInstances() {
  const configured = (process.env.PIPED_INSTANCES || "")
    .split(",")
    .map(normalizeInstance)
    .filter(Boolean);

  return [
    ...new Set([
      ...configured,
      ...DEFAULT_INSTANCES.map(normalizeInstance).filter(Boolean)
    ])
  ];
}

// -----------------------------------------------------------------------------
// Request path validation: only allow the two internal API operations.
// -----------------------------------------------------------------------------

function validatePath(path) {
  if (typeof path !== "string" || !path.startsWith("/")) {
    throw new Error("Invalid provider request path.");
  }

  let url;

  try {
    url = new URL(path, "https://internal.invalid");
  } catch {
    throw new Error("Invalid provider request path.");
  }

  if (url.origin !== "https://internal.invalid") {
    throw new Error("External provider URLs are not allowed.");
  }

  if (url.hash) {
    throw new Error("Invalid provider request path.");
  }

  if (url.pathname === "/search") {
    const keys = [...url.searchParams.keys()];
    const query = url.searchParams.get("q");
    const filter = url.searchParams.get("filter");

    if (
      keys.length !== 2 ||
      !keys.includes("q") ||
      !keys.includes("filter") ||
      !query ||
      filter !== "videos" ||
      url.searchParams.getAll("q").length !== 1 ||
      url.searchParams.getAll("filter").length !== 1
    ) {
      throw new Error("Invalid search provider request.");
    }

    return url.pathname + url.search;
  }

  const streamMatch = url.pathname.match(
    /^\/streams\/([A-Za-z0-9_-]{6,20})$/
  );

  if (streamMatch && !url.search) {
    return url.pathname;
  }

  throw new Error("Unsupported provider operation.");
}

// -----------------------------------------------------------------------------
// Response validation
// -----------------------------------------------------------------------------

function getSearchItems(data) {
  if (Array.isArray(data)) return data;

  if (data && Array.isArray(data.items)) {
    return data.items;
  }

  return null;
}

function extractVideoId(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return "";
  }

  if (
    typeof item.id === "string" &&
    CONFIG.videoIdPattern.test(item.id)
  ) {
    return item.id;
  }

  const url = typeof item.url === "string" ? item.url : "";

  const match = url.match(
    /(?:[?&]v=|youtu\.be\/|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{6,20})(?=$|[&#/?])/i
  );

  return match?.[1] || "";
}

function hasUsableSearchItems(items) {
  return Array.isArray(items) && items.some(
    (item) => Boolean(extractVideoId(item))
  );
}

function hasUsableStreams(streams) {
  return Array.isArray(streams) && streams.some((stream) => {
    if (!stream || typeof stream.url !== "string") {
      return false;
    }

    try {
      const url = new URL(stream.url);

      return (
        url.protocol === "https:" &&
        Boolean(url.hostname) &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  });
}

function validatePayload(path, data) {
  if (path.startsWith("/search")) {
    const items = getSearchItems(data);

    if (!items) {
      const detail = data && (data.error || data.message);

      throw new Error(
        detail
          ? `Invalid search response: ${String(detail).slice(0, 120)}`
          : "Provider returned an invalid search response."
      );
    }

    return;
  }

  if (path.startsWith("/streams/")) {
    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      !Array.isArray(data.videoStreams)
    ) {
      throw new Error("Provider returned an invalid streams response.");
    }
  }
}

function isUsableResponse(path, data) {
  if (path.startsWith("/search")) {
    return hasUsableSearchItems(getSearchItems(data));
  }

  if (path.startsWith("/streams/")) {
    return hasUsableStreams(data.videoStreams);
  }

  return false;
}

function isValidEmptyResponse(path, data) {
  if (path.startsWith("/search")) {
    const items = getSearchItems(data);

    return Array.isArray(items) && items.length === 0;
  }

  if (path.startsWith("/streams/")) {
    return (
      Array.isArray(data?.videoStreams) &&
      !hasUsableStreams(data.videoStreams)
    );
  }

  return false;
}

// -----------------------------------------------------------------------------
// Single provider probe
// -----------------------------------------------------------------------------

async function probe(base, path, timeoutMs = CONFIG.timeoutMs, suppliedController) {
  const controller = suppliedController || new AbortController();
  const startedAt = Date.now();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(`${base}${path}`, {
      method: "GET",
      headers: {
        Accept: "application/json"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Provider returned HTTP ${response.status}.`);
    }

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error("Provider returned invalid JSON.");
    }

    validatePayload(path, data);

    return {
      data,
      status: response.status,
      ms: Date.now() - startedAt
    };
  } catch (error) {
    if (timedOut) {
      throw new Error(`Provider timed out after ${timeoutMs}ms.`);
    }

    if (error?.name === "AbortError") {
      const aborted = new Error("Provider request was aborted.");
      aborted.code = "REQUEST_ABORTED";
      throw aborted;
    }

    if (error instanceof TypeError) {
      throw new Error("Provider network request failed.");
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// -----------------------------------------------------------------------------
// Provider fallback with bounded concurrency
// -----------------------------------------------------------------------------

async function piped(rawPath) {
  const path = validatePath(rawPath);
  const instances = getInstances();

  if (!instances.length) {
    const error = new Error("No valid video providers are configured.");
    error.details = [];
    throw error;
  }

  const failures = [];
  const emptyResponses = [];

  for (
    let offset = 0;
    offset < instances.length;
    offset += CONFIG.batchSize
  ) {
    const batch = instances.slice(
      offset,
      offset + CONFIG.batchSize
    );

    const controllers = batch.map(() => new AbortController());
    const cancelledByWinner = batch.map(() => false);

    const attempts = batch.map(async (base, index) => {
      const controller = controllers[index];

      let host = "unknown-provider";

      try {
        host = new URL(base).host;
      } catch {
        // Provider URLs are already validated; keep errors safe to log.
      }

      try {
        const result = await probe(
          base,
          path,
          CONFIG.timeoutMs,
          controller
        );

        if (isUsableResponse(path, result.data)) {
          return result.data;
        }

        if (isValidEmptyResponse(path, result.data)) {
          emptyResponses.push(result.data);

          throw new Error(
            "Provider returned no usable videos or HTTPS streams."
          );
        }

        throw new Error("Provider response contains no usable entries.");
      } catch (error) {
        if (!cancelledByWinner[index]) {
          failures.push({
            instance: host,
            error: String(error?.message || "Provider request failed")
              .slice(0, 180)
          });
        }

        throw error;
      }
    });

    try {
      const data = await Promise.any(attempts);

      // Stop other requests in this batch as soon as a good response wins.
      controllers.forEach((controller, index) => {
        cancelledByWinner[index] = true;
        controller.abort();
      });

      return data;
    } catch {
      // This batch had no usable response; move on to the next group.
      controllers.forEach((controller) => controller.abort());
    }
  }

  // If all providers agree that there are no results/playable HTTPS streams,
  // return an empty-but-valid response so the API routes can handle it cleanly.
  if (emptyResponses.length > 0) {
    return emptyResponses[0];
  }

  const error = new Error("All video providers failed.");
  error.details = failures.slice(0, CONFIG.maxFailuresToReport);

  throw error;
}

module.exports = {
  piped,
  getInstances,
  probe
};
