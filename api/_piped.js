
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

function getInstances() {
  const configured = (process.env.PIPED_INSTANCES || "")
    .split(",")
    .map(value => value.trim().replace(/\/+$/, ""))
    .filter(Boolean);

  const unique = [...new Set([...configured, ...DEFAULT_INSTANCES])];

  return unique.filter(base => {
    try {
      return new URL(base).protocol === "https:";
    } catch {
      return false;
    }
  });
}

function getSearchItems(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.items)) return data.items;
  return null;
}

function validatePayload(path, data) {
  if (path.startsWith("/search")) {
    const items = getSearchItems(data);

    if (!items) {
      const detail = data && (data.error || data.message);

      throw new Error(
        detail
          ? `Upstream error: ${String(detail).slice(0, 120)}`
          : "Invalid search response format"
      );
    }
  }

  if (path.startsWith("/streams/")) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Invalid stream response format");
    }

    if (data.error && !Array.isArray(data.videoStreams)) {
      throw new Error(
        `Upstream error: ${String(data.error).slice(0, 120)}`
      );
    }
  }
}

async function probe(base, path, timeoutMs = 4000, suppliedController) {
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
      throw new Error(`HTTP ${response.status}`);
    }

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error("Provider returned invalid JSON");
    }

    validatePayload(path, data);

    return {
      data,
      status: response.status,
      ms: Date.now() - startedAt
    };
  } catch (error) {
    if (timedOut || error.name === "AbortError") {
      throw new Error(`Timeout after ${timeoutMs}ms`);
    }

    if (error instanceof TypeError) {
      const cause =
        error.cause && (error.cause.code || error.cause.message);

      throw new Error(`Network error: ${cause || error.message}`);
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function piped(path) {
  const instances = getInstances();
  const controllers = instances.map(() => new AbortController());
  const failures = [];
  const emptySearchResponses = [];

  const attempts = instances.map(async (base, index) => {
    let host = base;

    try {
      host = new URL(base).host;
    } catch {}

    try {
      const result = await probe(
        base,
        path,
        4000,
        controllers[index]
      );

      if (path.startsWith("/search")) {
        const items = getSearchItems(result.data);

        if (items && items.length === 0) {
          emptySearchResponses.push(result.data);
          throw new Error("Request succeeded, but returned zero results");
        }
      }

      return result.data;
    } catch (error) {
      failures.push({
        instance: host,
        error: error.message
      });

      throw error;
    }
  });

  try {
    return await Promise.any(attempts);
  } catch {
    if (path.startsWith("/search") && emptySearchResponses.length > 0) {
      return emptySearchResponses[0];
    }

    const error = new Error("All Piped instances failed");
    error.details = failures;
    throw error;
  } finally {
    controllers.forEach(controller => controller.abort());
  }
}

module.exports = {
  piped,
  getInstances,
  probe
};
