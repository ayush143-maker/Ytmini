(() => {
  "use strict";

  // Interests picker: choose up to 5 things you like and the feed follows.
  // Shown once after signing in, and again from Account > Interests.

  const UI = () => window.AyuTubeUI;

  const MAX = 5;
  const EXAMS = new Set(["jee", "neet", "class-10", "class-12", "olympiad", "isi-prep"]);

  let root = null;

  function el(tag, className, text) {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
  }

  function setInert(on) {
    document.querySelector(".app")?.toggleAttribute("inert", on);
  }

  function trapFocus(event) {
    if (event.key !== "Tab" || !root) return;

    const focusable = [...root.querySelectorAll("button, input")].filter(
      (node) => !node.disabled && node.offsetParent !== null
    );

    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function close() {
    root?.remove();
    root = null;
    setInert(false);
  }

  async function maybeRun() {
    const personal = await UI().getPersonal(true);

    if (!personal.user || personal.profile.onboarded_at || root) return;

    open({ edit: false });
  }

  async function open({ edit = false } = {}) {
    if (root) return;

    const ui = UI();
    const personal = await ui.getPersonal();

    if (!personal.user) return;

    const module = await ui.ensureCategories();
    const selected = new Set(edit ? personal.profile.interests : []);

    root = el("div", "overlay onboarding");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Choose your interests");
    root.addEventListener("keydown", trapFocus);

    const inner = el("div", "overlay-inner overlay-inner--wide");
    root.append(inner);
    document.body.append(root);
    setInert(true);

    // ---- step 1: choose up to 5 ----
    function stepOne() {
      inner.replaceChildren();

      inner.append(el("h1", "overlay-title", `Pick ${MAX} things you like`));

      const counter = el("p", "pick-count");

      counter.setAttribute("aria-live", "polite");
      inner.append(counter);

      const tiles = new Map();

      for (const group of module.getGroups()) {
        const items = module.getAll().filter((item) => item.group === group.id);

        if (!items.length) continue;

        inner.append(el("h2", "pick-group", group.label));

        const grid = el("div", "pick-grid");

        for (const item of items) {
          const tile = el("button", "pick", item.label);

          tile.type = "button";
          tile.setAttribute("aria-pressed", String(selected.has(item.id)));

          tile.addEventListener("click", () => {
            if (selected.has(item.id)) selected.delete(item.id);
            else if (selected.size < MAX) selected.add(item.id);

            paint();
          });

          tiles.set(item.id, tile);
          grid.append(tile);
        }

        inner.append(grid);
      }

      const actions = el("div", "overlay-actions");
      const next = ui.makeButton("Continue", "ay-action ay-action-primary", afterPick);
      const skip = ui.makeButton(edit ? "Cancel" : "Skip", "ay-action", async () => {
        if (edit) {
          close();
          return;
        }

        await persist({ interests: [] }, "");
      });

      actions.append(next, skip);
      inner.append(actions);

      function paint() {
        counter.textContent = `${selected.size} of ${MAX}`;
        next.disabled = selected.size === 0;

        for (const [id, tile] of tiles) {
          const on = selected.has(id);

          tile.setAttribute("aria-pressed", String(on));
          tile.disabled = !on && selected.size >= MAX;
        }
      }

      paint();
      inner.querySelector(".pick")?.focus();
    }

    // ---- step 2 (only for exam interests): optional exam date ----
    function afterPick() {
      const chosen = [...selected];
      const exam = chosen.map((id) => module.getById(id)).find((item) => item && EXAMS.has(item.id));

      if (!exam) {
        persist({ interests: chosen }, "");
        return;
      }

      inner.replaceChildren();
      inner.append(el("h1", "overlay-title", "Exam date"));

      const form = el("form", "ay-form");
      const nameLabel = el("label", "ay-field", "Exam");
      const nameInput = el("input");

      nameInput.type = "text";
      nameInput.maxLength = 60;
      nameInput.value = personal.profile.exam_name || exam.label;
      nameLabel.append(nameInput);

      const dateLabel = el("label", "ay-field", "Date");
      const dateInput = el("input");

      dateInput.type = "date";
      dateInput.value = personal.profile.exam_date || "";
      dateLabel.append(dateInput);

      const save = el("button", "ay-action ay-action-primary", "Save");
      save.type = "submit";

      const later = ui.makeButton("Skip", "ay-action", () => persist({ interests: chosen }, ""));
      const actions = el("div", "ay-inline");

      actions.append(save, later);
      form.append(nameLabel, dateLabel, actions);

      form.addEventListener("submit", (event) => {
        event.preventDefault();

        persist(
          {
            interests: chosen,
            exam_name: nameInput.value,
            exam_date: dateInput.value || null
          },
          ""
        );
      });

      inner.append(form);
      nameInput.focus();
    }

    async function persist(fields) {
      const buttons = [...inner.querySelectorAll("button")];

      buttons.forEach((button) => (button.disabled = true));
      inner.querySelector(".ay-notice")?.remove();

      try {
        await window.AyuTubeLibrary.saveProfile({ ...fields, onboarded: true });
        close();
        await ui.applyInterests();
        ui.notify(edit ? "Interests updated." : "Your feed is ready.");
      } catch (error) {
        buttons.forEach((button) => (button.disabled = false));
        ui.setNotice(inner, error.message || "Could not save. Try again.", "error");
      }
    }

    stepOne();
  }

  window.AyuTubeOnboarding = Object.freeze({ maybeRun, open });
})();
