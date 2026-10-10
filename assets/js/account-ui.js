(() => {
  "use strict";

  const UI = () => window.AyuTubeUI;

  function switchRow({ title, copy, checked, onChange }) {
    const { element } = UI();

    const row = element("div", "pref-row");
    const text = element("div", "pref-text");

    text.append(element("p", "pref-title", title), element("p", "pref-copy", copy));

    const toggle = element("button", "ay-switch");
    toggle.type = "button";
    toggle.setAttribute("role", "switch");
    toggle.setAttribute("aria-checked", String(Boolean(checked)));
    toggle.setAttribute("aria-label", title);
    toggle.append(element("span", "ay-switch-knob"));

    toggle.addEventListener("click", () => {
      const next = toggle.getAttribute("aria-checked") !== "true";

      toggle.setAttribute("aria-checked", String(next));
      onChange(next);
    });

    row.append(text, toggle);

    return row;
  }

  function renderPreferences(container) {
    const { element, store, setStudy, notify } = UI();

    const panel = element("section", "ay-panel");
    panel.setAttribute("aria-label", "Preferences");
    panel.append(element("h2", "ay-panel-title", "Preferences"));

    panel.append(
      switchRow({
        title: "Study mode",
        copy: "No cartoons, facts, Up next or autoplay.",
        checked: UI().isStudy(),
        onChange: (on) => {
          setStudy(on);
          notify(on ? "Study mode is on." : "Study mode is off.");
        }
      }),
      switchRow({
        title: "Autoplay next video",
        copy: "Play the next video when one ends.",
        checked: store.get("ayutube.autoplay", true) !== false,
        onChange: (on) => {
          store.set("ayutube.autoplay", on);
          notify(on ? "Autoplay is on." : "Autoplay is off.");
        }
      })
    );

    container.append(panel);
  }

  function renderForm(container, notice = "") {
    const { element, makeButton, setNotice, state, ensureAuthModules } = UI();

    container.replaceChildren();

    const isSignup = state.authMode === "signup";
    const form = element("form", "ay-form");

    if (notice) setNotice(container, notice, "info");

    form.append(
      element("h2", "ay-section-heading", isSignup ? "Create your account" : "Sign in")
    );

    if (isSignup) {
      const nameLabel = element("label", "ay-field", "Display name");
      const nameInput = element("input");

      nameInput.name = "displayName";
      nameInput.type = "text";
      nameInput.autocomplete = "name";
      nameInput.maxLength = 80;
      nameInput.placeholder = "Your name";

      nameLabel.append(nameInput);
      form.append(nameLabel);
    }

    const emailLabel = element("label", "ay-field", "Email address");
    const emailInput = element("input");

    emailInput.type = "email";
    emailInput.name = "email";
    emailInput.required = true;
    emailInput.autocomplete = "email";
    emailInput.maxLength = 254;
    emailInput.placeholder = "you@example.com";
    emailLabel.append(emailInput);

    const passwordLabel = element("label", "ay-field", "Password");
    const passwordInput = element("input");

    passwordInput.type = "password";
    passwordInput.name = "password";
    passwordInput.required = true;
    passwordInput.autocomplete = isSignup ? "new-password" : "current-password";
    passwordInput.minLength = isSignup ? 8 : 1;
    passwordInput.maxLength = 128;
    passwordInput.placeholder = isSignup ? "At least 8 characters" : "Your password";
    passwordLabel.append(passwordInput);

    const submit = element(
      "button",
      "ay-action ay-action-primary",
      isSignup ? "Create account" : "Sign in"
    );
    submit.type = "submit";

    const switchMode = makeButton(
      isSignup ? "I already have an account" : "Create a new account",
      "ay-action",
      () => {
        state.authMode = isSignup ? "signin" : "signup";
        render();
      }
    );

    const actions = element("div", "ay-inline");
    actions.style.marginTop = "4px";
    actions.append(submit, switchMode);

    form.append(emailLabel, passwordLabel, actions);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      submit.disabled = true;
      container.querySelector(".ay-notice")?.remove();

      try {
        await ensureAuthModules();

        let result;

        if (isSignup) {
          result = await window.AyuTubeAuth.signUp({
            email: emailInput.value,
            password: passwordInput.value,
            displayName: form.elements.displayName?.value
          });

          if (result.needsEmailConfirmation) {
            renderForm(
              container,
              "Confirm your email, then sign in."
            );
            state.authMode = "signin";
            return;
          }
        } else {
          result = await window.AyuTubeAuth.signIn({
            email: emailInput.value,
            password: passwordInput.value
          });
        }

        state.user = result.user || null;
        UI().invalidatePersonal();
        render();
      } catch (error) {
        setNotice(
          container,
          error.message || "Something went wrong. Try again.",
          "error"
        );
      } finally {
        submit.disabled = false;
      }
    });

    container.append(form);
  }

  async function render() {
    const { element, makeButton, setNotice, state, ensureAuthModules, setView } = UI();
    const container = document.getElementById("ayutube-account-content");

    if (!container) return;

    container.replaceChildren();
    setNotice(container, "Loading your account…");

    try {
      await ensureAuthModules();

      const user = await window.AyuTubeAuth.getCurrentUser();
      state.user = user;

      container.replaceChildren();

      if (!user) {
        renderForm(container);
        renderPreferences(container);
        return;
      }

      const panel = element("section", "ay-panel");
      panel.append(
        element("h2", "ay-panel-title", "Signed in"),
        element("p", "ay-panel-copy", user.email || "")
      );

      const actions = element("div", "ay-inline");

      actions.append(
        makeButton("Open library", "ay-action ay-action-primary", () => {
          setView("library");
        }),
        makeButton("Sign out", "ay-action ay-action-danger", async () => {
          try {
            await window.AyuTubeAuth.signOut();
            state.user = null;
            UI().invalidatePersonal();
            render();
          } catch (error) {
            setNotice(container, error.message || "Could not sign out.", "error");
          }
        })
      );

      panel.append(actions);
      container.append(panel);
      renderPreferences(container);
    } catch {
      container.replaceChildren();

      renderForm(
        container,
        "Accounts are not connected yet."
      );
      renderPreferences(container);
    }
  }

  window.AyuTubeAccountUI = Object.freeze({ render });
})();
