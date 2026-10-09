
(() => {
  "use strict";

  const CONFIG = Object.freeze({
    searchEndpoint: "/api/search",
    streamsEndpoint: "/api/streams",
    searchTimeoutMs: 20000,
    streamsTimeoutMs: 20000,
    maxSearchLength: 200,
    videoIdPattern: /^[A-Za-z0-9_-]{6,20}$/
  });

  class ApiError extends Error {
    constructor(message, options = {}) {
      super(message);

      this.name = "ApiError";
      this.status = options.status ?? 0;
      this.code = options.code ?? "API_ERROR";
      this.retryable = options.retryable ?? false;
    }
  }

  function validateSearchQuery(value) {
    if (typeof value !== "string") {
      throw new ApiError("Enter a search query.", {
        code: "INVALID_QUERY"
      });
    }

    const query = value.trim();

    if (!query) {
      throw new ApiError("Enter something to search for.", {
        code: "EMPTY_QUERY"
      });
    }

    if (query.length > CONFIG.maxSearchLength) {
      throw new ApiError(
        `Search must be ${CONFIG.maxSearchLength} characters or fewer.`,
        { code: "QUERY_TOO_LONG" }
      );
    }

    return query;
  }

  function validateVideoId(value) {
    if (
      typeof value !== "string" ||
      !CONFIG.videoIdPattern.test(value.trim())
    ) {
      throw new ApiError("This video has an invalid ID.", {
        code: "INVALID_VIDEO_ID"
      });
    }

    return value.trim();
  }

  function getErrorMessage(payload, status) {
    if (
      payload &&
      typeof payload.error === "string" &&
      payload.error.trim().length > 0
    ) {
      // Avoid displaying excessively long server responses.
      return payload.error.trim().slice(0, 300);
    }

    if (status === 400) {
      return "The request was invalid. Check your search and try again.";
    }

    if (status === 404) {
      return "The requested resource was not found.";
    }

    if (status === 429) {
      return "Too many requests. Wait a moment and try again.";
    }

    if (status === 503) {
      return "The video service is temporarily unavailable.";
    }

    if (status >= 500) {
      return "The server encountered a problem. Please try again.";
    }

    return "The request could not be completed.";
  }

  async function request(
    path,
    {
      timeoutMs,
      signal: externalSignal
    } = {}
  ) {
    if (typeof path !== "string" || !path.startsWith("/api/")) {
      throw new ApiError("Invalid API endpoint.", {
        code: "INVALID_ENDPOINT"
      });
    }

    if (externalSignal?.aborted) {
      throw new ApiError("The request was cancelled.", {
        code: "REQUEST_CANCELLED"
      });
    }

    const controller = new AbortController();
    let timedOut = false;

    const abortFromCaller = () => {
      controller.abort();
    };

    externalSignal?.addEventListener(
      "abort",
      abortFromCaller,
      { once: true }
    );

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      let response;

      try {
        response = await fetch(path, {
          method: "GET",
          headers: {
            Accept: "application/json"
          },
          credentials: "same-origin",
          cache: "no-store",
          redirect: "error",
          signal: controller.signal
        });
      } catch (error) {
        if (timedOut) {
          throw new ApiError(
            "The request took too long. Please try again.",
            {
              code: "REQUEST_TIMEOUT",
              retryable: true
            }
          );
        }

        if (externalSignal?.aborted) {
          throw new ApiError("The request was cancelled.", {
            code: "REQUEST_CANCELLED"
          });
        }

        throw new ApiError(
          "Could not connect to the video service. Check your connection.",
          {
            code: "NETWORK_ERROR",
            retryable: true
          }
        );
      }

      const contentType = response.headers.get("content-type") || "";

      if (!contentType.toLowerCase().includes("application/json")) {
        if (!response.ok) {
          throw new ApiError(getErrorMessage(null, response.status), {
            status: response.status,
            code: "HTTP_ERROR",
            retryable: response.status >= 500 || response.status === 429
          });
        }

        throw new ApiError(
          "The server returned an unexpected response. Check the deployment.",
          {
            status: response.status,
            code: "INVALID_RESPONSE"
          }
        );
      }

      let payload;

      try {
        payload = await response.json();
      } catch {
        throw new ApiError(
          "The server response could not be read. Please try again.",
          {
            status: response.status,
            code: "INVALID_JSON",
            retryable: true
          }
        );
      }

      if (!response.ok) {
        throw new ApiError(
          getErrorMessage(payload, response.status),
          {
            status: response.status,
            code: "HTTP_ERROR",
            retryable: response.status >= 500 || response.status === 429
          }
        );
      }

      if (
        !payload ||
        typeof payload !== "object" ||
        Array.isArray(payload)
      ) {
        throw new ApiError(
          "The server returned invalid data.",
          {
            status: response.status,
            code: "INVALID_PAYLOAD"
          }
        );
      }

      if (typeof payload.error === "string" && payload.error.trim()) {
        throw new ApiError(payload.error.trim().slice(0, 300), {
          status: response.status,
          code: "API_REPORTED_ERROR"
        });
      }

      return payload;
    } finally {
      clearTimeout(timer);

      externalSignal?.removeEventListener(
        "abort",
        abortFromCaller
      );
    }
  }

  async function search(query, options = {}) {
    const normalizedQuery = validateSearchQuery(query);

    const params = new URLSearchParams({
      q: normalizedQuery
    });

    const payload = await request(
      `${CONFIG.searchEndpoint}?${params.toString()}`,
      {
        timeoutMs: CONFIG.searchTimeoutMs,
        signal: options.signal
      }
    );

    // Retain the existing app's expected { items: [...] } shape.
    if (
      payload.items !== undefined &&
      !Array.isArray(payload.items)
    ) {
      throw new ApiError(
        "The search service returned an invalid results list.",
        { code: "INVALID_SEARCH_RESULTS" }
      );
    }

    return payload;
  }

  async function streams(videoId, options = {}) {
    const id = validateVideoId(videoId);

    const params = new URLSearchParams({ id });

    const payload = await request(
      `${CONFIG.streamsEndpoint}?${params.toString()}`,
      {
        timeoutMs: CONFIG.streamsTimeoutMs,
        signal: options.signal
      }
    );

    if (
      payload.videoStreams !== undefined &&
      !Array.isArray(payload.videoStreams)
    ) {
      throw new ApiError(
        "The playback service returned invalid stream data.",
        { code: "INVALID_STREAMS" }
      );
    }

    return payload;
  }

  const api = Object.freeze({
    search,
    streams,
    ApiError
  });

  // Both names are intentionally supported:
  // older code uses MiniTubeAPI; newer integration uses AyuTubeAPI.
  window.AyuTubeAPI = api;
  window.MiniTubeAPI = api;
})();
