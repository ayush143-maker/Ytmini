(() => {
  "use strict";

  const UI = () => window.AyuTubeUI;
  const Cards = () => window.AyuTubeCards;

  const FETCH_TIMEOUT_MS = 20000;

  let current = null; // { id, name, key }
  let token = 0;
  let observer = null;

  const $ = (selector) => document.querySelector(selector);

  function el(tag, className, text) {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
  }

  const isChannelId = (value) => /^[A-Za-z0-9_-]{10,40}$/.test(String(value || ""));

  function formatSubscribers(count) {
    if (!Number.isFinite(count) || count < 0) return "";

    try {
      return `${new Intl.NumberFormat("en", {
        notation: "compact",
        maximumFractionDigits: 1
      }).format(count)} subscribers`;
    } catch {
      return `${count.toLocaleString()} subscribers`;
    }
  }

  // ---------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------

  async function fetchPage({ id, name, page }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const params = new URLSearchParams({ id });

      if (page) params.set("page", page);
      if (name) params.set("name", name);

      const response = await fetch(`/api/channel?${params}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" }
      });

      let payload = null;

      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok || !Array.isArray(payload?.items)) {
        throw new Error(payload?.error || "This channel is unavailable.");
      }

      return payload;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Fallback: search by the channel's name and keep only its own videos.
   * One request returns about 20 results, so up to three pages are read per
   * call, and the search's own page token is used to continue.
   */
  async function searchByName({ id, name }, cursor = null) {
    const ui = UI();

    if (!name) throw new Error("This channel is unavailable.");

    const api = await ui.ensureApi();
    const wanted = name.trim().toLowerCase();

    const mine = (video) =>
      (id && video.channelId === id) ||
      String(video.uploaderName).trim().toLowerCase() === wanted;

    const items = [];
    const seen = new Set();
    let next = cursor;

    for (let pages = 0; pages < 3; pages += 1) {
      const response = await api.search(name, next ? { page: next } : {});

      for (const video of (Array.isArray(response?.items) ? response.items : []).map(ui.toVideo)) {
        if (!mine(video) || seen.has(video.id)) continue;

        seen.add(video.id);
        items.push(video);
      }

      next =
        typeof response?.nextpage === "string" && response.nextpage
          ? response.nextpage
          : null;

      if (!next || items.length >= 12) break;
    }

    if (!items.length && !cursor) throw new Error("This channel is unavailable.");

    return {
      id,
      name,
      avatar: "",
      subscribers: null,
      verified: false,
      items,
      nextpage: next,
      limited: true,
      more: (token) => searchByName({ id, name }, token)
    };
  }

  /** The channel's playlists: its own tab first, then a search by name. */
  async function loadPlaylists(channel) {
    const ui = UI();

    if (channel.id) {
      try {
        const response = await fetch(
          `/api/channel?${new URLSearchParams({ id: channel.id, tab: "playlists" })}`,
          { headers: { Accept: "application/json" } }
        );
        const payload = await response.json().catch(() => null);

        if (response.ok && Array.isArray(payload?.playlists)) {
          if (payload.playlists.length || payload.source === "tab") {
            return payload.playlists;
          }
        }
      } catch {
        // Fall through to the search below.
      }
    }

    if (!channel.name) return [];

    const api = await ui.ensureApi();
    const wanted = channel.name.trim().toLowerCase();
    const found = [];
    const seen = new Set();
    let page = null;

    for (let pages = 0; pages < 2; pages += 1) {
      const response = await api.search(channel.name, {
        type: "playlist",
        ...(page ? { page } : {})
      });

      for (const item of Array.isArray(response?.items) ? response.items : []) {
        const own =
          (channel.id && item.channelId === channel.id) ||
          String(item.uploaderName || "").trim().toLowerCase() === wanted;

        if (own && !seen.has(item.id)) {
          seen.add(item.id);
          found.push(item);
        }
      }

      page =
        typeof response?.nextpage === "string" && response.nextpage
          ? response.nextpage
          : null;

      if (!page) break;
    }

    return found;
  }

  // ---------------------------------------------------------------------------
  // Page
  // ---------------------------------------------------------------------------

  async function open(channel, options = {}) {
    const ui = UI();
    const id = isChannelId(channel?.id) ? channel.id : "";
    const name = String(channel?.name || "").trim().slice(0, 300);

    if (!id && !name) {
      ui.notify("This channel can't be opened.");
      return;
    }

    const key = id || ui.channelKey({ uploaderName: name });

    current = { id, name, key };

    ui.showChannel(current, {
      push: !options.fromHistory && !options.entry,
      entry: Boolean(options.entry)
    });

    render();
  }

  async function render() {
    const ui = UI();
    const cards = Cards();
    const root = $("#channel-pane");

    if (!root || !current) return;

    const mine = ++token;
    const channel = current;

    observer?.disconnect();
    observer = null;

    root.replaceChildren();

    const back = ui.makeButton("Back", "ay-action", () => ui.leaveChannel());
    root.append(back);

    const header = el("div", "channel-head");
    const title = el("h1", "channel-name", channel.name || "Channel");

    header.append(title);
    root.append(header);

    const body = el("div", "channel-body");

    body.append(cards.skeletons(6, "grid"));
    root.append(body);

    let data;

    try {
      try {
        if (!channel.id) throw new Error("name only");

        data = await fetchPage({ id: channel.id, name: channel.name });
      } catch (error) {
        data = await searchByName(channel);
      }
    } catch (error) {
      if (mine !== token) return;

      body.replaceChildren();

      const box = el("div", "ay-empty");

      box.append(el("p", "", error?.message || "This channel is unavailable."));

      const retry = ui.makeButton("Try again", "ay-action", render);
      retry.style.marginTop = "14px";

      box.append(retry);
      body.append(box);
      return;
    }

    if (mine !== token) return;

    const personal = await ui.getPersonal();

    if (mine !== token) return;

    channel.name = data.name || channel.name;
    title.textContent = channel.name;

    // Header details
    header.replaceChildren();

    if (data.avatar) {
      const avatar = el("img", "channel-avatar");

      avatar.alt = "";
      avatar.decoding = "async";
      avatar.src = data.avatar;
      avatar.addEventListener("error", () => avatar.remove(), { once: true });
      header.append(avatar);
    }

    const text = el("div", "channel-text");

    text.append(title);

    const metaParts = [
      formatSubscribers(data.subscribers),
      data.verified ? "Verified" : ""
    ].filter(Boolean);

    if (metaParts.length) {
      text.append(el("p", "channel-meta", metaParts.join(" \u00B7 ")));
    }

    header.append(text);

    // Actions
    const videoRef = {
      channelId: channel.id,
      uploaderName: channel.name,
      channel: channel.name
    };

    const actions = el("div", "channel-actions");
    const follow = ui.makeButton("", "ay-action");

    const paintFollow = () => {
      const following = ui.channelState(videoRef) === "follow";

      follow.textContent = following ? "Following" : "Follow";
      follow.setAttribute("aria-pressed", String(following));
    };

    paintFollow();

    follow.addEventListener("click", async () => {
      follow.disabled = true;
      await ui.toggleChannel(videoRef, "follow");
      follow.disabled = false;
      paintFollow();
    });

    const share = ui.makeButton("Share", "ay-action", async () => {
      if (!channel.id) {
        ui.notify("Sharing needs a channel ID.");
        return;
      }

      const url = `${location.origin}/?c=${encodeURIComponent(channel.id)}`;
      const ok = await ui.copyText(url);

      ui.notify(ok ? "Link copied." : "Could not copy. Copy the address manually.");
    });

    actions.append(follow, share);
    root.insertBefore(actions, body);

    // Tabs: Videos and Playlists
    const tabs = el("div", "filter-row channel-tabs");

    tabs.setAttribute("role", "group");
    tabs.setAttribute("aria-label", "Channel sections");

    const tabButtons = new Map();
    let activeTab = "videos";

    for (const [id, label] of [["videos", "Videos"], ["playlists", "Playlists"]]) {
      const button = ui.makeButton(label, "ay-chip", () => showTab(id));

      tabButtons.set(id, button);
      tabs.append(button);
    }

    root.insertBefore(tabs, body);

    const usable = (video) => ui.validVideoId(video.id) && !video.short;
    const all = [];
    const seen = new Set();
    let sortMode = "latest";
    let playlistsCache = null;

    for (const video of (data.items || []).map(ui.toVideo).filter(usable)) {
      if (!seen.has(video.id)) {
        seen.add(video.id);
        all.push(video);
      }
    }

    const more =
      data.more ||
      ((cursor) => fetchPage({ id: channel.id, name: channel.name, page: cursor }));

    const card = (video) =>
      cards.createCard(video, {
        variant: "grid",
        progress: personal.map.get(video.id) || null
      });

    // "Latest" follows upload time when every loaded video has one, otherwise
    // the provider's own order (newest first). "Popular" sorts the loaded
    // videos by view count.
    const byTime = () => all.length > 0 && all.every((video) => video.uploadedAt);

    const ordered = () => {
      if (sortMode === "popular") {
        return [...all].sort((a, b) => (b.views ?? -1) - (a.views ?? -1));
      }

      return byTime() ? [...all].sort((a, b) => b.uploadedAt - a.uploadedAt) : all;
    };

    const showVideos = () => {
      observer?.disconnect();
      observer = null;
      body.replaceChildren();

      if (data.limited) {
        body.append(
          el(
            "p",
            "feed-note",
            "Showing limited results: the channel service did not respond, so these come from a search."
          )
        );
      }

      if (!all.length) {
        body.append(el("div", "ay-empty", "No videos yet."));
        return;
      }

      const sortRow = el("div", "channel-sort");

      sortRow.setAttribute("role", "group");
      sortRow.setAttribute("aria-label", "Sort videos");

      const sortNote = el("p", "feed-note");

      for (const [id, label] of [["latest", "Latest"], ["popular", "Popular"]]) {
        const button = ui.makeButton(label, "ay-chip", () => {
          sortMode = id;
          paintGrid();
          paintSort();
        });

        button.dataset.sort = id;
        sortRow.append(button);
      }

      const paintSort = () => {
        for (const button of sortRow.querySelectorAll("button")) {
          button.setAttribute("aria-pressed", String(button.dataset.sort === sortMode));
        }

        sortNote.hidden = !(sortMode === "popular" && cursorRef.value);
        sortNote.textContent = "Popular sorts the videos loaded so far. Show more loads older ones.";
      };

      const grid = el("div", "grid");
      const cursorRef = { value: data.nextpage || null };

      const paintGrid = () => grid.replaceChildren(...ordered().map(card));

      body.append(sortRow, sortNote, grid);
      paintGrid();
      paintSort();

      const add = (videos) => {
        const fresh = [];

        for (const video of videos) {
          if (seen.has(video.id)) continue;

          seen.add(video.id);
          all.push(video);
          fresh.push(video);
        }

        if (sortMode === "latest" && !byTime()) {
          for (const video of fresh) grid.append(card(video));
        } else {
          paintGrid();
        }
      };

      setupMore({ body, add, nextpage: data.nextpage, mine, usable, more, cursorRef, onCursor: paintSort });
    };

    const showPlaylists = async () => {
      observer?.disconnect();
      observer = null;
      body.replaceChildren(cards.skeletons(4, "grid"));

      try {
        if (!playlistsCache) playlistsCache = await loadPlaylists(channel);
      } catch {
        if (mine !== token || activeTab !== "playlists") return;

        body.replaceChildren();

        const box = el("div", "ay-empty");

        box.append(el("p", "", "Could not load this channel's playlists."));

        const retry = ui.makeButton("Try again", "ay-action", showPlaylists);

        retry.style.marginTop = "14px";
        box.append(retry);
        body.append(box);

        return;
      }

      if (mine !== token || activeTab !== "playlists") return;

      body.replaceChildren();

      if (!playlistsCache.length) {
        body.append(el("div", "ay-empty", "No playlists found for this channel."));
        return;
      }

      const grid = el("div", "grid");

      for (const playlist of playlistsCache) {
        grid.append(cards.createPlaylistCard(playlist));
      }

      body.append(grid);
    };

    function showTab(id) {
      activeTab = id;

      for (const [tabId, button] of tabButtons) {
        button.setAttribute("aria-pressed", String(tabId === id));
      }

      if (id === "videos") showVideos();
      else showPlaylists();
    }

    showTab("videos");

    ui.markChannelSeen?.(channel.id || channel.key, [...all]);
  }

  function setupMore({ body, add, nextpage, mine, usable, more, cursorRef, onCursor }) {
    if (!nextpage) return;

    const ui = UI();
    const button = ui.makeButton("Show more", "ay-action");
    const message = el("p", "feed-note");
    const sentinel = el("div", "feed-sentinel");
    const footer = el("div", "feed-more");

    message.hidden = true;
    footer.append(button, message);
    body.append(footer, sentinel);

    let cursor = nextpage;
    let loading = false;

    async function loadNext() {
      if (loading || !cursor || mine !== token) return;

      loading = true;
      button.disabled = true;
      message.hidden = true;

      try {
        const data = await more(cursor);

        if (mine !== token) return;

        add((data.items || []).map(ui.toVideo).filter(usable));
        cursor = data.nextpage;
        cursorRef.value = cursor;
        onCursor?.();

        if (!cursor) {
          footer.hidden = true;
          observer?.disconnect();
        }
      } catch (error) {
        if (mine !== token) return;

        message.textContent = error?.message || "Could not load more.";
        message.hidden = false;
      } finally {
        loading = false;
        button.disabled = false;

        if (observer && cursor) {
          observer.unobserve(sentinel);
          observer.observe(sentinel);
        }
      }
    }

    button.addEventListener("click", loadNext);

    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) loadNext();
        },
        { rootMargin: "800px 0px" }
      );

      observer.observe(sentinel);
    }
  }

  function close() {
    token += 1;
    observer?.disconnect();
    observer = null;
    current = null;
  }

  /** First page of a channel: provider API, then a search by name. */
  async function load(channel) {
    try {
      if (!isChannelId(channel.id)) throw new Error("name only");

      return await fetchPage({ id: channel.id, name: channel.name });
    } catch {
      return searchByName(channel);
    }
  }

  window.AyuTubeChannel = Object.freeze({
    open,
    close,
    load,
    current: () => current,
    isChannelId
  });
})();
