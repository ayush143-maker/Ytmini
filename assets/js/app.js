(() => {
  "use strict";

  const MODULES = Object.freeze({
    categories: "/assets/js/categories.js",
    supabase: "/assets/js/supabase.js",
    auth: "/assets/js/auth.js",
    library: "/assets/js/library.js",
    api: "/assets/js/api.js"
  });

  const state = {
    view: "explore", // explore | library | account
    pane: "browse", // browse | watch | channel (only meaningful inside explore)
    browse: "feed", // feed | results
    category: null,
    feedKey: "",
    feedWasGuest: true, // the last feed was drawn without personal rows
    librarySection: "playlists",
    playlistId: null,
    authMode: "signin",
    searchRequestId: 0,
    user: null,
    lastQuery: "",
    lastItems: [],
    durationFilter: "any"
  };

  const scriptPromises = new Map();

  const $ = (selector, parent = document) => parent.querySelector(selector);

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------

  function element(tag, className, text) {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
  }

  function makeButton(label, className, onClick) {
    const button = element("button", className, label);

    button.type = "button";
    if (onClick) button.addEventListener("click", onClick);

    return button;
  }

  const store = {
    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },

    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Storage can be unavailable (private mode); preferences just reset.
      }
    }
  };

  function setStatus(message) {
    const status = $("#status");
    if (status) status.textContent = message || "";
  }

  function setNotice(container, message, kind = "info") {
    if (!container) return;

    const notice = element("p", `ay-notice ay-notice-${kind}`, message);
    notice.setAttribute("role", kind === "error" ? "alert" : "status");

    container.append(notice);
  }

  let toastTimer = null;

  function notify(message) {
    const toast = $("#toast");
    if (!toast || !message) return;

    toast.textContent = message;
    toast.hidden = false;

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 3200);
  }

  const getPlayer = () => window.AyuTubePlayer || window.MiniTubePlayer;

  /**
   * Convert any search/feed/library item into the one video shape the UI uses.
   */
  function toVideo(item) {
    const url = typeof item?.url === "string" ? item.url : "";
    const fromUrl = url.match(
      /(?:[?&]v=|youtu\.be\/|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{6,20})/
    );

    const id = String(item?.id || fromUrl?.[1] || "");

    const channel =
      item?.uploaderName ||
      item?.channel ||
      item?.channelTitle ||
      "Unknown channel";

    const duration = Number(item?.duration);
    const views = Number(item?.views);

    return {
      id,
      title:
        typeof item?.title === "string" && item.title.trim()
          ? item.title.trim()
          : "Untitled video",
      uploaderName: channel,
      channel,
      thumbnail: item?.thumbnail || item?.thumbnailUrl || "",
      duration: Number.isFinite(duration) && duration > 0
        ? Math.floor(duration)
        : 0,
      views: Number.isFinite(views) && views >= 0 ? Math.floor(views) : null,
      uploaded: typeof item?.uploaded === "string" ? item.uploaded : "",
      uploadedAt:
        Number.isFinite(Number(item?.uploadedAt)) && Number(item.uploadedAt) > 0
          ? Number(item.uploadedAt)
          : null,
      channelId: typeof item?.channelId === "string" ? item.channelId : "",
      short: Boolean(item?.short),
      url
    };
  }

  const validVideoId = (id) => /^[A-Za-z0-9_-]{6,20}$/.test(String(id || ""));

  // ---------------------------------------------------------------------------
  // Dynamic module loading
  // ---------------------------------------------------------------------------

  function loadScript(path) {
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

      if (existing?.dataset.loaded === "true") {
        resolve();
        return;
      }

      const script = existing || document.createElement("script");

      function onLoad() {
        script.dataset.loaded = "true";
        cleanup();
        resolve();
      }

      function onError() {
        cleanup();
        scriptPromises.delete(path);
        reject(new Error(`Could not load ${path}.`));
      }

      function cleanup() {
        script.removeEventListener("load", onLoad);
        script.removeEventListener("error", onError);
      }

      script.addEventListener("load", onLoad, { once: true });
      script.addEventListener("error", onError, { once: true });

      if (!existing) {
        script.src = path;
        script.async = true;
        document.body.append(script);
      }
    });

    scriptPromises.set(path, promise);
    return promise;
  }

  async function ensureCategories() {
    if (!window.AyuTubeCategories) {
      await loadScript(MODULES.categories);
    }

    if (!window.AyuTubeCategories) {
      throw new Error("The category module could not be initialized.");
    }

    return window.AyuTubeCategories;
  }

  async function ensureAuthModules() {
    if (!window.AyuTubeSupabase) await loadScript(MODULES.supabase);
    if (!window.AyuTubeAuth) await loadScript(MODULES.auth);
    if (!window.AyuTubeLibrary) await loadScript(MODULES.library);

    if (!window.AyuTubeAuth || !window.AyuTubeLibrary) {
      throw new Error("Account services could not be initialized.");
    }
  }

  async function ensureApi() {
    if (!window.AyuTubeAPI?.search && !window.MiniTubeAPI?.search) {
      await loadScript(MODULES.api);
    }

    const api = window.AyuTubeAPI || window.MiniTubeAPI;

    if (typeof api?.search !== "function") {
      throw new Error("The search API is not ready yet.");
    }

    return api;
  }

  // ---------------------------------------------------------------------------
  // Personal data (history, channel preferences). Cached briefly and never
  // blocks the page: signed-out visitors simply get an empty result.
  // ---------------------------------------------------------------------------

  let personalPromise = null;
  let personalAt = 0;
  // The topics shown on the very first paint come from what this device last
  // learned about the visitor, so the default topics never flash before the
  // person's own interests arrive from the database.
  const SIGNED_IN_KEY = "ayutube.signedIn";
  const INTERESTS_KEY = "ayutube.interests";

  let personalReady = false;

  const isKnownGuest = () => store.get(SIGNED_IN_KEY, false) !== true;

  function interestsNow() {
    if (personalReady) return personalData.profile.interests || [];

    if (isKnownGuest()) return [];

    const cached = store.get(INTERESTS_KEY, []);

    return Array.isArray(cached)
      ? cached.filter((id) => typeof id === "string")
      : [];
  }

  const emptyProfile = () => ({
    interests: [],
    exam_name: null,
    exam_date: null,
    onboarded_at: null
  });

  let personalData = {
    user: null,
    history: [],
    map: new Map(),
    prefs: [],
    likes: new Set(),
    profile: emptyProfile()
  };

  function getPersonal(force = false) {
    if (!force && personalPromise && Date.now() - personalAt < 60000) {
      return personalPromise;
    }

    personalAt = Date.now();

    personalPromise = (async () => {
      const data = {
        user: null,
        history: [],
        map: new Map(),
        prefs: [],
        likes: new Set(),
        profile: emptyProfile()
      };

      let authChecked = false;

      try {
        await ensureAuthModules();

        const user = await window.AyuTubeAuth.getCurrentUser();

        authChecked = true;

        if (user) {
          data.user = user;
          state.user = user;

          const lib = window.AyuTubeLibrary;
          const call = (name, ...args) =>
            typeof lib[name] === "function" ? lib[name](...args) : Promise.reject(new Error("n/a"));

          const [history, prefs, profile, likes] = await Promise.allSettled([
            call("getHistory", { limit: 200 }),
            call("getChannelPrefs"),
            call("getProfile"),
            call("getLikes", { limit: 500 })
          ]);

          if (history.status === "fulfilled" && Array.isArray(history.value)) {
            data.history = history.value;
          }

          for (const row of data.history) {
            data.map.set(row.video_id, {
              progress: Number(row.progress_seconds) || 0,
              duration: Number(row.duration_seconds) || 0,
              watchedAt: row.watched_at
            });
          }

          if (prefs.status === "fulfilled" && Array.isArray(prefs.value)) {
            data.prefs = prefs.value;
          }

          if (profile.status === "fulfilled" && profile.value) {
            data.profile = { ...emptyProfile(), ...profile.value };
          }

          if (likes.status === "fulfilled" && Array.isArray(likes.value)) {
            data.likes = new Set(likes.value.map((row) => row.video_id));
          }
        }
      } catch {
        // Signed out, offline or not configured: personalisation is optional.
      }

      // Only trust the result when the account check itself succeeded.
      if (authChecked) {
        store.set(SIGNED_IN_KEY, Boolean(data.user));
        store.set(INTERESTS_KEY, data.user ? data.profile.interests : []);
        personalReady = true;
      }

      personalData = data;
      return data;
    })();

    return personalPromise;
  }

  function invalidatePersonal() {
    personalPromise = null;
    personalAt = 0;
  }

  function channelKey(video) {
    if (video?.channelId) return video.channelId;

    const name = String(video?.uploaderName || video?.channel || "")
      .trim()
      .toLowerCase();

    return name ? `name:${name}`.slice(0, 200) : "";
  }

  function isBlocked(video) {
    const key = channelKey(video);
    if (!key) return false;

    return personalData.prefs.some(
      (pref) =>
        pref.kind === "block" &&
        (pref.channel_key === key ||
          pref.channel_key === `name:${String(video.uploaderName || "").trim().toLowerCase()}`)
    );
  }

  // ---------------------------------------------------------------------------
  // Study mode: fewer distractions. Stored on this device.
  // ---------------------------------------------------------------------------

  // Hidden in study mode. When nothing else is left, STUDY_FALLBACK is used.
  const ENTERTAINMENT = new Set(["oggy", "facts", "music", "games", "fun"]);
  const STUDY_FALLBACK = Object.freeze(["isi-prep", "maths", "physics", "coding", "quant"]);

  const isStudy = () => store.get("ayutube.study", false) === true;

  function setStudy(on) {
    store.set("ayutube.study", Boolean(on));
    document.body.dataset.study = on ? "on" : "off";
    state.feedKey = "";

    // Entertainment categories disappear in study mode.
    if (on && ENTERTAINMENT.has(state.category)) {
      state.category = null;

      const input = $("#search-input");
      if (input) input.placeholder = "Search videos";
    }

    renderCategories().catch(() => {});
  }

  /**
   * The categories shown in the strip and feed: the person's chosen interests,
   * or the original five when none were chosen (guests, incognito, skipped).
   */
  function visibleCategories(module) {
    const chosen = interestsNow()
      .map((id) => module.getById(id))
      .filter(Boolean);

    let list = chosen.length ? chosen : module.getDefaults();

    if (isStudy()) {
      const focused = list.filter((category) => !ENTERTAINMENT.has(category.id));

      list = focused.length
        ? focused
        : STUDY_FALLBACK.map((id) => module.getById(id)).filter(Boolean);
    }

    return list;
  }

  /** Called after signing in: reload everything that depends on the account. */
  async function afterSignIn() {
    invalidatePersonal();
    await getPersonal(true);

    state.feedKey = "";
    state.category = null;

    await renderCategories().catch(() => {});

    if (state.view === "explore" && state.pane === "browse" && state.browse === "feed") {
      showFeed();
    }

    window.AyuTubeFollowing?.refreshBadge?.();
    window.AyuTubeOnboarding?.maybeRun?.();
  }

  async function afterSignOut() {
    invalidatePersonal();
    await getPersonal(true);

    state.feedKey = "";
    state.category = null;
    setLibraryDot(false);

    await renderCategories().catch(() => {});
  }

  /** Called after interests change: rebuild the strip and the feed. */
  async function applyInterests() {
    invalidatePersonal();
    await getPersonal(true);

    state.feedKey = "";
    state.category = null;

    const input = $("#search-input");
    if (input) input.placeholder = "Search videos";

    await renderCategories().catch(() => {});

    if (state.view === "explore" && state.pane === "browse" && state.browse === "feed") {
      showFeed();
    }
  }

  // ---------------------------------------------------------------------------
  // Navigation (bottom bar on phones, side rail on desktop)
  // ---------------------------------------------------------------------------

  // Lucide icons (ISC licence): compass, library, circle-user.
  const ICONS = Object.freeze({
    explore: [
      {
        tag: "path",
        d: "m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"
      },
      { tag: "circle", cx: 12, cy: 12, r: 10 }
    ],
    library: [
      { tag: "path", d: "m16 6 4 14" },
      { tag: "path", d: "M12 6v14" },
      { tag: "path", d: "M8 8v12" },
      { tag: "path", d: "M4 4v16" }
    ],
    account: [
      { tag: "circle", cx: 12, cy: 12, r: 10 },
      { tag: "circle", cx: 12, cy: 10, r: 3 },
      { tag: "path", d: "M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662" }
    ]
  });

  function iconSvg(shapes) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");

    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    for (const { tag, ...attributes } of shapes) {
      const shape = document.createElementNS(ns, tag);

      for (const [name, value] of Object.entries(attributes)) {
        shape.setAttribute(name, String(value));
      }

      svg.append(shape);
    }

    return svg;
  }

  function createNavigation() {
    const nav = $("#ayutube-tabs");

    if (!nav || nav.childElementCount) return;

    const items = [
      { id: "explore", label: "Explore" },
      { id: "library", label: "Library" },
      { id: "account", label: "Account" }
    ];

    for (const item of items) {
      const tab = element("button", "ay-tab");

      tab.type = "button";
      tab.dataset.view = item.id;
      tab.setAttribute("aria-current", item.id === state.view ? "page" : "false");
      tab.append(iconSvg(ICONS[item.id]), element("span", "", item.label));

      if (item.id === "library") {
        const dot = element("i", "tab-dot");

        dot.hidden = true;
        dot.setAttribute("aria-hidden", "true");
        tab.append(dot);
      }

      tab.addEventListener("click", () => onTab(item.id));
      nav.append(tab);
    }
  }

  function onTab(id) {
    if (id === "explore" && state.view === "explore") {
      // Tapping Explore again means "take me home".
      if (state.pane === "watch") {
        leaveWatch();
      } else if (state.pane === "channel") {
        leaveChannel();
      } else if (state.browse === "results") {
        showFeed();
      }

      window.scrollTo({ top: 0 });
      return;
    }

    setView(id);
  }

  function createApplicationViews() {
    const main = $("#main");
    if (!main) return;

    if (!$("#ayutube-library-view")) {
      const library = element("section", "ay-view");
      library.id = "ayutube-library-view";
      library.hidden = true;
      library.setAttribute("aria-label", "Your library");

      const content = element("div");
      content.id = "ayutube-library-content";

      library.append(element("h1", "", "Library"), content);

      main.append(library);
    }

    if (!$("#ayutube-account-view")) {
      const account = element("section", "ay-view");
      account.id = "ayutube-account-view";
      account.hidden = true;
      account.setAttribute("aria-label", "Your account");

      const content = element("div");
      content.id = "ayutube-account-content";

      account.append(element("h1", "", "Account"), content);
      main.append(account);
    }
  }

  // ---------------------------------------------------------------------------
  // Panes: browse (feed or results) and watch
  // ---------------------------------------------------------------------------

  let wasWatching = false;

  function applyLayout() {
    const explore = state.view === "explore";
    const watching = explore && state.pane === "watch";
    const onChannel = explore && state.pane === "channel";
    const browsing = explore && !watching && !onChannel;

    const toggle = (selector, visible) => {
      const node = $(selector);
      if (node) node.hidden = !visible;
    };

    toggle("#search-form", browsing);
    toggle("#ayutube-categories", browsing);
    toggle("#status", browsing);
    toggle("#feed", browsing && state.browse === "feed");
    toggle("#results", browsing && state.browse === "results");
    toggle("#player-panel", watching);
    toggle("#channel-pane", onChannel);
    toggle("#ayutube-library-view", state.view === "library");
    toggle("#ayutube-account-view", state.view === "account");

    for (const tab of document.querySelectorAll(".ay-tab")) {
      tab.setAttribute(
        "aria-current",
        tab.dataset.view === state.view ? "page" : "false"
      );
    }

    // The watch page left the screen: stop playback instead of letting audio
    // continue in a hidden player.
    if (wasWatching && !watching) {
      getPlayer()?.pause?.();
    }

    wasWatching = watching;
    updateNowPlaying();
  }

  // The screen a watch or channel page was opened from, so Back returns there.
  let originView = null;

  function rememberOrigin() {
    if (state.view !== "explore") originView = state.view;
  }

  /** Leave the watch/channel page and return to the screen it came from. */
  function finishLeave() {
    state.pane = "browse";

    const origin = originView;

    originView = null;

    if (origin) state.view = origin;

    applyLayout();

    if (origin === "library") window.AyuTubeLibraryUI?.render?.();
    if (origin === "account") window.AyuTubeAccountUI?.render?.();
  }

  function setView(view) {
    if (!["explore", "library", "account"].includes(view)) return;

    originView = null;
    state.view = view;
    applyLayout();

    if (view === "library") window.AyuTubeLibraryUI?.render?.();
    if (view === "account") window.AyuTubeAccountUI?.render?.();

    // Something that changes the feed (exam date, interests, study mode)
    // happened elsewhere: refresh it on the way back.
    if (
      view === "explore" &&
      state.pane === "browse" &&
      state.browse === "feed" &&
      state.feedKey === ""
    ) {
      showFeed();
    }

    window.scrollTo({ top: 0 });
  }

  /**
   * Show the watch page. Called by watch.js right before playback starts.
   * `entry: true` marks a page opened straight from a shared link.
   */
  function showWatch(video, { push = true, entry = false } = {}) {
    rememberOrigin();
    state.view = "explore";
    state.pane = "watch";

    if (video?.id && (push || entry)) {
      const record = {
        ayu: "watch",
        id: video.id,
        title: video.title,
        channel: video.uploaderName,
        thumbnail: video.thumbnail
      };

      const url = `/?v=${encodeURIComponent(video.id)}`;
      const current = history.state;

      if (entry) {
        history.replaceState({ ...record, entry: true }, "", url);
      } else if (current?.ayu === "watch" && current.id === video.id) {
        history.replaceState({ ...record, entry: Boolean(current.entry) }, "", url);
      } else {
        history.pushState(record, "", url);
      }
    }

    applyLayout();
    window.scrollTo({ top: 0 });
  }

  /** Leave the watch page (pauses playback; the Now playing strip remains). */
  function leaveWatch() {
    const current = history.state;

    if (current?.ayu === "watch") {
      if (current.entry) {
        // Opened directly from a shared link: there is no earlier page of ours.
        history.replaceState({}, "", location.pathname);
        finishLeave();
      } else {
        history.back(); // popstate applies the layout
      }

      return;
    }

    finishLeave();
  }

  function onPopState(event) {
    const entry = event.state;

    if (entry?.ayu === "channel") {
      state.view = "explore";
      state.pane = "channel";

      const open = window.AyuTubeChannel?.current?.();

      if (open && open.id === (entry.id || "") && open.name === (entry.name || "")) {
        applyLayout();
      } else {
        window.AyuTubeChannel?.open?.(
          { id: entry.id || "", name: entry.name || "" },
          { fromHistory: true }
        );
      }

      return;
    }

    if (entry?.ayu === "watch" && entry.id) {
      state.view = "explore";
      state.pane = "watch";

      const current = window.AyuTubeWatch?.current?.();

      if (current?.id === entry.id) {
        applyLayout();
      } else {
        window.AyuTubeWatch?.open?.(
          {
            id: entry.id,
            title: entry.title || "Video",
            uploaderName: entry.channel || "",
            thumbnail: entry.thumbnail || ""
          },
          { fromHistory: true }
        );
      }

      return;
    }

    finishLeave();
  }

  /** Show a channel page. Called by channel.js before it loads the videos. */
  function showChannel(channel, { push = true, entry = false } = {}) {
    rememberOrigin();
    state.view = "explore";
    state.pane = "channel";

    if (push || entry) {
      const record = {
        ayu: "channel",
        id: channel.id || "",
        name: channel.name || ""
      };

      const url = channel.id ? `/?c=${encodeURIComponent(channel.id)}` : "/";
      const current = history.state;

      if (entry) {
        history.replaceState({ ...record, entry: true }, "", url);
      } else if (
        current?.ayu === "channel" &&
        current.id === record.id &&
        current.name === record.name
      ) {
        history.replaceState({ ...record, entry: Boolean(current.entry) }, "", url);
      } else {
        history.pushState(record, "", url);
      }
    }

    applyLayout();
    window.scrollTo({ top: 0 });
  }

  /** Leave the channel page and return to whatever opened it. */
  function leaveChannel() {
    const current = history.state;

    window.AyuTubeChannel?.close?.();

    if (current?.ayu === "channel") {
      if (current.entry) {
        history.replaceState({}, "", location.pathname);
        finishLeave();
      } else {
        history.back(); // popstate applies the layout
      }

      return;
    }

    finishLeave();
  }

  // ---------------------------------------------------------------------------
  // Which channel videos were already seen (drives the "New" marker)
  // ---------------------------------------------------------------------------

  const SEEN_KEY = "ayutube.seen";

  function seenMap() {
    const value = store.get(SEEN_KEY, {});

    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  function markChannelSeen(key) {
    if (!key) return;

    const map = seenMap();

    map[key] = Date.now();
    store.set(SEEN_KEY, map);

    window.AyuTubeFollowing?.recompute?.();
  }

  function setLibraryDot(on) {
    const dot = $('.ay-tab[data-view="library"] .tab-dot');

    if (dot) dot.hidden = !on;
  }

  function isNewSince(key, uploadedAt) {
    const seenAt = seenMap()[key];

    return Boolean(seenAt && uploadedAt && uploadedAt > seenAt);
  }

  // ---------------------------------------------------------------------------
  // Now playing strip (replaces any floating mini-player)
  // ---------------------------------------------------------------------------

  function updateNowPlaying() {
    const box = $("#now-playing");
    if (!box) return;

    const player = getPlayer();
    const current = window.AyuTubeWatch?.current?.();

    const show = Boolean(
      player?.isActive?.() &&
        current &&
        !(state.view === "explore" && state.pane === "watch")
    );

    document.body.classList.toggle("has-now-playing", show);
    box.hidden = !show;

    if (!show) {
      box.replaceChildren();
      delete box.dataset.id;
      return;
    }

    if (box.dataset.id === current.id) return;

    box.dataset.id = current.id;
    box.replaceChildren();

    const title = element("div", "now-playing-title");
    title.append(
      element("small", "", "Paused"),
      document.createTextNode(current.title || "Video")
    );

    const resume = makeButton("Resume", "ay-action ay-action-primary", () => {
      state.view = "explore";
      state.pane = "watch";

      showWatch(current, { push: true });
      getPlayer()?.resume?.();
    });

    const close = makeButton("Close", "ay-action", () => {
      getPlayer()?.close?.();
    });

    const actions = element("div", "ay-inline");
    actions.style.marginTop = "0";
    actions.append(resume, close);

    box.append(title, actions);
  }

  // ---------------------------------------------------------------------------
  // Categories strip
  // ---------------------------------------------------------------------------

  function createCategoryUI() {
    const form = $("#search-form");

    if (!form || $("#ayutube-categories")) return;

    const section = element("section");
    section.id = "ayutube-categories";
    section.setAttribute("aria-label", "Categories");

    const list = element("div", "ay-category-list");
    list.id = "ayutube-category-list";

    const suggestions = element("div", "ay-suggestion-list");
    suggestions.id = "ayutube-suggestion-list";

    section.append(list, suggestions);
    form.insertAdjacentElement("afterend", section);
  }

  async function renderCategories() {
    const module = await ensureCategories();

    const list = $("#ayutube-category-list");
    const suggestions = $("#ayutube-suggestion-list");

    if (!list || !suggestions) return;

    list.replaceChildren();
    suggestions.replaceChildren();

    const all = makeButton("All", "ay-chip", () => selectCategory(null));
    all.setAttribute("aria-pressed", String(!state.category));
    list.append(all);

    const visible = visibleCategories(module);

    if (state.category && !visible.some((item) => item.id === state.category)) {
      state.category = null;
      all.setAttribute("aria-pressed", "true");
    }

    for (const category of visible) {
      const button = makeButton(category.label, "ay-chip", () =>
        selectCategory(category.id)
      );

      button.setAttribute(
        "aria-pressed",
        String(category.id === state.category)
      );
      button.dataset.category = category.id;
      list.append(button);
    }

    const active = state.category ? module.getById(state.category) : null;

    suggestions.hidden = !active;

    if (!active) return;

    const topics = [
      { label: `Explore ${active.label}`, query: active.defaultQuery },
      ...module.getSuggestions(active.id)
    ];

    for (const topic of topics) {
      suggestions.append(
        makeButton(topic.label, "ay-tag", () =>
          runSearch(topic.query, { useCategoryContext: false })
        )
      );
    }
  }

  async function selectCategory(id) {
    try {
      const module = await ensureCategories();
      const category = id ? module.getById(id) : null;

      if (id && !category) {
        throw new Error("This category is not available.");
      }

      state.category = category ? category.id : null;

      const input = $("#search-input");
      if (input) {
        input.placeholder = category
          ? `Search ${category.label} videos`
          : "Search videos";
      }

      await renderCategories();

      state.pane = "browse";
      state.view = "explore";
      showFeed();
    } catch (error) {
      setStatus(error.message || "Unable to load categories.");
    }
  }

  // ---------------------------------------------------------------------------
  // Feed and search results
  // ---------------------------------------------------------------------------

  function showFeed() {
    state.browse = "feed";
    state.lastQuery = "";
    setStatus("");
    applyLayout();

    const key = `${state.category || "all"}|${isStudy() ? "study" : "all"}|${interestsNow().join(",")}`;
    const feed = $("#feed");

    if (feed && (state.feedKey !== key || !feed.childElementCount)) {
      state.feedKey = key;
      state.feedWasGuest = isKnownGuest();
      window.AyuTubeFeed?.render?.(feed, { category: state.category });
    }
  }

  const DURATION_FILTERS = Object.freeze([
    { id: "any", label: "Any length" },
    { id: "short", label: "Under 5 min" },
    { id: "medium", label: "5 to 20 min" },
    { id: "long", label: "Over 20 min" }
  ]);

  function matchesDuration(video, filter) {
    if (filter === "any") return true;
    if (!video.duration) return false;

    if (filter === "short") return video.duration < 300;
    if (filter === "medium") return video.duration >= 300 && video.duration <= 1200;
    return video.duration > 1200;
  }

  function renderResults() {
    const container = $("#results");
    if (!container) return;

    container.replaceChildren();

    const items = state.lastItems;
    const hasDurations = items.some((video) => video.duration > 0);

    const head = element("header", "results-head");
    const titleBlock = element("div");

    titleBlock.append(
      element("h2", "results-title", state.lastQuery)
    );

    const countLine = element("p", "results-count");
    titleBlock.append(countLine);

    const clear = makeButton("Clear search", "ay-action", () => {
      const input = $("#search-input");
      if (input) input.value = "";
      showFeed();
    });

    head.append(titleBlock, clear);
    container.append(head);

    if (hasDurations) {
      const filters = element("div", "filter-row");
      filters.setAttribute("role", "group");
      filters.setAttribute("aria-label", "Filter by length");

      for (const filter of DURATION_FILTERS) {
        const button = makeButton(filter.label, "ay-chip", () => {
          state.durationFilter = filter.id;
          renderResults();
        });

        button.setAttribute(
          "aria-pressed",
          String(state.durationFilter === filter.id)
        );
        filters.append(button);
      }

      container.append(filters);
    }

    const visible = items.filter((video) =>
      matchesDuration(video, state.durationFilter)
    );

    countLine.textContent = `${visible.length} video${visible.length === 1 ? "" : "s"}`;

    if (!visible.length) {
      container.append(
        element(
          "div",
          "ay-empty",
          items.length
            ? "Nothing in this length range."
            : "No videos found."
        )
      );
      return;
    }

    const grid = element("div", "grid");

    for (const video of visible) {
      grid.append(
        window.AyuTubeCards.createCard(video, {
          variant: "grid",
          progress: personalData.map.get(video.id) || null
        })
      );
    }

    container.append(grid);
  }

  async function runSearch(rawQuery, { useCategoryContext = true } = {}) {
    const input = $("#search-input");
    const button = $("#search-button");
    const queryText = String(rawQuery || "").trim();

    if (!queryText) {
      setStatus("Type something to search.");
      input?.focus();
      return;
    }

    if (queryText.length > 200) {
      setStatus("Keep your search under 200 characters.");
      return;
    }

    let query = queryText;

    if (useCategoryContext && state.category) {
      try {
        const module = await ensureCategories();
        query = module.buildSearchQuery(state.category, queryText);
      } catch (error) {
        setStatus(error.message || "Unable to prepare this search.");
        return;
      }
    }

    state.view = "explore";
    state.pane = "browse";
    state.browse = "results";
    state.lastQuery = queryText;
    state.durationFilter = "any";

    if (input) input.value = queryText;
    if (button) button.disabled = true;

    window.AyuTubeSearchUI?.remember?.(queryText);
    window.AyuTubeSearchUI?.close?.();

    const results = $("#results");
    results?.replaceChildren();
    results?.append(window.AyuTubeCards.skeletons(6, "grid"));

    applyLayout();
    setStatus("");

    const requestId = ++state.searchRequestId;

    try {
      const api = await ensureApi();
      const [response] = await Promise.all([api.search(query), getPersonal()]);

      if (requestId !== state.searchRequestId) return;

      const raw = Array.isArray(response?.items)
        ? response.items
        : Array.isArray(response)
          ? response
          : [];

      const seen = new Set();
      const items = [];

      for (const item of raw) {
        const video = toVideo(item);

        if (!validVideoId(video.id) || seen.has(video.id)) continue;
        if (isBlocked(video)) continue;

        seen.add(video.id);
        items.push(video);
      }

      state.lastItems = items;
      renderResults();
      window.AyuTubeSearchUI?.learn?.(items);
    } catch (error) {
      if (requestId !== state.searchRequestId) return;

      results?.replaceChildren();
      setStatus(
        error.message || "Search is unavailable. Try again."
      );
      state.lastItems = [];
    } finally {
      if (requestId === state.searchRequestId && button) {
        button.disabled = false;
      }
    }
  }

  function bindSearch() {
    const form = $("#search-form");
    const input = $("#search-input");

    if (!form || !input || form.dataset.ayutubeBound === "true") return;

    form.dataset.ayutubeBound = "true";

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      runSearch(input.value);
    });
  }

  // ---------------------------------------------------------------------------
  // Actions shared by cards and the watch page
  // ---------------------------------------------------------------------------

  function friendlyError(error, fallback) {
    const message = String(error?.message || "");

    if (/sign in/i.test(message)) {
      return "Sign in from the Account tab to use this.";
    }

    return message || fallback;
  }

  function videoUrl(video, seconds = 0) {
    const url = new URL(location.origin + "/");

    url.searchParams.set("v", video.id);
    if (seconds > 0) url.searchParams.set("t", String(Math.floor(seconds)));

    return url.href;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const area = element("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.append(area);
      area.select();

      let ok = false;

      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }

      area.remove();
      return ok;
    }
  }

  async function copyLink(video, seconds = 0) {
    const ok = await copyText(videoUrl(video, seconds));
    notify(ok ? "Link copied." : "Could not copy. Copy the address manually.");
  }

  const isLiked = (videoId) => personalData.likes.has(videoId);

  /** Like or unlike a video. Returns the new state, or null on failure. */
  async function toggleLike(video) {
    try {
      await ensureAuthModules();

      const lib = window.AyuTubeLibrary;

      if (personalData.likes.has(video.id)) {
        await lib.unlikeVideo(video.id);
        personalData.likes.delete(video.id);
        notify("Like removed.");
        return false;
      }

      await lib.likeVideo(video);
      personalData.likes.add(video.id);
      notify("Liked.");
      return true;
    } catch (error) {
      notify(friendlyError(error, "Could not update your like."));
      return null;
    }
  }

  async function shareVideo(video, seconds = 0) {
    const url = videoUrl(video, seconds);

    if (navigator.share) {
      try {
        await navigator.share({ title: video.title, url });
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }

    const ok = await copyText(url);
    notify(ok ? "Link copied." : "Could not copy. Copy the address manually.");
  }

  async function saveToWatchLater(video) {
    try {
      await ensureAuthModules();
      await window.AyuTubeLibrary.addToWatchLater(video);
      notify("Saved to Watch Later.");
    } catch (error) {
      notify(friendlyError(error, "Could not save this video."));
    }
  }

  async function loadPlaylists() {
    await ensureAuthModules();
    return window.AyuTubeLibrary.getPlaylists();
  }

  async function addToPlaylist(playlist, video) {
    try {
      await ensureAuthModules();
      await window.AyuTubeLibrary.addToPlaylist(playlist.id, video);
      notify(`Added to ${playlist.name}.`);
    } catch (error) {
      notify(friendlyError(error, "Could not add this video."));
    }
  }

  async function toggleChannel(video, kind) {
    try {
      await ensureAuthModules();

      const lib = window.AyuTubeLibrary;
      const key = channelKey(video);

      if (!key || typeof lib.setChannelPref !== "function") {
        throw new Error("This channel cannot be saved.");
      }

      const existing = personalData.prefs.find(
        (pref) => pref.channel_key === key
      );

      if (existing?.kind === kind) {
        await lib.removeChannelPref(key);
        notify(kind === "follow" ? "Unfollowed." : "Channel unblocked.");
      } else {
        await lib.setChannelPref({
          channel_key: key,
          channel_name: video.uploaderName,
          kind
        });
        if (kind === "follow") markChannelSeen(key);

        notify(
          kind === "follow"
            ? `Following ${video.uploaderName}.`
            : `${video.uploaderName} is blocked.`
        );
      }

      invalidatePersonal();
      await getPersonal(true);
      state.feedKey = "";
    } catch (error) {
      notify(friendlyError(error, "Could not update this channel."));
    }
  }

  function channelState(video) {
    const key = channelKey(video);
    const pref = personalData.prefs.find((item) => item.channel_key === key);

    return pref?.kind || "";
  }

  // ---------------------------------------------------------------------------
  // Public UI surface for the other modules
  // ---------------------------------------------------------------------------

  window.AyuTubeUI = Object.freeze({
    state,
    store,
    element,
    makeButton,
    setNotice,
    setStatus,
    notify,
    toVideo,
    validVideoId,
    getPlayer,
    ensureAuthModules,
    ensureCategories,
    ensureApi,
    getPersonal,
    peekPersonal: () => personalData,
    isKnownGuest,
    invalidatePersonal,
    isBlocked,
    channelKey,
    channelState,
    toggleChannel,
    isStudy,
    setStudy,
    visibleCategories,
    afterSignIn,
    afterSignOut,
    applyInterests,
    ENTERTAINMENT,
    setView,
    showWatch,
    leaveWatch,
    showChannel,
    leaveChannel,
    openChannel: (channel, options) => window.AyuTubeChannel?.open?.(channel, options),
    markChannelSeen,
    isNewSince,
    setLibraryDot,
    showFeed,
    selectCategory,
    runSearch,
    applyLayout,
    updateNowPlaying,
    copyLink,
    isLiked,
    toggleLike,
    shareVideo,
    copyText,
    videoUrl,
    friendlyError,
    saveToWatchLater,
    loadPlaylists,
    addToPlaylist,
    playVideo: (video, options) => window.AyuTubeWatch?.open?.(video, options)
  });

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  function configureCards() {
    window.AyuTubeCards?.configure?.({
      play: (video) => window.AyuTubeWatch?.open?.(video),
      saveLater: saveToWatchLater,
      getPlaylists: loadPlaylists,
      addToPlaylist,
      copyLink,
      openChannel: (channel) => window.AyuTubeChannel?.open?.(channel),
      extraItems: (video) => {
        if (typeof window.AyuTubeLibrary?.setChannelPref !== "function") {
          return [];
        }

        const status = channelState(video);

        return [
          {
            label: status === "follow" ? "Unfollow channel" : "Follow channel",
            run: () => toggleChannel(video, "follow")
          },
          {
            label: status === "block" ? "Unblock channel" : "Hide this channel",
            run: () => toggleChannel(video, "block")
          }
        ];
      }
    });
  }

  function openFromLink() {
    const params = new URLSearchParams(location.search);
    const id = params.get("v");

    if (!id || !validVideoId(id)) {
      const channelId = params.get("c");

      if (channelId && window.AyuTubeChannel?.isChannelId?.(channelId)) {
        window.AyuTubeChannel.open({ id: channelId, name: "" }, { entry: true });
        return true;
      }

      return false;
    }

    const start = Number(params.get("t"));

    window.AyuTubeWatch?.openById?.(id, {
      start: Number.isFinite(start) && start > 0 ? start : 0,
      entry: true
    });

    return true;
  }

  async function initialize() {
    const form = $("#search-form");
    const input = $("#search-input");

    if (!form || !input || !$("#feed") || !$("#results")) {
      console.error("AyuTube could not initialize: required elements are missing.");
      return;
    }

    document.body.dataset.study = isStudy() ? "on" : "off";

    createNavigation();
    createApplicationViews();
    createCategoryUI();
    bindSearch();
    configureCards();

    const player = getPlayer();

    player?.on?.("play", updateNowPlaying);
    player?.on?.("close", () => {
      if (state.pane === "watch") {
        leaveWatch();
      } else {
        applyLayout();
      }
    });

    window.addEventListener("popstate", onPopState);

    applyLayout();

    renderCategories().catch((error) => {
      console.error("AyuTube categories failed to load:", error);
    });

    // A shared link opens the watch page straight away; the feed loads behind it.
    openFromLink();
    showFeed();

    window.AyuTubeSearchUI?.init?.();

    // First visit: offer to create an account, sign in or go incognito.
    window.AyuTubeWelcome?.maybeShow?.();

    getPersonal().then((personal) => {
      if (!personal.user) return;

      window.AyuTubeWelcome?.dismiss?.();

      // The strip and feed depend on the chosen interests. They were drawn
      // from the cached interests; correct them only if those were stale.
      renderCategories().catch(() => {});

      // A feed drawn before we knew the visitor was signed in has no personal
      // rows (continue watching, following): draw it again with them.
      if (state.feedWasGuest) state.feedKey = "";

      if (state.view === "explore" && state.pane === "browse" && state.browse === "feed") {
        showFeed();
      }

      window.AyuTubeFollowing?.refreshBadge?.();

      if (!personal.profile.onboarded_at) {
        window.AyuTubeOnboarding?.maybeRun?.();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }

  // Small public entry point kept for integration and testing.
  window.AyuTubeApp = Object.freeze({
    search: (query) => runSearch(query),
    selectCategory,
    setView
  });
})();
