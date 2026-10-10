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
    pane: "browse", // browse | watch (only meaningful inside explore)
    browse: "feed", // feed | results
    category: null,
    feedKey: "",
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
  let personalData = { user: null, history: [], map: new Map(), prefs: [] };

  function getPersonal(force = false) {
    if (!force && personalPromise && Date.now() - personalAt < 60000) {
      return personalPromise;
    }

    personalAt = Date.now();

    personalPromise = (async () => {
      const data = { user: null, history: [], map: new Map(), prefs: [] };

      try {
        await ensureAuthModules();

        const user = await window.AyuTubeAuth.getCurrentUser();

        if (user) {
          data.user = user;
          state.user = user;

          const history = await window.AyuTubeLibrary.getHistory({
            limit: 200
          });

          data.history = Array.isArray(history) ? history : [];

          for (const row of data.history) {
            data.map.set(row.video_id, {
              progress: Number(row.progress_seconds) || 0,
              duration: Number(row.duration_seconds) || 0,
              watchedAt: row.watched_at
            });
          }

          if (typeof window.AyuTubeLibrary.getChannelPrefs === "function") {
            try {
              const prefs = await window.AyuTubeLibrary.getChannelPrefs();
              data.prefs = Array.isArray(prefs) ? prefs : [];
            } catch {
              data.prefs = [];
            }
          }
        }
      } catch {
        // Signed out, offline or not configured: personalisation is optional.
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

  const ENTERTAINMENT = new Set(["oggy", "facts"]);

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

  // ---------------------------------------------------------------------------
  // Navigation (bottom bar on phones, side rail on desktop)
  // ---------------------------------------------------------------------------

  const ICONS = Object.freeze({
    explore:
      "M3.5 3.5h7v7h-7zM13.5 3.5h7v7h-7zM3.5 13.5h7v7h-7zM13.5 13.5h7v7h-7z",
    library: "M6 3.5h12v17l-6-4.2-6 4.2z",
    account: "M8.5 3.5h7v7h-7zM4 20.5v-4.5h16v4.5z"
  });

  function iconSvg(pathData) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    const path = document.createElementNS(ns, "path");

    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    path.setAttribute("d", pathData);
    svg.append(path);

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

      tab.addEventListener("click", () => onTab(item.id));
      nav.append(tab);
    }
  }

  function onTab(id) {
    if (id === "explore" && state.view === "explore") {
      // Tapping Explore again means "take me home".
      if (state.pane === "watch") {
        leaveWatch();
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
    const browsing = explore && !watching;

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

  function setView(view) {
    if (!["explore", "library", "account"].includes(view)) return;

    state.view = view;
    applyLayout();

    if (view === "library") window.AyuTubeLibraryUI?.render?.();
    if (view === "account") window.AyuTubeAccountUI?.render?.();

    window.scrollTo({ top: 0 });
  }

  /**
   * Show the watch page. Called by watch.js right before playback starts.
   * `entry: true` marks a page opened straight from a shared link.
   */
  function showWatch(video, { push = true, entry = false } = {}) {
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
        state.pane = "browse";
        applyLayout();
      } else {
        history.back(); // popstate applies the layout
      }

      return;
    }

    state.pane = "browse";
    applyLayout();
  }

  function onPopState(event) {
    const entry = event.state;

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

    state.pane = "browse";
    applyLayout();
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

    for (const category of module.getAll()) {
      if (isStudy() && ENTERTAINMENT.has(category.id)) continue;

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

    const key = `${state.category || "all"}|${isStudy() ? "study" : "all"}`;
    const feed = $("#feed");

    if (feed && (state.feedKey !== key || !feed.childElementCount)) {
      state.feedKey = key;
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

  async function copyLink(video) {
    const ok = await copyText(videoUrl(video));
    notify(ok ? "Link copied." : "Could not copy. Copy the address manually.");
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
    invalidatePersonal,
    isBlocked,
    channelKey,
    channelState,
    toggleChannel,
    isStudy,
    setStudy,
    ENTERTAINMENT,
    setView,
    showWatch,
    leaveWatch,
    showFeed,
    selectCategory,
    runSearch,
    applyLayout,
    updateNowPlaying,
    copyLink,
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

    if (!id || !validVideoId(id)) return false;

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
