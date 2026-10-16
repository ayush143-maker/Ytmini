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
  // Client and current-user handling
  // ---------------------------------------------------------------------------

  async function getContext() {
    if (!window.AyuTubeSupabase?.getClient) {
      throw new Error(
        "AyuTube is not initialized yet. Please try again shortly."
      );
    }

    const client = await window.AyuTubeSupabase.getClient();

    if (!client?.auth || !client?.from) {
      throw new Error("The database client is unavailable.");
    }

    let result;

    try {
      result = await client.auth.getUser();
    } catch {
      throw new Error(
        "Unable to verify your account. Check your connection and retry."
      );
    }

    if (result.error) {
      throw new Error(
        "Your session could not be verified. Please sign in again."
      );
    }

    const user = result.data?.user;

    if (!user?.id) {
      throw new Error("Please sign in to use your personal library.");
    }

    return { client, user };
  }

  function handleDatabaseError(error, fallback) {
    const code = String(error?.code ?? "");

    if (code === "23505") {
      return new Error(
        "This item is already saved, or a matching entry already exists."
      );
    }

    if (code === "23503") {
      return new Error(
        "This library item no longer exists. Refresh and try again."
      );
    }

    if (code === "42501" || code === "PGRST301") {
      return new Error(
        "You do not have permission to perform this action."
      );
    }

    if (
      code === "PGRST116" ||
      code === "PGRST204" ||
      code === "PGRST205"
    ) {
      return new Error(
        "The requested library data is unavailable. Please retry."
      );
    }

    if (
      code === "57014" ||
      code === "53300" ||
      code === "08000" ||
      code.startsWith("08")
    ) {
      return new Error(
        "The database is temporarily unavailable. Please try again."
      );
    }

    // Do not expose raw database details or SQL errors to the UI.
    return new Error(fallback);
  }

  async function execute(query, fallback) {
    let result;

    try {
      result = await query;
    } catch {
      throw new Error(
        "A network error interrupted the request. Please retry."
      );
    }

    if (result.error) {
      throw handleDatabaseError(result.error, fallback);
    }

    return result.data;
  }

  function normalizeUpdatedAt() {
    return new Date().toISOString();
  }

  // ---------------------------------------------------------------------------
  // Playlists
  // ---------------------------------------------------------------------------

  async function getPlaylists() {
    const { client } = await getContext();

    return execute(
      client
        .from(TABLES.playlists)
        .select(
          "id, name, description, is_favorite, created_at, updated_at"
        )
        .order("created_at", { ascending: false }),
      "Unable to load your playlists."
    );
  }

  async function createPlaylist({ name, description = "" } = {}) {
    const { client, user } = await getContext();

    const playlist = {
      user_id: user.id,
      name: validatePlaylistName(name),
      description: validateDescription(description)
    };

    const data = await execute(
      client
        .from(TABLES.playlists)
        .insert(playlist)
        .select(
          "id, name, description, is_favorite, created_at, updated_at"
        )
        .single(),
      "Unable to create this playlist."
    );

    return data;
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

    update.updated_at = normalizeUpdatedAt();

    const { client } = await getContext();

    return execute(
      client
        .from(TABLES.playlists)
        .update(update)
        .eq("id", id)
        .select(
          "id, name, description, is_favorite, created_at, updated_at"
        )
        .single(),
      "Unable to update this playlist."
    );
  }

  async function setPlaylistFavorite(id, isFavorite) {
    validateUuid(id, "Playlist ID");

    if (typeof isFavorite !== "boolean") {
      throw new Error("Favorite status must be true or false.");
    }

    const { client } = await getContext();

    return execute(
      client
        .from(TABLES.playlists)
        .update({
          is_favorite: isFavorite,
          updated_at: normalizeUpdatedAt()
        })
        .eq("id", id)
        .select(
          "id, name, description, is_favorite, created_at, updated_at"
        )
        .single(),
      "Unable to update the playlist's favorite status."
    );
  }

  async function deletePlaylist(id) {
    validateUuid(id, "Playlist ID");

    const { client } = await getContext();

    await execute(
      client
        .from(TABLES.playlists)
        .delete()
        .eq("id", id),
      "Unable to delete this playlist."
    );

    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Playlist items
  // ---------------------------------------------------------------------------

  async function getPlaylistItems(playlistId, options = {}) {
    validateUuid(playlistId, "Playlist ID");

    const { client } = await getContext();
    const { limit, offset } = validatePage(options);

    return execute(
      client
        .from(TABLES.playlistItems)
        .select(
          "id, playlist_id, video_id, title, channel_title, thumbnail_url, position, added_at",
          { count: "exact" }
        )
        .eq("playlist_id", playlistId)
        .order("position", { ascending: true })
        .order("added_at", { ascending: true })
        .range(offset, offset + limit - 1),
      "Unable to load this playlist's videos."
    ).then((data) => data);
  }

  async function addToPlaylist(playlistId, video) {
    validateUuid(playlistId, "Playlist ID");

    const normalized = normalizeVideo(video);
    const { client } = await getContext();

    // The RLS policy verifies ownership of the parent playlist.
    const latestItem = await execute(
      client
        .from(TABLES.playlistItems)
        .select("position")
        .eq("playlist_id", playlistId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle(),
      "Unable to prepare this playlist."
    );

    const position = Number.isInteger(latestItem?.position)
      ? latestItem.position + 1
      : 0;

    return execute(
      client
        .from(TABLES.playlistItems)
        .insert({
          playlist_id: playlistId,
          ...normalized,
          position
        })
        .select(
          "id, playlist_id, video_id, title, channel_title, thumbnail_url, position, added_at"
        )
        .single(),
      "Unable to add this video to the playlist."
    );
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

    const { client } = await getContext();

    const latest = await execute(
      client
        .from(TABLES.playlistItems)
        .select("position")
        .eq("playlist_id", playlistId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle(),
      "Unable to prepare this playlist."
    );

    let position = Number.isInteger(latest?.position) ? latest.position + 1 : 0;

    const seen = new Set();
    const rows = [];

    for (const video of videos) {
      let normalized;

      try {
        normalized = normalizeVideo(video);
      } catch {
        continue; // skip entries that cannot be stored
      }

      if (seen.has(normalized.video_id)) continue;

      seen.add(normalized.video_id);
      rows.push({
        playlist_id: playlistId,
        ...normalized,
        position: position++
      });
    }

    for (let offset = 0; offset < rows.length; offset += 100) {
      await execute(
        client
          .from(TABLES.playlistItems)
          .upsert(rows.slice(offset, offset + 100), {
            onConflict: "playlist_id,video_id",
            ignoreDuplicates: true
          }),
        "Unable to add these videos to the playlist."
      );
    }

    return { added: rows.length };
  }

  async function removeFromPlaylist(itemId) {
    validateUuid(itemId, "Playlist item ID");

    const { client } = await getContext();

    await execute(
      client
        .from(TABLES.playlistItems)
        .delete()
        .eq("id", itemId),
      "Unable to remove this video from the playlist."
    );

    return { success: true };
  }

  async function reorderPlaylistItem(itemId, position) {
    validateUuid(itemId, "Playlist item ID");

    if (!Number.isInteger(position) || position < 0) {
      throw new Error("Position must be a non-negative whole number.");
    }

    const { client } = await getContext();

    return execute(
      client
        .from(TABLES.playlistItems)
        .update({ position })
        .eq("id", itemId)
        .select(
          "id, playlist_id, video_id, title, channel_title, thumbnail_url, position, added_at"
        )
        .single(),
      "Unable to reorder this playlist item."
    );
  }

  // ---------------------------------------------------------------------------
  // Watch Later
  // ---------------------------------------------------------------------------

  async function getWatchLater(options = {}) {
    const { client } = await getContext();
    const { limit, offset } = validatePage(options);

    return execute(
      client
        .from(TABLES.watchLater)
        .select(
          "id, video_id, title, channel_title, thumbnail_url, added_at",
          { count: "exact" }
        )
        .order("added_at", { ascending: false })
        .range(offset, offset + limit - 1),
      "Unable to load Watch Later."
    );
  }

  async function addToWatchLater(video) {
    const { client, user } = await getContext();
    const normalized = normalizeVideo(video);

    return execute(
      client
        .from(TABLES.watchLater)
        .insert({
          user_id: user.id,
          ...normalized
        })
        .select(
          "id, video_id, title, channel_title, thumbnail_url, added_at"
        )
        .single(),
      "Unable to save this video to Watch Later."
    );
  }

  async function removeFromWatchLater(videoId) {
    const id = validateVideoId(videoId);
    const { client } = await getContext();

    await execute(
      client
        .from(TABLES.watchLater)
        .delete()
        .eq("video_id", id),
      "Unable to remove this video from Watch Later."
    );

    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Watch history and playback progress
  // ---------------------------------------------------------------------------

  async function getHistory(options = {}) {
    const { client } = await getContext();
    const { limit, offset } = validatePage(options);

    return execute(
      client
        .from(TABLES.history)
        .select(
          "id, video_id, title, channel_title, thumbnail_url, watched_at, progress_seconds, duration_seconds",
          { count: "exact" }
        )
        .order("watched_at", { ascending: false })
        .range(offset, offset + limit - 1),
      "Unable to load your watch history."
    );
  }

  /**
   * Record a watched video or update its latest playback progress.
   * Call when playback starts and periodically as progress changes.
   */
  async function saveHistoryEntry(video, progress = {}) {
    const { client, user } = await getContext();
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

    const row = {
      user_id: user.id,
      ...normalized,
      ...playback,
      watched_at: normalizeUpdatedAt()
    };

    return execute(
      client
        .from(TABLES.history)
        .upsert(row, {
          onConflict: "user_id,video_id"
        })
        .select(
          "id, video_id, title, channel_title, thumbnail_url, watched_at, progress_seconds, duration_seconds"
        )
        .single(),
      "Unable to save your watch progress."
    );
  }

  async function removeHistoryEntry(videoId) {
    const id = validateVideoId(videoId);
    const { client } = await getContext();

    await execute(
      client
        .from(TABLES.history)
        .delete()
        .eq("video_id", id),
      "Unable to remove this video from your history."
    );

    return { success: true };
  }

  async function clearHistory() {
    const { client } = await getContext();

    await execute(
      client
        .from(TABLES.history)
        .delete()
        .neq("video_id", ""),
      "Unable to clear your watch history."
    );

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
    const { client } = await getContext();

    const [items, history] = await Promise.all([
      execute(
        client.from(TABLES.playlistItems).select("playlist_id, video_id"),
        "Unable to load playlist progress."
      ),
      execute(
        client
          .from(TABLES.history)
          .select("video_id, progress_seconds, duration_seconds"),
        "Unable to load playlist progress."
      )
    ]);

    const finished = new Set();

    for (const row of history || []) {
      const duration = Number(row.duration_seconds) || 0;
      const progress = Number(row.progress_seconds) || 0;

      if (duration > 0 && progress / duration >= 0.9) {
        finished.add(row.video_id);
      }
    }

    const result = {};

    for (const item of items || []) {
      const entry = (result[item.playlist_id] ||= { total: 0, completed: 0 });

      entry.total += 1;
      if (finished.has(item.video_id)) entry.completed += 1;
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Channel preferences: follow or hide a channel
  // ---------------------------------------------------------------------------

  const CHANNEL_KINDS = new Set(["follow", "block"]);

  async function getChannelPrefs() {
    const { client } = await getContext();

    return execute(
      client
        .from(TABLES.channelPrefs)
        .select("channel_key, channel_name, kind, created_at")
        .order("created_at", { ascending: false }),
      "Unable to load your channels."
    );
  }

  async function setChannelPref({ channel_key, channel_name, kind } = {}) {
    const key = requireString(channel_key, "Channel").slice(0, 200);
    const name = requireString(channel_name, "Channel name").slice(0, 300);

    if (!CHANNEL_KINDS.has(kind)) {
      throw new Error("Choose follow or block.");
    }

    const { client, user } = await getContext();

    return execute(
      client
        .from(TABLES.channelPrefs)
        .upsert(
          { user_id: user.id, channel_key: key, channel_name: name, kind },
          { onConflict: "user_id,channel_key" }
        )
        .select("channel_key, channel_name, kind, created_at")
        .single(),
      "Unable to save this channel."
    );
  }

  async function removeChannelPref(channelKey) {
    const key = requireString(channelKey, "Channel").slice(0, 200);
    const { client } = await getContext();

    await execute(
      client.from(TABLES.channelPrefs).delete().eq("channel_key", key),
      "Unable to update this channel."
    );

    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Timestamped notes
  // ---------------------------------------------------------------------------

  const NOTE_MAX_LENGTH = 1000;
  const NOTE_MAX_SECONDS = 604800;

  async function getNotes(videoId) {
    const id = validateVideoId(videoId);
    const { client } = await getContext();

    return execute(
      client
        .from(TABLES.notes)
        .select("id, video_id, seconds, body, created_at")
        .eq("video_id", id)
        .order("seconds", { ascending: true })
        .order("created_at", { ascending: true }),
      "Unable to load your notes."
    );
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

    const { client, user } = await getContext();

    return execute(
      client
        .from(TABLES.notes)
        .insert({ user_id: user.id, video_id: id, seconds: at, body: text })
        .select("id, video_id, seconds, body, created_at")
        .single(),
      "Unable to save this note."
    );
  }

  async function deleteNote(noteId) {
    const id = validateUuid(noteId, "Note");
    const { client } = await getContext();

    await execute(
      client.from(TABLES.notes).delete().eq("id", id),
      "Unable to delete this note."
    );

    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Profile: interests, exam date, first-run state
  // ---------------------------------------------------------------------------

  const PROFILE_COLUMNS = "interests, exam_name, exam_date, onboarded_at";
  const INTEREST_PATTERN = /^[a-z0-9-]{1,40}$/;
  const MAX_INTERESTS = 5;
  const MAX_EXAM_NAME = 60;

  async function getProfile() {
    const { client, user } = await getContext();

    const row = await execute(
      client
        .from(TABLES.profiles)
        .select(PROFILE_COLUMNS)
        .eq("id", user.id)
        .maybeSingle(),
      "Unable to load your profile."
    );

    return {
      interests: Array.isArray(row?.interests) ? row.interests : [],
      exam_name: row?.exam_name ?? null,
      exam_date: row?.exam_date ?? null,
      onboarded_at: row?.onboarded_at ?? null
    };
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
  async function saveProfile({ interests, exam_name, exam_date, onboarded } = {}) {
    const { client, user } = await getContext();
    const payload = { id: user.id, updated_at: new Date().toISOString() };

    if (interests !== undefined) {
      if (!Array.isArray(interests)) {
        throw new Error("Interests must be a list.");
      }

      const unique = [...new Set(interests)];

      if (unique.length > MAX_INTERESTS) {
        throw new Error(`Choose up to ${MAX_INTERESTS} interests.`);
      }

      if (!unique.every((item) => typeof item === "string" && INTEREST_PATTERN.test(item))) {
        throw new Error("One of the interests is not valid.");
      }

      payload.interests = unique;
    }

    if (exam_name !== undefined) {
      const name = typeof exam_name === "string" ? exam_name.trim() : "";

      if (name.length > MAX_EXAM_NAME) {
        throw new Error(`Exam names can be up to ${MAX_EXAM_NAME} characters.`);
      }

      payload.exam_name = name || null;
    }

    if (exam_date !== undefined) {
      if (exam_date !== null && exam_date !== "" && !validDate(exam_date)) {
        throw new Error("That exam date is not valid.");
      }

      payload.exam_date = exam_date || null;
    }

    if (onboarded === true) {
      payload.onboarded_at = new Date().toISOString();
    }

    return execute(
      client
        .from(TABLES.profiles)
        .upsert(payload, { onConflict: "id" })
        .select(PROFILE_COLUMNS)
        .single(),
      "Unable to save your preferences."
    );
  }

  // ---------------------------------------------------------------------------
  // Liked videos
  // ---------------------------------------------------------------------------

  async function getLikes({ limit = 300 } = {}) {
    const { client } = await getContext();
    const count = Math.min(Math.max(Math.floor(Number(limit)) || 300, 1), 1000);

    return execute(
      client
        .from(TABLES.likes)
        .select("id, video_id, title, channel_title, thumbnail_url, created_at")
        .order("created_at", { ascending: false })
        .limit(count),
      "Unable to load your liked videos."
    );
  }

  async function likeVideo(video) {
    const { client, user } = await getContext();
    const normalized = normalizeVideo(video);

    return execute(
      client
        .from(TABLES.likes)
        .upsert(
          { user_id: user.id, ...normalized },
          { onConflict: "user_id,video_id" }
        )
        .select("id, video_id, title, channel_title, thumbnail_url, created_at")
        .single(),
      "Unable to like this video."
    );
  }

  async function unlikeVideo(videoId) {
    const id = validateVideoId(videoId);
    const { client } = await getContext();

    await execute(
      client.from(TABLES.likes).delete().eq("video_id", id),
      "Unable to remove this like."
    );

    return { success: true };
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
})();
