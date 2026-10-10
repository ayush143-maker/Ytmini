(() => {
  "use strict";

  const UI = () => window.AyuTubeUI;
  const Cards = () => window.AyuTubeCards;

  const CACHE_MS = 10 * 60 * 1000;
  const FETCH_TIMEOUT_MS = 20000;
  const CHUNK = 12;
  const BATCH_SIZE = 3;
  const MAX_BATCHES = 6;

  let renderToken = 0;
  let observer = null;

  function el(tag, className, text) {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
  }

  // ---------------------------------------------------------------------------
  // Fetching (one request for several topics, cached for this tab)
  // ---------------------------------------------------------------------------

  const cacheKey = (queries) => `ayutube.feed:${queries.join("\u0001")}`;

  function readCache(key) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;

      const { at, groups } = JSON.parse(raw);

      return Date.now() - at <= CACHE_MS && Array.isArray(groups) ? groups : null;
    } catch {
      return null;
    }
  }

  function writeCache(key, groups) {
    try {
      sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), groups }));
    } catch {
      // Storage is optional.
    }
  }

  async function fetchGroups(queries) {
    const key = cacheKey(queries);
    const cached = readCache(key);

    if (cached) return cached;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(
        `/api/feed?${queries.map((q) => `q=${encodeURIComponent(q)}`).join("&")}`,
        { signal: controller.signal, headers: { Accept: "application/json" } }
      );

      let payload = null;

      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok || !Array.isArray(payload?.groups)) {
        throw new Error(payload?.error || "Videos are unavailable right now.");
      }

      const groups = payload.groups.filter(
        (group) => group && Array.isArray(group.items)
      );

      writeCache(key, groups);

      return groups;
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error("Videos took too long to load.");
      }

      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** [[a1,a2],[b1,b2]] -> [a1,b1,a2,b2] */
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

  function shorten(text, max) {
    const clean = String(text || "")
      .replace(/\s*[|\-\u2013\u2014].*$/, "")
      .replace(/[[(].*?[\])]/g, "")
      .trim();

    return clean.length > max ? `${clean.slice(0, max - 1).trim()}\u2026` : clean;
  }

  function searchTerms(title) {
    return String(title || "")
      .replace(/\s*[|\u2013\u2014].*$/, "")
      .replace(/[[(].*?[\])]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 7)
      .join(" ");
  }

  function section(title, body, action) {
    const wrap = el("section", "feed-section");
    const head = el("div", "section-head");

    head.append(el("h2", "", title));

    if (action) head.append(action);

    wrap.append(head, body);

    return wrap;
  }

  function loadingView() {
    const wrap = el("div", "feed-loading");
    const lead = Cards().skeletons(1, "grid");

    lead.className = "feed-lead";
    wrap.append(lead, Cards().skeletons(6, "grid"));

    return wrap;
  }

  function showError(container, message, retry) {
    container.replaceChildren();
    container.removeAttribute("aria-busy");

    const box = el("div", "ay-empty");

    box.append(el("p", "", message));

    const again = UI().makeButton("Try again", "ay-action", retry);
    again.style.marginTop = "14px";

    box.append(again);
    container.append(box);
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  async function render(container, { category = null } = {}) {
    const ui = UI();
    const cards = Cards();

    if (!container || !cards) return;

    const token = ++renderToken;
    const current = () => token === renderToken;

    observer?.disconnect();
    observer = null;

    container.replaceChildren(loadingView());
    container.setAttribute("aria-busy", "true");

    let module;
    let groups;
    let personal;

    const study = ui.isStudy();

    try {
      module = await ui.ensureCategories();

      const visible = module
        .getAll()
        .filter((item) => !(study && ui.ENTERTAINMENT.has(item.id)));

      const active = category ? module.getById(category) : null;
      const topics = active ? [active] : visible;

      let queries;
      let reserve = [];

      if (active) {
        queries = [
          active.defaultQuery,
          ...module.getSuggestions(active.id).map((item) => item.query)
        ].slice(0, 6);
      } else {
        queries = topics.map((item) => item.defaultQuery).slice(0, 6);

        reserve = interleave(
          topics.map((item) =>
            module.getSuggestions(item.id).map((suggestion) => suggestion.query)
          )
        );
      }

      [groups, personal] = await Promise.all([
        fetchGroups(queries),
        ui.getPersonal()
      ]);

      if (!current()) return;

      build({ container, ui, cards, module, active, topics, queries, groups, personal, reserve, token, study });
    } catch (error) {
      if (!current()) return;

      showError(
        container,
        error?.message || "Videos are unavailable right now.",
        () => render(container, { category })
      );
    }
  }

  function build({ container, ui, cards, module, active, topics, queries, groups, personal, reserve, token, study }) {
    const current = () => token === renderToken;
    const seen = new Set();

    const usable = (video) =>
      ui.validVideoId(video.id) && !video.short && !ui.isBlocked(video);

    // Groups arrive in the order requested. Map each to a clean video list.
    const byQuery = new Map(groups.map((group) => [group.query, group.items]));

    const listFor = (query) =>
      (byQuery.get(query) || []).map(ui.toVideo).filter(usable);

    const topicLists = active
      ? queries.map((query) => listFor(query))
      : topics.map((topic) => listFor(topic.defaultQuery));

    const mixed = interleave(topicLists);

    function pull(list, count) {
      const picked = [];

      for (const video of list) {
        if (picked.length >= count) break;
        if (seen.has(video.id)) continue;

        seen.add(video.id);
        picked.push(video);
      }

      return picked;
    }

    const progressOf = (video) => personal.map.get(video.id) || null;

    const makeGrid = (videos, variant = "grid") => {
      const grid = el("div", variant === "compact" ? "stack" : "grid");

      for (const video of videos) {
        grid.append(cards.createCard(video, { variant, progress: progressOf(video) }));
      }

      return grid;
    };

    const makeRow = (videos) => {
      const row = el("div", "hrow");

      for (const video of videos) {
        row.append(cards.createCard(video, { variant: "grid", progress: progressOf(video) }));
      }

      return row;
    };

    container.replaceChildren();
    container.removeAttribute("aria-busy");

    // Continue watching comes first, so those videos are not repeated below.
    const unfinished = personal.history
      .filter((row) => {
        const progress = Number(row.progress_seconds) || 0;
        const duration = Number(row.duration_seconds) || 0;

        if (progress < 30) return false;

        return !(duration > 0 && progress / duration >= 0.92);
      })
      .slice(0, 8)
      .map((row) =>
        ui.toVideo({
          id: row.video_id,
          title: row.title,
          uploaderName: row.channel_title,
          thumbnail: row.thumbnail_url,
          duration: row.duration_seconds
        })
      )
      .filter((video) => ui.validVideoId(video.id));

    for (const video of unfinished) seen.add(video.id);

    const lead = pull(mixed, 1)[0];

    if (!lead && !unfinished.length) {
      showError(container, "No videos to show yet.", () =>
        render(container, { category: active?.id || null })
      );
      return;
    }

    if (lead) {
      const wrap = el("div", "feed-lead");

      wrap.append(cards.createCard(lead, { variant: "lead", progress: progressOf(lead) }));
      container.append(wrap);
    }

    if (unfinished.length) {
      container.append(section("Continue watching", makeRow(unfinished)));
    }

    const firstGrid = pull(mixed, active ? 11 : 8);

    if (firstGrid.length) {
      const grid = makeGrid(firstGrid);

      grid.classList.add("grid--flush");
      container.append(grid);
    }

    // Slots for rows that load after the first paint.
    const followingSlot = el("div");
    const becauseSlot = el("div");

    container.append(followingSlot, becauseSlot);

    // One block per category on the All view.
    if (!active) {
      for (const [index, topic] of topics.entries()) {
        const picked = pull(topicLists[index], 4);

        if (!picked.length) continue;

        const seeAll = ui.makeButton("See all", "ay-chip", () =>
          ui.selectCategory(topic.id)
        );

        container.append(section(topic.label, makeGrid(picked), seeAll));
      }
    }

    // Whatever is left feeds the "more" list without another request.
    const pool = interleave(topicLists).filter((video) => !seen.has(video.id));

    setupMore({ container, ui, cards, pool, reserve, seen, usable, progressOf, token, current });

    if (personal.user) {
      fillFollowing({ ui, cards, slot: followingSlot, personal, seen, usable, progressOf, current, makeGrid });
      fillBecause({ ui, cards, slot: becauseSlot, personal, seen, usable, progressOf, current, makeRow });
    }
  }

  // ---------------------------------------------------------------------------
  // Personal rows (filled in after the first paint)
  // ---------------------------------------------------------------------------

  async function fillFollowing({ ui, cards, slot, personal, seen, usable, progressOf, current, makeGrid }) {
    const follows = personal.prefs.filter((pref) => pref.kind === "follow").slice(0, 4);

    if (!follows.length) return;

    try {
      const api = await ui.ensureApi();

      const lists = await Promise.all(
        follows.map(async (pref) => {
          const response = await api.search(pref.channel_name);
          const items = Array.isArray(response?.items) ? response.items : [];
          const name = String(pref.channel_name).trim().toLowerCase();

          return items
            .map(ui.toVideo)
            .filter(
              (video) =>
                usable(video) &&
                (video.channelId === pref.channel_key ||
                  String(video.uploaderName).trim().toLowerCase() === name)
            );
        })
      );

      if (!current()) return;

      // Followed channels always show their videos, even when the same video
      // also appears elsewhere on the page.
      const picked = [];
      const taken = new Set();

      for (const video of interleave(lists)) {
        if (picked.length >= 6) break;
        if (taken.has(video.id)) continue;

        taken.add(video.id);
        picked.push(video);
      }

      if (!picked.length) return;

      slot.replaceChildren(section("Following", makeGrid(picked)));
    } catch {
      // Optional row: stay quiet if the provider is slow.
    }
  }

  async function fillBecause({ ui, cards, slot, personal, seen, usable, progressOf, current, makeRow }) {
    const latest = personal.history[0];

    if (!latest) return;

    const terms = searchTerms(latest.title);

    if (terms.length < 4) return;

    try {
      const api = await ui.ensureApi();
      const response = await api.search(terms);

      if (!current()) return;

      const items = Array.isArray(response?.items) ? response.items : [];
      const picked = [];

      for (const video of items.map(ui.toVideo)) {
        if (picked.length >= 8) break;
        if (video.id === latest.video_id || seen.has(video.id) || !usable(video)) continue;

        seen.add(video.id);
        picked.push(video);
      }

      if (picked.length < 2) return;

      slot.replaceChildren(
        section(`More like ${shorten(latest.title, 34)}`, makeRow(picked))
      );
    } catch {
      // Optional row.
    }
  }

  // ---------------------------------------------------------------------------
  // Endless "more" list: first from leftovers, then from further topics
  // ---------------------------------------------------------------------------

  function setupMore({ container, ui, cards, pool, reserve, seen, usable, progressOf, token, current }) {
    if (!pool.length && !reserve.length) return;

    const grid = el("div", "grid");
    const button = ui.makeButton("Show more", "ay-action");
    const sentinel = el("div", "feed-sentinel");
    const footer = el("div", "feed-more");
    const message = el("p", "feed-note");

    message.hidden = true;
    footer.append(button, message);

    const wrap = section("More", grid);

    wrap.append(footer, sentinel);
    wrap.hidden = true;
    container.append(wrap);

    let loading = false;
    let finished = false;
    let batches = 0;

    function finish() {
      finished = true;
      footer.hidden = true;
      observer?.disconnect();
    }

    function append(videos) {
      if (!videos.length) return;

      wrap.hidden = false;

      for (const video of videos) {
        seen.add(video.id);
        grid.append(cards.createCard(video, { variant: "grid", progress: progressOf(video) }));
      }
    }

    async function loadMore() {
      if (loading || finished || !current()) return;

      loading = true;
      button.disabled = true;
      message.hidden = true;

      try {
        let chunk = [];

        while (!chunk.length && !finished) {
          chunk = pool.splice(0, CHUNK).filter((video) => !seen.has(video.id));

          if (chunk.length) break;

          if (!reserve.length || batches >= MAX_BATCHES) {
            finish();
            break;
          }

          const queries = reserve.splice(0, BATCH_SIZE);
          batches += 1;

          const groups = await fetchGroups(queries);

          if (!current()) return;

          pool.push(
            ...interleave(
              groups.map((group) => group.items.map(ui.toVideo).filter(usable))
            ).filter((video) => !seen.has(video.id))
          );
        }

        if (!current()) return;

        append(chunk);

        if (!pool.length && (!reserve.length || batches >= MAX_BATCHES)) {
          finish();
        }
      } catch (error) {
        if (!current()) return;

        message.textContent = error?.message || "Could not load more.";
        message.hidden = false;
      } finally {
        loading = false;
        button.disabled = false;

        // Re-check whether the sentinel is still on screen.
        if (observer && !finished) {
          observer.unobserve(sentinel);
          observer.observe(sentinel);
        }
      }
    }

    button.addEventListener("click", loadMore);

    // Show the first chunk immediately so the page is never short.
    const first = pool.splice(0, CHUNK);

    append(first);

    if (!pool.length && (!reserve.length || MAX_BATCHES === 0)) {
      finish();
    }

    if ("IntersectionObserver" in window && !finished) {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) loadMore();
        },
        { rootMargin: "800px 0px" }
      );

      observer.observe(sentinel);
    }

    if (!first.length && !finished) {
      wrap.hidden = false;
      loadMore();
    }
  }

  window.AyuTubeFeed = Object.freeze({ render });
})();
