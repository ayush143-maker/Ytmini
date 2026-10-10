(() => {
  "use strict";

  const UI = () => window.AyuTubeUI;
  const Cards = () => window.AyuTubeCards;
  const lib = () => window.AyuTubeLibrary;

  const SECTIONS = Object.freeze([
    { id: "playlists", label: "Playlists" },
    { id: "later", label: "Watch later" },
    { id: "history", label: "History" },
    { id: "channels", label: "Channels" }
  ]);

  function el(tag, className, text) {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
  }

  const confirmAction = (message) => window.confirm(message);

  // ---------------------------------------------------------------------------
  // Building blocks
  // ---------------------------------------------------------------------------

  function progressBar(ratio, label) {
    const wrap = el("div", "lib-progress");
    const bar = el("span", "lib-progress-bar");
    const fill = el("i");

    fill.style.width = `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`;
    bar.append(fill);
    wrap.append(bar);

    if (label) wrap.append(el("span", "", label));

    return wrap;
  }

  function thumbnailFor(video) {
    return video.thumbnail && video.thumbnail.startsWith("https://")
      ? video.thumbnail
      : `https://i.ytimg.com/vi/${encodeURIComponent(video.id)}/hqdefault.jpg`;
  }

  /** One saved video as a ruled row: thumbnail, text, actions. */
  function videoRow(video, { progress = null, actions = [] } = {}) {
    const ui = UI();
    const row = el("div", "lib-row");

    const play = () => ui.playVideo(video);

    const thumb = el("button", "lib-thumb");
    thumb.type = "button";
    thumb.tabIndex = -1;
    thumb.setAttribute("aria-hidden", "true");
    thumb.addEventListener("click", play);

    const image = el("img");
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.src = thumbnailFor(video);
    image.addEventListener("error", () => image.remove(), { once: true });
    thumb.append(image);

    const body = el("div", "lib-body");
    const title = el("button", "lib-title", video.title);

    title.type = "button";
    title.addEventListener("click", play);

    body.append(title);

    if (video.uploaderName) {
      body.append(el("p", "lib-channel", video.uploaderName));
    }

    const duration = Number(progress?.duration) || video.duration || 0;
    const seconds = Number(progress?.progress) || 0;

    if (duration > 0 && seconds >= 5) {
      const ratio = Math.min(1, seconds / duration);

      body.append(progressBar(ratio, `${Math.round(ratio * 100)}%`));
    }

    const buttons = el("div", "lib-actions");

    for (const action of actions) {
      const button = UI().makeButton(action.label, "ay-action", action.run);

      if (action.danger) button.classList.add("ay-action-danger");

      buttons.append(button);
    }

    row.append(thumb, body, buttons);

    return row;
  }

  function toVideo(row, kind) {
    const ui = UI();

    return ui.toVideo({
      id: row.video_id,
      title: row.title,
      uploaderName: row.channel_title,
      thumbnail: row.thumbnail_url,
      duration: kind === "history" ? row.duration_seconds : 0
    });
  }

  function empty(text) {
    return el("div", "ay-empty", text);
  }

  function failure(container, error, fallback) {
    UI().setNotice(container, error?.message || fallback, "error");
  }

  // ---------------------------------------------------------------------------
  // Sections
  // ---------------------------------------------------------------------------

  async function renderPlaylists(body) {
    const ui = UI();
    const { state } = ui;

    if (state.playlistId) return renderPlaylistItems(body);

    const form = el("form", "inline-form");
    const input = el("input");

    input.type = "text";
    input.maxLength = 100;
    input.placeholder = "New playlist name";
    input.setAttribute("aria-label", "New playlist name");

    const submit = el("button", "ay-action ay-action-primary", "Create");
    submit.type = "submit";

    form.append(input, submit);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const name = input.value.trim();

      if (!name) return;

      submit.disabled = true;

      try {
        await lib().createPlaylist({ name });
        ui.notify("Playlist created.");
        render();
      } catch (error) {
        ui.notify(ui.friendlyError(error, "Could not create the playlist."));
        submit.disabled = false;
      }
    });

    body.append(form);

    const [playlists, progress] = await Promise.all([
      lib().getPlaylists(),
      lib().getPlaylistProgress().catch(() => ({}))
    ]);

    if (!playlists.length) {
      body.append(empty("No playlists yet."));
      return;
    }

    const list = el("div", "lib-list");

    // Favorites first; creation order is kept inside each group.
    const ordered = [...playlists].sort(
      (a, b) => Number(Boolean(b.is_favorite)) - Number(Boolean(a.is_favorite))
    );

    for (const playlist of ordered) {
      const row = el("div", "lib-row lib-row--text");

      row.dataset.favorite = String(Boolean(playlist.is_favorite));

      const text = el("div", "lib-body");
      const open = el("button", "lib-title lib-title--big", playlist.name);

      open.type = "button";
      open.addEventListener("click", () => {
        state.playlistId = playlist.id;
        state.playlistName = playlist.name;
        render();
      });

      text.append(open);

      const stat = progress[playlist.id] || { total: 0, completed: 0 };

      text.append(
        el(
          "p",
          "lib-channel",
          stat.total === 1 ? "1 video" : `${stat.total} videos`
        )
      );

      if (stat.total > 0) {
        text.append(
          progressBar(
            stat.completed / stat.total,
            `${stat.completed} of ${stat.total} watched`
          )
        );
      }

      const actions = el("div", "lib-actions");

      const favorite = ui.makeButton("Favorite", "ay-action", async () => {
        favorite.disabled = true;

        try {
          await lib().setPlaylistFavorite(playlist.id, !playlist.is_favorite);
          render();
        } catch (error) {
          ui.notify(ui.friendlyError(error, "Could not update the playlist."));
          favorite.disabled = false;
        }
      });

      favorite.setAttribute("aria-pressed", String(Boolean(playlist.is_favorite)));

      const remove = ui.makeButton("Delete", "ay-action ay-action-danger", async () => {
        if (!confirmAction(`Delete "${playlist.name}"?`)) return;

        try {
          await lib().deletePlaylist(playlist.id);
          render();
        } catch (error) {
          ui.notify(ui.friendlyError(error, "Could not delete the playlist."));
        }
      });

      actions.append(favorite, remove);
      row.append(text, actions);
      list.append(row);
    }

    body.append(list);
  }

  async function renderPlaylistItems(body) {
    const ui = UI();
    const { state } = ui;

    const back = ui.makeButton("All playlists", "ay-action", () => {
      state.playlistId = null;
      state.playlistName = "";
      render();
    });

    body.append(back);

    const heading = el("h2", "lib-heading", state.playlistName || "Playlist");

    body.append(heading);

    const [items, personal] = await Promise.all([
      lib().getPlaylistItems(state.playlistId),
      ui.getPersonal()
    ]);

    if (!items.length) {
      body.append(empty("This playlist is empty."));
      return;
    }

    let completed = 0;

    for (const item of items) {
      const record = personal.map.get(item.video_id);

      if (record && record.duration > 0 && record.progress / record.duration >= 0.9) {
        completed += 1;
      }
    }

    body.append(
      progressBar(completed / items.length, `${completed} of ${items.length} watched`)
    );

    const list = el("div", "lib-list");

    for (const item of items) {
      const video = toVideo(item, "playlist");

      list.append(
        videoRow(video, {
          progress: personal.map.get(item.video_id) || null,
          actions: [
            {
              label: "Remove",
              danger: true,
              run: async () => {
                try {
                  await lib().removeFromPlaylist(item.id);
                  render();
                } catch (error) {
                  ui.notify(ui.friendlyError(error, "Could not remove this video."));
                }
              }
            }
          ]
        })
      );
    }

    body.append(list);
  }

  async function renderLater(body) {
    const ui = UI();
    const [items, personal] = await Promise.all([lib().getWatchLater(), ui.getPersonal()]);

    if (!items.length) {
      body.append(empty("Nothing saved."));
      return;
    }

    const list = el("div", "lib-list");

    for (const item of items) {
      list.append(
        videoRow(toVideo(item, "later"), {
          progress: personal.map.get(item.video_id) || null,
          actions: [
            {
              label: "Remove",
              danger: true,
              run: async () => {
                try {
                  await lib().removeFromWatchLater(item.video_id);
                  render();
                } catch (error) {
                  ui.notify(ui.friendlyError(error, "Could not remove this video."));
                }
              }
            }
          ]
        })
      );
    }

    body.append(list);
  }

  async function renderHistory(body) {
    const ui = UI();
    const items = await lib().getHistory({ limit: 100 });

    if (!items.length) {
      body.append(empty("No history."));
      return;
    }

    const clear = ui.makeButton("Clear history", "ay-action ay-action-danger", async () => {
      if (!confirmAction("Clear your whole watch history?")) return;

      try {
        await lib().clearHistory();
        ui.invalidatePersonal();
        render();
      } catch (error) {
        ui.notify(ui.friendlyError(error, "Could not clear your history."));
      }
    });

    clear.style.marginTop = "22px";
    body.append(clear);

    const list = el("div", "lib-list");

    for (const item of items) {
      list.append(
        videoRow(toVideo(item, "history"), {
          progress: {
            progress: item.progress_seconds,
            duration: item.duration_seconds
          },
          actions: [
            {
              label: "Remove",
              danger: true,
              run: async () => {
                try {
                  await lib().removeHistoryEntry(item.video_id);
                  ui.invalidatePersonal();
                  render();
                } catch (error) {
                  ui.notify(ui.friendlyError(error, "Could not remove this entry."));
                }
              }
            }
          ]
        })
      );
    }

    body.append(list);
  }

  async function renderChannels(body) {
    const ui = UI();
    const prefs = await lib().getChannelPrefs();

    if (!prefs.length) {
      body.append(empty("No channels."));
      return;
    }

    const groups = [
      { kind: "follow", title: "Following", action: "Unfollow" },
      { kind: "block", title: "Hidden", action: "Unhide" }
    ];

    for (const group of groups) {
      const rows = prefs.filter((pref) => pref.kind === group.kind);

      if (!rows.length) continue;

      const head = el("div", "section-head");
      head.append(el("h2", "", group.title));

      const list = el("div", "lib-list lib-list--plain");

      for (const pref of rows) {
        const row = el("div", "lib-row lib-row--text");
        const text = el("div", "lib-body");

        text.append(el("p", "lib-title lib-title--static", pref.channel_name));

        const actions = el("div", "lib-actions");

        actions.append(
          ui.makeButton(group.action, "ay-action", async () => {
            try {
              await lib().removeChannelPref(pref.channel_key);
              ui.invalidatePersonal();
              ui.state.feedKey = "";
              render();
            } catch (error) {
              ui.notify(ui.friendlyError(error, "Could not update this channel."));
            }
          })
        );

        row.append(text, actions);
        list.append(row);
      }

      body.append(head, list);
    }
  }

  const RENDERERS = Object.freeze({
    playlists: renderPlaylists,
    later: renderLater,
    history: renderHistory,
    channels: renderChannels
  });

  // ---------------------------------------------------------------------------
  // Entry point
  // ---------------------------------------------------------------------------

  async function render() {
    const ui = UI();
    const { state } = ui;
    const container = document.getElementById("ayutube-library-content");

    if (!container) return;

    container.replaceChildren();

    let user = null;

    try {
      await ui.ensureAuthModules();
      user = await window.AyuTubeAuth.getCurrentUser();
    } catch {
      user = null;
    }

    state.user = user;

    if (!user) {
      const panel = el("section", "ay-panel");

      panel.append(
        el("h2", "ay-panel-title", "Sign in to see your library."),
        (() => {
          const actions = el("div", "ay-inline");

          actions.append(
            ui.makeButton("Go to Account", "ay-action ay-action-primary", () =>
              ui.setView("account")
            )
          );

          return actions;
        })()
      );

      container.append(panel);
      return;
    }

    const switcher = el("div", "ay-library-switch");
    switcher.setAttribute("role", "group");
    switcher.setAttribute("aria-label", "Library sections");

    for (const section of SECTIONS) {
      const button = ui.makeButton(section.label, "ay-chip", () => {
        state.librarySection = section.id;
        state.playlistId = null;
        render();
      });

      button.setAttribute("aria-pressed", String(state.librarySection === section.id));
      switcher.append(button);
    }

    const body = el("div", "lib-body-wrap");

    container.append(switcher, body);

    const token = (render.token = (render.token || 0) + 1);

    try {
      await RENDERERS[state.librarySection || "playlists"](body);
    } catch (error) {
      if (token !== render.token) return;

      body.replaceChildren();
      failure(body, error, "Could not load this section.");
    }
  }

  window.AyuTubeLibraryUI = Object.freeze({ render });
})();
