
(() => {
  "use strict";

  const MIN_PASSWORD_LENGTH = 8;
  const MAX_PASSWORD_LENGTH = 128;
  const MAX_DISPLAY_NAME_LENGTH = 80;

  /**
   * Normalize and validate email addresses consistently.
   */
  function normalizeEmail(value) {
    if (typeof value !== "string") {
      throw new Error("Please enter a valid email address.");
    }

    const email = value.trim().toLowerCase();

    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      throw new Error("Please enter a valid email address.");
    }

    return email;
  }

  /**
   * Validate passwords before sending them to Supabase.
   * Never trim or silently modify a password.
   */
  function validatePassword(password, isSignup = false) {
    if (typeof password !== "string" || password.length === 0) {
      throw new Error("Please enter your password.");
    }

    if (password.length > MAX_PASSWORD_LENGTH) {
      throw new Error("Password must be 128 characters or fewer.");
    }

    if (isSignup && password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(
        `Your password must contain at least ${MIN_PASSWORD_LENGTH} characters.`
      );
    }

    return password;
  }

  function normalizeDisplayName(value) {
    if (value == null || value === "") {
      return undefined;
    }

    if (typeof value !== "string") {
      throw new Error("Please enter a valid display name.");
    }

    const name = value.trim();

    if (!name) {
      return undefined;
    }

    if (name.length > MAX_DISPLAY_NAME_LENGTH) {
      throw new Error(
        `Your display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`
      );
    }

    return name;
  }

  /**
   * Convert common Supabase Auth errors into useful messages.
   * Unknown errors receive a generic message instead of exposing
   * internal request details to the UI.
   */
  function friendlyError(error, operation) {
    const code = String(error?.code || "").toLowerCase();
    const message = String(error?.message || "").toLowerCase();
    const status = Number(error?.status || 0);

    if (
      code.includes("invalid_credentials") ||
      message.includes("invalid login credentials")
    ) {
      return new Error("Incorrect email or password.");
    }

    if (
      code.includes("email_not_confirmed") ||
      message.includes("email not confirmed")
    ) {
      return new Error(
        "Please verify your email before signing in."
      );
    }

    if (
      code.includes("user_already_exists") ||
      message.includes("user already registered")
    ) {
      return new Error(
        "This email may already be registered. Try signing in."
      );
    }

    if (
      code.includes("weak_password") ||
      message.includes("password should be")
    ) {
      return new Error(
        "Choose a stronger password and try again."
      );
    }

    if (
      code.includes("over_request_rate_limit") ||
      code.includes("rate_limit") ||
      status === 429
    ) {
      return new Error(
        "Too many attempts. Please wait a little and try again."
      );
    }

    if (
      message.includes("failed to fetch") ||
      message.includes("network") ||
      message.includes("fetch")
    ) {
      return new Error(
        "Connection failed. Check your internet and try again."
      );
    }

    if (operation === "signup") {
      return new Error(
        "Unable to create your account right now. Please try again."
      );
    }

    if (operation === "signin") {
      return new Error(
        "Unable to sign in right now. Check your details and try again."
      );
    }

    if (operation === "signout") {
      return new Error(
        "Unable to complete sign out. Please try again."
      );
    }

    return new Error(
      "Something went wrong. Please try again."
    );
  }

  async function getAuth() {
    if (!window.AyuTubeSupabase?.getClient) {
      throw new Error(
        "AyuTube is still initializing. Please try again shortly."
      );
    }

    const client = await window.AyuTubeSupabase.getClient();

    if (!client?.auth) {
      throw new Error(
        "Authentication is temporarily unavailable."
      );
    }

    return client.auth;
  }

  /**
   * Create an account.
   *
   * Email confirmation may be required depending on the
   * Supabase project's Auth settings.
   */
  async function signUp({
    email,
    password,
    displayName
  } = {}) {
    const normalizedEmail = normalizeEmail(email);
    const validatedPassword = validatePassword(password, true);
    const normalizedName = normalizeDisplayName(displayName);

    const auth = await getAuth();

    const options = {};

    if (normalizedName) {
      options.data = {
        display_name: normalizedName
      };
    }

    let result;

    try {
      result = await auth.signUp({
        email: normalizedEmail,
        password: validatedPassword,
        options
      });
    } catch (error) {
      throw friendlyError(error, "signup");
    }

    if (result.error) {
      throw friendlyError(result.error, "signup");
    }

    return Object.freeze({
      user: result.data.user,
      session: result.data.session,
      needsEmailConfirmation: !result.data.session
    });
  }

  /**
   * Sign in an existing account using email and password.
   */
  async function signIn({
    email,
    password
  } = {}) {
    const normalizedEmail = normalizeEmail(email);
    const validatedPassword = validatePassword(password);

    const auth = await getAuth();

    let result;

    try {
      result = await auth.signInWithPassword({
        email: normalizedEmail,
        password: validatedPassword
      });
    } catch (error) {
      throw friendlyError(error, "signin");
    }

    if (result.error) {
      throw friendlyError(result.error, "signin");
    }

    return Object.freeze({
      user: result.data.user,
      session: result.data.session
    });
  }

  /**
   * Sign out the current user and clear the local session.
   */
  async function signOut() {
    const auth = await getAuth();

    let result;

    try {
      result = await auth.signOut({
        scope: "local"
      });
    } catch (error) {
      throw friendlyError(error, "signout");
    }

    if (result.error) {
      throw friendlyError(result.error, "signout");
    }

    return Object.freeze({
      success: true
    });
  }

  /**
   * Read the currently persisted session.
   * Returns null when nobody is signed in.
   */
  async function getSession() {
    const auth = await getAuth();

    let result;

    try {
      result = await auth.getSession();
    } catch {
      throw new Error(
        "Unable to check your session. Please try again."
      );
    }

    if (result.error) {
      throw friendlyError(result.error, "session");
    }

    return result.data.session || null;
  }

  /**
   * Verify the current user with Supabase Auth.
   */
  async function getCurrentUser() {
    const auth = await getAuth();

    let result;

    try {
      result = await auth.getUser();
    } catch {
      throw new Error(
        "Unable to verify your account. Please try again."
      );
    }

    if (result.error) {
      // An expired or missing session is not an application crash.
      if (
        String(result.error.code || "").includes("session_not_found")
      ) {
        return null;
      }

      throw friendlyError(result.error, "session");
    }

    return result.data.user || null;
  }

  /**
   * Subscribe to login, logout, refresh and other Auth events.
   * Returns an unsubscribe function for clean UI teardown.
   */
  async function onAuthStateChange(callback) {
    if (typeof callback !== "function") {
      throw new TypeError(
        "An authentication event callback is required."
      );
    }

    const auth = await getAuth();

    const { data, error } = auth.onAuthStateChange(
      (event, session) => {
        // Keep this callback synchronous. UI code should avoid
        // awaiting Supabase requests inside the Auth callback.
        try {
          callback(
            Object.freeze({
              event,
              session: session || null,
              user: session?.user || null
            })
          );
        } catch (callbackError) {
          console.error(
            "AyuTube auth listener failed:",
            callbackError
          );
        }
      }
    );

    if (error) {
      throw friendlyError(error, "session");
    }

    let subscribed = true;

    return () => {
      if (!subscribed) return;

      subscribed = false;
      data.subscription.unsubscribe();
    };
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
