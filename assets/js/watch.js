(() => {
  "use strict";

  const UI = () => window.AyuTubeUI;
  const Cards = () => window.AyuTubeCards;
  const getPlayer = () => window.AyuTubePlayer || window.MiniTubePlayer;

  const $ = (selector) => document.querySelector(selector);

  let current = null; // the video on the watch page
  let upNext = [];
  let upNextToken = 0;
  let notesToken = 0;

  // When a video is played from a YouTube playlist this holds that playlist's
  // context, so Up next, Previous / Next and autoplay follow the playlist.
  let playlistCtx = null;
  let ctxToken = 0;

  const getPlaylistApi = () => window.AyuTubePlaylist;

  const played = new Set(); // IDs already played this session (for autoplay)

  function el(tag, className, text) {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
  }

  const autoplayOn = () =>
    !UI().isStudy() && UI().store.get("ayutube.autoplay", true) !== false;

  function terms(title) {
    return String(title || "")
      .replace(/\s*[|\u2013\u2014].*$/, "")
      .replace(/[[(].*?[\])]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 7)
      .join(" ");
  }

  function interleave(lists) {
    const result = [];
    const longest = Math.max(0, ...lists.map((list) => list.length));

    for (let index = 0; index < longest; index += 1) {
      for (const list of lists) {
        if (index < list.length) result.push(list[index]);
      }
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Opening a video
  // ---------------------------------------------------------------------------

  async function open(rawVideo, options = {}) {
    const ui = UI();
    const video = ui.toVideo(rawVideo);

    if (!ui.validVideoId(video.id)) {
      ui.notify("This video can't be played.");
      return;
    }

    current = video;
    played.add(video.id);

    playlistCtx = options.playlist || null;
    ctxToken += 1;

    const listId =
      playlistCtx?.id ||
      (getPlaylistApi()?.isPlaylistId?.(options.list) ? options.list : "");

    // Show the watch page right away; everything else fills in behind it.
    ui.showWatch(video, {
      push: !options.fromHistory && !options.entry,
      entry: Boolean(options.entry),
      list: listId
    });

    // Opened from a link or Back: bring the playlist back in behind the video.
    if (!playlistCtx && listId) restorePlaylist(listId, video.id);

    // Resume where the person stopped, unless a start time was given.
    let from = Number(options.start) || 0;
    let resumed = false;

    if (!from) {
      try {
        const personal = await ui.getPersonal();
        const record = personal.map.get(video.id);

        if (
          record &&
          record.progress > 15 &&
          (!record.duration || record.progress < record.duration - 30)
        ) {
          from = record.progress;
          resumed = true;
        }
      } catch {
        // Resuming is a convenience only.
      }
    }

    // Another video was chosen while history was loading.
    if (current !== video) return;

    const player = getPlayer();

    player?.setRate?.(ui.store.get("ayutube.rate", 1));
    player?.play?.(video, { start: from });

    if (resumed) {
      ui.notify(`Resuming at ${Cards().format.duration(from)}.`);
    }

    renderActions(video);

    if (!options.placeholder) {
      loadUpNext(video);
      loadNotes(video);
    }
  }

  /**
   * Open a video known only by its ID (a shared link). Playback starts at
   * once; title, channel and Up next fill in when the details arrive.
   */
  async function openById(id, { start = 0, entry = false, list = "" } = {}) {
    const ui = UI();

    await open(
      { id, title: "Video", uploaderName: "", thumbnail: "" },
      { start, entry, placeholder: true, list }
    );

    try {
      const api = await ui.ensureApi();
      const response = await api.search(id);
      const items = Array.isArray(response?.items) ? response.items : [];
      const hit = items.map(ui.toVideo).find((video) => video.id === id);

      if (current?.id !== id) return;

      if (hit) {
        current = hit;

        getPlayer()?.updateDetails?.({
          title: hit.title,
          uploaderName: hit.uploaderName,
          thumbnail: hit.thumbnail
        });

        try {
          history.replaceState(
            {
              ...history.state,
              title: hit.title,
              channel: hit.uploaderName,
              thumbnail: hit.thumbnail
            },
            "",
            location.href
          );
        } catch {
          // History state is best effort.
        }

        renderActions(hit);
        loadUpNext(hit);
      }

      loadNotes(current);
    } catch {
      // The video still plays; only the extras are missing.
    }
  }

  // ---------------------------------------------------------------------------
  // Actions under the player
  // ---------------------------------------------------------------------------

  const SPEEDS = Object.freeze([1, 1.25, 1.5, 1.75, 2, 0.75]);

  function restorePlaylist(listId, videoId) {
    const mine = ctxToken;

    getPlaylistApi()
      ?.context(listId)
      .then((ctx) => {
        if (mine !== ctxToken || current?.id !== videoId) return;
        if (getPlaylistApi().indexOf(ctx, videoId) < 0) return;

        playlistCtx = ctx;
        renderActions(current);
        loadUpNext(current);
      })
      .catch(() => {
        // The video plays on its own; only the playlist extras are missing.
      });
  }

  async function step(direction) {
    const api = getPlaylistApi();
    const ctx = playlistCtx;

    if (!api || !ctx || !current) return;

    const from = current.id;
    const target =
      direction > 0 ? await api.next(ctx, from) : api.previous(ctx, from);

    if (current?.id !== from || playlistCtx !== ctx) return;

    if (!target) {
      UI().notify(direction > 0 ? "End of the playlist." : "Start of the playlist.");
      return;
    }

    open(target, { playlist: ctx });
  }

  function renderActions(video) {
    const ui = UI();
    const box = $("#watch-actions");

    if (!box) return;

    box.replaceChildren();

    if (playlistCtx) {
      const api = getPlaylistApi();
      const prev = ui.makeButton("Previous", "ay-action", () => step(-1));
      const nextButton = ui.makeButton("Next", "ay-action", () => step(1));

      prev.disabled = api.indexOf(playlistCtx, video.id) <= 0;
      nextButton.disabled = !api.hasNext(playlistCtx, video.id);
      box.append(prev, nextButton);
    }

    const like = ui.makeButton("Like", "ay-action");

    like.setAttribute("aria-pressed", String(ui.isLiked(video.id)));
    like.addEventListener("click", async () => {
      like.disabled = true;

      const next = await ui.toggleLike(video);

      like.disabled = false;

      if (next !== null) like.setAttribute("aria-pressed", String(next));
    });
    box.append(like);

    box.append(
      ui.makeButton("Save", "ay-action", () => ui.saveToWatchLater(video))
    );

    const playlist = ui.makeButton("Playlist", "ay-action");

    playlist.setAttribute("aria-haspopup", "menu");
    playlist.setAttribute("aria-expanded", "false");
    playlist.addEventListener("click", () => {
      Cards().openMenu(playlist, video, { start: "playlists" });
    });
    box.append(playlist);

    const share = ui.makeButton("Share", "ay-action");

    share.setAttribute("aria-haspopup", "menu");
    share.setAttribute("aria-expanded", "false");
    share.addEventListener("click", () => {
      const player = getPlayer();
      const seconds =
        player?.canTrackTime?.() ? Math.floor(player.getCurrentTime()) : 0;

      const items = [{ label: "Copy link", run: () => ui.copyLink(video) }];

      if (seconds >= 5) {
        items.push({
          label: `Copy link at ${Cards().format.duration(seconds)}`,
          run: () => ui.copyLink(video, seconds)
        });
      }

      if (navigator.share) {
        items.push({
          label: "Share\u2026",
          run: () => ui.shareVideo(video, seconds >= 5 ? seconds : 0)
        });
      }

      Cards().openActions(share, items);
    });
    box.append(share);

    const speed = ui.makeButton("", "ay-action");
    const label = () => `${getPlayer()?.getRate?.() ?? 1}\u00D7`;

    speed.textContent = label();
    speed.setAttribute("aria-label", "Playback speed");
    speed.addEventListener("click", () => {
      const now = getPlayer()?.getRate?.() ?? 1;
      const next = SPEEDS[(SPEEDS.indexOf(now) + 1) % SPEEDS.length];

      getPlayer()?.setRate?.(next);
      ui.store.set("ayutube.rate", next);
      speed.textContent = label();
    });
    box.append(speed);

    if (!ui.isStudy()) {
      const auto = ui.makeButton("Autoplay", "ay-action");

      auto.setAttribute("aria-pressed", String(autoplayOn()));
      auto.addEventListener("click", () => {
        const next = !(ui.store.get("ayutube.autoplay", true) !== false);

        ui.store.set("ayutube.autoplay", next);
        auto.setAttribute("aria-pressed", String(next));
      });
      box.append(auto);
    }

    const following = ui.channelState(video) === "follow";
    const follow = ui.makeButton(
      following ? "Following" : "Follow",
      "ay-action"
    );

    follow.setAttribute("aria-pressed", String(following));
    follow.addEventListener("click", async () => {
      follow.disabled = true;
      await ui.toggleChannel(video, "follow");

      if (current?.id === video.id) renderActions(video);
    });
    box.append(follow);
  }

  // ---------------------------------------------------------------------------
  // Up next
  // ---------------------------------------------------------------------------

  async function loadUpNext(video) {
    const ui = UI();
    const aside = $("#watch-next");
    const box = $("#up-next");

    if (!aside || !box) return;

    const token = ++upNextToken;
    upNext = [];

    const heading = aside.querySelector(".watch-next-title");

    if (heading) heading.textContent = "Up next";

    // Playing a playlist: show the playlist itself, in order. This also shows
    // in study mode, because the person chose this list on purpose.
    if (playlistCtx) {
      renderPlaylistPanel(aside, box, heading, video);
      return;
    }

    if (ui.isStudy()) {
      aside.hidden = true;
      return;
    }

    aside.hidden = false;
    box.replaceChildren(Cards().skeletons(5, "compact"));

    try {
      const api = await ui.ensureApi();
      const personal = await ui.getPersonal();

      const queries = [terms(video.title), video.uploaderName]
        .map((query) => String(query || "").trim())
        .filter((query, index, all) => query.length >= 3 && all.indexOf(query) === index);

      const settled = await Promise.allSettled(
        queries.map((query) => api.search(query))
      );

      if (token !== upNextToken) return;

      const lists = settled
        .filter((result) => result.status === "fulfilled")
        .map((result) =>
          (Array.isArray(result.value?.items) ? result.value.items : [])
            .map(ui.toVideo)
            .filter(
              (item) =>
                ui.validVideoId(item.id) &&
                item.id !== video.id &&
                !item.short &&
                !ui.isBlocked(item)
            )
        );

      const seen = new Set();

      upNext = interleave(lists)
        .filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)))
        .slice(0, 12);

      box.replaceChildren();

      if (!upNext.length) {
        box.append(el("p", "feed-note", "Nothing to suggest right now."));
        return;
      }

      const stack = el("div", "stack");

      for (const item of upNext) {
        stack.append(
          Cards().createCard(item, {
            variant: "compact",
            progress: personal.map.get(item.id) || null
          })
        );
      }

      box.append(stack);
    } catch {
      if (token !== upNextToken) return;

      box.replaceChildren(el("p", "feed-note", "Up next is unavailable."));
    }
  }

  function renderPlaylistPanel(aside, box, heading, video) {
    const ui = UI();
    const ctx = playlistCtx;
    const api = getPlaylistApi();

    aside.hidden = false;

    if (heading) heading.textContent = ctx.name || "Playlist";

    const personal = ui.peekPersonal?.() || { map: new Map() };

    box.replaceChildren();

    const position = api.indexOf(ctx, video.id) + 1;
    const total = ctx.count ?? ctx.items.length;

    if (position > 0) {
      box.append(el("p", "feed-note", `Video ${position} of ${total}`));
    }

    const stack = el("div", "stack playlist-list");

    ctx.items.forEach((item, index) => {
      const card = Cards().createCard(item, {
        variant: "compact",
        badge: String(index + 1),
        progress: personal.map?.get(item.id) || null,
        onPlay: (picked) => open(picked, { playlist: ctx })
      });

      if (item.id === video.id) {
        card.classList.add("is-current");
        card.setAttribute("aria-current", "true");
      }

      stack.append(card);
    });

    box.append(stack);

    if (ctx.nextpage) {
      const more = ui.makeButton("Show more", "ay-action", async () => {
        more.disabled = true;

        try {
          await api.loadMore(ctx);
        } catch {
          ui.notify("Could not load more of the playlist.");
        }

        if (playlistCtx === ctx && current) {
          renderActions(current);
          loadUpNext(current);
        }
      });

      box.append(more);
    }
  }

  function onEnded() {
    if (!current) return;

    // A playlist plays straight through: the person pressed Play all.
    if (playlistCtx) {
      const ctx = playlistCtx;
      const from = current.id;

      getPlaylistApi()
        .next(ctx, from)
        .then((target) => {
          if (current?.id !== from || playlistCtx !== ctx) return;

          if (!target) {
            UI().notify("Playlist finished.");
            return;
          }

          UI().notify(`Next: ${target.title.slice(0, 48)}`);
          open(target, { playlist: ctx });
        });

      return;
    }

    if (!autoplayOn()) return;

    const next = upNext.find((video) => !played.has(video.id));

    if (!next) return;

    UI().notify(`Next: ${next.title.slice(0, 48)}`);
    open(next);
  }

  // ---------------------------------------------------------------------------
  // Notes (signed-in only; hidden when the table is not available)
  // ---------------------------------------------------------------------------

  async function loadNotes(video) {
    const ui = UI();
    const box = $("#watch-notes");

    if (!box || !video) return;

    const token = ++notesToken;

    box.hidden = true;
    box.replaceChildren();

    try {
      const personal = await ui.getPersonal();

      if (!personal.user || token !== notesToken) return;

      await ui.ensureAuthModules();

      if (typeof window.AyuTubeLibrary.getNotes !== "function") return;

      const notes = await window.AyuTubeLibrary.getNotes(video.id);

      if (token !== notesToken) return;

      renderNotes(box, video, Array.isArray(notes) ? notes : [], token);
    } catch {
      // No notes without an account or before the table exists.
    }
  }

  function renderNotes(box, video, notes, token) {
    const ui = UI();
    const player = getPlayer();

    box.replaceChildren();
    box.hidden = false;

    const head = el("div", "section-head");
    head.append(el("h2", "", "Notes"));

    const form = el("form", "note-form");
    const area = el("textarea");

    area.rows = 2;
    area.maxLength = 1000;
    area.placeholder = "Write a note";
    area.setAttribute("aria-label", "Note");

    const submit = el("button", "ay-action ay-action-primary", "Add note");
    submit.type = "submit";

    form.append(area, submit);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const body = area.value.trim();

      if (!body) return;

      const seconds = player?.canTrackTime?.()
        ? Math.floor(player.getCurrentTime())
        : 0;

      submit.disabled = true;

      try {
        await window.AyuTubeLibrary.addNote({
          video_id: video.id,
          seconds,
          body
        });

        if (token !== notesToken) return;

        const fresh = await window.AyuTubeLibrary.getNotes(video.id);

        renderNotes(box, video, fresh, token);
      } catch (error) {
        ui.notify(ui.friendlyError(error, "Could not save the note."));
        submit.disabled = false;
      }
    });

    const list = el("ol", "note-list");

    for (const note of notes) {
      const item = el("li");
      const time = ui.makeButton(
        Cards().format.duration(note.seconds),
        "note-time",
        () => {
          player?.seek?.(note.seconds);
          player?.resume?.();
        }
      );

      time.setAttribute("aria-label", `Jump to ${Cards().format.duration(note.seconds)}`);

      const remove = ui.makeButton("Delete", "ay-chip", async () => {
        try {
          await window.AyuTubeLibrary.deleteNote(note.id);
          item.remove();
        } catch (error) {
          ui.notify(ui.friendlyError(error, "Could not delete the note."));
        }
      });

      item.append(time, el("p", "note-body", note.body), remove);
      list.append(item);
    }

    box.append(head, form, list);
  }

  // ---------------------------------------------------------------------------

  $("#player-channel")?.addEventListener("click", () => {
    if (!current) return;

    UI().openChannel({ id: current.channelId, name: current.uploaderName });
  });

  getPlayer()?.on?.("ended", onEnded);

  getPlayer()?.on?.("close", () => {
    current = null;
    upNext = [];
    upNextToken += 1;
    notesToken += 1;
  });

  window.AyuTubeWatch = Object.freeze({
    open,
    openById,
    current: () => current
  });
})();
