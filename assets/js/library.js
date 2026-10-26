(() => {
  "use strict";

  const TABLES = Object.freeze({
    playlists: "playlists",
    playlistItems: "playlist_items",
    watchLater: "watch_later",
    history: "watch_history",
    channelPrefs: "channel_preferences",
    notes: "video_notes",
    likes: "video_likes",
    profiles: "profiles"
  });

  const LIMITS = Object.freeze({
    playlistName: 100,
    playlistDescription: 500,
    title: 500,
    channel: 300,
    thumbnailUrl: 2000,
    videoId: 100,
    pageSize: 100,
    maxPageSize: 200
  });

  const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{6,100}$/;

  const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  function requireString(value, label) {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`${label} is required.`);
    }

    return value.trim();
  }

  function validateUuid(value, label = "ID") {
    if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
      throw new Error(`Invalid ${label.toLowerCase()}.`);
    }

    return value;
  }

  function validateVideoId(value) {
    const id = requireString(value, "Video ID");

    if (!VIDEO_ID_PATTERN.test(id)) {
      throw new Error("This video has an invalid ID.");
    }

    return id;
  }

  function validatePlaylistName(value) {
    const name = requireString(value, "Playlist name");

    if (name.length > LIMITS.playlistName) {
      throw new Error(
        `Playlist names must be ${LIMITS.playlistName} characters or fewer.`
      );
    }

    return name;
  }

  function validateDescription(value = "") {
    if (typeof value !== "string") {
      throw new Error("Playlist description must be text.");
    }

    const description = value.trim();

    if (description.length > LIMITS.playlistDescription) {
      throw new Error(
        `Descriptions must be ${LIMITS.playlistDescription} characters or fewer.`
      );
    }

    return description;
  }

  function validatePage(options = {}) {
    const limit = Number(options.limit ?? LIMITS.pageSize);
    const offset = Number(options.offset ?? 0);

    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > LIMITS.maxPageSize
    ) {
      throw new Error(
        `Page size must be between 1 and ${LIMITS.maxPageSize}.`
      );
    }

    if (!Number.isInteger(offset) || offset < 0) {
      throw new Error("Invalid pagination offset.");
    }

    return { limit, offset };
  }

  function validateSeconds(value, label, nullable = false) {
    if (nullable && (value === null || value === undefined || value === "")) {
      return null;
    }

    const seconds = Number(value);

    if (!Number.isInteger(seconds) || seconds < 0) {
      throw new Error(`${label} must be a non-negative whole number.`);
    }

    return seconds;
  }

  function normalizeThumbnail(value) {
    if (value == null || value === "") {
      return "";
    }

    if (typeof value !== "string" || value.length > LIMITS.thumbnailUrl) {
      throw new Error("Invalid thumbnail URL.");
    }

    try {
      const url = new URL(value);

      if (url.protocol !== "https:") {
        throw new Error("Only secure thumbnail URLs are supported.");
      }

      return url.href;
    } catch {
      throw new Error("Please provide a valid HTTPS thumbnail URL.");
    }
  }

  function normalizeVideo(video = {}) {
    if (!video || typeof video !== "object" || Array.isArray(video)) {
      throw new Error("Invalid video details.");
    }

    const rawId = video.id ?? video.videoId;

    const id = validateVideoId(rawId);

    const title = requireString(video.title, "Video title");

    if (title.length > LIMITS.title) {
      throw new Error(
        `Video titles must be ${LIMITS.title} characters or fewer.`
      );
    }

    const channelValue =
      video.channelTitle ?? video.uploaderName ?? video.channel ?? "";

    if (typeof channelValue !== "string") {
      throw new Error("Invalid channel name.");
    }

    const channelTitle = channelValue.trim();

    if (channelTitle.length > LIMITS.channel) {
      throw new Error(
        `Channel names must be ${LIMITS.channel} characters or fewer.`
      );
    }

    const thumbnailValue =
      video.thumbnailUrl ?? video.thumbnail ?? "";

    return {
      video_id: id,
      title,
      channel_title: channelTitle,
      thumbnail_url: normalizeThumbnail(thumbnailValue)
    };
  }

  function normalizeProgress(progress = {}) {
    return {
      progress_seconds: validateSeconds(
        progress.progressSeconds ?? 0,
        "Playback progress"
      ),
      duration_seconds: validateSeconds(
        progress.durationSeconds,
        "Video duration",
        true
      )
    };
  }

  // ---------------------------------------------------------------------------
  // On-device store. Everything lives on this phone (IndexedDB, with a
  // localStorage fallback). There is no account and nothing is sent anywhere.
  // ---------------------------------------------------------------------------

  const DB_NAME = "ayutube-local";
  const DB_STORE = "kv";
  const DB_KEY = "state";
  const LS_KEY = "ayutube.local.state.v1";
  const SAVE_DELAY_MS = 250;

  const ERR_DUPLICATE =
    "This item is already saved, or a matching entry already exists.";
  const ERR_MISSING =
    "This library item no longer exists. Refresh and try again.";

  const emptyState = () => ({
    version: 1,
    playlists: [],
    playlist_items: [],
    watch_later: [],
    watch_history: [],
    channel_preferences: [],
    video_notes: [],
    video_likes: [],
    profile: {
      interests: [],
      exam_name: null,
      exam_date: null,
      subjects: [],
      onboarded_at: null
    }
  });

  const LIST_KEYS = [
    "playlists",
    "playlist_items",
    "watch_later",
    "watch_history",
    "channel_preferences",
    "video_notes",
    "video_likes"
  ];

  let data = null;
  let loading = null;
  let saveTimer = null;
  let dirty = false;

  function uuid() {
    if (typeof crypto?.randomUUID === "function") {
      return crypto.randomUUID();
    }

    const bytes = new Uint8Array(16);

    if (typeof crypto?.getRandomValues === "function") {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < 16; i += 1) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }

    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));

    return (
      hex.slice(0, 4).join("") + "-" +
      hex.slice(4, 6).join("") + "-" +
      hex.slice(6, 8).join("") + "-" +
      hex.slice(8, 10).join("") + "-" +
      hex.slice(10, 16).join("")
    );
  }

  const nowIso = () => new Date().toISOString();
  const copy = (value) => JSON.parse(JSON.stringify(value));

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB is unavailable."));
        return;
      }

      const request = indexedDB.open(DB_NAME, 1);

      request.onupgradeneeded = () => {
        request.result.createObjectStore(DB_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function readPersisted() {
    try {
      const db = await openDatabase();

      const value = await new Promise((resolve, reject) => {
        const request = db
          .transaction(DB_STORE, "readonly")
          .objectStore(DB_STORE)
          .get(DB_KEY);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      db.close();

      if (value) {
        return value;
      }
    } catch {
      // Fall through to localStorage.
    }

    try {
      const raw = localStorage.getItem(LS_KEY);

      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async function writePersisted(snapshot) {
    try {
      const db = await openDatabase();

      await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readwrite");

        tx.objectStore(DB_STORE).put(snapshot, DB_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });

      db.close();
      return;
    } catch {
      // Fall back to localStorage below.
    }

    localStorage.setItem(LS_KEY, JSON.stringify(snapshot));
  }

  function mergeState(raw) {
    const base = emptyState();

    if (!raw || typeof raw !== "object") {
      return base;
    }

    for (const key of LIST_KEYS) {
      if (Array.isArray(raw[key])) {
        base[key] = raw[key].filter(
          (row) => row && typeof row === "object" && !Array.isArray(row)
        );
      }
    }

    if (raw.profile && typeof raw.profile === "object") {
      base.profile = { ...base.profile, ...raw.profile };
    }

    return base;
  }

  function ready() {
    loading ||= (async () => {
      data = mergeState(await readPersisted());

      try {
        // Ask Android not to evict this data when storage runs low.
        await navigator.storage?.persist?.();
      } catch {
        // Best effort only.
      }

      return data;
    })();

    return loading;
  }

  async function flush() {
    if (!dirty || !data) {
      return;
    }

    dirty = false;

    try {
      await writePersisted(copy(data));
    } catch (error) {
      dirty = true;
      console.error("AyuTube could not save local data:", error);
    }
  }

  function scheduleSave() {
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, SAVE_DELAY_MS);
  }

  window.addEventListener("pagehide", flush);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flush();
    }
  });

  async function store() {
    await ready();

    return data;
  }

  function byDateDesc(field) {
    return (a, b) => String(b[field] || "").localeCompare(String(a[field] || ""));
  }

  function pick(row, fields) {
    const out = {};

    for (const field of fields) {
      out[field] = row[field] ?? null;
    }

    return out;
  }

  const PLAYLIST_FIELDS = [
    "id", "name", "description", "is_favorite", "created_at", "updated_at"
  ];
  const ITEM_FIELDS = [
    "id", "playlist_id", "video_id", "title", "channel_title",
    "thumbnail_url", "position", "added_at"
  ];
  const LATER_FIELDS = [
    "id", "video_id", "title", "channel_title", "thumbnail_url", "added_at"
  ];
  const HISTORY_FIELDS = [
    "id", "video_id", "title", "channel_title", "thumbnail_url",
    "watched_at", "progress_seconds", "duration_seconds"
  ];
  const PREF_FIELDS = ["channel_key", "channel_name", "kind", "avatar", "created_at"];
  const NOTE_FIELDS = ["id", "video_id", "seconds", "body", "created_at"];
  const LIKE_FIELDS = [
    "id", "video_id", "title", "channel_title", "thumbnail_url", "created_at"
  ];

  function findPlaylist(state, id) {
    const playlist = state.playlists.find((row) => row.id === id);

    if (!playlist) {
      throw new Error(ERR_MISSING);
    }

    return playlist;
  }

  // ---------------------------------------------------------------------------
  // Playlists
  // ---------------------------------------------------------------------------

  async function getPlaylists() {
    const state = await store();

    return [...state.playlists]
      .sort(byDateDesc("created_at"))
      .map((row) => pick(row, PLAYLIST_FIELDS));
  }

  async function createPlaylist({ name, description = "" } = {}) {
    const playlistName = validatePlaylistName(name);
    const playlistDescription = validateDescription(description);
    const state = await store();
    const stamp = nowIso();

    const row = {
      id: uuid(),
      name: playlistName,
      description: playlistDescription,
      is_favorite: false,
      created_at: stamp,
      updated_at: stamp
    };

    state.playlists.push(row);
    scheduleSave();

    return pick(row, PLAYLIST_FIELDS);
  }

  async function updatePlaylist(id, changes = {}) {
    validateUuid(id, "Playlist ID");

    if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
      throw new Error("Invalid playlist updates.");
    }

    const update = {};

    if (Object.hasOwn(changes, "name")) {
      update.name = validatePlaylistName(changes.name);
    }

    if (Object.hasOwn(changes, "description")) {
      update.description = validateDescription(changes.description);
    }

    if (Object.keys(update).length === 0) {
      throw new Error("No valid playlist changes were provided.");
    }

    const state = await store();
    const row = findPlaylist(state, id);

    Object.assign(row, update, { updated_at: nowIso() });
    scheduleSave();

    return pick(row, PLAYLIST_FIELDS);
  }

  async function setPlaylistFavorite(id, isFavorite) {
    validateUuid(id, "Playlist ID");

    if (typeof isFavorite !== "boolean") {
      throw new Error("Favorite status must be true or false.");
    }

    const state = await store();
    const row = findPlaylist(state, id);

    row.is_favorite = isFavorite;
    row.updated_at = nowIso();
    scheduleSave();

    return pick(row, PLAYLIST_FIELDS);
  }

  async function deletePlaylist(id) {
    validateUuid(id, "Playlist ID");

    const state = await store();

    state.playlists = state.playlists.filter((row) => row.id !== id);
    state.playlist_items = state.playlist_items.filter(
      (row) => row.playlist_id !== id
    );
    scheduleSave();

    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Playlist items
  // ---------------------------------------------------------------------------

  function nextPosition(state, playlistId) {
    let max = -1;

    for (const row of state.playlist_items) {
      if (row.playlist_id === playlistId && Number.isInteger(row.position)) {
        max = Math.max(max, row.position);
      }
    }

    return max + 1;
  }

  async function getPlaylistItems(playlistId, options = {}) {
    validateUuid(playlistId, "Playlist ID");

    const { limit, offset } = validatePage(options);
    const state = await store();

    return state.playlist_items
      .filter((row) => row.playlist_id === playlistId)
      .sort(
        (a, b) =>
          (a.position ?? 0) - (b.position ?? 0) ||
          String(a.added_at).localeCompare(String(b.added_at))
      )
      .slice(offset, offset + limit)
      .map((row) => pick(row, ITEM_FIELDS));
  }

  async function addToPlaylist(playlistId, video) {
    validateUuid(playlistId, "Playlist ID");

    const normalized = normalizeVideo(video);
    const state = await store();

    findPlaylist(state, playlistId);

    if (
      state.playlist_items.some(
        (row) =>
          row.playlist_id === playlistId &&
          row.video_id === normalized.video_id
      )
    ) {
      throw new Error(ERR_DUPLICATE);
    }

    const row = {
      id: uuid(),
      playlist_id: playlistId,
      ...normalized,
      position: nextPosition(state, playlistId),
      added_at: nowIso()
    };

    state.playlist_items.push(row);
    scheduleSave();

    return pick(row, ITEM_FIELDS);
  }

  /**
   * Add many videos at once (used when saving a YouTube playlist). Videos that
   * are already in the playlist are skipped. Returns how many were added.
   */
  async function addManyToPlaylist(playlistId, videos) {
    validateUuid(playlistId, "Playlist ID");

    if (!Array.isArray(videos) || videos.length === 0) {
      return { added: 0 };
    }

    if (videos.length > LIMITS.maxPageSize * 2) {
      throw new Error("That is too many videos to add at once.");
    }

    const state = await store();

    findPlaylist(state, playlistId);

    const existing = new Set(
      state.playlist_items
        .filter((row) => row.playlist_id === playlistId)
        .map((row) => row.video_id)
    );

    let position = nextPosition(state, playlistId);
    let added = 0;

    for (const video of videos) {
      let normalized;

      try {
        normalized = normalizeVideo(video);
      } catch {
        continue; // skip entries that cannot be stored
      }

      if (existing.has(normalized.video_id)) {
        continue;
      }

      existing.add(normalized.video_id);

      state.playlist_items.push({
        id: uuid(),
        playlist_id: playlistId,
        ...normalized,
        position: position++,
        added_at: nowIso()
      });

      added += 1;
    }

    if (added) {
      scheduleSave();
    }

    return { added };
  }

  async function removeFromPlaylist(itemId) {
    validateUuid(itemId, "Playlist item ID");

    const state = await store();

    state.playlist_items = state.playlist_items.filter(
      (row) => row.id !== itemId
    );
    scheduleSave();

    return { success: true };
  }

  async function reorderPlaylistItem(itemId, position) {
    validateUuid(itemId, "Playlist item ID");

    if (!Number.isInteger(position) || position < 0) {
      throw new Error("Position must be a non-negative whole number.");
    }

    const state = await store();
    const row = state.playlist_items.find((entry) => entry.id === itemId);

    if (!row) {
      throw new Error(ERR_MISSING);
    }

    row.position = position;
    scheduleSave();

    return pick(row, ITEM_FIELDS);
  }

  // ---------------------------------------------------------------------------
  // Watch Later
  // ---------------------------------------------------------------------------

  async function getWatchLater(options = {}) {
    const { limit, offset } = validatePage(options);
    const state = await store();

    return [...state.watch_later]
      .sort(byDateDesc("added_at"))
      .slice(offset, offset + limit)
      .map((row) => pick(row, LATER_FIELDS));
  }

  async function addToWatchLater(video) {
    const normalized = normalizeVideo(video);
    const state = await store();

    if (state.watch_later.some((row) => row.video_id === normalized.video_id)) {
      throw new Error(ERR_DUPLICATE);
    }

    const row = { id: uuid(), ...normalized, added_at: nowIso() };

    state.watch_later.push(row);
    scheduleSave();

    return pick(row, LATER_FIELDS);
  }

  async function removeFromWatchLater(videoId) {
    const id = validateVideoId(videoId);
    const state = await store();

    state.watch_later = state.watch_later.filter((row) => row.video_id !== id);
    scheduleSave();

    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Watch history and playback progress
  // ---------------------------------------------------------------------------

  async function getHistory(options = {}) {
    const { limit, offset } = validatePage(options);
    const state = await store();

    return [...state.watch_history]
      .sort(byDateDesc("watched_at"))
      .slice(offset, offset + limit)
      .map((row) => pick(row, HISTORY_FIELDS));
  }

  /**
   * Record a watched video or update its latest playback progress.
   * Call when playback starts and periodically as progress changes.
   */
  async function saveHistoryEntry(video, progress = {}) {
    const normalized = normalizeVideo(video);
    const playback = normalizeProgress(progress);

    if (
      playback.duration_seconds !== null &&
      playback.progress_seconds > playback.duration_seconds
    ) {
      throw new Error(
        "Playback progress cannot exceed the video duration."
      );
    }

    const state = await store();
    let row = state.watch_history.find(
      (entry) => entry.video_id === normalized.video_id
    );

    if (row) {
      Object.assign(row, normalized, playback, { watched_at: nowIso() });
    } else {
      row = { id: uuid(), ...normalized, ...playback, watched_at: nowIso() };
      state.watch_history.push(row);
    }

    scheduleSave();

    return pick(row, HISTORY_FIELDS);
  }

  async function removeHistoryEntry(videoId) {
    const id = validateVideoId(videoId);
    const state = await store();

    state.watch_history = state.watch_history.filter(
      (row) => row.video_id !== id
    );
    scheduleSave();

    return { success: true };
  }

  async function clearHistory() {
    const state = await store();

    state.watch_history = [];
    scheduleSave();

    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Playlist progress (computed from watch history; no extra table)
  // ---------------------------------------------------------------------------

  /**
   * Returns { [playlistId]: { total, completed } } where a video counts as
   * completed once at least 90% of it has been watched.
   */
  async function getPlaylistProgress() {
    const state = await store();
    const finished = new Set();

    for (const row of state.watch_history) {
      const duration = Number(row.duration_seconds) || 0;
      const progress = Number(row.progress_seconds) || 0;

      if (duration > 0 && progress / duration >= 0.9) {
        finished.add(row.video_id);
      }
    }

    const result = {};

    for (const item of state.playlist_items) {
      const entry = (result[item.playlist_id] ||= { total: 0, completed: 0 });

      entry.total += 1;

      if (finished.has(item.video_id)) {
        entry.completed += 1;
      }
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Channel preferences: follow or hide a channel
  // ---------------------------------------------------------------------------

  const CHANNEL_KINDS = new Set(["follow", "block"]);

  async function getChannelPrefs() {
    const state = await store();

    return [...state.channel_preferences]
      .sort(byDateDesc("created_at"))
      .map((row) => pick(row, PREF_FIELDS));
  }

  async function setChannelPref({ channel_key, channel_name, kind, avatar } = {}) {
    const key = requireString(channel_key, "Channel").slice(0, 200);
    const name = requireString(channel_name, "Channel name").slice(0, 300);

    if (!CHANNEL_KINDS.has(kind)) {
      throw new Error("Choose follow or block.");
    }

    // The channel picture is optional and must be a plain https URL.
    const picture =
      typeof avatar === "string" && /^https:\/\//.test(avatar) && avatar.length <= 2000
        ? avatar
        : null;
    const state = await store();
    let row = state.channel_preferences.find(
      (entry) => entry.channel_key === key
    );

    if (row) {
      row.channel_name = name;
      row.kind = kind;

      if (picture) row.avatar = picture;
    } else {
      row = {
        channel_key: key,
        channel_name: name,
        kind,
        avatar: picture,
        created_at: nowIso()
      };
      state.channel_preferences.push(row);
    }

    scheduleSave();

    return pick(row, PREF_FIELDS);
  }

  async function removeChannelPref(channelKey) {
    const key = requireString(channelKey, "Channel").slice(0, 200);
    const state = await store();

    state.channel_preferences = state.channel_preferences.filter(
      (row) => row.channel_key !== key
    );
    scheduleSave();

    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Timestamped notes
  // ---------------------------------------------------------------------------

  const NOTE_MAX_LENGTH = 1000;
  const NOTE_MAX_SECONDS = 604800;

  async function getNotes(videoId) {
    const id = validateVideoId(videoId);
    const state = await store();

    return state.video_notes
      .filter((row) => row.video_id === id)
      .sort(
        (a, b) =>
          (a.seconds ?? 0) - (b.seconds ?? 0) ||
          String(a.created_at).localeCompare(String(b.created_at))
      )
      .map((row) => pick(row, NOTE_FIELDS));
  }

  async function addNote({ video_id, seconds = 0, body } = {}) {
    const id = validateVideoId(video_id);
    const text = requireString(body, "Note");

    if (text.length > NOTE_MAX_LENGTH) {
      throw new Error(`Notes can be up to ${NOTE_MAX_LENGTH} characters.`);
    }

    const at = Math.floor(Number(seconds));

    if (!Number.isFinite(at) || at < 0 || at > NOTE_MAX_SECONDS) {
      throw new Error("That note time is not valid.");
    }

    const state = await store();
    const row = {
      id: uuid(),
      video_id: id,
      seconds: at,
      body: text,
      created_at: nowIso()
    };

    state.video_notes.push(row);
    scheduleSave();

    return pick(row, NOTE_FIELDS);
  }

  async function deleteNote(noteId) {
    validateUuid(noteId, "Note");

    const state = await store();

    state.video_notes = state.video_notes.filter((row) => row.id !== noteId);
    scheduleSave();

    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Profile: interests, exam date, first-run state
  // ---------------------------------------------------------------------------

  const INTEREST_PATTERN = /^[a-z0-9-]{1,40}$/;
  const MAX_INTERESTS = 5;
  const MAX_EXAM_NAME = 60;

  function profileShape(profile) {
    return {
      interests: Array.isArray(profile?.interests) ? [...profile.interests] : [],
      exam_name: profile?.exam_name ?? null,
      exam_date: profile?.exam_date ?? null,
      subjects: Array.isArray(profile?.subjects) ? [...profile.subjects] : [],
      onboarded_at: profile?.onboarded_at ?? null
    };
  }

  async function getProfile() {
    const state = await store();

    return profileShape(state.profile);
  }

  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }

    const date = new Date(`${value}T00:00:00Z`);

    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }

  /**
   * Saves only the fields that are passed. `onboarded: true` records that the
   * first-run choices were made (or skipped).
   */
  async function saveProfile({ interests, exam_name, exam_date, onboarded, subjects } = {}) {
    const payload = {};

    if (interests !== undefined) {
      if (!Array.isArray(interests)) {
        throw new Error("Interests must be a list.");
      }

      const unique = [...new Set(interests)];

      if (unique.length > MAX_INTERESTS) {
        throw new Error(`Choose up to ${MAX_INTERESTS} interests.`);
      }

      if (
        !unique.every(
          (item) => typeof item === "string" && INTEREST_PATTERN.test(item)
        )
      ) {
        throw new Error("One of the interests is not valid.");
      }

      payload.interests = unique;
    }

    if (exam_name !== undefined) {
      const name = typeof exam_name === "string" ? exam_name.trim() : "";

      if (name.length > MAX_EXAM_NAME) {
        throw new Error(
          `Exam names can be up to ${MAX_EXAM_NAME} characters.`
        );
      }

      payload.exam_name = name || null;
    }

    if (exam_date !== undefined) {
      if (exam_date !== null && exam_date !== "" && !validDate(exam_date)) {
        throw new Error("That exam date is not valid.");
      }

      payload.exam_date = exam_date || null;
    }

    if (subjects !== undefined) {
      if (!Array.isArray(subjects)) {
        throw new Error("Subjects must be a list.");
      }

      const clean = [
        ...new Set(
          subjects
            .map((item) => (typeof item === "string" ? item.trim().replace(/\s+/g, " ") : ""))
            .filter(Boolean)
        )
      ];

      if (clean.length > 8) {
        throw new Error("Choose up to 8 subjects.");
      }

      if (clean.some((item) => item.length > 40)) {
        throw new Error("Subject names can be up to 40 characters.");
      }

      payload.subjects = clean;
    }

    if (onboarded === true) {
      payload.onboarded_at = nowIso();
    }

    const state = await store();

    state.profile = { ...state.profile, ...payload };
    scheduleSave();

    return profileShape(state.profile);
  }

  // ---------------------------------------------------------------------------
  // Liked videos
  // ---------------------------------------------------------------------------

  async function getLikes({ limit = 300 } = {}) {
    const count = Math.min(Math.max(Math.floor(Number(limit)) || 300, 1), 1000);
    const state = await store();

    return [...state.video_likes]
      .sort(byDateDesc("created_at"))
      .slice(0, count)
      .map((row) => pick(row, LIKE_FIELDS));
  }

  async function likeVideo(video) {
    const normalized = normalizeVideo(video);
    const state = await store();
    let row = state.video_likes.find(
      (entry) => entry.video_id === normalized.video_id
    );

    if (row) {
      Object.assign(row, normalized);
    } else {
      row = { id: uuid(), ...normalized, created_at: nowIso() };
      state.video_likes.push(row);
    }

    scheduleSave();

    return pick(row, LIKE_FIELDS);
  }

  async function unlikeVideo(videoId) {
    const id = validateVideoId(videoId);
    const state = await store();

    state.video_likes = state.video_likes.filter((row) => row.video_id !== id);
    scheduleSave();

    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Backup: export, import, erase
  // ---------------------------------------------------------------------------

  const MERGE_KEYS = {
    playlists: (row) => row.id,
    playlist_items: (row) => `${row.playlist_id}:${row.video_id}`,
    watch_later: (row) => row.video_id,
    watch_history: (row) => row.video_id,
    channel_preferences: (row) => row.channel_key,
    video_notes: (row) => row.id,
    video_likes: (row) => row.video_id
  };

  async function exportJson() {
    const state = await store();

    return JSON.stringify(
      { app: "ayutube", exported_at: nowIso(), ...copy(state) },
      null,
      2
    );
  }

  /** Adds anything not already stored. Returns how many records were added. */
  async function importJson(text) {
    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("That file is not a valid AyuTube backup.");
    }

    if (!parsed || typeof parsed !== "object" || parsed.app !== "ayutube") {
      throw new Error("That file is not a valid AyuTube backup.");
    }

    const incoming = mergeState(parsed);
    const state = await store();
    let added = 0;

    for (const key of LIST_KEYS) {
      const keyOf = MERGE_KEYS[key];
      const seen = new Set(state[key].map(keyOf));

      for (const row of incoming[key]) {
        const id = keyOf(row);

        if (id && !seen.has(id)) {
          seen.add(id);
          state[key].push(row);
          added += 1;
        }
      }
    }

    const profile = incoming.profile;

    if (!state.profile.onboarded_at && profile.onboarded_at) {
      state.profile = { ...state.profile, ...profile };
    }

    scheduleSave();

    return { added };
  }

  async function eraseAll() {
    await store();

    data = emptyState();
    scheduleSave();
    await flush();

    return { success: true };
  }

  async function stats() {
    const state = await store();

    return {
      playlists: state.playlists.length,
      history: state.watch_history.length,
      watchLater: state.watch_later.length,
      likes: state.video_likes.length,
      following: state.channel_preferences.filter((row) => row.kind === "follow")
        .length
    };
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  window.AyuTubeLibrary = Object.freeze({
    getPlaylists,
    createPlaylist,
    updatePlaylist,
    setPlaylistFavorite,
    deletePlaylist,
    getPlaylistItems,
    addToPlaylist,
    addManyToPlaylist,
    removeFromPlaylist,
    reorderPlaylistItem,
    getWatchLater,
    addToWatchLater,
    removeFromWatchLater,
    getHistory,
    saveHistoryEntry,
    removeHistoryEntry,
    clearHistory,
    getPlaylistProgress,
    getChannelPrefs,
    setChannelPref,
    removeChannelPref,
    getNotes,
    addNote,
    deleteNote,
    getProfile,
    saveProfile,
    getLikes,
    likeVideo,
    unlikeVideo
  });

  window.AyuTubeLocal = Object.freeze({
    exportJson,
    importJson,
    eraseAll,
    stats
  });
})();
