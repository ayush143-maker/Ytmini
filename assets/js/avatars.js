/*
 * AyuTube - channel pictures.
 *
 * Search results rarely carry the channel's picture, so it is fetched once per
 * channel when its card scrolls into view and remembered on this device.
 * Licensed under the GNU General Public License v3.0 (see LICENSE).
 */
(() => {
  "use strict";

  const KEY = "ayutube.avatars.v1";
  const MAX_KEPT = 600;
  const PARALLEL = 3;

  let cache = {};

  try {
    cache = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
  } catch {
    cache = {};
  }

  const failed = new Set();
  const pending = new Map();
  const queue = [];
  let running = 0;
  let saveTimer = 0;

  const valid = (id) => /^[A-Za-z0-9_-]{10,40}$/.test(id || "");

  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const keys = Object.keys(cache);

        for (const old of keys.slice(0, Math.max(0, keys.length - MAX_KEPT))) {
          delete cache[old];
        }

        localStorage.setItem(KEY, JSON.stringify(cache));
      } catch {
        // The cache is a convenience only.
      }
    }, 800);
  }

  async function fetchAvatar(id) {
    const extractor = window.AyuNativeBridge?.extractor;

    if (!extractor?.channelAvatar) return "";

    const result = await extractor.channelAvatar({ id });
    const url =
      typeof result?.avatarUrl === "string" && result.avatarUrl.startsWith("https://")
        ? result.avatarUrl
        : "";

    if (url) {
      cache[id] = url;
      persist();
    } else {
      failed.add(id);
    }

    return url;
  }

  function pump() {
    while (running < PARALLEL && queue.length) {
      const job = queue.shift();

      running += 1;
      fetchAvatar(job.id)
        .catch(() => {
          failed.add(job.id);
          return "";
        })
        .then((url) => {
          running -= 1;
          job.resolve(url);
          pump();
        });
    }
  }

  function get(id) {
    if (!valid(id)) return Promise.resolve("");
    if (cache[id]) return Promise.resolve(cache[id]);
    if (failed.has(id)) return Promise.resolve("");
    if (pending.has(id)) return pending.get(id);

    const promise = new Promise((resolve) => {
      queue.push({ id, resolve });
      pump();
    }).then((url) => {
      pending.delete(id);
      return url;
    });

    pending.set(id, promise);

    return promise;
  }

  const observer =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting) {
                observer.unobserve(entry.target);
                entry.target.__ayAvatar?.();
              }
            }
          },
          { rootMargin: "300px" }
        )
      : null;

  function paint(node, url) {
    const picture = document.createElement("img");

    picture.alt = "";
    picture.decoding = "async";
    picture.addEventListener("load", () => {
      node.textContent = "";
      node.append(picture);
    });
    picture.src = url;
  }

  /**
   * Puts the channel's picture into `node` (which already shows a letter).
   * Uses `url` if given, else the saved copy, else fetches it when visible.
   */
  function attach(node, { id = "", url = "" } = {}) {
    if (url) {
      paint(node, url);
      return;
    }

    if (!valid(id)) return;

    if (cache[id]) {
      paint(node, cache[id]);
      return;
    }

    node.__ayAvatar = () => {
      get(id).then((found) => {
        if (found) paint(node, found);
      });
    };

    if (observer) observer.observe(node);
    else node.__ayAvatar();
  }

  window.AyuAvatars = Object.freeze({ attach, get });
})();
