(() => {
  "use strict";

  // There is no sign-up or sign-in step any more: the app opens straight to
  // the feed. These are kept as no-ops because app.js still calls them.
  function maybeShow() {}
  function dismiss() {}

  window.AyuTubeWelcome = Object.freeze({ maybeShow, dismiss });
})();
