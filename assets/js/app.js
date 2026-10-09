
(() => {
  "use strict";

  const SELECTORS = Object.freeze({
    form: "#search-form",
    input: "#search-input",
    searchButton: "#search-button",
    status: "#status",
    results: "#results",
    player: "#player-panel",
    header: ".topbar",
    footer: ".footer"
  });

  const MODULES = Object.freeze({
    categories: "/assets/js/categories.js",
    supabase: "/assets/js/supabase.js",
    auth: "/assets/js/auth.js",
    library: "/assets/js/library.js"
  });

  const state = {
    activeView: "explore",
    activeCategory: null,
    activeLibrarySection: "playlists",
    activePlaylistId: null,
    authMode: "signin",
    searchRequestId: 0,
    user: null
  };

  const scriptPromises = new Map();

  const $ = (selector, parent = document) =>
    parent.querySelector(selector);

  function element(tag, className, text) {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
  }

  function makeButton(label, className, onClick) {
    const button = element("button", className, label);

    button.type = "button";
    button.addEventListener("click", onClick);

    return button;
  }

  function setStatus(message) {
    const status = $(SELECTORS.status);
    if (status) status.textContent = message;
  }

  function setNotice(container, message, kind = "info") {
    if (!container) return;

    const notice = element("p", `ay-notice ay-notice-${kind}`, message);
    notice.setAttribute("role", kind === "error" ? "alert" : "status");

    container.append(notice);
  }

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
    if (!window.AyuTubeSupabase) {
      await loadScript(MODULES.supabase);
    }

    if (!window.AyuTubeAuth) {
      await loadScript(MODULES.auth);
    }

    if (!window.AyuTubeLibrary) {
      await loadScript(MODULES.library);
    }

    if (!window.AyuTubeAuth || !window.AyuTubeLibrary) {
      throw new Error("Account services could not be initialized.");
    }
  }

  // ---------------------------------------------------------------------------
  // Visual theme and navigation
  // ---------------------------------------------------------------------------

  function installStyles() {
    if ($("#ayutube-runtime-styles")) return;

    const style = element("style");
    style.id = "ayutube-runtime-styles";

    style.textContent = `
      :root {
        --ay-black: #050607;
        --ay-graphite: #1b1b20;
        --ay-pink: #ff4165;
        --ay-white: #f5f4f2;
        --ay-muted: #929298;
        --ay-line: #29292d;
      }

      body { background: var(--ay-black); }

      .ay-tabs {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 5px;
        margin: 0 0 24px;
        padding: 5px;
        border: 1px solid var(--ay-line);
        border-radius: 15px;
        background: #101012;
      }

      .ay-tab {
        min-height: 42px;
        border: 0;
        border-radius: 10px;
        padding: 9px 5px;
        background: transparent;
        color: var(--ay-muted);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      }

      .ay-tab[aria-current="page"] {
        background: var(--ay-graphite);
        color: var(--ay-white);
      }

      .ay-tab:focus-visible,
      .ay-chip:focus-visible,
      .ay-action:focus-visible {
        outline: 2px solid var(--ay-pink);
        outline-offset: 3px;
      }

      .ay-section-heading {
        margin: 28px 0 7px;
        font-size: 21px;
        line-height: 1.3;
        letter-spacing: -.55px;
      }

      .ay-subtitle {
        margin: 0 0 17px;
        color: var(--ay-muted);
        font-size: 13px;
        line-height: 1.6;
      }

      .ay-category-list,
      .ay-suggestion-list,
      .ay-library-switch {
        display: flex;
        flex-wrap: wrap;
        gap: 9px;
      }

      .ay-chip {
        max-width: 100%;
        border: 1px solid var(--ay-line);
        border-radius: 999px;
        padding: 10px 13px;
        background: #111113;
        color: #d7d7db;
        font-size: 12px;
        line-height: 1.2;
        cursor: pointer;
        overflow-wrap: anywhere;
      }

      .ay-chip[aria-pressed="true"] {
        border-color: var(--ay-pink);
        background: rgba(255, 65, 101, .10);
        color: var(--ay-white);
      }

      .ay-category-description {
        min-height: 20px;
        margin: 12px 2px;
        color: var(--ay-muted);
        font-size: 12px;
        line-height: 1.5;
      }

      .ay-subheading {
        margin: 22px 0 12px;
        font-size: 13px;
        font-weight: 600;
      }

      .ay-view {
        margin-top: 12px;
      }

      .ay-view h1 {
        margin: 22px 0 8px;
        font-size: 26px;
        letter-spacing: -.8px;
      }

      .ay-panel {
        margin: 13px 0;
        padding: 15px;
        border: 1px solid var(--ay-line);
        border-radius: 14px;
        background: #101012;
      }

      .ay-panel-title {
        margin: 0 0 6px;
        font-size: 14px;
        overflow-wrap: anywhere;
      }

      .ay-panel-copy {
        margin: 0;
        color: var(--ay-muted);
        font-size: 12px;
        line-height: 1.6;
        overflow-wrap: anywhere;
      }

      .ay-action {
        min-height: 41px;
        border: 1px solid var(--ay-line);
        border-radius: 11px;
        padding: 10px 13px;
        background: var(--ay-graphite);
        color: var(--ay-white);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }

      .ay-action-primary {
        border-color: var(--ay-pink);
        background: var(--ay-pink);
        color: #16070a;
      }

      .ay-action-danger {
        color: #ff8da3;
      }

      .ay-stack {
        display: grid;
        gap: 10px;
      }

      .ay-form {
        display: grid;
        gap: 12px;
        margin-top: 16px;
      }

      .ay-field {
        display: grid;
        gap: 7px;
        color: #c9c9cd;
        font-size: 12px;
      }

      .ay-field input {
        width: 100%;
        min-height: 45px;
        border: 1px solid var(--ay-line);
        border-radius: 10px;
        padding: 11px 12px;
        background: #09090b;
        color: var(--ay-white);
        font-size: 14px;
        outline: none;
      }

      .ay-field input:focus {
        border-color: var(--ay-pink);
      }

      .ay-inline {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 10px;
      }

      .ay-notice {
        margin: 12px 0;
        color: #c9c9cd;
        font-size: 12px;
        line-height: 1.6;
        overflow-wrap: anywhere;
      }

      .ay-notice-error { color: #ff8da3; }
      .ay-notice-success { color: #8ee2b1; }

      .ay-result-card {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 9px;
      }

      .ay-result-card > .result {
        width: 100%;
        min-width: 0;
      }

      .ay-save-button {
        align-self: center;
        border: 1px solid var(--ay-line);
        border-radius: 9px;
        padding: 8px 9px;
        background: #111113;
        color: #dedee1;
        font-size: 11px;
        cursor: pointer;
      }

      .ay-save-button:disabled,
      .ay-action:disabled,
      .ay-chip:disabled {
        opacity: .5;
        cursor: wait;
      }

      .ay-card-actions {
        display: grid;
        gap: 6px;
        align-self: center;
      }

      .ay-picker {
        grid-column: 1 / -1;
        padding: 12px;
        border: 1px solid var(--ay-line);
        border-radius: 12px;
        background: #101012;
      }

      .ay-picker-title {
        margin: 0 0 10px;
        color: var(--ay-muted);
        font-size: 12px;
      }

      .ay-picker .ay-suggestion-list,
      .ay-picker-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .ay-item-title {
        display: block;
        margin-bottom: 5px;
        color: var(--ay-white);
        font-size: 13px;
        line-height: 1.5;
        overflow-wrap: anywhere;
      }

      .ay-item-meta {
        display: block;
        margin-bottom: 12px;
        color: var(--ay-muted);
        font-size: 11px;
        line-height: 1.5;
        overflow-wrap: anywhere;
      }

      .ay-empty {
        padding: 22px 14px;
        border: 1px dashed var(--ay-line);
        border-radius: 13px;
        color: var(--ay-muted);
        font-size: 13px;
        line-height: 1.6;
        text-align: center;
      }

      .ay-footer-note {
        margin-top: 12px;
        color: var(--ay-muted);
        font-size: 11px;
        line-height: 1.5;
      }

      @media (max-width: 390px) {
        .ay-result-card {
          grid-template-columns: minmax(0, 1fr);
        }

        .ay-card-actions {
          justify-self: start;
          grid-auto-flow: column;
        }

        .ay-section-heading {
          font-size: 19px;
        }
      }
    `;

    document.head.append(style);
  }

  function updateBrand() {
    const brand = $(".wordmark");
    if (!brand) return;

    brand.replaceChildren();

    const ayu = element("span", "", "AYU");
    const tube = element("span", "", "TUBE");

    ayu.style.color = "var(--ay-pink)";
    tube.style.color = "var(--ay-white)";

    brand.append(ayu, tube);
    brand.setAttribute("aria-label", "AyuTube home");

    const note = $(".top-note");
    if (note) note.textContent = "VIDEO DISCOVERY";

    const footer = $(SELECTORS.footer);
    if (footer) footer.textContent = "AYUTUBE · WATCH WHAT MATTERS";
  }

  function createNavigation() {
    const header = $(SELECTORS.header);

    if (!header || $("#ayutube-tabs")) return;

    const tabs = element("nav", "ay-tabs");
    tabs.id = "ayutube-tabs";
    tabs.setAttribute("aria-label", "Main navigation");

    const navItems = [
      { id: "explore", label: "Explore" },
      { id: "library", label: "Library" },
      { id: "account", label: "Account" }
    ];

    for (const item of navItems) {
      const tab = makeButton(item.label, "ay-tab", () => {
        setView(item.id);
      });

      tab.dataset.view = item.id;
      tab.setAttribute(
        "aria-current",
        item.id === state.activeView ? "page" : "false"
      );

      tabs.append(tab);
    }

    header.insertAdjacentElement("afterend", tabs);
  }

  function createApplicationViews() {
    const footer = $(SELECTORS.footer);

    if (!footer) return;

    if (!$("#ayutube-library-view")) {
      const library = element("section", "ay-view");
      library.id = "ayutube-library-view";
      library.hidden = true;
      library.setAttribute("aria-label", "Your library");

      const heading = element("h1", "", "Your library");
      const subtitle = element(
        "p",
        "ay-subtitle",
        "Your playlists, saved videos and watch history."
      );
      const content = element("div");
      content.id = "ayutube-library-content";

      library.append(heading, subtitle, content);
      footer.before(library);
    }

    if (!$("#ayutube-account-view")) {
      const account = element("section", "ay-view");
      account.id = "ayutube-account-view";
      account.hidden = true;
      account.setAttribute("aria-label", "Your account");

      account.append(
        element("h1", "", "Your account"),
        element(
          "p",
          "ay-subtitle",
          "Sign in to keep your AyuTube library connected across sessions."
        )
      );

      const content = element("div");
      content.id = "ayutube-account-content";
      account.append(content);
      footer.before(account);
    }
  }

  // ---------------------------------------------------------------------------
  // Category discovery UI
  // ---------------------------------------------------------------------------

  function createCategoryUI() {
    const form = $(SELECTORS.form);
    const status = $(SELECTORS.status);

    if (!form || !status || $("#ayutube-categories")) return;

    const section = element("section");
    section.id = "ayutube-categories";
    section.setAttribute("aria-label", "Explore categories");

    section.append(
      element("h2", "ay-section-heading", "What are we watching?"),
      element(
        "p",
        "ay-subtitle",
        "Pick a category or jump straight into a topic."
      )
    );

    const categoryList = element("div", "ay-category-list");
    categoryList.id = "ayutube-category-list";
    categoryList.setAttribute("aria-label", "Video categories");

    const description = element("p", "ay-category-description");
    description.id = "ayutube-category-description";
    description.setAttribute("aria-live", "polite");

    const suggestionHeading = element(
      "h3",
      "ay-subheading",
      "Suggested searches"
    );

    const suggestionList = element("div", "ay-suggestion-list");
    suggestionList.id = "ayutube-suggestion-list";

    section.append(
      categoryList,
      description,
      suggestionHeading,
      suggestionList
    );

    form.insertAdjacentElement("afterend", section);
  }

  async function renderCategories() {
    const module = await ensureCategories();

    const list = $("#ayutube-category-list");
    const description = $("#ayutube-category-description");
    const suggestions = $("#ayutube-suggestion-list");

    if (!list || !description || !suggestions) return;

    list.replaceChildren();
    suggestions.replaceChildren();

    for (const category of module.getAll()) {
      const button = makeButton(
        category.label,
        "ay-chip",
        () => selectCategory(category.id)
      );

      button.setAttribute(
        "aria-pressed",
        String(category.id === state.activeCategory)
      );

      button.dataset.category = category.id;
      list.append(button);
    }

    const active = state.activeCategory
      ? module.getById(state.activeCategory)
      : null;

    description.textContent = active
      ? active.description
      : "Cartoons, mathematics, coding, puzzles and curious facts.";

    if (!active) {
      const hint = element(
        "p",
        "ay-footer-note",
        "Choose a category to see curated search ideas."
      );

      suggestions.append(hint);
      return;
    }

    const defaultButton = makeButton(
      `Explore ${active.label}`,
      "ay-chip",
      () => runSearch(active.defaultQuery, { useCategoryContext: false })
    );

    suggestions.append(defaultButton);

    for (const suggestion of module.getSuggestions(active.id)) {
      const button = makeButton(
        suggestion.label,
        "ay-chip",
        () => runSearch(suggestion.query, { useCategoryContext: false })
      );

      suggestions.append(button);
    }
  }

  async function selectCategory(id) {
    try {
      const module = await ensureCategories();
      const category = module.getById(id);

      if (!category) {
        throw new Error("This category is not available.");
      }

      state.activeCategory = category.id;

      await renderCategories();

      const input = $(SELECTORS.input);
      if (input) {
        input.placeholder = `Search ${category.label} videos`;
      }
    } catch (error) {
      setStatus(error.message || "Unable to load categories.");
    }
  }

  // ---------------------------------------------------------------------------
  // Search API and video results
  // ---------------------------------------------------------------------------

  function normalizeVideo(item) {
    const url = typeof item?.url === "string" ? item.url : "";
    const fromUrl = url.match(
      /(?:[?&]v=|youtu\.be\/|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{6,20})/
    );

    const id = String(item?.id || fromUrl?.[1] || "");

    return {
      id,
      title:
        typeof item?.title === "string" && item.title.trim()
          ? item.title.trim()
          : "Untitled video",
      uploaderName:
        item?.uploaderName || item?.channel || item?.channelTitle || "Unknown channel",
      channel: item?.channel || item?.uploaderName || item?.channelTitle || "",
      thumbnail: item?.thumbnail || item?.thumbnailUrl || "",
      url
    };
  }

  function validVideoId(id) {
    return /^[A-Za-z0-9_-]{6,20}$/.test(String(id || ""));
  }

  function thumbnailFor(video) {
    if (video.thumbnail) return video.thumbnail;

    return `https://i.ytimg.com/vi/${encodeURIComponent(video.id)}/hqdefault.jpg`;
  }

  /**
   * Show or hide a small "add to playlist" picker under a result card.
   */
  async function togglePlaylistPicker(card, video, trigger) {
    const existing = card.querySelector(".ay-picker");

    if (existing) {
      existing.remove();
      trigger.setAttribute("aria-expanded", "false");
      return;
    }

    trigger.disabled = true;

    try {
      await ensureAuthModules();

      const playlists = await window.AyuTubeLibrary.getPlaylists();

      if (!playlists.length) {
        setStatus("Create a playlist in Library first, then add videos here.");
        return;
      }

      const picker = element("div", "ay-picker");
      picker.setAttribute("role", "group");
      picker.setAttribute("aria-label", "Choose a playlist");

      picker.append(element("p", "ay-picker-title", "Add to playlist"));

      const list = element("div", "ay-picker-list");

      for (const playlist of playlists) {
        const choice = makeButton(playlist.name, "ay-chip", async () => {
          choice.disabled = true;

          try {
            await window.AyuTubeLibrary.addToPlaylist(playlist.id, video);

            setStatus(`Added to "${playlist.name}".`);
            picker.remove();
            trigger.setAttribute("aria-expanded", "false");
          } catch (error) {
            setStatus(error.message || "Unable to add this video.");
            choice.disabled = false;
          }
        });

        list.append(choice);
      }

      picker.append(list);
      card.append(picker);
      trigger.setAttribute("aria-expanded", "true");
    } catch (error) {
      if (/sign in/i.test(error.message)) {
        setStatus("Sign in through Account to use playlists.");
      } else {
        setStatus(error.message || "Unable to load your playlists.");
      }
    } finally {
      trigger.disabled = false;
    }
  }

  function makeResultCard(raw) {
    const video = normalizeVideo(raw);

    if (!validVideoId(video.id)) return null;

    const card = element("article", "ay-result-card");
    const playButton = element("button", "result");

    playButton.type = "button";
    playButton.setAttribute("aria-label", `Play ${video.title}`);

    const thumbWrap = element("span", "thumb-wrap");
    const image = element("img", "thumb");

    image.src = thumbnailFor(video);
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";

    image.addEventListener("error", () => {
      image.style.visibility = "hidden";
    }, { once: true });

    const badge = element("span", "play-badge", "▶");
    thumbWrap.append(image, badge);

    const copy = element("span", "result-copy");
    const title = element("span", "result-title", video.title);
    const channel = element("span", "result-channel", video.uploaderName);

    copy.append(title, channel);
    playButton.append(thumbWrap, copy);

    playButton.addEventListener("click", () => {
      if (window.AyuTubePlayer?.play) {
        window.AyuTubePlayer.play(video);
      } else if (window.MiniTubePlayer?.play) {
        window.MiniTubePlayer.play(video);
      } else {
        setStatus("The video player is not ready yet.");
      }
    });

    const saveButton = makeButton(
      "＋ Save",
      "ay-save-button",
      async () => {
        saveButton.disabled = true;

        try {
          await ensureAuthModules();
          await window.AyuTubeLibrary.addToWatchLater(video);

          saveButton.textContent = "Saved ✓";
          setStatus("Added to Watch Later.");
        } catch (error) {
          if (/sign in/i.test(error.message)) {
            setStatus("Sign in through Account to save videos.");
          } else {
            setStatus(error.message || "Unable to save this video.");
          }
        } finally {
          saveButton.disabled = false;
        }
      }
    );

    saveButton.setAttribute("aria-label", `Save ${video.title} to Watch Later`);

    const playlistButton = makeButton(
      "＋ Playlist",
      "ay-save-button",
      () => togglePlaylistPicker(card, video, playlistButton)
    );

    playlistButton.setAttribute(
      "aria-label",
      `Add ${video.title} to a playlist`
    );
    playlistButton.setAttribute("aria-expanded", "false");

    const actions = element("div", "ay-card-actions");
    actions.append(saveButton, playlistButton);

    card.append(playButton, actions);

    return card;
  }

  function renderResults(items) {
    const results = $(SELECTORS.results);
    if (!results) return;

    results.replaceChildren();

    const fragment = document.createDocumentFragment();
    let validCount = 0;

    for (const raw of items) {
      const card = makeResultCard(raw);
      if (!card) continue;

      fragment.append(card);
      validCount += 1;
    }

    results.append(fragment);

    return validCount;
  }

  async function runSearch(
    rawQuery,
    { useCategoryContext = true } = {}
  ) {
    const input = $(SELECTORS.input);
    const form = $(SELECTORS.form);
    const button = $(SELECTORS.searchButton);
    const results = $(SELECTORS.results);
    const queryText = String(rawQuery || "").trim();

    if (!queryText) {
      setStatus("Enter something to search for.");
      input?.focus();
      return;
    }

    if (queryText.length > 200) {
      setStatus("Keep your search under 200 characters.");
      return;
    }

    let query = queryText;

    if (useCategoryContext && state.activeCategory) {
      try {
        const module = await ensureCategories();
        query = module.buildSearchQuery(state.activeCategory, queryText);
      } catch (error) {
        setStatus(error.message || "Unable to prepare this search.");
        return;
      }
    }

    setView("explore");

    if (input) input.value = queryText;
    if (button) button.disabled = true;
    if (results) results.replaceChildren();

    const requestId = ++state.searchRequestId;

    setStatus("Searching videos…");

    try {
      if (!window.AyuTubeAPI?.search && !window.MiniTubeAPI?.search) {
        await loadScript("/assets/js/api.js");
      }

      const api = window.AyuTubeAPI || window.MiniTubeAPI;

      if (typeof api?.search !== "function") {
        throw new Error("The search API is not ready yet.");
      }

      const response = await api.search(query);

      if (requestId !== state.searchRequestId) return;

      const items = Array.isArray(response?.items)
        ? response.items
        : Array.isArray(response)
          ? response
          : [];

      const count = renderResults(items) || 0;

      if (count > 0) {
        setStatus(`${count} video${count === 1 ? "" : "s"} found.`);
      } else {
        setStatus(
          items.length
            ? "No playable video IDs were returned."
            : "No videos found. Try a different search."
        );
      }
    } catch (error) {
      if (requestId !== state.searchRequestId) return;

      setStatus(
        error.message || "Search is temporarily unavailable. Try again."
      );
    } finally {
      if (requestId === state.searchRequestId && button) {
        button.disabled = false;
      }
    }
  }

  function bindSearch() {
    const form = $(SELECTORS.form);
    const input = $(SELECTORS.input);

    if (!form || !input || form.dataset.ayutubeBound === "true") return;

    form.dataset.ayutubeBound = "true";

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      runSearch(input.value);
    });
  }

  // ---------------------------------------------------------------------------
  // Main tab handling
  // ---------------------------------------------------------------------------

  function setView(view) {
    const validViews = new Set(["explore", "library", "account"]);

    if (!validViews.has(view)) return;

    const previousView = state.activeView;
    state.activeView = view;

    const player = window.AyuTubePlayer || window.MiniTubePlayer;

    // Leaving Explore: pause so audio does not continue in a hidden panel.
    if (view !== "explore" && previousView === "explore") {
      player?.pause?.();
    }

    const exploreElements = [
      $(SELECTORS.form),
      $("#ayutube-categories"),
      $(SELECTORS.status),
      $(SELECTORS.results)
    ].filter(Boolean);

    for (const node of exploreElements) {
      node.hidden = view !== "explore";
    }

    // The player panel is managed by player.js. Only show it when a video
    // is actually loaded, so returning to Explore never reveals an empty
    // "NOW PLAYING" box.
    const playerPanel = $(SELECTORS.player);

    if (playerPanel) {
      if (view !== "explore") {
        playerPanel.hidden = true;
      } else if (previousView !== "explore") {
        playerPanel.hidden = !player?.isActive?.();
      }
    }

    const libraryView = $("#ayutube-library-view");
    const accountView = $("#ayutube-account-view");

    if (libraryView) libraryView.hidden = view !== "library";
    if (accountView) accountView.hidden = view !== "account";

    for (const tab of document.querySelectorAll(".ay-tab")) {
      const active = tab.dataset.view === view;

      tab.setAttribute("aria-current", active ? "page" : "false");
    }

    if (view === "library") renderLibrary();
    if (view === "account") renderAccount();
  }

  // ---------------------------------------------------------------------------
  // Account UI
  // ---------------------------------------------------------------------------

  function renderAccountForm(container, notice = "") {
    container.replaceChildren();

    const form = element("form", "ay-form");
    const isSignup = state.authMode === "signup";

    if (notice) {
      setNotice(container, notice, "info");
    }

    if (isSignup) {
      const nameLabel = element("label", "ay-field", "Display name");
      const nameInput = element("input");

      nameInput.name = "displayName";
      nameInput.autocomplete = "name";
      nameInput.maxLength = 80;
      nameInput.placeholder = "Your name";
      nameInput.type = "text";

      nameLabel.append(nameInput);
      form.append(nameLabel);
    }

    const emailLabel = element("label", "ay-field", "Email address");
    const emailInput = element("input");

    emailInput.type = "email";
    emailInput.name = "email";
    emailInput.required = true;
    emailInput.autocomplete = "email";
    emailInput.maxLength = 254;
    emailInput.placeholder = "you@example.com";

    emailLabel.append(emailInput);

    const passwordLabel = element("label", "ay-field", "Password");
    const passwordInput = element("input");

    passwordInput.type = "password";
    passwordInput.name = "password";
    passwordInput.required = true;
    passwordInput.autocomplete = isSignup ? "new-password" : "current-password";
    passwordInput.minLength = isSignup ? 8 : 1;
    passwordInput.maxLength = 128;
    passwordInput.placeholder = isSignup
      ? "At least 8 characters"
      : "Your password";

    passwordLabel.append(passwordInput);

    const submit = element(
      "button",
      "ay-action ay-action-primary",
      isSignup ? "Create account" : "Sign in"
    );

    submit.type = "submit";

    const switchMode = makeButton(
      isSignup ? "Already have an account? Sign in" : "New here? Create an account",
      "ay-action",
      () => {
        state.authMode = isSignup ? "signin" : "signup";
        renderAccount();
      }
    );

    form.append(emailLabel, passwordLabel, submit);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      submit.disabled = true;
      container.querySelector(".ay-notice")?.remove();

      try {
        await ensureAuthModules();

        let result;

        if (isSignup) {
          result = await window.AyuTubeAuth.signUp({
            email: emailInput.value,
            password: passwordInput.value,
            displayName: form.elements.displayName?.value
          });

          if (result.needsEmailConfirmation) {
            renderAccountForm(
              container,
              "Account request received. Check your email if confirmation is required."
            );

            setNotice(
              container,
              "Your account needs email confirmation before sign-in.",
              "success"
            );

            return;
          }
        } else {
          result = await window.AyuTubeAuth.signIn({
            email: emailInput.value,
            password: passwordInput.value
          });
        }

        state.user = result.user || null;
        renderAccount();
      } catch (error) {
        setNotice(
          container,
          error.message || "Unable to complete the account request.",
          "error"
        );
      } finally {
        submit.disabled = false;
      }
    });

    container.append(form, switchMode);
  }

  async function renderAccount() {
    const container = $("#ayutube-account-content");
    if (!container) return;

    container.replaceChildren();
    setNotice(container, "Loading account…");

    try {
      await ensureAuthModules();

      const user = await window.AyuTubeAuth.getCurrentUser();
      state.user = user;

      container.replaceChildren();

      if (user) {
        const panel = element("div", "ay-panel");
        panel.append(
          element("h2", "ay-panel-title", "Signed in"),
          element("p", "ay-panel-copy", user.email || "Your AyuTube account")
        );

        const actions = element("div", "ay-inline");
        actions.style.marginTop = "14px";

        actions.append(
          makeButton("Open library", "ay-action ay-action-primary", () => {
            setView("library");
          }),
          makeButton("Sign out", "ay-action ay-action-danger", async () => {
            try {
              await window.AyuTubeAuth.signOut();
              state.user = null;
              renderAccount();
            } catch (error) {
              setNotice(
                container,
                error.message || "Unable to sign out.",
                "error"
              );
            }
          })
        );

        panel.append(actions);
        container.append(panel);
        return;
      }

      renderAccountForm(container);
    } catch {
      container.replaceChildren();

      renderAccountForm(
        container,
        "Account services are waiting for Supabase configuration. You can finish the connection during the final deployment step."
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Personal library
  // ---------------------------------------------------------------------------

  function renderItemCard({
    title,
    subtitle = "",
    play,
    remove,
    removeLabel = "Remove"
  }) {
    const panel = element("div", "ay-panel");
    panel.append(element("span", "ay-item-title", title));

    if (subtitle) {
      panel.append(element("span", "ay-item-meta", subtitle));
    }

    const actions = element("div", "ay-inline");

    if (play) {
      actions.append(
        makeButton("▶ Play", "ay-action ay-action-primary", play)
      );
    }

    if (remove) {
      actions.append(
        makeButton(removeLabel, "ay-action ay-action-danger", remove)
      );
    }

    if (actions.childElementCount) panel.append(actions);

    return panel;
  }

  /**
   * Play a saved video from the Library.
   * Switch to Explore first so the player panel is visible and can scroll
   * into view when playback starts.
   */
  function playFromLibrary(video) {
    setView("explore");

    const player = window.AyuTubePlayer || window.MiniTubePlayer;

    if (player?.play) {
      player.play(video);
    } else {
      setStatus("The video player is not ready yet.");
    }
  }

  async function openPlaylist(playlistId, playlistName) {
    state.activePlaylistId = playlistId;

    const container = $("#ayutube-library-content");
    if (!container) return;

    container.replaceChildren();

    const back = makeButton("← All playlists", "ay-action", () => {
      state.activePlaylistId = null;
      renderLibrary();
    });

    container.append(
      back,
      element("h2", "ay-section-heading", playlistName),
      element("p", "ay-subtitle", "Videos saved in this playlist.")
    );

    try {
      const items = await window.AyuTubeLibrary.getPlaylistItems(playlistId);

      if (!items.length) {
        container.append(
          element("div", "ay-empty", "This playlist is empty.")
        );
        return;
      }

      for (const item of items) {
        container.append(
          renderItemCard({
            title: item.title,
            subtitle: item.channel_title,
            play: () => {
              playFromLibrary({
                id: item.video_id,
                title: item.title,
                uploaderName: item.channel_title,
                thumbnail: item.thumbnail_url
              });
            },
            remove: async () => {
              try {
                await window.AyuTubeLibrary.removeFromPlaylist(item.id);
                await openPlaylist(playlistId, playlistName);
              } catch (error) {
                setNotice(container, error.message, "error");
              }
            }
          })
        );
      }
    } catch (error) {
      setNotice(container, error.message, "error");
    }
  }

  async function renderLibrarySection(container) {
    container.replaceChildren();

    if (state.activePlaylistId) return;

    const switcher = element("div", "ay-library-switch");

    const sections = [
      { id: "playlists", label: "Playlists" },
      { id: "later", label: "Watch Later" },
      { id: "history", label: "History" }
    ];

    for (const section of sections) {
      const button = makeButton(
        section.label,
        "ay-chip",
        () => {
          state.activeLibrarySection = section.id;
          renderLibrary();
        }
      );

      button.setAttribute(
        "aria-pressed",
        String(state.activeLibrarySection === section.id)
      );

      switcher.append(button);
    }

    container.append(switcher);

    if (state.activeLibrarySection === "playlists") {
      const createForm = element("form", "ay-form");
      const nameLabel = element("label", "ay-field", "New playlist");
      const nameInput = element("input");

      nameInput.name = "playlistName";
      nameInput.type = "text";
      nameInput.required = true;
      nameInput.maxLength = 100;
      nameInput.placeholder = "e.g. Weekend Watchlist";

      nameLabel.append(nameInput);

      const descriptionInput = element("input");
      descriptionInput.type = "text";
      descriptionInput.name = "description";
      descriptionInput.maxLength = 500;
      descriptionInput.placeholder = "Optional description";

      const descriptionLabel = element("label", "ay-field", "Description");
      descriptionLabel.append(descriptionInput);

      const createButton = element(
        "button",
        "ay-action ay-action-primary",
        "Create playlist"
      );

      createButton.type = "submit";
      createForm.append(nameLabel, descriptionLabel, createButton);

      createForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        createButton.disabled = true;

        try {
          await window.AyuTubeLibrary.createPlaylist({
            name: nameInput.value,
            description: descriptionInput.value
          });

          await renderLibrary();
        } catch (error) {
          setNotice(container, error.message, "error");
        } finally {
          createButton.disabled = false;
        }
      });

      container.append(createForm);

      const playlists = await window.AyuTubeLibrary.getPlaylists();

      if (!playlists.length) {
        container.append(
          element("div", "ay-empty", "Your playlists will appear here.")
        );
        return;
      }

      // Favorites first; the original newest-first order is kept within groups.
      const ordered = [...playlists].sort(
        (a, b) => Number(Boolean(b.is_favorite)) - Number(Boolean(a.is_favorite))
      );

      for (const playlist of ordered) {
        const panel = element("div", "ay-panel");
        const open = makeButton(
          `${playlist.is_favorite ? "★ " : ""}${playlist.name}`,
          "ay-action",
          () => openPlaylist(playlist.id, playlist.name)
        );

        open.style.width = "100%";
        open.style.textAlign = "left";

        panel.append(
          open,
          element(
            "p",
            "ay-panel-copy",
            playlist.description || "Your personal playlist"
          )
        );

        const actions = element("div", "ay-inline");
        actions.style.marginTop = "12px";

        actions.append(
          makeButton("Open", "ay-action ay-action-primary", () => {
            openPlaylist(playlist.id, playlist.name);
          }),
          makeButton(
            playlist.is_favorite ? "★ Favorite" : "☆ Favorite",
            "ay-action",
            async () => {
              try {
                await window.AyuTubeLibrary.setPlaylistFavorite(
                  playlist.id,
                  !playlist.is_favorite
                );
                await renderLibrary();
              } catch (error) {
                setNotice(container, error.message, "error");
              }
            }
          ),
          makeButton("Delete", "ay-action ay-action-danger", async () => {
            if (!confirm(`Delete the playlist "${playlist.name}"?`)) return;

            try {
              await window.AyuTubeLibrary.deletePlaylist(playlist.id);
              await renderLibrary();
            } catch (error) {
              setNotice(container, error.message, "error");
            }
          })
        );

        panel.append(actions);
        container.append(panel);
      }

      return;
    }

    const isHistory = state.activeLibrarySection === "history";

    const items = isHistory
      ? await window.AyuTubeLibrary.getHistory({ limit: 100 })
      : await window.AyuTubeLibrary.getWatchLater({ limit: 100 });

    if (!items.length) {
      container.append(
        element(
          "div",
          "ay-empty",
          isHistory
            ? "Videos you watch will appear in your history."
            : "Use the + Save button on a search result to keep it here."
        )
      );
      return;
    }

    for (const item of items) {
      const videoId = item.video_id;

      container.append(
        renderItemCard({
          title: item.title,
          subtitle: item.channel_title,
          play: () => {
            playFromLibrary({
              id: videoId,
              title: item.title,
              uploaderName: item.channel_title,
              thumbnail: item.thumbnail_url
            });
          },
          remove: async () => {
            try {
              if (isHistory) {
                await window.AyuTubeLibrary.removeHistoryEntry(videoId);
              } else {
                await window.AyuTubeLibrary.removeFromWatchLater(videoId);
              }

              await renderLibrary();
            } catch (error) {
              setNotice(container, error.message, "error");
            }
          }
        })
      );
    }

    if (isHistory) {
      container.append(
        makeButton("Clear history", "ay-action ay-action-danger", async () => {
          if (!confirm("Clear your entire watch history?")) return;

          try {
            await window.AyuTubeLibrary.clearHistory();
            await renderLibrary();
          } catch (error) {
            setNotice(container, error.message, "error");
          }
        })
      );
    }
  }

  async function renderLibrary() {
    const container = $("#ayutube-library-content");
    if (!container) return;

    if (state.activePlaylistId) {
      return;
    }

    container.replaceChildren();
    setNotice(container, "Loading your library…");

    try {
      await ensureAuthModules();

      const user = await window.AyuTubeAuth.getCurrentUser();
      state.user = user;

      container.replaceChildren();

      if (!user) {
        const panel = element("div", "ay-panel");

        panel.append(
          element("h2", "ay-panel-title", "Your library, your space."),
          element(
            "p",
            "ay-panel-copy",
            "Sign in to create playlists, save videos and keep your watch history."
          ),
          makeButton("Go to Account", "ay-action ay-action-primary", () => {
            setView("account");
          })
        );

        container.append(panel);
        return;
      }

      await renderLibrarySection(container);
    } catch {
      container.replaceChildren();

      const panel = element("div", "ay-panel");

      panel.append(
        element("h2", "ay-panel-title", "Library connection pending"),
        element(
          "p",
          "ay-panel-copy",
          "Your database connection will become available after Supabase configuration and deployment."
        ),
        makeButton("Open Account", "ay-action", () => {
          setView("account");
        })
      );

      container.append(panel);
    }
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  async function initialize() {
    const form = $(SELECTORS.form);
    const input = $(SELECTORS.input);
    const results = $(SELECTORS.results);

    if (!form || !input || !results) {
      console.error(
        "AyuTube could not initialize: required search elements are missing."
      );
      return;
    }

    installStyles();
    updateBrand();
    createNavigation();
    createApplicationViews();
    createCategoryUI();
    bindSearch();

    // Categories load separately, so existing search does not depend on them.
    renderCategories().catch((error) => {
      console.error("AyuTube categories failed to load:", error);
      const list = $("#ayutube-category-list");

      if (list) {
        list.replaceChildren();
        list.append(
          element(
            "p",
            "ay-notice",
            "Categories are temporarily unavailable. You can still search above."
          )
        );
      }
    });

    setStatus("Search for something to watch.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }

  // Small public entry point for later integration and testing.
  window.AyuTubeApp = Object.freeze({
    search: (query) => runSearch(query),
    selectCategory,
    setView
  });
})();
