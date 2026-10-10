(() => {
  "use strict";

  // Local suggestions: recent searches, category topics and titles seen in
  // earlier results. Nothing is sent to a third party while typing.

  const UI = () => window.AyuTubeUI;
  const STORAGE_KEY = "ayutube.recent";
  const MAX_RECENT = 8;
  const MAX_SHOWN = 8;
  const MAX_TITLES = 300;

  const titles = [];
  let topics = null; // [{ text, ctx }]
  let options = []; // [{ text, ctx, node }]
  let active = -1;
  let blurTimer = null;

  const $ = (selector) => document.querySelector(selector);

  function el(tag, className, text) {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
  }

  const recents = () => {
    const list = UI().store.get(STORAGE_KEY, []);

    return Array.isArray(list)
      ? list.filter((item) => typeof item === "string").slice(0, MAX_RECENT)
      : [];
  };

  function remember(query) {
    const text = String(query || "").trim();

    if (text.length < 2) return;

    const next = [
      text,
      ...recents().filter((item) => item.toLowerCase() !== text.toLowerCase())
    ].slice(0, MAX_RECENT);

    UI().store.set(STORAGE_KEY, next);
  }

  function learn(videos) {
    for (const video of videos || []) {
      const title = String(video.title || "").trim();

      if (title && !titles.includes(title)) titles.push(title);
    }

    if (titles.length > MAX_TITLES) titles.splice(0, titles.length - MAX_TITLES);
  }

  async function loadTopics() {
    if (topics) return topics;

    try {
      const module = await UI().ensureCategories();

      topics = [];

      for (const category of module.getAll()) {
        topics.push({ text: category.defaultQuery, ctx: false });

        for (const suggestion of module.getSuggestions(category.id)) {
          topics.push({ text: suggestion.query, ctx: false });
        }
      }
    } catch {
      topics = [];
    }

    return topics;
  }

  function matches(text, needle) {
    return text.toLowerCase().includes(needle);
  }

  async function candidates(raw) {
    const needle = raw.trim().toLowerCase();
    const list = [];
    const seen = new Set();

    const add = (text, ctx) => {
      const key = text.toLowerCase();

      if (!text || seen.has(key) || key === needle) return;

      seen.add(key);
      list.push({ text, ctx });
    };

    // With nothing typed, only recent searches are offered.
    if (needle.length < 2) {
      for (const item of recents()) add(item, true);

      return { list: list.slice(0, MAX_SHOWN), recentOnly: true };
    }

    for (const item of recents()) {
      if (matches(item, needle)) add(item, true);
    }

    for (const topic of await loadTopics()) {
      if (matches(topic.text, needle)) add(topic.text, topic.ctx);
    }

    let fromTitles = 0;

    for (const title of titles) {
      if (fromTitles >= 3) break;

      if (matches(title, needle)) {
        add(title, false);
        fromTitles += 1;
      }
    }

    return { list: list.slice(0, MAX_SHOWN), recentOnly: false };
  }

  // ---------------------------------------------------------------------------
  // Listbox
  // ---------------------------------------------------------------------------

  function box() {
    return $("#search-suggest");
  }

  function input() {
    return $("#search-input");
  }

  function close() {
    const listbox = box();

    if (!listbox) return;

    listbox.hidden = true;
    listbox.replaceChildren();
    options = [];
    active = -1;

    input()?.setAttribute("aria-expanded", "false");
    input()?.removeAttribute("aria-activedescendant");
  }

  function setActive(index) {
    active = index;

    options.forEach((option, position) => {
      const on = position === index;

      option.node.setAttribute("aria-selected", String(on));
    });

    if (index >= 0) {
      input()?.setAttribute("aria-activedescendant", options[index].node.id);
      options[index].node.scrollIntoView({ block: "nearest" });
    } else {
      input()?.removeAttribute("aria-activedescendant");
    }
  }

  function choose(option) {
    close();

    const field = input();

    if (field) field.value = option.text;

    UI().runSearch(option.text, { useCategoryContext: option.ctx });
  }

  async function update() {
    const field = input();
    const listbox = box();

    if (!field || !listbox) return;

    const stamp = ++update.stamp || (update.stamp = 1);
    const { list, recentOnly } = await candidates(field.value);

    if (stamp !== update.stamp || document.activeElement !== field) return;

    listbox.replaceChildren();
    options = [];
    active = -1;

    if (!list.length) {
      close();
      return;
    }

    list.forEach((item, index) => {
      const node = el("div", "suggest-option", item.text);

      node.id = `suggest-${index}`;
      node.setAttribute("role", "option");
      node.setAttribute("aria-selected", "false");

      // pointerdown, so the input keeps focus and the click is not lost.
      node.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        choose(item);
      });

      listbox.append(node);
      options.push({ ...item, node });
    });

    if (recentOnly) {
      const clear = el("button", "suggest-clear", "Clear recent searches");

      clear.type = "button";
      clear.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        UI().store.set(STORAGE_KEY, []);
        close();
      });
      listbox.append(clear);
    }

    listbox.hidden = false;
    field.setAttribute("aria-expanded", "true");
  }

  function onKeyDown(event) {
    const listbox = box();
    const open = listbox && !listbox.hidden && options.length;

    if (event.key === "Escape" && open) {
      event.preventDefault();
      close();
      return;
    }

    if (!open) {
      if (event.key === "ArrowDown") update();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((active + 1) % options.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((active - 1 + options.length) % options.length);
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      choose(options[active]);
    }
  }

  function init() {
    const field = input();

    if (!field || field.dataset.suggestBound === "true") return;

    field.dataset.suggestBound = "true";

    field.addEventListener("input", update);
    field.addEventListener("focus", () => {
      clearTimeout(blurTimer);
      update();
    });
    field.addEventListener("keydown", onKeyDown);
    field.addEventListener("blur", () => {
      blurTimer = setTimeout(close, 120);
    });
  }

  window.AyuTubeSearchUI = Object.freeze({ init, close, remember, learn });
})();
