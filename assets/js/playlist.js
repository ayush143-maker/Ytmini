(() => {
  "use strict";

  // YouTube playlists: a playlist page, "Play all", playing through a list in
  // order, and saving a whole playlist into the person's own library.

  const UI = () => window.AyuTubeUI;
  const Cards = () => window.AyuTubeCards;

  const MAX_ITEMS = 300; // the most videos loaded for "Save" and for playing on

  const $ = (selector) => document.querySelector(selector);

  let current = null; // { id, name } of the page being shown
  let token = 0;
  let observer = null;

  const cache = new Map(); // playlist id -> context

  function el(tag, className, text) {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
  }

  const isPlaylistId = (value) =>
    /^[A-Za-z0-9_-]{10,64}$/.test(String(value || ""));

  // ---------------------------------------------------------------------------
  // Data: a context holds the videos loaded so far and the token for the rest
  // ---------------------------------------------------------------------------

  function absorb(ctx, payload) {
    const ui = UI();

    for (const raw of Array.isArray(payload.items) ? payload.items : []) {
      const video = ui.toVideo(raw);

      if (!ui.validVideoId(video.id) || ctx.seen.has(video.id)) continue;

      ctx.seen.add(video.id);
      ctx.items.push(video);
    }

    ctx.nextpage =
      typeof payload.nextpage === "string" && payload.nextpage
        ? payload.nextpage
        : null;
  }

  async function context(id) {
    if (!isPlaylistId(id)) throw new Error("This playlist can't be opened.");

    const cached = cache.get(id);

    if (cached) return cached;

    const api = await UI().ensureApi();
    const payload = await api.playlist(id);

    const ctx = {
      id,
      name: String(payload.name || "").trim(),
      uploaderName: String(payload.uploaderName || "").trim(),
      channelId: String(payload.channelId || ""),
      thumbnail: String(payload.thumbnail || ""),
      count: Number.isFinite(payload.count) ? payload.count : null,
      items: [],
      seen: new Set(),
      nextpage: null,
      pending: null
    };

    absorb(ctx, payload);

    if (!ctx.items.length) throw new Error("This playlist has no videos.");

    cache.set(id, ctx);

    return ctx;
  }

  /** Load the next page into the context. Resolves with the new videos. */
  function loadMore(ctx) {
    if (!ctx.nextpage) return Promise.resolve([]);
    if (ctx.pending) return ctx.pending;

    const before = ctx.items.length;
    const cursor = ctx.nextpage;

    ctx.pending = (async () => {
      try {
        const api = await UI().ensureApi();

        absorb(ctx, await api.playlist(ctx.id, { page: cursor }));

        return ctx.items.slice(before);
      } finally {
        ctx.pending = null;
      }
    })();

    return ctx.pending;
  }

  async function loadAll(ctx, cap = MAX_ITEMS) {
    while (ctx.nextpage && ctx.items.length < cap) {
      const added = await loadMore(ctx);

      if (!added.length && !ctx.nextpage) break;
    }

    return ctx.items;
  }

  const indexOf = (ctx, videoId) =>
    ctx.items.findIndex((video) => video.id === videoId);

  /** The video after `videoId`, loading another page if needed. */
  async function next(ctx, videoId) {
    let index = indexOf(ctx, videoId);

    if (index < 0) return null;

    if (index + 1 >= ctx.items.length && ctx.nextpage) {
      try {
        await loadMore(ctx);
      } catch {
        return null;
      }

      index = indexOf(ctx, videoId);
    }

    return ctx.items[index + 1] || null;
  }

  function previous(ctx, videoId) {
    const index = indexOf(ctx, videoId);

    return index > 0 ? ctx.items[index - 1] : null;
  }

  function hasNext(ctx, videoId) {
    const index = indexOf(ctx, videoId);

    return index >= 0 && (index + 1 < ctx.items.length || Boolean(ctx.nextpage));
  }

  // ---------------------------------------------------------------------------
  // Page
  // ---------------------------------------------------------------------------

  function open(playlist, options = {}) {
    const ui = UI();
    const id = String(playlist?.id || "");

    if (!isPlaylistId(id)) {
      ui.notify("This playlist can't be opened.");
      return;
    }

    current = { id, name: String(playlist?.name || "").trim().slice(0, 200) };

    ui.showPlaylist(current, {
      push: !options.fromHistory && !options.entry,
      entry: Boolean(options.entry)
    });

    render();
  }

  function playFrom(ctx, video) {
    UI().playVideo(video, { playlist: ctx });
  }

  function watchedCount(ctx, personal) {
    let done = 0;

    for (const video of ctx.items) {
      const record = personal.map.get(video.id);

      if (record && record.duration > 0 && record.progress / record.duration >= 0.9) {
        done += 1;
      }
    }

    return done;
  }

  async function render() {
    const ui = UI();
    const cards = Cards();
    const root = $("#playlist-pane");

    if (!root || !current) return;

    const mine = ++token;
    const page = current;

    observer?.disconnect();
    observer = null;

    root.replaceChildren();

    // Some mobile browsers restore the old scroll offset after the pane swap.
    // Re-anchor the playlist at the top after this frame so the Back button and
    // first line of the title cannot sit underneath the status/browser chrome.
    window.requestAnimationFrame(() => {
      if (mine === token) window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });

    root.append(ui.makeButton("Back", "ay-action", () => ui.leavePlaylist()));

    const header = el("div", "channel-head");
    const title = el("h1", "channel-name playlist-title", page.name || "Playlist");

    header.append(title);
    root.append(header);

    const body = el("div", "channel-body");

    body.append(cards.skeletons(5, "compact"));
    root.append(body);

    let ctx;

    try {
      ctx = await context(page.id);
    } catch (error) {
      if (mine !== token) return;

      body.replaceChildren();

      const box = el("div", "ay-empty");

      box.append(el("p", "", error?.message || "This playlist is unavailable."));

      const retry = ui.makeButton("Try again", "ay-action", render);

      retry.style.marginTop = "14px";
      box.append(retry);
      body.append(box);

      return;
    }

    const personal = await ui.getPersonal();

    if (mine !== token) return;

    page.name = ctx.name || page.name;
    title.textContent = page.name || "Playlist";

    // Header details
    const text = el("div", "channel-text");

    header.replaceChildren(text);
    text.append(title);

    const meta = el("p", "channel-meta");

    if (ctx.uploaderName) {
      const owner = ui.makeButton(ctx.uploaderName, "playlist-owner", () =>
        ui.openChannel({ id: ctx.channelId, name: ctx.uploaderName })
      );

      meta.append(owner);
    }

    const total = ctx.count ?? (ctx.nextpage ? null : ctx.items.length);

    if (total !== null) {
      meta.append(
        document.createTextNode(
          `${ctx.uploaderName ? " \u00B7 " : ""}${total} video${total === 1 ? "" : "s"}`
        )
      );
    }

    text.append(meta);

    const progress = el("p", "channel-meta playlist-progress");

    progress.hidden = true;
    text.append(progress);

    const paintProgress = () => {
      if (!personal.user) return;

      const done = watchedCount(ctx, personal);
      const of = total ?? ctx.items.length;

      progress.textContent = `${done} of ${of} watched`;
      progress.hidden = false;
    };

    paintProgress();

    // Actions
    const actions = el("div", "channel-actions");

    actions.append(
      ui.makeButton("Play all", "ay-action ay-action-primary", () =>
        playFrom(ctx, ctx.items[0])
      )
    );

    const save = ui.makeButton("Save to library", "ay-action");

    save.addEventListener("click", () => saveToLibrary(ctx, save));
    actions.append(save);

    actions.append(
      ui.makeButton("Share", "ay-action", async () => {
        const ok = await ui.copyText(
          `${location.origin}/?list=${encodeURIComponent(ctx.id)}`
        );

        ui.notify(ok ? "Link copied." : "Could not copy. Copy the address manually.");
      })
    );

    root.insertBefore(actions, body);

    // Videos, in playlist order
    body.replaceChildren();

    const stack = el("div", "stack playlist-list");

    body.append(stack);

    let shown = 0;

    const addCards = (videos) => {
      for (const video of videos) {
        shown += 1;

        stack.append(
          cards.createCard(video, {
            variant: "compact",
            badge: String(shown),
            progress: personal.map.get(video.id) || null,
            onPlay: (picked) => playFrom(ctx, picked)
          })
        );
      }
    };

    addCards(ctx.items);
    setupMore({ body, ctx, mine, addCards, paintProgress });
  }

  function setupMore({ body, ctx, mine, addCards, paintProgress }) {
    if (!ctx.nextpage) return;

    const ui = UI();
    const button = ui.makeButton("Show more", "ay-action");
    const message = el("p", "feed-note");
    const sentinel = el("div", "feed-sentinel");
    const footer = el("div", "feed-more");

    message.hidden = true;
    footer.append(button, message);
    body.append(footer, sentinel);

    let loading = false;

    async function more() {
      if (loading || !ctx.nextpage || mine !== token) return;

      loading = true;
      button.disabled = true;
      message.hidden = true;

      try {
        const added = await loadMore(ctx);

        if (mine !== token) return;

        addCards(added);
        paintProgress();

        if (!ctx.nextpage) {
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

        if (observer && ctx.nextpage) {
          observer.unobserve(sentinel);
          observer.observe(sentinel);
        }
      }
    }

    button.addEventListener("click", more);

    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) more();
        },
        { rootMargin: "800px 0px" }
      );

      observer.observe(sentinel);
    }
  }

  // ---------------------------------------------------------------------------
  // Save a YouTube playlist as one of the person's own playlists
  // ---------------------------------------------------------------------------

  async function saveToLibrary(ctx, button) {
    const ui = UI();
    const label = button.textContent;

    const personal = await ui.getPersonal();

    if (!personal.user) {
      ui.notify("Sign in from the Account tab to save playlists.");
      return;
    }

    button.disabled = true;
    button.textContent = "Saving\u2026";

    try {
      await ui.ensureAuthModules();

      const lib = window.AyuTubeLibrary;

      if (typeof lib?.addManyToPlaylist !== "function") {
        throw new Error("Saving playlists is not available.");
      }

      // The source is written into the description, so saving twice is caught.
      const marker = `YouTube playlist ${ctx.id}`;
      const existing = await lib.getPlaylists();

      if (
        (existing || []).some(
          (row) => typeof row.description === "string" && row.description.includes(marker)
        )
      ) {
        ui.notify("This playlist is already in your library.");
        button.textContent = "Saved";
        return;
      }

      await loadAll(ctx);

      const created = await lib.createPlaylist({
        name: (ctx.name || "YouTube playlist").slice(0, 100),
        description: `Imported from ${marker}`
      });

      try {
        await lib.addManyToPlaylist(created.id, ctx.items);
      } catch (error) {
        // Do not leave an empty half-made playlist behind.
        try {
          await lib.deletePlaylist(created.id);
        } catch {
          // Nothing more can be done here.
        }

        throw error;
      }

      ui.invalidatePersonal?.();

      ui.notify(
        ctx.nextpage
          ? `Saved the first ${ctx.items.length} videos to your library.`
          : `Saved ${ctx.items.length} videos to your library.`
      );

      button.textContent = "Saved";
    } catch (error) {
      ui.notify(ui.friendlyError(error, "Could not save this playlist."));
      button.textContent = label;
    } finally {
      button.disabled = false;
    }
  }

  function close() {
    token += 1;
    observer?.disconnect();
    observer = null;
    current = null;
  }

  window.AyuTubePlaylist = Object.freeze({
    open,
    close,
    current: () => current,
    isPlaylistId,
    context,
    loadMore,
    next,
    previous,
    hasNext,
    indexOf
  });
})();
