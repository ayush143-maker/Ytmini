
(() => {
  const video = document.getElementById("video-player");
  const iframe = document.getElementById("youtube-player");
  const message = document.getElementById("player-message");
  const title = document.getElementById("player-title");
  const channel = document.getElementById("player-channel");
  const watchLink = document.getElementById("watch-youtube");
  const panel = document.getElementById("player-panel");

  let activeId = "";

  function showMessage(text) {
    message.textContent = text;
    message.hidden = false;
  }

  function youtubeUrl(id) {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
  }

  function embedUrl(id) {
    return (
      `https://www.youtube.com/embed/${encodeURIComponent(id)}` +
      "?autoplay=1&playsinline=1&rel=0"
    );
  }

  function resetMedia() {
    video.onerror = null;
    video.pause();
    video.removeAttribute("src");
    video.load();

    iframe.removeAttribute("src");

    video.hidden = false;
    iframe.hidden = true;
    message.hidden = true;
  }

  function useYouTubeFallback(item) {
    if (activeId !== item.id) return;

    // Stop the failed direct stream.
    video.onerror = null;
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.hidden = true;

    // Load YouTube inside the existing player.
    // Preserve the Referer needed by YouTube embeds.
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.allow =
      "autoplay; encrypted-media; picture-in-picture; fullscreen";
    iframe.title = item.title || "YouTube video player";
    iframe.hidden = false;
    iframe.src = embedUrl(item.id);

    // Do not display the old service error over the player.
    message.hidden = true;
  }

  async function play(item) {
    const id = String(item.id || "").trim();

    if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) {
      showMessage("Invalid video ID. Please select another result.");
      return;
    }

    item = { ...item, id };
    activeId = id;

    panel.hidden = false;
    title.textContent = item.title || "Untitled video";
    channel.textContent = item.uploaderName || item.channel || "";

    watchLink.href = youtubeUrl(id);
    watchLink.hidden = false;

    resetMedia();
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
    showMessage("Loading video…");

    try {
      const data = await window.MiniTubeAPI.streams(id);

      if (activeId !== id) return;

      const streams = Array.isArray(data.videoStreams)
        ? data.videoStreams
        : [];

      const playable = streams
        .filter(s =>
          s &&
          typeof s.url === "string" &&
          /^https?:\/\//i.test(s.url) &&
          (
            !s.mimeType ||
            /video\/mp4|audio\/mp4|audio\/webm|video\/webm/i.test(s.mimeType)
          )
        )
        .sort(
          (a, b) =>
            Number(Boolean(a.videoOnly)) -
            Number(Boolean(b.videoOnly))
        );

      if (playable.length === 0) {
        throw new Error("No compatible direct stream.");
      }

      video.onerror = () => {
        useYouTubeFallback(item);
      };

      iframe.hidden = true;
      video.hidden = false;
      message.hidden = true;
      video.src = playable[0].url;

      // Some browsers block automatic playback.
      // The native video controls remain available.
      video.play().catch(() => {});
    } catch (error) {
      if (activeId !== id) return;

      console.warn(
        "Direct playback failed; falling back to YouTube:",
        error.message
      );

      useYouTubeFallback(item);
    }
  }

  function close() {
    activeId = "";
    resetMedia();
    panel.hidden = true;
  }

  document
    .getElementById("close-player")
    .addEventListener("click", close);

  window.MiniTubePlayer = { play, close };
})();
