/*
 * AyuTube - video player.
 *
 * Playback runs in a native ExoPlayer (Media3) behind the transparent
 * WebView; this file draws the controls and gestures on top, modelled on
 * LibreTube's player (double-tap to seek, swipe for brightness and volume,
 * long-press for 2x speed, quality / speed / audio / aspect menu, fullscreen).
 *
 * Licensed under the GNU General Public License v3.0 (see LICENSE).
 */
(() => {
  "use strict";

  const CONFIG = Object.freeze({
    historyIntervalMs: 15000,
    historyMinimumProgressDelta: 8,
    startTimeoutMs: 25000,
    controlsHideMs: 3200,
    skipSeconds: 10,
    doubleTapMs: 280,
    longPressMs: 450,
    boostRate: 2,
    syncMs: 150,
    validIdPattern: /^[A-Za-z0-9_-]{6,20}$/
  });

  const RATES = Object.freeze([0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);
  const QUALITY_KEY = "ayutube.quality";
  const RESIZE_KEY = "ayutube.resize";
  const RESIZE_MODES = Object.freeze([
    { id: "fit", label: "Fit" },
    { id: "fill", label: "Stretch" },
    { id: "zoom", label: "Zoom" }
  ]);

  const dom = {
    frame: document.querySelector("#player-panel .video-frame"),
    message: document.getElementById("player-message"),
    title: document.getElementById("player-title"),
    channel: document.getElementById("player-channel"),
    watchLink: document.getElementById("watch-youtube"),
    panel: document.getElementById("player-panel"),
    closeButton: document.getElementById("close-player")
  };

  if (!Object.values(dom).every(Boolean)) {
    console.error("AyuTube player could not initialize: required HTML elements are missing.");
    return;
  }

  // Tiny event emitter so the page can react to playback without polling.
  const listeners = {
    play: new Set(),
    close: new Set(),
    ended: new Set(),
    state: new Set(),
    time: new Set()
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

  const bridge = () => window.AyuNativeBridge || null;
  const root = document.documentElement;

  const storage = {
    get(key, fallback) {
      try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : value;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, String(value));
      } catch {
        // Preferences are optional.
      }
    }
  };

  let activeItem = null;
  let activeToken = 0;
  let activeStart = 0;
  let activeRate = 1;
  let activeMode = "idle"; // idle | loading | native
  let info = null;
  let choice = { qualities: [], muxed: null };
  let selectedQuality = null;
  let selectedAudio = null;
  let triedMuxed = false;
  let lastState = {};
  let resizeMode = RESIZE_MODES.some((m) => m.id === storage.get(RESIZE_KEY, "fit"))
    ? storage.get(RESIZE_KEY, "fit")
    : "fit";
  let fullscreen = false;
  let wired = false;

  let lastHistoryQueuedAt = 0;
  let lastQueuedProgress = -1;
  let historyWritePromise = null;
  let pendingHistory = null;

  const isCurrent = (token) => token === activeToken && Boolean(activeItem);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function el(tag, className, text) {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
  }

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function formatClock(value) {
    const total = Math.max(0, Math.floor(Number(value) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = String(total % 60).padStart(2, "0");

    return hours
      ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
      : `${minutes}:${seconds}`;
  }

  function getVideoId(item) {
    if (!item || typeof item !== "object") return "";

    const directId = String(item.id || item.videoId || "").trim();

    if (CONFIG.validIdPattern.test(directId)) return directId;

    const url = typeof item.url === "string" ? item.url : "";

    try {
      const parsed = new URL(url);

      if (parsed.hostname === "youtu.be" || parsed.hostname.endsWith(".youtu.be")) {
        const id = parsed.pathname.split("/").filter(Boolean)[0] || "";
        return CONFIG.validIdPattern.test(id) ? id : "";
      }

      if (parsed.hostname === "youtube.com" || parsed.hostname.endsWith(".youtube.com")) {
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

    if (!id) throw new Error("This video has an invalid ID.");

    const title =
      typeof item.title === "string" && item.title.trim()
        ? item.title.trim().slice(0, 500)
        : "Untitled video";
    const channel = item.uploaderName || item.channelTitle || item.channel || "";
    const thumbnail = item.thumbnail || item.thumbnailUrl || "";

    return {
      id,
      title,
      uploaderName: typeof channel === "string" ? channel.slice(0, 300) : "",
      thumbnail: typeof thumbnail === "string" ? thumbnail.slice(0, 2000) : ""
    };
  }

  const youtubeWatchUrl = (id) => `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;

  // ---------------------------------------------------------------------------
  // Loading line and messages (shown over the video area)
  // ---------------------------------------------------------------------------

  let gate = null;
  let lineFrame = 0;
  let startTimer = 0;

  const prefersReducedMotion = () =>
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

  function stopLine() {
    cancelAnimationFrame(lineFrame);
    lineFrame = 0;
  }

  function showLoading(token) {
    if (gate && gate.token === token && !dom.message.hidden) return;

    stopLine();
    clearTimeout(startTimer);
    gate = { token, finishing: false };

    const track = el("div", "load-line");
    const fill = el("i");
    const label = el("span", "sr-only", "Loading video");

    track.append(fill, label);
    dom.message.className = "player-message is-loading";
    dom.message.replaceChildren(track);
    dom.message.hidden = false;
    dom.message.setAttribute("role", "status");

    if (prefersReducedMotion()) {
      fill.style.transform = "scaleX(1)";
      return;
    }

    const started = performance.now();
    const tick = (now) => {
      const progress = 0.92 * (1 - Math.exp(-(now - started) / 1800));
      fill.style.transform = `scaleX(${progress.toFixed(4)})`;
      lineFrame = requestAnimationFrame(tick);
    };

    lineFrame = requestAnimationFrame(tick);
  }

  function hideMessage() {
    gate = null;
    stopLine();
    clearTimeout(startTimer);
    dom.message.className = "player-message";
    dom.message.hidden = true;
    dom.message.replaceChildren();
  }

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

  function showError(text, detail) {
    gate = null;
    stopLine();
    clearTimeout(startTimer);

    const box = el("div", "player-error");

    box.append(el("p", "player-error-text", text));

    if (detail) box.append(el("p", "player-error-detail", String(detail).slice(0, 160)));

    const actions = el("div", "player-error-actions");
    const retry = el("button", "ay-action ay-action-primary", "Retry");

    retry.type = "button";
    retry.addEventListener("click", () => {
      if (!activeItem) return;
      play(activeItem, { start: Math.floor((lastState.positionMs || 0) / 1000) || activeStart });
    });
    actions.append(retry);
    box.append(actions);

    dom.message.className = "player-message";
    dom.message.replaceChildren(box);
    dom.message.hidden = false;
    dom.message.setAttribute("role", "alert");
    dom.watchLink.href = youtubeWatchUrl(activeItem?.id || "");
    dom.watchLink.hidden = false;
  }

  // ---------------------------------------------------------------------------
  // Controls (drawn over the transparent video area)
  // ---------------------------------------------------------------------------

  const SVG_NS = "http://www.w3.org/2000/svg";

  const ICONS = Object.freeze({
    play: "M8 5v14l11-7z",
    pause: "M6 19h4V5H6v14zm8-14v14h4V5h-4z",
    replay:
      "M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z",
    forward:
      "M18 13c0 3.31-2.69 6-6 6s-6-2.69-6-6 2.69-6 6-6v4l5-5-5-5v4c-4.42 0-8 3.58-8 8s3.58 8 8 8 8-3.58 8-8h-2z",
    settings:
      "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.5.5 0 0 0 .12-.61l-1.92-3.32a.5.5 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.49.42l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.5.5 0 0 0-.59.22L2.74 8.87a.5.5 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.5.5 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.49-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.5.5 0 0 0-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z",
    fullscreen: "M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z",
    fullscreenExit: "M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z",
    close:
      "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
    arrowLeft: "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z",
    check: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
    chevron: "M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z",
    chevronBack: "M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z",
    volume:
      "M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z",
    brightness:
      "M20 8.69V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69L23.31 12 20 8.69zM12 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12z",
    speed:
      "M13 2.05v3.03c3.39.49 6 3.39 6 6.92 0 .9-.18 1.75-.48 2.54l2.6 1.53c.56-1.24.88-2.62.88-4.07 0-5.18-3.95-9.45-9-9.95zM12 19c-3.87 0-7-3.13-7-7 0-3.53 2.61-6.43 6-6.92V2.05c-5.06.5-9 4.76-9 9.95 0 5.52 4.47 10 9.99 10 3.31 0 6.24-1.61 8.06-4.09l-2.6-1.53A6.95 6.95 0 0 1 12 19z"
  });

  function icon(name, extra) {
    const svg = document.createElementNS(SVG_NS, "svg");

    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    const path = document.createElementNS(SVG_NS, "path");

    path.setAttribute("d", ICONS[name]);
    path.setAttribute("fill", "currentColor");
    svg.append(path);

    if (extra) {
      const label = document.createElementNS(SVG_NS, "text");

      label.setAttribute("x", "12");
      label.setAttribute("y", "15.6");
      label.setAttribute("font-size", "6.5");
      label.setAttribute("font-weight", "700");
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("fill", "currentColor");
      label.textContent = extra;
      svg.append(label);
    }

    return svg;
  }

  function button(className, name, label, extra) {
    const node = el("button", `pl-btn ${className}`);

    node.type = "button";
    node.setAttribute("aria-label", label);
    node.append(icon(name, extra));

    return node;
  }

  function setIcon(node, name, label) {
    node.replaceChildren(icon(name));
    node.setAttribute("aria-label", label);
  }

  let ui = null;
  let hideTimer = 0;
  let dragging = false;

  function ensureUi() {
    if (ui) return ui;

    const rootNode = el("div", "pl-ui is-active");
    const surface = el("div", "pl-surface");

    const top = el("div", "pl-top");
    const exit = button("pl-exit", "arrowLeft", "Exit fullscreen");
    const title = el("div", "pl-title");
    const gear = button("pl-gear", "settings", "Playback settings");

    top.append(exit, title, gear);

    const mid = el("div", "pl-mid");
    const back = button("pl-skip", "replay", `Back ${CONFIG.skipSeconds} seconds`, String(CONFIG.skipSeconds));
    const play = button("pl-play", "play", "Play");
    const forward = button("pl-skip pl-skip-fwd", "forward", `Forward ${CONFIG.skipSeconds} seconds`, String(CONFIG.skipSeconds));

    mid.append(back, play, forward);

    const bottom = el("div", "pl-bottom");
    const current = el("span", "pl-time", "0:00");
    const seek = el("div", "pl-seek");
    const buffered = el("div", "pl-buf");
    const fill = el("div", "pl-fill");
    const thumb = el("div", "pl-thumb");
    const duration = el("span", "pl-time", "0:00");
    const fs = button("pl-fs", "fullscreen", "Fullscreen");

    seek.setAttribute("role", "slider");
    seek.setAttribute("aria-label", "Seek");
    seek.append(buffered, fill, thumb);
    bottom.append(current, seek, duration, fs);

    const hint = el("div", "pl-hint");
    const hintIcon = el("span", "pl-hint-icon");
    const hintText = el("span", "pl-hint-text");
    const hintBar = el("div", "pl-hint-bar");
    const hintFill = el("i");

    hintBar.append(hintFill);
    hint.append(hintIcon, hintText, hintBar);
    hint.hidden = true;

    const ripple = el("div", "pl-ripple");

    ripple.hidden = true;

    const spinner = el("div", "pl-spinner");

    spinner.setAttribute("aria-hidden", "true");

    rootNode.append(surface, spinner, top, mid, bottom, hint, ripple);
    dom.frame.append(rootNode);

    ui = {
      root: rootNode, surface, title, exit, gear, back, play, forward,
      current, duration, seek, buffered, fill, thumb, fs,
      hint, hintIcon, hintText, hintBar, hintFill, ripple
    };

    exit.addEventListener("click", () => setFullscreen(false));
    gear.addEventListener("click", () => openSheet("main"));
    fs.addEventListener("click", () => setFullscreen(!fullscreen));
    play.addEventListener("click", () => {
      togglePlay();
      showControls();
    });
    back.addEventListener("click", () => {
      skip(-CONFIG.skipSeconds);
      showControls();
    });
    forward.addEventListener("click", () => {
      skip(CONFIG.skipSeconds);
      showControls();
    });

    bindSeek(seek);
    bindGestures(surface);

    return ui;
  }

  function isPlayingNow() {
    return Boolean(lastState.playing || (lastState.playWhenReady && lastState.state === "buffering"));
  }

  function showControls() {
    if (!ui) return;

    ui.root.classList.add("is-active");
    clearTimeout(hideTimer);

    if (isPlayingNow() && !dragging && !sheet) {
      hideTimer = setTimeout(() => ui?.root.classList.remove("is-active"), CONFIG.controlsHideMs);
    }
  }

  function toggleControls() {
    if (!ui) return;

    if (ui.root.classList.contains("is-active") && isPlayingNow()) {
      clearTimeout(hideTimer);
      ui.root.classList.remove("is-active");
    } else {
      showControls();
    }
  }

  function paintControls() {
    if (!ui) return;

    const position = Number(lastState.positionMs) || 0;
    const length = Number(lastState.durationMs) || 0;
    const ended = lastState.state === "ended";

    if (ended) {
      setIcon(ui.play, "replay", "Replay");
    } else if (isPlayingNow()) {
      setIcon(ui.play, "pause", "Pause");
    } else {
      setIcon(ui.play, "play", "Play");
    }

    ui.root.classList.toggle("is-buffering", lastState.state === "buffering" || activeMode === "loading");
    ui.current.textContent = formatClock(position / 1000);
    ui.duration.textContent = length ? formatClock(length / 1000) : "--:--";

    if (!dragging) {
      const ratio = length ? clamp(position / length, 0, 1) : 0;

      ui.fill.style.transform = `scaleX(${ratio})`;
      ui.thumb.style.left = `${ratio * 100}%`;
    }

    const buffer = length ? clamp((Number(lastState.bufferedMs) || 0) / length, 0, 1) : 0;

    ui.buffered.style.transform = `scaleX(${buffer})`;
    ui.seek.setAttribute("aria-valuenow", String(Math.floor(position / 1000)));
    ui.seek.setAttribute("aria-valuemax", String(Math.floor(length / 1000)));
  }

  // ----- seek bar ------------------------------------------------------------

  function bindSeek(seek) {
    const ratioAt = (event) => {
      const rect = seek.getBoundingClientRect();

      return clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    };

    const preview = (ratio) => {
      const length = Number(lastState.durationMs) || 0;

      ui.fill.style.transform = `scaleX(${ratio})`;
      ui.thumb.style.left = `${ratio * 100}%`;
      ui.current.textContent = formatClock((ratio * length) / 1000);
    };

    seek.addEventListener("pointerdown", (event) => {
      dragging = true;
      seek.setPointerCapture(event.pointerId);
      ui.root.classList.add("is-seeking");
      showControls();
      preview(ratioAt(event));
      event.stopPropagation();
    });

    seek.addEventListener("pointermove", (event) => {
      if (dragging) preview(ratioAt(event));
    });

    const finish = (event) => {
      if (!dragging) return;

      dragging = false;
      ui.root.classList.remove("is-seeking");

      const length = Number(lastState.durationMs) || 0;

      if (event.type === "pointerup" && length) {
        seekToMs(ratioAt(event) * length);
      }

      showControls();
    };

    seek.addEventListener("pointerup", finish);
    seek.addEventListener("pointercancel", finish);
  }

  // ----- gestures ------------------------------------------------------------

  let hintTimer = 0;

  function showHint(name, label, ratio) {
    if (!ui) return;

    ui.hintIcon.replaceChildren(icon(name));
    ui.hintText.textContent = label;
    ui.hintBar.hidden = ratio === null || ratio === undefined;

    if (!ui.hintBar.hidden) ui.hintFill.style.transform = `scaleX(${clamp(ratio, 0, 1)})`;

    ui.hint.hidden = false;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      if (ui) ui.hint.hidden = true;
    }, 900);
  }

  function holdHint(name, label) {
    showHint(name, label, null);
    clearTimeout(hintTimer);
  }

  function hideHint() {
    clearTimeout(hintTimer);
    if (ui) ui.hint.hidden = true;
  }

  let skipTotal = 0;
  let skipTimer = 0;

  function showRipple(side) {
    if (!ui) return;

    ui.ripple.className = `pl-ripple is-${side}`;
    ui.ripple.textContent =
      side === "center" ? "" : `${skipTotal > 0 ? "+" : "\u2212"}${Math.abs(skipTotal)}s`;
    ui.ripple.hidden = false;
    clearTimeout(skipTimer);
    skipTimer = setTimeout(() => {
      skipTotal = 0;
      if (ui) ui.ripple.hidden = true;
    }, 650);
  }

  async function readDevice() {
    const player = bridge()?.player;
    const out = { brightness: 0.5, volume: 0.5 };

    if (!player) return out;

    try {
      out.brightness = Number((await player.getBrightness()).value);
      out.volume = Number((await player.getVolume()).value);
    } catch {
      // Keep the defaults.
    }

    return out;
  }

  function bindGestures(surface) {
    let press = null;
    let longTimer = 0;
    let boosting = false;
    let mode = null;
    let device = { brightness: 0.5, volume: 0.5 };
    let lastTapAt = 0;
    let tapTimer = 0;

    const zoneOf = (event) => {
      const rect = surface.getBoundingClientRect();
      const x = (event.clientX - rect.left) / Math.max(1, rect.width);

      return x < 0.33 ? "left" : x > 0.67 ? "right" : "center";
    };

    const boost = (on) => {
      const player = bridge()?.player;

      if (!player) return;

      boosting = on;
      player.setSpeed({ speed: on ? CONFIG.boostRate : activeRate }).catch(() => {});

      if (on) {
        holdHint("speed", `${CONFIG.boostRate}\u00D7 speed`);
      } else {
        hideHint();
      }
    };

    surface.addEventListener("pointerdown", (event) => {
      surface.setPointerCapture(event.pointerId);
      press = { x: event.clientX, y: event.clientY, moved: false };
      mode = null;
      readDevice().then((value) => {
        device = value;
      });

      longTimer = setTimeout(() => {
        if (press && !press.moved && isPlayingNow()) boost(true);
      }, CONFIG.longPressMs);
    });

    surface.addEventListener("pointermove", (event) => {
      if (!press || boosting) return;

      const dx = event.clientX - press.x;
      const dy = event.clientY - press.y;

      if (!press.moved && Math.hypot(dx, dy) > 12) {
        press.moved = true;
        clearTimeout(longTimer);

        if (Math.abs(dy) > Math.abs(dx)) {
          const rect = surface.getBoundingClientRect();

          mode = press.x - rect.left < rect.width / 2 ? "brightness" : "volume";
        }
      }

      if (!mode || !press.moved) return;

      const rect = surface.getBoundingClientRect();
      const next = clamp(device[mode] - dy / (rect.height * 0.8), 0, 1);
      const player = bridge()?.player;

      if (mode === "brightness") {
        player?.setBrightness({ value: Math.max(0.02, next) }).catch(() => {});
        showHint("brightness", `${Math.round(next * 100)}%`, next);
      } else {
        player?.setVolume({ value: next }).catch(() => {});
        showHint("volume", `${Math.round(next * 100)}%`, next);
      }
    });

    const release = (event) => {
      clearTimeout(longTimer);

      const wasPress = press;

      press = null;

      if (boosting) {
        boost(false);
        return;
      }

      if (!wasPress || wasPress.moved || event.type === "pointercancel") return;

      const zone = zoneOf(event);
      const now = Date.now();

      if (now - lastTapAt < CONFIG.doubleTapMs) {
        clearTimeout(tapTimer);
        lastTapAt = now;

        if (zone === "center") {
          togglePlay();
          showControls();
        } else {
          const delta = zone === "left" ? -CONFIG.skipSeconds : CONFIG.skipSeconds;

          skipTotal += delta;
          skip(delta);
          showRipple(zone);
        }

        return;
      }

      lastTapAt = now;
      clearTimeout(tapTimer);
      tapTimer = setTimeout(toggleControls, CONFIG.doubleTapMs);
    };

    surface.addEventListener("pointerup", release);
    surface.addEventListener("pointercancel", release);
  }

  // ----- settings sheet --------------------------------------------------------

  let sheet = null;

  function updateBackIntercept() {
    bridge()?.player?.setBackIntercept({ enabled: fullscreen || Boolean(sheet) }).catch(() => {});
  }

  function closeSheet() {
    sheet?.remove();
    sheet = null;
    updateBackIntercept();
    showControls();
  }

  function qualityLabel() {
    if (!selectedQuality) return "Auto";

    return storage.get(QUALITY_KEY, "auto") === "auto"
      ? `Auto (${selectedQuality.label})`
      : selectedQuality.label;
  }

  function audioLabel(stream) {
    if (!stream) return "Default";

    const name = stream.trackName || stream.locale || "Default";

    return `${name} \u00B7 ${Math.round(Number(stream.bitrate) / 1000) || Number(stream.bitrate) || 0}k`;
  }

  function openSheet(view) {
    if (!activeItem) return;

    sheet?.remove();

    const backdrop = el("div", "pl-sheet-backdrop");
    const panel = el("div", "pl-sheet");

    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closeSheet();
    });

    const row = (label, value, onClick, selected) => {
      const node = el("button", `pl-row${selected ? " is-selected" : ""}`);

      node.type = "button";
      node.append(el("span", "pl-row-label", label));

      if (value !== undefined) node.append(el("span", "pl-row-value", value));
      if (selected) node.append(icon("check"));
      else if (onClick && view === "main") node.append(icon("chevron"));

      node.addEventListener("click", onClick);

      return node;
    };

    const head = (label) => {
      const bar = el("div", "pl-sheet-head");
      const backButton = el("button", "pl-btn");

      backButton.type = "button";
      backButton.setAttribute("aria-label", "Back");
      backButton.append(icon("chevronBack"));
      backButton.addEventListener("click", () => openSheet("main"));
      bar.append(backButton, el("span", "pl-sheet-title", label));
      panel.append(bar);
    };

    if (view === "main") {
      panel.append(el("div", "pl-sheet-title pl-sheet-solo", "Playback"));
      panel.append(
        row("Quality", qualityLabel(), () => openSheet("quality")),
        row("Speed", `${activeRate}\u00D7`, () => openSheet("speed")),
        row("Audio", audioLabel(selectedAudio), () => openSheet("audio")),
        row("Aspect ratio", RESIZE_MODES.find((m) => m.id === resizeMode)?.label, () => openSheet("resize"))
      );
    } else if (view === "quality") {
      head("Quality");
      panel.append(
        row("Auto (up to 720p)", undefined, () => chooseQuality("auto"), storage.get(QUALITY_KEY, "auto") === "auto")
      );

      for (const entry of choice.qualities) {
        panel.append(
          row(
            entry.label,
            entry.muxed ? "with audio" : undefined,
            () => chooseQuality(entry),
            storage.get(QUALITY_KEY, "auto") !== "auto" && selectedQuality === entry
          )
        );
      }
    } else if (view === "speed") {
      head("Speed");

      for (const rate of RATES) {
        panel.append(row(`${rate}\u00D7`, undefined, () => {
          setRate(rate);
          closeSheet();
        }, rate === activeRate));
      }
    } else if (view === "audio") {
      head("Audio");

      const streams = (info?.audioStreams || []).filter((s) => s?.url);

      if (!streams.length) panel.append(el("p", "pl-sheet-empty", "No separate audio tracks."));

      for (const stream of streams) {
        panel.append(row(audioLabel(stream), undefined, () => chooseAudio(stream), selectedAudio === stream));
      }
    } else if (view === "resize") {
      head("Aspect ratio");

      for (const mode of RESIZE_MODES) {
        panel.append(row(mode.label, undefined, () => {
          resizeMode = mode.id;
          storage.set(RESIZE_KEY, mode.id);
          bridge()?.player?.setResizeMode({ mode: mode.id }).catch(() => {});
          closeSheet();
        }, mode.id === resizeMode));
      }
    }

    backdrop.append(panel);
    document.body.append(backdrop);
    sheet = backdrop;
    updateBackIntercept();
    clearTimeout(hideTimer);
  }

  // ----- fullscreen -----------------------------------------------------------

  async function setFullscreen(on) {
    if (fullscreen === on) return;

    fullscreen = on;
    dom.panel.querySelector(".watch-player")?.classList.toggle("pl-fs", on);
    root.classList.toggle("pl-fs-active", on);

    if (ui) {
      setIcon(ui.fs, on ? "fullscreenExit" : "fullscreen", on ? "Exit fullscreen" : "Fullscreen");
    }

    try {
      await bridge()?.player?.setFullscreen({ enabled: on });
    } catch {
      // Fullscreen is cosmetic; keep playing.
    }

    updateBackIntercept();

    for (const delay of [0, 120, 350, 700]) {
      setTimeout(() => syncBounds(true), delay);
    }

    showControls();
  }

  // ----- native video area ------------------------------------------------------

  let lastBounds = "";
  let lastLayerAbove = false;

  function miniTarget() {
    const box = document.getElementById("now-playing");
    const node = box?.querySelector(".mini-video");

    return box && !box.hidden && node && node.getClientRects().length ? node : null;
  }

  function syncBounds(force = false) {
    const player = bridge()?.player;

    if (!player) return;

    const watchVisible = activeMode !== "idle" && !dom.panel.hidden;
    const mini = !watchVisible && activeMode !== "idle" ? miniTarget() : null;
    const target = watchVisible ? dom.frame : mini;
    const above = Boolean(mini);

    root.classList.toggle("native-hole", watchVisible);

    if (above !== lastLayerAbove) {
      lastLayerAbove = above;
      force = true;
      player.setLayer({ above }).catch(() => {});
    }

    const rect = target ? target.getBoundingClientRect() : null;
    const usable = Boolean(rect && rect.width > 0 && rect.height > 0);
    const key = usable
      ? [rect.left, rect.top, rect.width, rect.height].map(Math.round).join(",")
      : "off";

    if (!force && key === lastBounds) return;

    lastBounds = key;

    player
      .setBounds(
        usable
          ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
          : { x: 0, y: 0, width: 0, height: 0 }
      )
      .catch(() => {});
  }

  new ResizeObserver(() => syncBounds()).observe(dom.frame);
  window.addEventListener("resize", () => syncBounds(), { passive: true });
  window.addEventListener("scroll", () => syncBounds(), { passive: true });
  setInterval(() => {
    if (activeMode !== "idle") syncBounds();
  }, CONFIG.syncMs);

  // ---------------------------------------------------------------------------
  // Watch history
  // ---------------------------------------------------------------------------

  function safeSeconds(value) {
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  }

  function currentProgress() {
    if (!activeItem) return { progressSeconds: 0, durationSeconds: null };

    const duration = safeSeconds((Number(lastState.durationMs) || 0) / 1000);

    return {
      progressSeconds: safeSeconds((Number(lastState.positionMs) || 0) / 1000),
      durationSeconds: duration > 0 ? duration : null
    };
  }

  function historyPaused() {
    return storage.get("ayutube.noHistory", "false") === "true";
  }

  function queueHistory(force = false) {
    if (!activeItem || historyPaused()) return;

    const progress = currentProgress();
    const now = Date.now();

    if (!force) {
      const enoughTimePassed = now - lastHistoryQueuedAt >= CONFIG.historyIntervalMs;
      const enoughProgress =
        Math.abs(progress.progressSeconds - lastQueuedProgress) >= CONFIG.historyMinimumProgressDelta;

      if (!enoughTimePassed || !enoughProgress) return;
    }

    lastHistoryQueuedAt = now;
    lastQueuedProgress = progress.progressSeconds;
    pendingHistory = { item: { ...activeItem }, progress, token: activeToken };
    void flushHistory();
  }

  async function flushHistory() {
    if (historyWritePromise) return historyWritePromise;

    historyWritePromise = (async () => {
      while (pendingHistory) {
        const snapshot = pendingHistory;

        pendingHistory = null;

        if (!snapshot.item?.id || !window.AyuTubeLibrary?.saveHistoryEntry) continue;

        try {
          await window.AyuTubeLibrary.saveHistoryEntry(snapshot.item, snapshot.progress);
        } catch (error) {
          console.debug("AyuTube could not save playback history:", error.message);
        }
      }
    })().finally(() => {
      historyWritePromise = null;
      if (pendingHistory) void flushHistory();
    });

    return historyWritePromise;
  }

  // ---------------------------------------------------------------------------
  // Playback control
  // ---------------------------------------------------------------------------

  function nativePlayer() {
    return bridge()?.player || null;
  }

  function togglePlay() {
    const player = nativePlayer();

    if (!player || !activeItem) return;

    if (lastState.state === "ended" || !isPlayingNow()) {
      player.play().catch(() => {});
    } else {
      player.pause().catch(() => {});
    }
  }

  function seekToMs(ms) {
    const player = nativePlayer();

    if (!player || !activeItem) return;

    const length = Number(lastState.durationMs) || 0;
    const target = clamp(ms, 0, length || Math.max(0, ms));

    lastState = { ...lastState, positionMs: target };
    paintControls();
    player.seekTo({ ms: Math.floor(target) }).catch(() => {});
  }

  /** Refreshes lastState straight from the player (events may lag). */
  async function freshState() {
    try {
      const state = await nativePlayer()?.getState();

      if (state && typeof state === "object" && Number.isFinite(Number(state.positionMs))) {
        lastState = { ...lastState, ...state };
      }
    } catch {
      // Keep the last known state.
    }

    return lastState;
  }

  async function skip(seconds) {
    await freshState();
    seekToMs((Number(lastState.positionMs) || 0) + seconds * 1000);
  }

  function setRate(rate) {
    const value = Number(rate);

    if (!RATES.includes(value)) return activeRate;

    activeRate = value;
    nativePlayer()?.setSpeed({ speed: value }).catch(() => {});

    return activeRate;
  }

  function currentSeconds() {
    return Math.floor((Number(lastState.positionMs) || 0) / 1000);
  }

  async function startNative(positionSeconds, autoplay, token) {
    const player = nativePlayer();

    if (!player || !info) throw new Error("Playback needs the AyuTube app.");

    const args = {
      startMs: Math.max(0, Math.round(positionSeconds * 1000)),
      autoplay,
      speed: activeRate
    };

    if (info.livestream && info.hls) {
      args.hlsUrl = info.hls;
    } else if (selectedQuality) {
      args.videoUrl = selectedQuality.stream.url;

      if (!selectedQuality.muxed && selectedAudio) args.audioUrl = selectedAudio.url;
    } else if (selectedAudio) {
      args.audioUrl = selectedAudio.url;
    } else if (info.hls) {
      args.hlsUrl = info.hls;
    } else {
      throw new Error("No playable stream was found for this video.");
    }

    await player.open(args);

    if (!isCurrent(token)) return;

    activeMode = "native";
    startPolling();
    await player.setResizeMode({ mode: resizeMode }).catch(() => {});
    syncBounds(true);
    clearTimeout(startTimer);
    startTimer = setTimeout(() => {
      if (isCurrent(token) && gate) {
        showError("This video is taking too long to start.");
      }
    }, CONFIG.startTimeoutMs);
  }

  function prepareStreams() {
    choice = window.AyuStreamSelect.buildQualities(info);
    triedMuxed = false;

    const preferred = storage.get(QUALITY_KEY, "auto");
    const height = preferred === "auto" ? 720 : Number(preferred) || 720;

    selectedQuality = window.AyuStreamSelect.defaultQuality(choice.qualities, height);

    const mp4 = !selectedQuality || String(selectedQuality.stream.mimeType || "").includes("mp4");

    selectedAudio = window.AyuStreamSelect.pickAudio(info, mp4);
  }

  async function reopenHere(autoplay) {
    if (!activeItem || !info) return;

    const token = activeToken;

    await freshState();
    showLoading(token);
    activeMode = "loading";

    try {
      await startNative(currentSeconds(), autoplay, token);
    } catch (error) {
      if (isCurrent(token)) showError(error.message || "Could not change the stream.");
    }
  }

  function chooseQuality(entry) {
    if (entry === "auto") {
      storage.set(QUALITY_KEY, "auto");
      prepareStreams();
    } else {
      storage.set(QUALITY_KEY, entry.height);
      selectedQuality = entry;
      selectedAudio = window.AyuStreamSelect.pickAudio(
        info,
        String(entry.stream.mimeType || "").includes("mp4")
      );
    }

    closeSheet();
    void reopenHere(isPlayingNow() || lastState.playWhenReady);
  }

  function chooseAudio(stream) {
    selectedAudio = stream;
    closeSheet();
    void reopenHere(isPlayingNow() || lastState.playWhenReady);
  }

  // ---------------------------------------------------------------------------
  // Native events
  // ---------------------------------------------------------------------------

  function onNativeState(state) {
    if (!activeItem || activeMode === "idle") return;

    const wasPlaying = Boolean(lastState.playing);

    lastState = state || {};

    if (gate && (lastState.state === "ready" || lastState.playing)) finishLoading();

    paintControls();
    emit("time", {
      position: (Number(lastState.positionMs) || 0) / 1000,
      duration: (Number(lastState.durationMs) || 0) / 1000
    });

    if (Boolean(lastState.playing) !== wasPlaying) {
      emit("state", lastState.playing ? "playing" : "paused");
      showControls();

      if (!lastState.playing && lastState.state !== "ended") queueHistory(true);
    }

    if (lastState.playing) queueHistory(false);
  }

  function onNativeEnded() {
    if (!activeItem) return;

    queueHistory(true);
    paintControls();
    showControls();
    emit("state", "ended");
    emit("ended", activeItem);
  }

  function onNativeError(error) {
    if (!activeItem) return;

    console.error("AyuTube native player error:", error);

    // A separate video + audio pair failed: try the single muxed stream once.
    if (!triedMuxed && selectedQuality && !selectedQuality.muxed && choice.muxed) {
      triedMuxed = true;
      selectedQuality = choice.muxed;
      selectedAudio = null;
      void reopenHere(true);
      return;
    }

    showError(
      `This video could not be played (${error?.codeName || error?.code || "error"}).`,
      error?.cause
    );
  }

  function onBack() {
    if (sheet) {
      closeSheet();
    } else if (fullscreen) {
      void setFullscreen(false);
    }
  }

  /** Capacitor's bridge listens to plugin events through cap.addListener. */
  function listen(name, handler) {
    const cap = window.Capacitor;

    if (typeof cap?.addListener === "function") {
      return cap.addListener("AyuPlayer", name, handler);
    }

    return nativePlayer()?.addListener?.(name, handler);
  }

  let pollTimer = 0;

  /** Safety net: ask the player for its state twice a second as well. */
  function startPolling() {
    if (pollTimer) return;

    pollTimer = setInterval(async () => {
      if (activeMode !== "native" || document.visibilityState === "hidden") return;

      try {
        const state = await nativePlayer()?.getState();

        if (state && typeof state === "object" && state.state) onNativeState(state);
      } catch {
        // The next tick tries again.
      }
    }, 500);
  }

  function wireNative() {
    const player = nativePlayer();

    if (wired || !player) return;

    wired = true;
    listen("state", onNativeState);
    listen("ended", onNativeEnded);
    listen("error", onNativeError);
    window.addEventListener("ayutubeBack", onBack);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async function fetchStreams(id) {
    const response = await fetch(`/api/streams?id=${encodeURIComponent(id)}`);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) throw new Error(data?.error || "Could not load this video.");

    return data;
  }

  async function play(rawItem, options = {}) {
    let item;

    try {
      item = normalizeItem(rawItem);
    } catch (error) {
      dom.message.className = "player-message";
      dom.message.textContent = error.message || "Select a valid video.";
      dom.message.hidden = false;
      return;
    }

    const token = ++activeToken;
    const start = Number(options?.start);

    activeStart = Number.isFinite(start) && start > 0 ? Math.floor(start) : 0;
    activeItem = item;
    activeMode = "loading";
    info = null;
    lastState = {};
    lastHistoryQueuedAt = 0;
    lastQueuedProgress = -1;
    pendingHistory = null;

    dom.panel.hidden = false;
    dom.title.textContent = item.title;
    dom.channel.textContent = item.uploaderName || "";
    dom.watchLink.href = youtubeWatchUrl(item.id);
    dom.watchLink.hidden = true;

    ensureUi().title.textContent = item.title;
    paintControls();
    showControls();
    emit("play", item);
    showLoading(token);
    wireNative();
    syncBounds(true);

    if (!nativePlayer() || !window.AyuStreamSelect) {
      showError("Video playback needs the AyuTube Android app.");
      return;
    }

    try {
      const data = await fetchStreams(item.id);

      if (!isCurrent(token)) return;

      info = data;

      if (item.title === "Untitled video" && data.title) {
        updateDetails({ title: data.title, uploaderName: data.uploader });
      }

      prepareStreams();
      await startNative(activeStart, true, token);
    } catch (error) {
      if (!isCurrent(token)) return;

      showError(error.message || "Could not load this video.");
    }
  }

  function stopSession() {
    clearInterval(pollTimer);
    pollTimer = 0;
    clearTimeout(startTimer);
    clearTimeout(hideTimer);
    closeSheet();
    hideMessage();
    hideHint();

    if (fullscreen) void setFullscreen(false);

    const player = nativePlayer();

    if (player) {
      player.release().catch(() => {});
      player.setBrightness({ value: -1 }).catch(() => {});
    }

    root.classList.remove("native-hole");
    lastBounds = "";
    lastLayerAbove = false;
    lastState = {};
    info = null;
  }

  function close() {
    // Invalidate pending requests and events before cleanup.
    activeToken += 1;
    queueHistory(true);
    activeItem = null;
    activeMode = "idle";
    stopSession();
    pendingHistory = null;
    dom.panel.hidden = true;
    dom.title.textContent = "";
    dom.channel.textContent = "";
    emit("close");
  }

  /** Pause without closing (used when the person leaves the watch page). */
  function pause() {
    if (!activeItem) return;

    nativePlayer()?.pause().catch(() => {});
  }

  /** Continue playback after pause(). */
  function resume() {
    if (!activeItem) return;

    nativePlayer()?.play().catch(() => {});
    syncBounds(true);
  }

  const isActive = () => Boolean(activeItem);
  const isPlaying = () => Boolean(lastState.playing);

  /** Called by the page when the watch view is shown or left. */
  function setMini(on) {
    if (!activeItem) return;

    if (on) {
      hideHint();
      closeSheet();
      if (fullscreen) void setFullscreen(false);
    }

    for (const delay of [0, 80, 300]) {
      setTimeout(() => syncBounds(true), delay);
    }
  }
  const canTrackTime = () => activeMode === "native";
  const getCurrentTime = () => (Number(lastState.positionMs) || 0) / 1000;

  function seek(seconds) {
    if (!activeItem) return;

    seekToMs(Math.max(0, Number(seconds) || 0) * 1000);
  }

  /** Fill in details that were unknown when playback started. */
  function updateDetails(details = {}) {
    if (!activeItem) return;

    if (typeof details.title === "string" && details.title.trim()) {
      activeItem.title = details.title.trim().slice(0, 500);
      dom.title.textContent = activeItem.title;

      if (ui) ui.title.textContent = activeItem.title;
    }

    if (typeof details.uploaderName === "string") {
      activeItem.uploaderName = details.uploaderName.slice(0, 300);
      dom.channel.textContent = activeItem.uploaderName;
    }

    if (typeof details.thumbnail === "string" && details.thumbnail.startsWith("https://")) {
      activeItem.thumbnail = details.thumbnail.slice(0, 2000);
    }
  }

  dom.closeButton.addEventListener("click", close);

  // Leaving the app should save where the person was.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") queueHistory(true);
  });

  window.AyuTubePlayer = Object.freeze({
    play,
    close,
    pause,
    resume,
    updateDetails,
    isActive,
    isPlaying,
    toggle: togglePlay,
    setMini,
    icon,
    seek,
    setRate,
    getRate: () => activeRate,
    cleanControlsOn: () => true,
    rates: RATES,
    getCurrentTime,
    canTrackTime,
    on
  });

  // Keep compatibility with the original app.js and any existing callers.
  window.MiniTubePlayer = window.AyuTubePlayer;
})();
