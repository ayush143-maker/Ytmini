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

  /** Fallback: look the channel up by name and keep only its own videos. */
  async function searchByName({ id, name }) {
    const ui = UI();

    if (!name) throw new Error("This channel is unavailable.");

    const api = await ui.ensureApi();
    const response = await api.search(name);
    const wanted = name.trim().toLowerCase();

    const items = (Array.isArray(response?.items) ? response.items : [])
      .map(ui.toVideo)
      .filter(
        (video) =>
          (id && video.channelId === id) ||
          String(video.uploaderName).trim().toLowerCase() === wanted
      );

    if (!items.length) throw new Error("This channel is unavailable.");

    return {
      id,
      name,
      avatar: "",
      subscribers: null,
      items,
      nextpage: null
    };
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

    const subs = formatSubscribers(data.subscribers);

    if (subs) text.append(el("p", "channel-meta", subs));

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

    // Videos
    body.replaceChildren();

    const seen = new Set();
    const usable = (video) => ui.validVideoId(video.id) && !video.short;

    const list = (data.items || []).map(ui.toVideo).filter(usable);

    if (!list.length) {
      body.append(el("div", "ay-empty", "No videos yet."));
    } else {
      const grid = el("div", "grid");

      body.append(grid);

      const add = (videos) => {
        for (const video of videos) {
          if (seen.has(video.id)) continue;

          seen.add(video.id);
          grid.append(
            cards.createCard(video, {
              variant: "grid",
              progress: personal.map.get(video.id) || null
            })
          );
        }
      };

      add(list);
      setupMore({ body, add, channel, nextpage: data.nextpage, mine, usable });
    }

    ui.markChannelSeen?.(channel.id || channel.key, list);
  }

  function setupMore({ body, add, channel, nextpage, mine, usable }) {
    if (!nextpage || !channel.id) return;

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

    async function more() {
      if (loading || !cursor || mine !== token) return;

      loading = true;
      button.disabled = true;
      message.hidden = true;

      try {
        const data = await fetchPage({
          id: channel.id,
          name: channel.name,
          page: cursor
        });

        if (mine !== token) return;

        add((data.items || []).map(ui.toVideo).filter(usable));
        cursor = data.nextpage;

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
