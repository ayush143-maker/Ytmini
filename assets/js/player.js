
(() => {
  "use strict";

  const CONFIG = Object.freeze({
    streamTimeoutMs: 5000,
    moduleTimeoutMs: 15000,
    historyIntervalMs: 15000,
    historyMinimumProgressDelta: 8,
    youtubeReadyTimeoutMs: 10000,
    streamLoadTimeoutMs: 10000,
    playStartTimeoutMs: 4000,
    barPollMs: 250,
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

  // Tiny event emitter so the page can react to playback without polling.
  const listeners = {
    play: new Set(),
    close: new Set(),
    ended: new Set(),
    state: new Set()
  };

  function emit(name, payload) {
    for (const handler of listeners[name] || []) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`AyuTube player "${name}" listener failed:`, error);
      }
    }
  }

  function on(name, handler) {
    listeners[name]?.add(handler);

    return () => listeners[name]?.delete(handler);
  }

  let activeStart = 0;
  let activeRate = 1;

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

  // ---------------------------------------------------------------------------
  // Loading: a thin pink line moves forward while the video loads. Playback
  // starts underneath it as soon as the player is ready, and the line is
  // removed the moment the player reports that the video is playing, so
  // the player's own paused screen never flashes in between.
  // ---------------------------------------------------------------------------

  let gate = null; // { token, finishing }
  let lineFrame = 0;
  let startTimer = 0;

  const prefersReducedMotion = () =>
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

  function stopLine() {
    cancelAnimationFrame(lineFrame);
    lineFrame = 0;
  }

  function buildLine() {
    const track = document.createElement("div");
    track.className = "load-line";

    const fill = document.createElement("i");
    track.append(fill);

    const label = document.createElement("span");
    label.className = "sr-only";
    label.textContent = "Loading video";
    track.append(label);

    return { track, fill };
  }

  function showLoading(token) {
    // Keep the line running if this play request is already showing it.
    if (gate && gate.token === token && !dom.message.hidden) return;

    stopLine();
    clearTimeout(startTimer);

    gate = { token, finishing: false };

    const { track, fill } = buildLine();

    dom.message.className = "player-message is-loading";
    dom.message.replaceChildren(track);
    dom.message.hidden = false;
    dom.message.setAttribute("role", "status");

    if (prefersReducedMotion()) {
      fill.style.transform = "scaleX(1)";
      return;
    }

    // Quick at first, then slower, never quite reaching the end by itself.
    const started = performance.now();

    const tick = (now) => {
      const progress = 0.92 * (1 - Math.exp(-(now - started) / 1800));

      fill.style.transform = `scaleX(${progress.toFixed(4)})`;
      lineFrame = requestAnimationFrame(tick);
    };

    lineFrame = requestAnimationFrame(tick);
  }

  /**
   * The video is playing (or cannot be waited for any longer): run the line
   * to the end and remove it.
   */
  function finishLoading() {
    if (!gate || gate.finishing) return;

    const current = gate;
    const fill = dom.message.querySelector(".load-line i");

    current.finishing = true;
    stopLine();
    clearTimeout(startTimer);

    if (!fill || prefersReducedMotion()) {
      hideMessage();
      return;
    }

    fill.style.transition = "transform 120ms linear";
    fill.style.transform = "scaleX(1)";

    setTimeout(() => {
      if (gate === current) hideMessage();
    }, 130);
  }

  /**
   * Safety net: if playback does not begin (autoplay blocked, slow network),
   * remove the line so the player's own play button is reachable.
   */
  function armStartFallback(token) {
    clearTimeout(startTimer);

    startTimer = setTimeout(() => {
      if (isCurrent(token)) finishLoading();
    }, CONFIG.playStartTimeoutMs);
  }

  function showMessage(text, isError = false) {
    gate = null;
    stopLine();
    clearTimeout(startTimer);

    dom.message.className = "player-message";
    dom.message.replaceChildren();
    dom.message.textContent = text;
    dom.message.hidden = false;
    dom.message.setAttribute(
      "role",
      isError ? "alert" : "status"
    );
  }

  function hideMessage() {
    gate = null;
    stopLine();
    clearTimeout(startTimer);

    dom.message.className = "player-message";
    dom.message.hidden = true;
    dom.message.replaceChildren();
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

  function youtubeEmbedUrl(id, start = 0, autoplay = true, clean = false) {
    const url = new URL(
      `https://www.youtube.com/embed/${encodeURIComponent(id)}`
    );

    if (autoplay) url.searchParams.set("autoplay", "1");
    url.searchParams.set("playsinline", "1");
    url.searchParams.set("rel", "0");
    url.searchParams.set("enablejsapi", "1");

    if (clean) {
      // Our own bar replaces YouTube's: no control bar, no keyboard
      // shortcuts, no YouTube fullscreen button, no annotations.
      url.searchParams.set("controls", "0");
      url.searchParams.set("disablekb", "1");
      url.searchParams.set("fs", "0");
      url.searchParams.set("iv_load_policy", "3");
    }

    if (start > 0) {
      url.searchParams.set("start", String(Math.floor(start)));
    }

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

    hideBar();
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
  // Clean controls: our own play / seek / mute / fullscreen bar, placed under
  // the video (never over it). OFF by default (YouTube's own controls); the
  // Account tab can switch it on. Applies to the next video.
  // ---------------------------------------------------------------------------

  const CLEAN_KEY = "ayutube.clean";

  function cleanControlsOn() {
    try {
      return JSON.parse(localStorage.getItem(CLEAN_KEY)) === true;
    } catch {
      return false;
    }
  }

  const SVG_NS = "http://www.w3.org/2000/svg";

  // [path, "fill" | "stroke"]
  const ICONS = Object.freeze({
    play: [["M7 4.5v15l12-7.5z", "fill"]],
    pause: [["M6 4.5h4.5v15H6zM13.5 4.5H18v15h-4.5z", "fill"]],
    volume: [
      ["M3 9v6h4l5 4V5L7 9z", "fill"],
      ["M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13", "stroke"]
    ],
    muted: [
      ["M3 9v6h4l5 4V5L7 9z", "fill"],
      ["M16 9.5l5 5M21 9.5l-5 5", "stroke"]
    ],
    expand: [["M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5", "stroke"]],
    shrink: [["M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5", "stroke"]]
  });

  const bar = {
    root: null,
    play: null,
    mute: null,
    full: null,
    range: null,
    now: null,
    total: null,
    timer: 0,
    dragging: false
  };

  function iconSvg(name) {
    const svg = document.createElementNS(SVG_NS, "svg");

    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    for (const [d, kind] of ICONS[name]) {
      const path = document.createElementNS(SVG_NS, "path");

      path.setAttribute("d", d);

      if (kind === "fill") {
        path.setAttribute("fill", "currentColor");
      } else {
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "currentColor");
        path.setAttribute("stroke-width", "2");
      }

      svg.append(path);
    }

    return svg;
  }

  function setBarIcon(button, name, label) {
    if (button.dataset.icon !== name) {
      button.dataset.icon = name;
      button.replaceChildren(iconSvg(name));
    }

    button.setAttribute("aria-label", label);
  }

  function formatClock(value) {
    const total = Math.max(0, Math.floor(Number(value) || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = String(total % 60).padStart(2, "0");

    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${sec}`
      : `${m}:${sec}`;
  }

  /** Current state of whichever engine is active, or null. */
  function mediaState() {
    try {
      if (activeMode === "direct") {
        const duration = Number(dom.video.duration);

        return {
          playing: !dom.video.paused && !dom.video.ended,
          time: Number(dom.video.currentTime) || 0,
          duration: Number.isFinite(duration) ? duration : 0,
          muted: Boolean(dom.video.muted)
        };
      }

      if (activeMode === "youtube" && youtubePlayer?.getPlayerState) {
        const states = window.YT?.PlayerState;
        const state = youtubePlayer.getPlayerState();

        return {
          playing:
            Boolean(states) &&
            (state === states.PLAYING || state === states.BUFFERING),
          time: Number(youtubePlayer.getCurrentTime()) || 0,
          duration: Number(youtubePlayer.getDuration()) || 0,
          muted: Boolean(youtubePlayer.isMuted?.())
        };
      }
    } catch {
      // The engine is not ready yet.
    }

    return null;
  }

  function toggleMute() {
    const state = mediaState();

    if (!state) return;

    try {
      if (activeMode === "direct") {
        dom.video.muted = !state.muted;
      } else if (state.muted) {
        youtubePlayer.unMute();
      } else {
        youtubePlayer.mute();
      }
    } catch (error) {
      console.debug("AyuTube could not change volume:", error);
    }

    syncBar();
  }

  function toggleFullscreen() {
    const target = dom.panel.querySelector(".watch-player");
    const active = document.fullscreenElement || document.webkitFullscreenElement;

    try {
      if (active) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } else if (target) {
        (target.requestFullscreen || target.webkitRequestFullscreen).call(target);
      }
    } catch (error) {
      console.debug("AyuTube could not change fullscreen:", error);
    }
  }

  function paintRange() {
    bar.range.style.setProperty("--p", `${Number(bar.range.value) / 10}%`);
  }

  function ensureBar() {
    if (bar.root) return bar.root;

    // Structure: .watch-player > (.video-frame > video), then this bar.
    const host = dom.video.parentElement?.parentElement;

    if (!host) return null;

    const root = document.createElement("div");
    root.className = "clean-bar";
    root.hidden = true;
    root.setAttribute("role", "group");
    root.setAttribute("aria-label", "Video controls");

    const makeButton = () => {
      const button = document.createElement("button");

      button.type = "button";
      button.className = "clean-btn";

      return button;
    };

    bar.play = makeButton();
    bar.play.addEventListener("click", () => {
      if (mediaState()?.playing) pause();
      else resume();

      setTimeout(syncBar, 120);
    });

    bar.now = document.createElement("span");
    bar.now.className = "clean-time";
    bar.now.textContent = "0:00";

    bar.range = document.createElement("input");
    bar.range.type = "range";
    bar.range.className = "clean-range";
    bar.range.min = "0";
    bar.range.max = "1000";
    bar.range.step = "1";
    bar.range.value = "0";
    bar.range.disabled = true;
    bar.range.setAttribute("aria-label", "Seek");

    bar.range.addEventListener("input", () => {
      bar.dragging = true;

      const duration = mediaState()?.duration || 0;

      bar.now.textContent = formatClock((duration * bar.range.value) / 1000);
      paintRange();
    });

    bar.range.addEventListener("change", () => {
      const duration = mediaState()?.duration || 0;

      if (duration > 0) seek((duration * bar.range.value) / 1000);

      bar.dragging = false;
      setTimeout(syncBar, 120);
    });

    bar.total = document.createElement("span");
    bar.total.className = "clean-time";
    bar.total.textContent = "0:00";

    bar.mute = makeButton();
    bar.mute.addEventListener("click", toggleMute);

    root.append(bar.play, bar.now, bar.range, bar.total, bar.mute);

    // iPhone Safari cannot fullscreen a page element, so no button there.
    if (document.fullscreenEnabled || document.webkitFullscreenEnabled) {
      bar.full = makeButton();
      bar.full.addEventListener("click", toggleFullscreen);
      root.append(bar.full);
    }

    setBarIcon(bar.play, "play", "Play");
    setBarIcon(bar.mute, "volume", "Mute");
    if (bar.full) setBarIcon(bar.full, "expand", "Fullscreen");

    host.append(root);
    bar.root = root;

    return root;
  }

  function syncBar() {
    if (!bar.root || bar.root.hidden) return;

    const state = mediaState();

    if (!state) return;

    setBarIcon(bar.play, state.playing ? "pause" : "play", state.playing ? "Pause" : "Play");
    setBarIcon(bar.mute, state.muted ? "muted" : "volume", state.muted ? "Unmute" : "Mute");

    if (bar.full) {
      const full = Boolean(document.fullscreenElement || document.webkitFullscreenElement);

      setBarIcon(bar.full, full ? "shrink" : "expand", full ? "Exit fullscreen" : "Fullscreen");
    }

    bar.range.disabled = !(state.duration > 0);
    bar.total.textContent = formatClock(state.duration);

    if (!bar.dragging) {
      bar.range.value =
        state.duration > 0
          ? String(Math.min(1000, Math.round((state.time / state.duration) * 1000)))
          : "0";
      bar.now.textContent = formatClock(state.time);
    }

    paintRange();
  }

  function showBar() {
    if (!ensureBar()) return;

    bar.root.hidden = false;
    clearInterval(bar.timer);
    bar.timer = setInterval(syncBar, CONFIG.barPollMs);
    syncBar();
  }

  function hideBar() {
    clearInterval(bar.timer);
    bar.timer = 0;
    bar.dragging = false;

    if (bar.root) bar.root.hidden = true;
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

  function historyPaused() {
    try {
      return localStorage.getItem("ayutube.noHistory") === "true";
    } catch {
      return false;
    }
  }

  function queueHistory(force = false) {
    if (!activeItem) return;

    // "Pause history" is on: watch progress is not saved.
    if (historyPaused()) return;

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

      finishLoading();
      queueHistory(true);
      emit("state", "playing");
    };

    dom.video.ontimeupdate = () => {
      if (!isCurrent(token) || activeMode !== "direct") return;

      queueHistory(false);
    };

    dom.video.onpause = () => {
      if (!isCurrent(token) || activeMode !== "direct") return;

      queueHistory(true);
      emit("state", "paused");
    };

    dom.video.onended = () => {
      if (!isCurrent(token) || activeMode !== "direct") return;

      queueHistory(true);
      emit("state", "ended");
      emit("ended", item);
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

    const clean = cleanControlsOn();

    dom.video.hidden = false;
    dom.video.controls = !clean;
    dom.video.playsInline = true;
    dom.video.preload = "metadata";
    dom.video.src = stream.url;
    dom.video.playbackRate = activeRate;

    if (activeStart > 0) {
      dom.video.addEventListener(
        "loadedmetadata",
        () => {
          try {
            dom.video.currentTime = activeStart;
          } catch {
            // Seeking is best effort.
          }
        },
        { once: true }
      );
    }

    const iframe = getIframe();
    iframe.hidden = true;
    iframe.removeAttribute("src");

    bindDirectVideoEvents(item, token);

    // Wait until the stream is usable. A load error is handled by the
    // video's onerror handler (it switches to the YouTube player).
    const outcome = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => finish(() => reject(new Error("The stream took too long to load."))),
        CONFIG.streamLoadTimeoutMs
      );

      function finish(done) {
        clearTimeout(timer);
        dom.video.removeEventListener("loadedmetadata", onReady);
        dom.video.removeEventListener("error", onError);
        done();
      }

      function onReady() {
        finish(() => resolve("ready"));
      }

      function onError() {
        finish(() => resolve("error"));
      }

      dom.video.addEventListener("loadedmetadata", onReady, { once: true });
      dom.video.addEventListener("error", onError, { once: true });
    });

    if (outcome !== "ready" || !isCurrent(token) || activeMode !== "direct") {
      return;
    }

    if (clean) showBar();

    // Start right away, under the line. The "playing" event removes it.
    dom.video.play()?.catch?.(() => {
      // Autoplay restrictions are not a stream failure; controls remain.
    });

    armStartFallback(token);
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
      finishLoading();
      queueHistory(true);
      emit("state", "playing");

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
      emit("state", "paused");
      return;
    }

    if (state === states.ENDED) {
      clearYoutubeProgressTimer();
      queueHistory(true);
      emit("state", "ended");
      emit("ended", activeItem);
    }
  }

  function handleYouTubeError(error, token) {
    if (!isCurrent(token)) return;

    clearYoutubeProgressTimer();

    console.warn("YouTube embed returned an error:", error?.data);

    hideBar();

    showMessage(
      "This video can't be played here.",
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
      iframe.title = item.title;
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      iframe.allowFullscreen = true;
      iframe.allow =
        "autoplay; encrypted-media; picture-in-picture; fullscreen";

      showLoading(token);

      // Clean controls: hide YouTube's bar and show ours under the video.
      const clean = cleanControlsOn();

      // When YT.Player receives an existing <iframe>, it attaches to that
      // iframe's current src (videoId/playerVars are ignored). The src must
      // therefore already be the embed URL with enablejsapi=1.
      iframe.src = youtubeEmbedUrl(item.id, activeStart, false, clean);

      let playerReady = false;

      // If the player never reports ready (blocked embed, network problem),
      // stop showing "Loading…" forever and offer the YouTube link instead.
      setTimeout(() => {
        if (playerReady || !isCurrent(token) || activeMode !== "youtube") {
          return;
        }

        handleYouTubeError({ data: "ready-timeout" }, token);
      }, CONFIG.youtubeReadyTimeoutMs);

      youtubePlayer = new YT.Player(iframe, {
        events: {
          onReady: (event) => {
            playerReady = true;

            if (!isCurrent(token)) {
              try {
                event.target.destroy();
              } catch {}
              return;
            }

            try {
              event.target.setPlaybackRate(activeRate);
            } catch {
              // Not every video supports every speed.
            }

            if (clean) showBar();

            // Start right away, under the line. The PLAYING state removes it.
            try {
              event.target.playVideo();
            } catch {
              // The player controls remain available.
            }

            armStartFallback(token);
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

      iframe.src = youtubeEmbedUrl(item.id, activeStart);

      // This path is used only if the IFrame API itself is unavailable.
      // The embed autoplays and cannot report playback time; the line stays
      // until the frame has loaded.
      showLoading(token);

      const ready = () => {
        if (isCurrent(token)) finishLoading();
      };

      iframe.addEventListener("load", ready, { once: true });
      setTimeout(ready, CONFIG.youtubeReadyTimeoutMs);
    } catch {
      showMessage("This video can't be played here.", true);
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

    showLoading(token);

    await attachYouTubePlayer(item, token);
  }

  // ---------------------------------------------------------------------------
  // Main player API
  // ---------------------------------------------------------------------------

  async function play(rawItem, options = {}) {
    let item;

    try {
      item = normalizeItem(rawItem);
    } catch (error) {
      showMessage(error.message || "Select a valid video.", true);
      return;
    }

    const token = ++activeToken;

    const start = Number(options?.start);
    activeStart = Number.isFinite(start) && start > 0 ? Math.floor(start) : 0;

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

    emit("play", item);

    // The YouTube link remains hidden unless the embed reports an error.
    dom.watchLink.href = youtubeWatchUrl(item.id);
    dom.watchLink.hidden = true;

    showLoading(token);

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

    emit("close");
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

  function commandIframe(func, args = []) {
    const iframe = document.getElementById("youtube-player");

    iframe?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func, args }),
      "https://www.youtube.com"
    );
  }

  /** Continue playback after pause(). */
  function resume() {
    if (!activeItem) return;

    try {
      if (activeMode === "direct") {
        dom.video.play()?.catch?.(() => {});
      } else if (activeMode === "youtube" && youtubePlayer) {
        youtubePlayer.playVideo();
      } else if (activeMode === "youtube-iframe") {
        commandIframe("playVideo");
      }
    } catch (error) {
      console.debug("AyuTube could not resume playback:", error);
    }
  }

  /** True when the current position can be read (not the bare iframe mode). */
  function canTrackTime() {
    return (
      activeMode === "direct" ||
      (activeMode === "youtube" &&
        typeof youtubePlayer?.getCurrentTime === "function")
    );
  }

  function getCurrentTime() {
    try {
      if (activeMode === "direct") return Number(dom.video.currentTime) || 0;

      if (activeMode === "youtube" && youtubePlayer?.getCurrentTime) {
        return Number(youtubePlayer.getCurrentTime()) || 0;
      }
    } catch {
      // Fall through to 0.
    }

    return 0;
  }

  function seek(seconds) {
    const target = Math.max(0, Number(seconds) || 0);

    if (!activeItem) return;

    try {
      if (activeMode === "direct") {
        dom.video.currentTime = target;
      } else if (activeMode === "youtube" && youtubePlayer) {
        youtubePlayer.seekTo(target, true);
      } else if (activeMode === "youtube-iframe") {
        commandIframe("seekTo", [target, true]);
      }
    } catch (error) {
      console.debug("AyuTube could not seek:", error);
    }
  }

  const RATES = Object.freeze([0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);

  function setRate(rate) {
    const value = Number(rate);

    if (!RATES.includes(value)) return activeRate;

    activeRate = value;

    try {
      if (activeMode === "direct") {
        dom.video.playbackRate = value;
      } else if (activeMode === "youtube" && youtubePlayer) {
        youtubePlayer.setPlaybackRate(value);
      } else if (activeMode === "youtube-iframe") {
        commandIframe("setPlaybackRate", [value]);
      }
    } catch (error) {
      console.debug("AyuTube could not change speed:", error);
    }

    return activeRate;
  }

  /**
   * Fill in details that were unknown when playback started (for example a
   * shared link that only carried the video ID).
   */
  function updateDetails(details = {}) {
    if (!activeItem) return;

    if (typeof details.title === "string" && details.title.trim()) {
      activeItem.title = details.title.trim().slice(0, 500);
      dom.title.textContent = activeItem.title;
    }

    if (typeof details.uploaderName === "string") {
      activeItem.uploaderName = details.uploaderName.slice(0, 300);
      dom.channel.textContent = activeItem.uploaderName;
    }

    if (
      typeof details.thumbnail === "string" &&
      details.thumbnail.startsWith("https://")
    ) {
      activeItem.thumbnail = details.thumbnail.slice(0, 2000);
    }
  }

  window.AyuTubePlayer = Object.freeze({
    play,
    close,
    pause,
    resume,
    updateDetails,
    isActive,
    seek,
    setRate,
    getRate: () => activeRate,
    cleanControlsOn,
    rates: RATES,
    getCurrentTime,
    canTrackTime,
    on
  });

  // Keep compatibility with the original app.js and any existing callers.
  window.MiniTubePlayer = window.AyuTubePlayer;
})();
