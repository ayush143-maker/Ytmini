(() => {
  "use strict";

  // Videos from the channels a person follows, newest first, plus the
  // "New" markers. Results are cached so opening Library stays quick and
  // the providers are not hit on every visit.

  const UI = () => window.AyuTubeUI;

  const CACHE_MS = 10 * 60 * 1000;
  const BADGE_CHECK_MS = 30 * 60 * 1000;
  const BADGE_KEY = "ayutube.newcheck";
  const MAX_CHANNELS = 8;
  const PARALLEL = 4;
  const MAX_VIDEOS = 24;

  let cached = null; // { at, signature, data }

  function followed(personal) {
    return personal.prefs
      .filter((pref) => pref.kind === "follow")
      .slice(0, MAX_CHANNELS);
  }

  const toChannel = (pref) => ({
    id: window.AyuTubeChannel?.isChannelId?.(pref.channel_key) ? pref.channel_key : "",
    name: pref.channel_name
  });

  /**
   * Returns { channels: [{ pref, latestAt, items }], videos: [...] }.
   * `videos` are merged and sorted newest first.
   */
  async function load({ force = false } = {}) {
    const ui = UI();
    const personal = await ui.getPersonal();
    const list = followed(personal);
    const signature = list.map((pref) => pref.channel_key).join("|");

    if (!force && cached && cached.signature === signature && Date.now() - cached.at < CACHE_MS) {
      return cached.data;
    }

    const results = new Array(list.length).fill(null);

    for (let start = 0; start < list.length; start += PARALLEL) {
      const slice = list.slice(start, start + PARALLEL);

      const settled = await Promise.allSettled(
        slice.map((pref) => window.AyuTubeChannel.load(toChannel(pref)))
      );

      settled.forEach((result, index) => {
        if (result.status === "fulfilled") results[start + index] = result.value;
      });
    }

    const channels = list.map((pref, index) => {
      const data = results[index];
      const items = (data?.items || [])
        .map(ui.toVideo)
        .filter((video) => ui.validVideoId(video.id) && !video.short);

      const latestAt = items.reduce(
        (max, video) => Math.max(max, video.uploadedAt || 0),
        0
      );

      return { pref, items, latestAt, ok: Boolean(data) };
    });

    // Newest first across channels. Videos without a date go after the dated
    // ones and keep a fair share per channel.
    const dated = [];
    const undated = [];

    for (const channel of channels) {
      for (const video of channel.items) {
        (video.uploadedAt ? dated : undated).push({ video, key: channel.pref.channel_key });
      }
    }

    dated.sort((a, b) => b.video.uploadedAt - a.video.uploadedAt);

    const seen = new Set();
    const videos = [];

    for (const entry of [...dated, ...undated]) {
      if (videos.length >= MAX_VIDEOS) break;
      if (seen.has(entry.video.id)) continue;

      seen.add(entry.video.id);
      videos.push(entry);
    }

    const data = { channels, videos };

    cached = { at: Date.now(), signature, data };

    return data;
  }

  /** True when any followed channel has a video newer than the last visit. */
  function anyNew(data) {
    const ui = UI();

    return data.channels.some((channel) =>
      ui.isNewSince(channel.pref.channel_key, channel.latestAt)
    );
  }

  function recompute() {
    if (cached) UI().setLibraryDot(anyNew(cached.data));
  }

  /** Cheap, throttled check used at start-up for the Library tab dot. */
  async function refreshBadge() {
    const ui = UI();

    try {
      const personal = await ui.getPersonal();

      if (!personal.user || !followed(personal).length) {
        ui.setLibraryDot(false);
        return;
      }

      const last = ui.store.get(BADGE_KEY, null);

      if (last && Date.now() - last.at < BADGE_CHECK_MS && !cached) {
        ui.setLibraryDot(Boolean(last.any));
        return;
      }

      const data = await load();
      const any = anyNew(data);

      ui.store.set(BADGE_KEY, { at: Date.now(), any });
      ui.setLibraryDot(any);
    } catch {
      // The dot is a convenience; stay quiet on failures.
    }
  }

  function invalidate() {
    cached = null;
    UI().store.set(BADGE_KEY, null);
  }

  window.AyuTubeFollowing = Object.freeze({
    load,
    recompute,
    refreshBadge,
    invalidate,
    anyNew
  });
})();
