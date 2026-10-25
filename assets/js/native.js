(() => {
  "use strict";

  // Only active inside the Capacitor app. In a normal browser this file
  // does nothing, so the web deployment behaves exactly as before.
  const cap = window.Capacitor;

  if (!cap || typeof cap.isNativePlatform !== "function" || !cap.isNativePlatform()) {
    return;
  }

  // The app is served from https://localhost, so relative /api/* calls
  // must be sent to the deployed serverless API instead.
  const API_ORIGIN = "https://ayutube.vercel.app";
  const baseFetch = window.fetch.bind(window);

  window.fetch = (input, init) => {
    if (typeof input === "string" && input.startsWith("/api/")) {
      return baseFetch(API_ORIGIN + input, init);
    }

    return baseFetch(input, init);
  };

  document.documentElement.classList.add("is-native");
})();
