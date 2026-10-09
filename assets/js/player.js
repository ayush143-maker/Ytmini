
(() => {
  "use strict";

  const CONFIG = Object.freeze({
    streamTimeoutMs: 15000,
    moduleTimeoutMs: 15000,
    historyIntervalMs: 15000,
    historyMinimumProgressDelta: 8,
    validIdPattern: /^[A-Za-z0-9_-]{6,20}$/
  });

  const MODULE_PATHS = Object.freeze({
    supabase: "/assets/js/supabase.js",
    auth: "/assets/js/auth.js",
    library: "/assets/js/library.js"
  });

  const dom = {
    video: document.getElementById("video-player"),
    message: document.getElementById("player-message"),
    title: document.getElementById("player-title"),
    channel: document.getElementById("player-channel"),
    watchLink: document.getElementById("watch-youtube"),
    panel: document.getElementById("player-panel"),
    closeButton: document.getElementById("close-player")
  };

  const scriptPromises = new Map();

  let activeItem = null;
  let activeToken = 0;
  let activeMode = "idle";
  let youtubePlayer = null;
  let youtubeApiPromise = null;
  let youtubeProgressTimer = null;

  let historyAuthStatus = "unknown";
  let lastHistoryQueuedAt = 0;
  let lastQueuedProgress = -1;
  let historyWritePromise = null;
  let pendingHistory = null;

  const hasRequiredElements = Boolean(
    dom.video &&
    dom.message &&
    dom.title &&
    dom.channel &&
    dom.watchLink &&
    dom.panel &&
    dom.closeButton
  );

  if (!hasRequiredElements) {
    console.error(
      "AyuTube player could not initialize: required HTML elements are missing."
    );
    return;
  }

  // ---------------------------------------------------------------------------
  // General helpers
  // ---------------------------------------------------------------------------

  function getIframe() {
    let iframe = document.getElementById("youtube-player");

    if (iframe) return iframe;

    const frame = dom.video.parentElement;

    if (!frame) {
      throw new Error("The video player container is missing.");
    }

    iframe = document.createElement("iframe");
    iframe.id = "youtube-player";
    iframe.title = "YouTube video player";
    iframe.hidden = true;
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.allow =
      "autoplay; encrypted-media; picture-in-picture; fullscreen";

    frame.append(iframe);

    return iframe;
  }

  function showMessage(text, isError = false) {
    dom.message.replaceChildren();
    dom.message.textContent = text;
    dom.message.hidden = false;
    dom.message.setAttribute(
      "role",
      isError ? "alert" : "status"
    );
  }

  function hideMessage() {
    dom.message.hidden = true;
    dom.message.textContent = "";
  }

  function getVideoId(item) {
    if (!item || typeof item !== "object") return "";

    const directId = String(item.id || item.videoId || "").trim();

    if (CONFIG.validIdPattern.test(directId)) {
      return directId;
    }

    const url = typeof item.url === "string" ? item.url : "";

    try {
      const parsed = new URL(url);

      if (
        parsed.hostname === "youtu.be" ||
        parsed.hostname.endsWith(".youtu.be")
      ) {
        const id = parsed.pathname.split("/").filter(Boolean)[0] || "";

        return CONFIG.validIdPattern.test(id) ? id : "";
      }

      if (
        parsed.hostname === "youtube.com" ||
        parsed.hostname.endsWith(".youtube.com")
      ) {
        const id =
          parsed.searchParams.get("v") ||
          parsed.pathname.match(/\/(?:embed|shorts)\/([^/]+)/)?.[1] ||
          "";

        return CONFIG.validIdPattern.test(id) ? id : "";
      }
    } catch {
      return "";
    }

    return "";
  }

  function normalizeItem(item) {
    const id = getVideoId(item);

    if (!id) {
      throw new Error("This video has an invalid ID.");
    }

    const title =
      typeof item.title === "string" && item.title.trim()
        ? item.title.trim().slice(0, 500)
        : "Untitled video";

    const channel =
      item.uploaderName ||
      item.channelTitle ||
      item.channel ||
      "";

    const thumbnail = item.thumbnail || item.thumbnailUrl || "";

    return {
      id,
      title,
      uploaderName:
        typeof channel === "string" ? channel.slice(0, 300) : "",
      thumbnail:
        typeof thumbnail === "string" ? thumbnail.slice(0, 2000) : ""
    };
  }

  function youtubeWatchUrl(id) {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
  }

  function youtubeEmbedUrl(id) {
    const url = new URL(
      `https://www.youtube.com/embed/${encodeURIComponent(id)}`
    );

    url.searchParams.set("autoplay", "1");
    url.searchParams.set("playsinline", "1");
    url.searchParams.set("rel", "0");
    url.searchParams.set("enablejsapi", "1");

    if (location.protocol === "https:" || location.protocol === "http:") {
      url.searchParams.set("origin", location.origin);
    }

    return url.href;
  }

  function isCurrent(token) {
    return token === activeToken && Boolean(activeItem);
  }

  function clearYoutubeProgressTimer() {
    if (youtubeProgressTimer !== null) {
      clearInterval(youtubeProgressTimer);
      youtubeProgressTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Media cleanup
  // ---------------------------------------------------------------------------

  function destroyYoutubePlayer() {
    clearYoutubeProgressTimer();

    if (youtubePlayer) {
      try {
        youtubePlayer.destroy();
      } catch (error) {
        console.debug("YouTube player cleanup:", error);
      }

      youtubePlayer = null;
    }

    // The IFrame API can replace its target element.
    // Recreate a missing iframe so the next video can still play.
    try {
      const iframe = getIframe();
      iframe.removeAttribute("src");
      iframe.hidden = true;
    } catch (error) {
      console.error("Unable to reset YouTube iframe:", error);
    }
  }

  function resetMedia() {
    try {
      dom.video.pause();
    } catch {
      // The media element may not have started yet.
    }

    dom.video.onerror = null;
    dom.video.onplaying = null;
    dom.video.onpause = null;
    dom.video.onended = null;
    dom.video.ontimeupdate = null;

    dom.video.removeAttribute("src");
    dom.video.load();
    dom.video.hidden = true;

    destroyYoutubePlayer();

    hideMessage();
    dom.watchLink.hidden = true;
  }

  function showWatchLink() {
    dom.watchLink.href = youtubeWatchUrl(activeItem.id);
    dom.watchLink.target = "_blank";
    dom.watchLink.rel = "noopener noreferrer";
    dom.watchLink.textContent = "Watch on YouTube ↗";
    dom.watchLink.hidden = false;
  }

  // ---------------------------------------------------------------------------
  // Supabase library integration
  // ---------------------------------------------------------------------------

  function loadModuleScript(path, isReady) {
    if (isReady()) return Promise.resolve();

    if (scriptPromises.has(path)) {
      return scriptPromises.get(path);
    }

    const promise = new Promise((resolve, reject) => {
      const existing = [...document.scripts].find((script) => {
        try {
          return new URL(script.src, location.href).pathname === path;
        } catch {
          return false;
        }
      });

      let script = existing;
      let settled = false;

      const timeout = setTimeout(() => {
        finish(new Error(`Timed out loading ${path}.`));
      }, CONFIG.moduleTimeoutMs);

      function finish(error) {
        if (settled) return;
        settled = true;

        clearTimeout(timeout);

        if (script) {
          script.removeEventListener("load", onLoad);
          script.removeEventListener("error", onError);
        }

        if (error) {
          reject(error);
        } else if (isReady()) {
          resolve();
        } else {
          reject(new Error(`Module did not initialize: ${path}.`));
        }
      }

      function onLoad() {
        if (script) script.dataset.loaded = "true";
        finish();
      }

      function onError() {
        finish(new Error(`Could not load ${path}.`));
      }

      if (existing?.dataset.loaded === "true") {
        clearTimeout(timeout);
        settled = true;

        if (isReady()) {
          resolve();
        } else {
          reject(new Error(`Module did not initialize: ${path}.`));
        }

        return;
      }

      script = existing || document.createElement("script");

      script.addEventListener("load", onLoad, { once: true });
      script.addEventListener("error", onError, { once: true });

      if (!existing) {
        script.src = path;
        script.async = true;
        document.body.append(script);
      }
    });

    scriptPromises.set(path, promise);

    promise.catch(() => {
      scriptPromises.delete(path);
    });

    return promise;
  }

  async function ensureLibrary() {
    if (!window.AyuTubeSupabase?.getClient) {
      await loadModuleScript(
        MODULE_PATHS.supabase,
        () => Boolean(window.AyuTubeSupabase?.getClient)
      );
    }

    if (!window.AyuTubeAuth?.getCurrentUser) {
      await loadModuleScript(
        MODULE_PATHS.auth,
        () => Boolean(window.AyuTubeAuth?.getCurrentUser)
      );
    }

    if (!window.AyuTubeLibrary?.saveHistoryEntry) {
      await loadModuleScript(
        MODULE_PATHS.library,
        () => Boolean(window.AyuTubeLibrary?.saveHistoryEntry)
      );
    }
  }

  function currentProgress() {
    if (!activeItem) {
      return { progressSeconds: 0, durationSeconds: null };
    }

    if (activeMode === "direct") {
      return {
        progressSeconds: safeSeconds(dom.video.currentTime),
        durationSeconds: safeDuration(dom.video.duration)
      };
    }

    if (activeMode === "youtube" && youtubePlayer) {
      try {
        return {
          progressSeconds: safeSeconds(youtubePlayer.getCurrentTime()),
          durationSeconds: safeDuration(youtubePlayer.getDuration())
        };
      } catch {
        // The player may not be ready to report progress.
      }
    }

    return { progressSeconds: 0, durationSeconds: null };
  }

  function safeSeconds(value) {
    return Number.isFinite(value) && value >= 0
      ? Math.floor(value)
      : 0;
  }

  function safeDuration(value) {
    return Number.isFinite(value) && value >= 0
      ? Math.floor(value)
      : null;
  }

  function queueHistory(force = false) {
    if (!activeItem) return;

    const progress = currentProgress();
    const now = Date.now();

    if (!force) {
      const enoughTimePassed =
        now - lastHistoryQueuedAt >= CONFIG.historyIntervalMs;

      const enoughProgress =
        Math.abs(progress.progressSeconds - lastQueuedProgress) >=
        CONFIG.historyMinimumProgressDelta;

      if (!enoughTimePassed || !enoughProgress) {
        return;
      }
    }

    lastHistoryQueuedAt = now;
    lastQueuedProgress = progress.progressSeconds;

    pendingHistory = {
      item: { ...activeItem },
      progress,
      token: activeToken
    };

    void flushHistory();
  }

  async function flushHistory() {
    if (historyWritePromise) return historyWritePromise;

    historyWritePromise = (async () => {
      while (pendingHistory) {
        const snapshot = pendingHistory;
        pendingHistory = null;

        if (!snapshot.item?.id) continue;

        try {
          await ensureLibrary();

          const currentUser = await window.AyuTubeAuth.getCurrentUser();

          // Watch history is private and only recorded for signed-in users.
          if (!currentUser) {
            historyAuthStatus = "signed-out";
            continue;
          }

          historyAuthStatus = "signed-in";

          await window.AyuTubeLibrary.saveHistoryEntry(
            snapshot.item,
            snapshot.progress
          );
        } catch (error) {
          // Do not interrupt video playback if the optional library service
          // is offline or not configured yet.
          console.debug(
            "AyuTube could not save playback history:",
            error.message
          );
        }
      }
    })().finally(() => {
      historyWritePromise = null;

      if (pendingHistory) {
        void flushHistory();
      }
    });

    return historyWritePromise;
  }

  // ---------------------------------------------------------------------------
  // Direct media playback
  // ---------------------------------------------------------------------------

  function bindDirectVideoEvents(item, token) {
    dom.video.onplaying = () => {
      if (!isCurrent(token) || activeMode !== "direct") return;

      hideMessage();
      queueHistory(true);
    };

    dom.video.ontimeupdate = () => {
      if (!isCurrent(token) || activeMode !== "direct") return;

      queueHistory(false);
    };

    dom.video.onpause = () => {
      if (!isCurrent(token) || activeMode !== "direct") return;

      queueHistory(true);
    };

    dom.video.onended = () => {
      if (!isCurrent(token) || activeMode !== "direct") return;

      queueHistory(true);
    };

    dom.video.onerror = () => {
      if (!isCurrent(token) || activeMode !== "direct") return;

      useYouTubeFallback(item, token);
    };
  }

  function validateStreamUrl(value) {
    if (typeof value !== "string" || !value.trim()) {
      return false;
    }

    try {
      const url = new URL(value);

      // HTTPS prevents mixed-content playback on the deployed site.
      return url.protocol === "https:" && Boolean(url.hostname);
    } catch {
      return false;
    }
  }

  function validateStream(stream) {
    if (!stream || typeof stream !== "object") return false;
    if (!validateStreamUrl(stream.url)) return false;

    if (stream.mimeType) {
      return /^(video|audio)\/(mp4|webm)(?:;|$)/i.test(stream.mimeType);
    }

    return true;
  }

  async function tryDirectPlayback(item, token) {
    if (!window.MiniTubeAPI?.streams) {
      throw new Error("The stream API is not ready.");
    }

    let timeoutId;

    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error("Stream lookup timed out."));
      }, CONFIG.streamTimeoutMs);
    });

    let response;

    try {
      response = await Promise.race([
        window.MiniTubeAPI.streams(item.id),
        timeout
      ]);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!isCurrent(token)) return;

    const streams = Array.isArray(response?.videoStreams)
      ? response.videoStreams
      : [];

    const playable = streams
      .filter(validateStream)
      .sort(
        (a, b) =>
          Number(Boolean(a.videoOnly)) -
          Number(Boolean(b.videoOnly))
      );

    if (!playable.length) {
      throw new Error("No compatible direct stream.");
    }

    const stream = playable[0];

    activeMode = "direct";

    destroyYoutubePlayer();

    dom.video.hidden = false;
    dom.video.controls = true;
    dom.video.playsInline = true;
    dom.video.preload = "metadata";
    dom.video.src = stream.url;

    const iframe = getIframe();
    iframe.hidden = true;
    iframe.removeAttribute("src");

    bindDirectVideoEvents(item, token);
    hideMessage();

    try {
      await dom.video.play();
    } catch (error) {
      if (!isCurrent(token)) return;

      // Browser autoplay restrictions should not be treated as stream failure.
      if (
        error?.name === "NotAllowedError" ||
        error?.name === "AbortError"
      ) {
        hideMessage();
        return;
      }

      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // YouTube iframe API
  // ---------------------------------------------------------------------------

  function loadYouTubeApi() {
    if (window.YT?.Player) {
      return Promise.resolve(window.YT);
    }

    if (youtubeApiPromise) return youtubeApiPromise;

    youtubeApiPromise = new Promise((resolve, reject) => {
      let settled = false;

      const previousCallback = window.onYouTubeIframeAPIReady;

      const timeout = setTimeout(() => {
        finish(new Error("The YouTube player API timed out."));
      }, 12000);

      function finish(error) {
        if (settled) return;
        settled = true;

        clearTimeout(timeout);

        if (error) {
          reject(error);
        } else if (window.YT?.Player) {
          resolve(window.YT);
        } else {
          reject(new Error("The YouTube player API is unavailable."));
        }
      }

      window.onYouTubeIframeAPIReady = () => {
        try {
          if (typeof previousCallback === "function") {
            previousCallback();
          }
        } catch (error) {
          console.debug("Previous YouTube API callback failed:", error);
        }

        finish();
      };

      const existingScript = [...document.scripts].find((script) => {
        try {
          return new URL(script.src).pathname === "/iframe_api" &&
            new URL(script.src).hostname === "www.youtube.com";
        } catch {
          return false;
        }
      });

      if (!existingScript) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        script.async = true;
        script.onerror = () => {
          finish(new Error("Unable to load the YouTube player API."));
        };

        document.head.append(script);
      }
    }).catch((error) => {
      youtubeApiPromise = null;
      throw error;
    });

    return youtubeApiPromise;
  }

  function handleYouTubeState(event, token) {
    if (!isCurrent(token)) return;

    const state = event?.data;
    const states = window.YT?.PlayerState;

    if (!states) return;

    if (state === states.PLAYING) {
      hideMessage();
      queueHistory(true);

      clearYoutubeProgressTimer();

      youtubeProgressTimer = setInterval(() => {
        if (!isCurrent(token) || activeMode !== "youtube") {
          clearYoutubeProgressTimer();
          return;
        }

        queueHistory(false);
      }, CONFIG.historyIntervalMs);

      return;
    }

    if (state === states.PAUSED) {
      clearYoutubeProgressTimer();
      queueHistory(true);
      return;
    }

    if (state === states.ENDED) {
      clearYoutubeProgressTimer();
      queueHistory(true);
    }
  }

  function handleYouTubeError(error, token) {
    if (!isCurrent(token)) return;

    clearYoutubeProgressTimer();

    console.warn("YouTube embed returned an error:", error?.data);

    showMessage(
      "This video could not be played in the embedded player. Open it on YouTube instead.",
      true
    );

    showWatchLink();
  }

  async function attachYouTubePlayer(item, token) {
    try {
      const YT = await loadYouTubeApi();

      if (!isCurrent(token)) return;

      activeMode = "youtube";
      dom.video.hidden = true;
      dom.video.pause();

      const iframe = getIframe();

      iframe.hidden = false;
      iframe.removeAttribute("src");
      iframe.title = item.title;
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      iframe.allowFullscreen = true;
      iframe.allow =
        "autoplay; encrypted-media; picture-in-picture; fullscreen";

      showMessage("Loading YouTube player…");

      youtubePlayer = new YT.Player(iframe, {
        videoId: item.id,
        playerVars: {
          autoplay: 1,
          playsinline: 1,
          rel: 0,
          controls: 1,
          enablejsapi: 1,
          origin: location.origin
        },
        events: {
          onReady: (event) => {
            if (!isCurrent(token)) {
              try {
                event.target.destroy();
              } catch {}
              return;
            }

            hideMessage();

            try {
              event.target.playVideo();
            } catch {
              // The player controls remain available when autoplay is blocked.
            }
          },
          onStateChange: (event) => {
            handleYouTubeState(event, token);
          },
          onError: (event) => {
            handleYouTubeError(event, token);
          }
        }
      });
    } catch (error) {
      if (!isCurrent(token)) return;

      console.warn("YouTube API setup failed:", error.message);

      attachRawYouTubeIframe(item, token);
    }
  }

  function attachRawYouTubeIframe(item, token) {
    if (!isCurrent(token)) return;

    try {
      activeMode = "youtube-iframe";

      dom.video.hidden = true;
      dom.video.pause();

      const iframe = getIframe();

      iframe.hidden = false;
      iframe.title = item.title;
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      iframe.allowFullscreen = true;
      iframe.allow =
        "autoplay; encrypted-media; picture-in-picture; fullscreen";

      iframe.src = youtubeEmbedUrl(item.id);

      // This path is used only if the IFrame API itself is unavailable.
      // The embed can play, but reliable playback-time events are unavailable.
      hideMessage();
    } catch {
      showMessage("Unable to load this video. Open it on YouTube.", true);
      showWatchLink();
    }
  }

  async function useYouTubeFallback(item, token) {
    if (!isCurrent(token)) return;

    console.warn("Direct playback failed; using YouTube fallback.");

    clearYoutubeProgressTimer();

    try {
      dom.video.pause();
      dom.video.removeAttribute("src");
      dom.video.load();
    } catch {
      // Continue to the fallback player.
    }

    dom.video.onerror = null;
    dom.video.onplaying = null;
    dom.video.onpause = null;
    dom.video.onended = null;
    dom.video.ontimeupdate = null;

    const iframe = getIframe();
    iframe.hidden = false;

    showMessage("Direct playback unavailable. Opening YouTube…");

    await attachYouTubePlayer(item, token);
  }

  // ---------------------------------------------------------------------------
  // Main player API
  // ---------------------------------------------------------------------------

  async function play(rawItem) {
    let item;

    try {
      item = normalizeItem(rawItem);
    } catch (error) {
      showMessage(error.message || "Select a valid video.", true);
      return;
    }

    const token = ++activeToken;

    activeItem = item;
    activeMode = "loading";

    historyAuthStatus = "unknown";
    lastHistoryQueuedAt = 0;
    lastQueuedProgress = -1;
    pendingHistory = null;

    clearYoutubeProgressTimer();
    resetMedia();

    activeItem = item;
    activeMode = "loading";

    dom.panel.hidden = false;
    dom.title.textContent = item.title;
    dom.channel.textContent = item.uploaderName || "";

    // The YouTube link remains hidden unless the embed reports an error.
    dom.watchLink.href = youtubeWatchUrl(item.id);
    dom.watchLink.hidden = true;

    showMessage("Loading video…");

    try {
      dom.panel.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start"
      });
    } catch {
      // Scrolling is optional.
    }

    try {
      if (!window.MiniTubeAPI?.streams) {
        const existingApi = window.MiniTubeAPI || window.AyuTubeAPI;

        if (typeof existingApi?.streams !== "function") {
          throw new Error("The stream API is unavailable.");
        }
      }

      await tryDirectPlayback(item, token);
    } catch (error) {
      if (!isCurrent(token)) return;

      console.debug("Direct playback failed:", error.message);

      await useYouTubeFallback(item, token);
    }
  }

  function close() {
    // Invalidate pending network requests and media events before cleanup.
    activeToken += 1;
    activeItem = null;
    activeMode = "idle";

    pendingHistory = null;

    resetMedia();

    dom.panel.hidden = true;
    dom.title.textContent = "";
    dom.channel.textContent = "";
  }

  /**
   * Pause whatever is currently playing without closing the player.
   * Used when the person leaves the Explore tab.
   */
  function pause() {
    if (!activeItem) return;

    try {
      if (activeMode === "direct") {
        dom.video.pause();
        return;
      }

      if (activeMode === "youtube" && youtubePlayer) {
        youtubePlayer.pauseVideo();
        return;
      }

      if (activeMode === "youtube-iframe") {
        // The embed URL includes enablejsapi=1, so it accepts this command.
        const iframe = document.getElementById("youtube-player");

        iframe?.contentWindow?.postMessage(
          JSON.stringify({
            event: "command",
            func: "pauseVideo",
            args: []
          }),
          "https://www.youtube.com"
        );
      }
    } catch (error) {
      console.debug("AyuTube could not pause playback:", error);
    }
  }

  /**
   * True while a video is loaded in the player panel.
   */
  function isActive() {
    return Boolean(activeItem);
  }

  dom.closeButton.addEventListener("click", close);

  window.AyuTubePlayer = Object.freeze({
    play,
    close,
    pause,
    isActive
  });

  // Keep compatibility with the original app.js and any existing callers.
  window.MiniTubePlayer = window.AyuTubePlayer;
})();
