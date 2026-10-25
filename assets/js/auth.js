(() => {
  "use strict";

  // AyuTube has no accounts. Everything is stored on this device, so the
  // "current user" is a fixed local profile. This module keeps the old
  // interface so the rest of the app does not need to know the difference.

  const LOCAL_USER = Object.freeze({
    id: "local-user",
    email: "",
    local: true,
    user_metadata: Object.freeze({ display_name: "You" })
  });

  const NO_ACCOUNTS =
    "AyuTube has no accounts. Your data stays on this device.";

  async function getSession() {
    return { user: LOCAL_USER };
  }

  async function getCurrentUser() {
    return LOCAL_USER;
  }

  async function signUp() {
    throw new Error(NO_ACCOUNTS);
  }

  async function signIn() {
    throw new Error(NO_ACCOUNTS);
  }

  async function signOut() {
    return { success: true };
  }

  function onAuthStateChange() {
    return { data: { subscription: { unsubscribe() {} } } };
  }

  window.AyuTubeAuth = Object.freeze({
    signUp,
    signIn,
    signOut,
    getSession,
    getCurrentUser,
    onAuthStateChange
  });
})();
