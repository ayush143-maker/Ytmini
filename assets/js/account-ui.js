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

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function exportBackup(container) {
    const { setNotice } = UI();
    const text = await window.AyuTubeLocal.exportJson();
    const filename = `ayutube-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const native = window.AyuNativeBridge?.share;

    if (native?.shareFile) {
      await native.shareFile({ filename, text, mimeType: "application/json" });
    } else {
      downloadText(filename, text);
    }

    setNotice(container, "Backup ready.");
  }

  function pickBackupFile(container, reload) {
    const { setNotice } = UI();
    const input = document.createElement("input");

    input.type = "file";
    input.accept = "application/json,.json";

    input.addEventListener("change", async () => {
      const file = input.files?.[0];

      if (!file) return;

      try {
        const result = await window.AyuTubeLocal.importJson(await file.text());

        await reload();
        setNotice(container, `Imported ${result.added} items.`);
      } catch (error) {
        setNotice(container, error.message || "Could not import that file.", "error");
      }
    });

    input.click();
  }

  async function renderData(container) {
    const { element, makeButton, setNotice } = UI();
    const stats = await window.AyuTubeLocal.stats();
    const panel = element("section", "ay-panel");

    panel.append(
      element("h2", "ay-panel-title", "Your data"),
      element(
        "p",
        "ay-panel-copy",
        "Stored only on this phone. There is no account and nothing is synced."
      ),
      element(
        "p",
        "ay-panel-copy",
        `${stats.history} watched · ${stats.playlists} playlists · ` +
          `${stats.watchLater} watch later · ${stats.likes} liked · ` +
          `${stats.following} following`
      )
    );

    const actions = element("div", "ay-inline");
    const reload = async () => {
      await UI().afterSignIn();
      await render();
    };

    actions.append(
      makeButton("Export backup", "ay-action ay-action-primary", async () => {
        try {
          await exportBackup(container);
        } catch (error) {
          setNotice(container, error.message || "Could not export.", "error");
        }
      }),
      makeButton("Import backup", "ay-action", () => {
        pickBackupFile(container, reload);
      }),
      makeButton("Erase all data", "ay-action ay-action-danger", async () => {
        if (!window.confirm("Erase your history, playlists, likes and settings from this phone?")) {
          return;
        }

        try {
          await window.AyuTubeLocal.eraseAll();
          await UI().afterSignOut();
          await render();
        } catch (error) {
          setNotice(container, error.message || "Could not erase data.", "error");
        }
      })
    );

    panel.append(actions);
    container.append(panel);
  }

  function renderAbout(container) {
    const { element } = UI();
    const panel = element("section", "ay-panel");
    const link = element("a", "ay-link", "Source code on GitHub");

    link.href = "https://github.com/ayush143-maker/Ytmini";
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    panel.append(
      element("h2", "ay-panel-title", "About"),
      element(
        "p",
        "ay-panel-copy",
        "AyuTube is free software under the GNU GPL v3, modelled on LibreTube and powered by NewPipeExtractor."
      ),
      link
    );
    container.append(panel);
  }

  async function render() {
    const { setNotice, state, ensureAuthModules } = UI();
    const container = document.getElementById("ayutube-account-content");

    if (!container) return;

    container.replaceChildren();
    setNotice(container, "Loading…");

    try {
      await ensureAuthModules();
      state.user = await window.AyuTubeAuth.getCurrentUser();

      container.replaceChildren();

      await renderData(container);
      await window.AyuTubeStudy.renderPanel(container, { switchRow });
      renderPreferences(container);
      await renderInterests(container);
      renderAbout(container);
    } catch {
      container.replaceChildren();
      setNotice(
        container,
        "Your local data could not be opened. Close and reopen the app.",
        "error"
      );
    }
  }

  window.AyuTubeAccountUI = Object.freeze({ render });
})();
