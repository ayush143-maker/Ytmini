(() => {
  "use strict";

  const UI = () => window.AyuTubeUI;
  const Cards = () => window.AyuTubeCards;
  const lib = () => window.AyuTubeLibrary;

  const SECTIONS = Object.freeze([
    { id: "home", label: "Overview" },
    { id: "playlists", label: "Playlists" },
    { id: "later", label: "Watch later" },
    { id: "liked", label: "Liked" },
    { id: "history", label: "History" },
    { id: "following", label: "Following" }
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
      const channel = el("button", "lib-channel", video.uploaderName);

      channel.type = "button";
      channel.addEventListener("click", () =>
        ui.openChannel({ id: video.channelId, name: video.uploaderName })
      );
      body.append(channel);
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

  async function renderLiked(body) {
    const ui = UI();
    const [items, personal] = await Promise.all([lib().getLikes(), ui.getPersonal()]);

    if (!items.length) {
      body.append(empty("Nothing liked yet."));
      return;
    }

    const list = el("div", "lib-list");

    for (const item of items) {
      list.append(
        videoRow(toVideo(item, "liked"), {
          progress: personal.map.get(item.video_id) || null,
          actions: [
            {
              label: "Unlike",
              danger: true,
              run: async () => {
                try {
                  await lib().unlikeVideo(item.video_id);
                  personal.likes.delete(item.video_id);
                  render();
                } catch (error) {
                  ui.notify(ui.friendlyError(error, "Could not remove this like."));
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

  async function renderFollowing(body) {
    const ui = UI();
    const personal = await ui.getPersonal();

    const follows = personal.prefs.filter((pref) => pref.kind === "follow");
    const hidden = personal.prefs.filter((pref) => pref.kind === "block");

    if (!follows.length && !hidden.length) {
      body.append(empty("Not following anyone."));
      return;
    }

    if (follows.length) {
      const chips = el("div", "chan-row");
      const byKey = new Map();

      for (const pref of follows) {
        const chip = el("button", "chan-chip");
        chip.append(avatarNode(pref.channel_name, pref.avatar), el("span", "", pref.channel_name));

        chip.type = "button";
        chip.addEventListener("click", () => {
          ui.openChannel({
            id: window.AyuTubeChannel.isChannelId(pref.channel_key) ? pref.channel_key : "",
            name: pref.channel_name
          });
        });

        byKey.set(pref.channel_key, chip);
        chips.append(chip);
      }

      body.append(chips);

      const head = el("div", "section-head");
      head.append(el("h2", "", "Latest"));

      const slot = el("div");

      slot.append(Cards().skeletons(3, "grid"));
      body.append(head, slot);

      const data = await window.AyuTubeFollowing.load();

      for (const channel of data.channels) {
        const chip = byKey.get(channel.pref.channel_key);

        if (chip && ui.isNewSince(channel.pref.channel_key, channel.latestAt)) {
          chip.dataset.new = "true";
        }
      }

      slot.replaceChildren();

      if (!data.videos.length) {
        slot.append(empty("No videos right now."));
      } else {
        const grid = el("div", "grid");

        for (const { video, key } of data.videos) {
          grid.append(
            Cards().createCard(video, {
              variant: "grid",
              progress: personal.map.get(video.id) || null,
              badge: ui.isNewSince(key, video.uploadedAt) ? "New" : ""
            })
          );
        }

        slot.append(grid);
      }
    }

    if (hidden.length) {
      const head = el("div", "section-head");
      head.append(el("h2", "", "Hidden"));

      const list = el("div", "lib-list lib-list--plain");

      for (const pref of hidden) {
        const row = el("div", "lib-row lib-row--text");
        const text = el("div", "lib-body");

        text.append(el("p", "lib-title lib-title--static", pref.channel_name));

        const actions = el("div", "lib-actions");

        actions.append(
          ui.makeButton("Unhide", "ay-action", async () => {
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

  // ---------------------------------------------------------------------------
  // Overview: YouTube-style "You" tab with blocks and shelves
  // ---------------------------------------------------------------------------

  const SVG_NS = "http://www.w3.org/2000/svg";

  const BLOCK_ICONS = Object.freeze({
    clock:
      "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm.5 5H11v6l5.2 3.1.8-1.3-4.5-2.7V7z",
    heart:
      "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
    playlist: "M3 6h12v2H3V6zm0 4h12v2H3v-2zm0 4h8v2H3v-2zm13-4v8l6-4-6-4z",
    history:
      "M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z",
    people:
      "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
  });

  function blockIcon(name) {
    const svg = document.createElementNS(SVG_NS, "svg");
    const path = document.createElementNS(SVG_NS, "path");

    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    path.setAttribute("d", BLOCK_ICONS[name]);
    path.setAttribute("fill", "currentColor");
    svg.append(path);

    return svg;
  }

  const BLOCKS = Object.freeze([
    { id: "later", label: "Watch later", icon: "clock", stat: "watchLater" },
    { id: "liked", label: "Liked videos", icon: "heart", stat: "likes" },
    { id: "playlists", label: "Playlists", icon: "playlist", stat: "playlists" },
    { id: "history", label: "History", icon: "history", stat: "history" },
    { id: "following", label: "Following", icon: "people", stat: "following" }
  ]);

  function openSection(id, playlistId = null) {
    const { state } = UI();

    state.librarySection = id;
    state.playlistId = playlistId;
    render();
  }

  function channelRef(pref) {
    return {
      id: window.AyuTubeChannel.isChannelId(pref.channel_key) ? pref.channel_key : "",
      name: pref.channel_name
    };
  }

  /** Round channel picture with the first letter as a fallback. */
  function avatarNode(name, url) {
    const node = el("span", "chan-avatar");

    node.textContent = (name || "?").trim().charAt(0).toUpperCase();

    if (url) {
      const picture = el("img");

      picture.alt = "";
      picture.decoding = "async";
      picture.addEventListener("load", () => {
        node.textContent = "";
        node.append(picture);
      });
      picture.src = url;
    }

    return node;
  }

  function shelfHead(title, sectionId) {
    const head = el("div", "section-head lib-shelf-head");

    head.append(el("h2", "", title));

    if (sectionId) {
      const more = el("button", "lib-more", "See all");

      more.type = "button";
      more.addEventListener("click", () => openSection(sectionId));
      head.append(more);
    }

    return head;
  }

  async function renderHome(body) {
    const ui = UI();
    const personal = await ui.getPersonal();
    const [stats, history, later, likes, playlists, progress] = await Promise.all([
      window.AyuTubeLocal.stats(),
      lib().getHistory({ limit: 12 }),
      lib().getWatchLater({ limit: 12 }),
      lib().getLikes({ limit: 12 }),
      lib().getPlaylists(),
      lib().getPlaylistProgress()
    ]);

    const blocks = el("div", "lib-blocks");

    for (const block of BLOCKS) {
      const button = el("button", "lib-block");
      const count = stats[block.stat] || 0;

      button.type = "button";
      button.append(
        blockIcon(block.icon),
        el("span", "lib-block-title", block.label),
        el("span", "lib-block-count", `${count} ${count === 1 ? "item" : "items"}`)
      );
      button.addEventListener("click", () => openSection(block.id));
      blocks.append(button);
    }

    body.append(blocks);

    const videoShelf = (title, section, rows, kind) => {
      if (!rows.length) return;

      const strip = el("div", "hrow lib-shelf");

      for (const row of rows) {
        const video = toVideo(row, kind);

        strip.append(
          Cards().createCard(video, {
            variant: "grid",
            progress:
              kind === "history"
                ? { progress: row.progress_seconds, duration: row.duration_seconds }
                : personal.map.get(video.id) || null
          })
        );
      }

      body.append(shelfHead(title, section), strip);
    };

    videoShelf("History", "history", history, "history");
    videoShelf("Watch later", "later", later, "later");

    if (playlists.length) {
      const strip = el("div", "hrow lib-shelf lib-shelf--playlists");

      for (const playlist of playlists.slice(0, 12)) {
        const card = el("button", "lib-pl");
        const total = progress[playlist.id]?.total || 0;
        const art = el("span", "lib-pl-art");

        art.append(blockIcon("playlist"));
        card.type = "button";
        card.append(
          art,
          el("span", "lib-pl-name", playlist.name),
          el("span", "lib-pl-count", `${total} ${total === 1 ? "video" : "videos"}`)
        );
        card.addEventListener("click", () => openSection("playlists", playlist.id));
        strip.append(card);
      }

      body.append(shelfHead("Playlists", "playlists"), strip);
    }

    videoShelf("Liked videos", "liked", likes, "liked");

    const follows = personal.prefs.filter((pref) => pref.kind === "follow");

    if (follows.length) {
      const strip = el("div", "chan-avatars");
      const nodes = new Map();

      for (const pref of follows) {
        const button = el("button", "chan-avatar-btn");
        const picture = avatarNode(pref.channel_name, pref.avatar);

        button.type = "button";
        button.append(picture, el("span", "chan-avatar-name", pref.channel_name));
        button.addEventListener("click", () => ui.openChannel(channelRef(pref)));
        nodes.set(pref.channel_key, picture);
        strip.append(button);
      }

      body.append(shelfHead("Following", "following"), strip);

      // Older follows have no picture yet: fetch it once and remember it.
      const queue = follows.filter((pref) => !pref.avatar).slice(0, 24);
      let next = 0;

      const worker = async () => {
        while (next < queue.length) {
          const pref = queue[next];

          next += 1;

          try {
            const data = await window.AyuTubeChannel.load(channelRef(pref));
            const url = typeof data?.avatar === "string" ? data.avatar : "";

            if (!url) continue;

            const fresh = avatarNode(pref.channel_name, url);

            nodes.get(pref.channel_key)?.replaceWith(fresh);
            nodes.set(pref.channel_key, fresh);
            await lib().setChannelPref({
              channel_key: pref.channel_key,
              channel_name: pref.channel_name,
              kind: "follow",
              avatar: url
            });
          } catch {
            // Keep the letter; try again next time.
          }
        }
      };

      Promise.all([worker(), worker(), worker()]).then(() => ui.invalidatePersonal());
    }

    if (!history.length && !later.length && !likes.length && !playlists.length && !follows.length) {
      body.append(empty("Nothing here yet. Watch, like or follow something and it shows up here."));
    }
  }

  const RENDERERS = Object.freeze({
    home: renderHome,
    playlists: renderPlaylists,
    later: renderLater,
    liked: renderLiked,
    history: renderHistory,
    following: renderFollowing
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

      button.setAttribute("aria-pressed", String((state.librarySection || "home") === section.id));
      switcher.append(button);
    }

    const body = el("div", "lib-body-wrap");

    container.append(switcher, body);

    const token = (render.token = (render.token || 0) + 1);

    try {
      await RENDERERS[state.librarySection || "home"](body);
    } catch (error) {
      if (token !== render.token) return;

      body.replaceChildren();
      failure(body, error, "Could not load this section.");
    }
  }

  window.AyuTubeLibraryUI = Object.freeze({ render });
})();
