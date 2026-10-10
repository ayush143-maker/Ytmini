(() => {
  "use strict";

  // Behaviour is injected by app.js through configure(), so this module only
  // knows how to draw cards and menus.
  const handlers = {
    play: null,
    saveLater: null,
    getPlaylists: null,
    addToPlaylist: null,
    copyLink: null,
    extraItems: null
  };

  function configure(next) {
    Object.assign(handlers, next);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
  }

  // ---------------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------------

  function formatDuration(totalSeconds) {
    const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const two = (n) => String(n).padStart(2, "0");

    return h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
  }

  function formatViews(count) {
    if (count === null || count === undefined || !Number.isFinite(count)) {
      return "";
    }

    if (count === 1) return "1 view";

    try {
      return `${new Intl.NumberFormat("en", {
        notation: "compact",
        maximumFractionDigits: 1
      }).format(count)} views`;
    } catch {
      return `${count.toLocaleString()} views`;
    }
  }

  function thumbnailFor(video) {
    if (typeof video.thumbnail === "string" && video.thumbnail.startsWith("https://")) {
      return video.thumbnail;
    }

    return `https://i.ytimg.com/vi/${encodeURIComponent(video.id)}/hqdefault.jpg`;
  }

  function progressRatio(progress, knownDuration) {
    if (!progress) return 0;

    const duration = Number(progress.duration) || Number(knownDuration) || 0;
    const seconds = Number(progress.progress) || 0;

    if (seconds < 5 || duration <= 0) return 0;

    return Math.min(1, seconds / duration);
  }

  const dotsIcon = () => {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");

    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    for (const y of [5, 12, 19]) {
      const rect = document.createElementNS(ns, "rect");

      rect.setAttribute("x", "10.5");
      rect.setAttribute("y", String(y - 1.5));
      rect.setAttribute("width", "3");
      rect.setAttribute("height", "3");
      svg.append(rect);
    }

    return svg;
  };

  // ---------------------------------------------------------------------------
  // Card
  // ---------------------------------------------------------------------------

  /**
   * variant: "grid" (default), "lead" (large title), "compact"
   * (thumbnail beside text, used for Up next and rows).
   * progress: { progress, duration } in seconds, from watch history.
   */
  function createCard(video, { variant = "grid", progress = null } = {}) {
    const card = el("article", `vcard vcard--${variant}`);
    card.dataset.id = video.id;

    const play = () => handlers.play?.(video);

    // The thumbnail is a pointer target only; the title button is the
    // accessible control, so screen readers do not hear every video twice.
    const media = el("button", "vcard-media");
    media.type = "button";
    media.tabIndex = -1;
    media.setAttribute("aria-hidden", "true");
    media.addEventListener("click", play);

    const image = el("img");
    image.alt = "";
    image.decoding = "async";
    image.loading = variant === "lead" ? "eager" : "lazy";

    let triedFallback = false;

    image.addEventListener("error", () => {
      const fallback = `https://i.ytimg.com/vi/${encodeURIComponent(video.id)}/hqdefault.jpg`;

      if (!triedFallback && image.src !== fallback) {
        triedFallback = true;
        image.src = fallback;
        return;
      }

      image.remove();
    });

    image.src = thumbnailFor(video);
    media.append(image);

    if (video.duration) {
      media.append(el("span", "vcard-duration", formatDuration(video.duration)));
    }

    const ratio = progressRatio(progress, video.duration);

    if (ratio > 0) {
      const bar = el("span", "vcard-progress");
      const fill = el("i");

      fill.style.width = `${Math.round(ratio * 100)}%`;
      bar.append(fill);
      media.append(bar);
      card.dataset.watched = ratio >= 0.9 ? "true" : "partial";
    }

    const body = el("div", "vcard-body");
    const heading = el("h3", "vcard-title");
    const titleButton = el("button", "vcard-titlebtn", video.title);

    titleButton.type = "button";
    titleButton.addEventListener("click", play);
    heading.append(titleButton);

    body.append(heading);

    if (video.uploaderName) {
      body.append(el("p", "vcard-channel", video.uploaderName));
    }

    const stats = [formatViews(video.views), video.uploaded].filter(Boolean);

    if (stats.length) {
      const meta = el("p", "vcard-meta");

      for (const stat of stats) meta.append(el("span", "", stat));
      body.append(meta);
    }

    const more = el("button", "vcard-more");
    more.type = "button";
    more.setAttribute("aria-label", `More actions for ${video.title}`);
    more.setAttribute("aria-haspopup", "menu");
    more.setAttribute("aria-expanded", "false");
    more.append(dotsIcon());
    more.addEventListener("click", (event) => {
      event.stopPropagation();
      openMenu(more, video);
    });

    card.append(media, body, more);

    return card;
  }

  // ---------------------------------------------------------------------------
  // Skeletons
  // ---------------------------------------------------------------------------

  function skeletons(count = 6, variant = "grid") {
    const wrap = el("div", variant === "compact" ? "stack" : "grid");

    wrap.setAttribute("aria-hidden", "true");

    for (let index = 0; index < count; index += 1) {
      const card = el("div", `vcard vcard--${variant} vcard--skeleton`);

      card.append(
        el("div", "vcard-media"),
        (() => {
          const body = el("div", "vcard-body");

          body.append(el("span", "skel-line"), el("span", "skel-line skel-short"));
          return body;
        })()
      );

      wrap.append(card);
    }

    return wrap;
  }

  // ---------------------------------------------------------------------------
  // Action menu (fixed position so scrolling rows never clip it)
  // ---------------------------------------------------------------------------

  let activeMenu = null;

  function closeMenu({ restoreFocus = false } = {}) {
    if (!activeMenu) return;

    const { node, anchor, dispose } = activeMenu;

    activeMenu = null;
    dispose();
    node.remove();
    anchor.setAttribute("aria-expanded", "false");

    if (restoreFocus) anchor.focus();
  }

  function placeMenu(node, anchor) {
    const rect = anchor.getBoundingClientRect();
    const width = node.offsetWidth;
    const height = node.offsetHeight;
    const margin = 8;
    const bottomLimit = window.innerHeight - 76; // keep clear of the tab bar

    let left = Math.min(
      Math.max(margin, rect.right - width),
      window.innerWidth - width - margin
    );
    let top = rect.bottom + 4;

    if (top + height > bottomLimit) {
      top = rect.top - height - 4;
    }

    if (top < margin) {
      top = Math.max(margin, bottomLimit - height);
    }

    node.style.left = `${Math.round(left)}px`;
    node.style.top = `${Math.round(top)}px`;
  }

  function openMenu(anchor, video, { start = "root" } = {}) {
    // Pressing the same button again closes the menu.
    if (activeMenu?.anchor === anchor) {
      closeMenu({ restoreFocus: true });
      return;
    }

    closeMenu();

    const node = el("div", "menu");
    node.setAttribute("role", "menu");
    node.setAttribute("aria-label", "Video actions");
    document.body.append(node);

    anchor.setAttribute("aria-expanded", "true");

    const items = () => [...node.querySelectorAll("[role=menuitem]")];

    function addItem(label, run, { disabled = false } = {}) {
      const item = el("button", "menu-item", label);

      item.type = "button";
      item.setAttribute("role", "menuitem");
      item.disabled = disabled;
      item.addEventListener("click", run);
      node.append(item);

      return item;
    }

    function showRoot() {
      node.replaceChildren();

      addItem("Save to Watch Later", () => {
        closeMenu({ restoreFocus: true });
        handlers.saveLater?.(video);
      });

      addItem("Add to playlist", showPlaylists);

      addItem("Copy link", () => {
        closeMenu({ restoreFocus: true });
        handlers.copyLink?.(video);
      });

      let extra = [];

      try {
        extra = handlers.extraItems?.(video) || [];
      } catch {
        extra = [];
      }

      if (extra.length) {
        node.append(el("div", "menu-rule"));

        for (const item of extra) {
          addItem(item.label, () => {
            closeMenu({ restoreFocus: true });
            item.run();
          });
        }
      }

      items()[0]?.focus({ preventScroll: true });
      placeMenu(node, anchor);
    }

    async function showPlaylists() {
      node.replaceChildren();

      addItem("Back", showRoot);
      node.append(el("p", "menu-note", "Loading playlists…"));
      placeMenu(node, anchor);

      let playlists = [];

      try {
        playlists = (await handlers.getPlaylists?.()) || [];
      } catch (error) {
        if (activeMenu?.node !== node) return;

        node.querySelector(".menu-note").textContent = /sign in/i.test(
          error?.message || ""
        )
          ? "Sign in from the Account tab to use playlists."
          : error?.message || "Could not load playlists.";
        placeMenu(node, anchor);
        return;
      }

      if (activeMenu?.node !== node) return;

      node.querySelector(".menu-note")?.remove();

      if (!playlists.length) {
        node.append(
          el("p", "menu-note", "No playlists yet. Create one in the Library tab.")
        );
        placeMenu(node, anchor);
        return;
      }

      for (const playlist of playlists) {
        addItem(playlist.name, () => {
          closeMenu({ restoreFocus: true });
          handlers.addToPlaylist?.(playlist, video);
        });
      }

      items()[1]?.focus({ preventScroll: true });
      placeMenu(node, anchor);
    }

    function onPointerDown(event) {
      if (!node.contains(event.target) && !anchor.contains(event.target)) {
        closeMenu();
      }
    }

    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu({ restoreFocus: true });
        return;
      }

      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;

      const list = items().filter((item) => !item.disabled);
      if (!list.length) return;

      event.preventDefault();

      const index = list.indexOf(document.activeElement);

      if (event.key === "Home") list[0].focus();
      else if (event.key === "End") list[list.length - 1].focus();
      else if (event.key === "ArrowDown") list[(index + 1) % list.length].focus();
      else list[(index - 1 + list.length) % list.length].focus();
    }

    const onResize = () => closeMenu();

    // The menu is fixed-position, so it must close when its anchor moves.
    // Late scroll events left over from before it opened are ignored: the
    // page only counts as scrolled if it actually moved.
    const startY = window.scrollY;

    const onScroll = (event) => {
      if (node.contains(event.target)) return;

      const pageScroll =
        event.target === document ||
        event.target === document.documentElement ||
        event.target === window;

      if (pageScroll && Math.abs(window.scrollY - startY) < 8) return;

      closeMenu();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);

    activeMenu = {
      node,
      anchor,
      dispose() {
        document.removeEventListener("pointerdown", onPointerDown, true);
        document.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("scroll", onScroll, true);
        window.removeEventListener("resize", onResize);
      }
    };

    if (start === "playlists") {
      showPlaylists();
    } else {
      showRoot();
    }
  }

  window.AyuTubeCards = Object.freeze({
    configure,
    createCard,
    skeletons,
    openMenu,
    closeMenu,
    format: Object.freeze({ duration: formatDuration, views: formatViews })
  });
})();
