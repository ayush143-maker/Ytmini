(() => {
  const form = document.getElementById("search-form");
  const input = document.getElementById("search-input");
  const button = document.getElementById("search-button");
  const status = document.getElementById("status");
  const results = document.getElementById("results");

  function text(value, fallback = "") {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
  }
  function normalize(item) {
    return {
      id: item.url ? (item.url.match(/(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{6,})/) || [])[1] : item.id,
      title: text(item.title, "Untitled video"),
      uploaderName: text(item.uploaderName || item.channel, "Unknown channel"),
      thumbnail: text(item.thumbnail || item.thumbnailUrl, ""),
      url: item.url || ""
    };
  }
  function videoId(item) {
    if (item.id) return item.id;
    const match = String(item.url || "").match(/(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{6,})/);
    return match ? match[1] : "";
  }
  function render(items) {
    results.replaceChildren();
    const fragment = document.createDocumentFragment();
    items.forEach(raw => {
      const item = normalize(raw);
      item.id = videoId(item);
      if (!item.id) return;
      const button = document.createElement("button");
      button.className = "result";
      button.type = "button";
      button.setAttribute("aria-label", `Play ${item.title}`);
      const thumbWrap = document.createElement("span");
      thumbWrap.className = "thumb-wrap";
      const img = document.createElement("img");
      img.className = "thumb";
      img.loading = "lazy";
      img.alt = "";
      img.src = item.thumbnail || `https://i.ytimg.com/vi/${encodeURIComponent(item.id)}/hqdefault.jpg`;
      img.onerror = () => { img.style.visibility = "hidden"; };
      const playBadge = document.createElement("span");
      playBadge.className = "play-badge";
      playBadge.textContent = "▶";
      thumbWrap.append(img, playBadge);
      const copy = document.createElement("span");
      copy.className = "result-copy";
      const heading = document.createElement("span");
      heading.className = "result-title";
      heading.textContent = item.title;
      const byline = document.createElement("span");
      byline.className = "result-channel";
      byline.textContent = item.uploaderName;
      copy.append(heading, byline);
      button.append(thumbWrap, copy);
      button.addEventListener("click", () => window.MiniTubePlayer.play(item));
      fragment.append(button);
    });
    results.append(fragment);
  }
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const query = input.value.trim();
    if (!query) return;
    button.disabled = true;
    results.replaceChildren();
    status.textContent = "Searching…";
    try {
      const data = await window.MiniTubeAPI.search(query);
      const items = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
      render(items);
      status.textContent = items.length ? `${items.length} results` : "No videos found.";
    } catch (error) {
      status.textContent = error.message || "Search is temporarily unavailable. Try again.";
    } finally {
      button.disabled = false;
    }
  });
})();
