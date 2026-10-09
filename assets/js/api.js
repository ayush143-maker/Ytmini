(() => {
  async function request(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { "Accept": "application/json", ...(options.headers || {}) }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
    return body;
  }
  window.MiniTubeAPI = {
    search(query) {
      return request(`/api/search?q=${encodeURIComponent(query)}`);
    },
    streams(videoId) {
      return request(`/api/streams?id=${encodeURIComponent(videoId)}`);
    }
  };
})();
