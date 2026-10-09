
(() => {
  "use strict";

  const CONFIG_ENDPOINT = "/api/config";
  const EXPECTED_PROJECT_URL =
    "https://ydpeuorhetnehpssxhao.supabase.co";

  // Keep the SDK version fixed for reproducible deployments.
  const SUPABASE_SDK_URL =
    "https://esm.sh/@supabase/supabase-js@2.117.3";

  let clientPromise = null;

  /**
   * Fetch public runtime configuration from our Vercel API.
   * Never read secrets or credentials directly in browser code.
   */
  async function loadConfig() {
    let response;

    try {
      response = await fetch(CONFIG_ENDPOINT, {
        method: "GET",
        headers: {
          Accept: "application/json"
        },
        cache: "no-store",
        credentials: "same-origin",
        redirect: "error"
      });
    } catch {
      throw new Error(
        "Cannot reach AyuTube configuration. Check the deployment."
      );
    }

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        typeof payload?.error === "string"
          ? payload.error
          : "Unable to load Supabase configuration."
      );
    }

    const suppliedUrl = payload?.supabaseUrl;
    const suppliedKey = payload?.supabaseKey;

    let parsedUrl;

    try {
      parsedUrl = new URL(suppliedUrl);
    } catch {
      throw new Error("Supabase URL is invalid.");
    }

    if (
      parsedUrl.origin !== EXPECTED_PROJECT_URL ||
      parsedUrl.pathname !== "/" ||
      parsedUrl.search !== "" ||
      parsedUrl.hash !== ""
    ) {
      throw new Error(
        "The configured Supabase project does not match AyuTube."
      );
    }

    if (
      typeof suppliedKey !== "string" ||
      !/^sb_publishable_[A-Za-z0-9_-]+$/.test(suppliedKey)
    ) {
      throw new Error(
        "A valid Supabase publishable key is required."
      );
    }

    return {
      url: parsedUrl.origin,
      key: suppliedKey
    };
  }

  /**
   * Create one shared client for the entire application.
   */
  async function initializeClient() {
    const config = await loadConfig();

    let sdk;

    try {
      sdk = await import(SUPABASE_SDK_URL);
    } catch {
      throw new Error(
        "Supabase SDK failed to load. Check your connection."
      );
    }

    if (typeof sdk.createClient !== "function") {
      throw new Error("The Supabase SDK could not be initialized.");
    }

    return sdk.createClient(config.url, config.key, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: "pkce"
      },
      global: {
        headers: {
          "X-Client-Info": "ayutube-web"
        }
      }
    });
  }

  /**
   * Lazily initialize the client and reuse it across the app.
   * A failed attempt can be retried instead of being cached forever.
   */
  function getClient() {
    if (!clientPromise) {
      clientPromise = initializeClient().catch((error) => {
        clientPromise = null;
        throw error;
      });
    }

    return clientPromise;
  }

  /**
   * Keep the client interface small and consistent.
   * Feature-specific logic belongs in separate modules.
   */
  window.AyuTubeSupabase = Object.freeze({
    getClient
  });
})();
