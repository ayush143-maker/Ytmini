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
        title: "Pause history",
        copy: "Watched videos and searches are not saved.",
        checked: store.get("ayutube.noHistory", false) === true,
        onChange: (on) => {
          store.set("ayutube.noHistory", on);
          notify(on ? "History is paused." : "History is on.");
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
      }),
      switchRow({
        title: "Clean controls",
        copy: "Our own play, seek and mute bar under the video. Off keeps YouTube's controls.",
        checked: store.get("ayutube.clean", false) === true,
        onChange: (on) => {
          store.set("ayutube.clean", on);
          notify(
            on
              ? "Clean controls on. From the next video."
              : "YouTube controls back. From the next video."
          );
        }
      })
    );

    container.append(panel);
  }

  /** Exam name and date for the countdown on the home page. */
  async function renderExam(container) {
    const { element, makeButton, state, notify, getPersonal, invalidatePersonal } = UI();

    if (!state.user) return;

    const personal = await getPersonal();
    const profile = personal.profile;

    const panel = element("section", "ay-panel");
    panel.setAttribute("aria-label", "Exam countdown");
    panel.append(element("h2", "ay-panel-title", "Exam countdown"));

    const form = element("form", "ay-form exam-form");

    const nameLabel = element("label", "ay-field", "Exam");
    const nameInput = element("input");

    nameInput.name = "exam";
    nameInput.type = "text";
    nameInput.maxLength = 60;
    nameInput.placeholder = "For example JEE Main";
    nameInput.value = profile.exam_name || "";
    nameLabel.append(nameInput);

    const dateLabel = element("label", "ay-field", "Date");
    const dateInput = element("input");

    dateInput.name = "date";
    dateInput.type = "date";
    dateInput.value = profile.exam_date || "";
    dateLabel.append(dateInput);

    const save = element("button", "ay-action ay-action-primary", "Save");
    save.type = "submit";

    const clear = makeButton("Clear", "ay-action", async () => {
      try {
        await window.AyuTubeLibrary.saveProfile({ exam_name: "", exam_date: null });
        invalidatePersonal();
        state.feedKey = "";
        nameInput.value = "";
        dateInput.value = "";
        notify("Countdown removed.");
      } catch (error) {
        notify(error.message || "Could not save.");
      }
    });

    const actions = element("div", "ay-inline");
    actions.style.marginTop = "4px";
    actions.append(save, clear);

    form.append(nameLabel, dateLabel, actions);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      save.disabled = true;

      try {
        await window.AyuTubeLibrary.saveProfile({
          exam_name: nameInput.value,
          exam_date: dateInput.value || null
        });

        invalidatePersonal();
        state.feedKey = "";
        notify("Saved.");
      } catch (error) {
        notify(error.message || "Could not save.");
      } finally {
        save.disabled = false;
      }
    });

    panel.append(form);
    container.append(panel);
  }

  /**
   * The sign-in / sign-up form. Used on the Account tab and on the welcome
   * screen. hooks: onSignedIn(user), rerender() when the mode is switched.
   */
  /** The chosen interests, with a way to change them. */
  async function renderInterests(container) {
    const { element, makeButton, state, getPersonal, ensureCategories } = UI();

    if (!state.user) return;

    const personal = await getPersonal();
    const module = await ensureCategories();

    const labels = personal.profile.interests
      .map((id) => module.getById(id)?.label)
      .filter(Boolean);

    const panel = element("section", "ay-panel");
    panel.setAttribute("aria-label", "Interests");
    panel.append(
      element("h2", "ay-panel-title", "Interests"),
      element("p", "ay-panel-copy", labels.length ? labels.join(", ") : "Default feed")
    );

    const actions = element("div", "ay-inline");

    actions.append(
      makeButton("Change", "ay-action", () =>
        window.AyuTubeOnboarding?.open?.({ edit: true })
      )
    );
    panel.append(actions);
    container.append(panel);
  }

  function renderForm(container, notice = "", hooks = {}) {
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
    if (hooks.email) emailInput.value = hooks.email;
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

        if (hooks.rerender) hooks.rerender();
        else render();
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
            const sentTo = emailInput.value.trim();

            state.authMode = "signin";
            renderForm(container, `Confirmation mail sent to ${sentTo}.`, {
              ...hooks,
              email: sentTo
            });
            return;
          }
        } else {
          result = await window.AyuTubeAuth.signIn({
            email: emailInput.value,
            password: passwordInput.value
          });
        }

        state.user = result.user || null;

        if (hooks.onSignedIn) {
          await hooks.onSignedIn(result.user);
        } else {
          await UI().afterSignIn();
          render();
        }
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
            await UI().afterSignOut();
            render();
          } catch (error) {
            setNotice(container, error.message || "Could not sign out.", "error");
          }
        })
      );

      panel.append(actions);
      container.append(panel);
      renderPreferences(container);
      await renderInterests(container);
      await renderExam(container);
    } catch {
      container.replaceChildren();

      renderForm(
        container,
        "Accounts are not connected yet."
      );
      renderPreferences(container);
    }
  }

  window.AyuTubeAccountUI = Object.freeze({ render, renderForm });
})();
