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
  function resetMedia() {
    video.pause();
    video.removeAttribute("src");
    video.load();
    iframe.removeAttribute("src");
    video.hidden = false;
    iframe.hidden = true;
    message.hidden = true;
  }
  function youtubeUrl(id) {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
  }
  async function play(item) {
    activeId = item.id;
    panel.hidden = false;
    title.textContent = item.title || "Untitled video";
    channel.textContent = item.uploaderName || item.channel || "";
    watchLink.href = youtubeUrl(item.id);
    watchLink.hidden = false;
    resetMedia();
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
    showMessage("Loading playback…");

    try {
      const data = await window.MiniTubeAPI.streams(item.id);
      if (activeId !== item.id) return;
      const streams = Array.isArray(data.videoStreams) ? data.videoStreams : [];
      const playable = streams
        .filter(s => s && s.url && (!s.mimeType || /video\/mp4|audio\/mp4|audio\/webm|video\/webm/i.test(s.mimeType)))
        .sort((a, b) => Number(Boolean(a.videoOnly)) - Number(Boolean(b.videoOnly)));
      if (!playable.length) throw new Error("No compatible direct stream was returned.");
      video.src = playable[0].url;
      message.hidden = true;
      video.play().catch(() => {});
      video.onerror = () => {
        if (activeId !== item.id) return;
        showMessage("This stream could not play in your browser. Try the YouTube link below.");
      };
    } catch (error) {
      if (activeId !== item.id) return;
      showMessage(`${error.message || "Playback unavailable."} Try the YouTube link below.`);
    }
  }
  function close() {
    activeId = "";
    resetMedia();
    panel.hidden = true;
  }
  document.getElementById("close-player").addEventListener("click", close);
  window.MiniTubePlayer = { play, close };
})();
