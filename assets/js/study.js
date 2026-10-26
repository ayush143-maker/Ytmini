/*
 * AyuTube - study mode and personalised home feed.
 *
 *  - Study mode: pick an exam (CUET, NEET, JEE ... or your own), the date of
 *    its next sitting (predicted for you, editable) and the subjects you want
 *    videos for. Home then shows a countdown and one shelf per subject.
 *  - Normal mode: Home gets "Because you watched ..." shelves built from the
 *    watch history stored on this phone.
 *
 * Licensed under the GNU General Public License v3.0 (see LICENSE).
 */
(() => {
  "use strict";

  const UI = () => window.AyuTubeUI;
  const Cards = () => window.AyuTubeCards;
  const lib = () => window.AyuTubeLibrary;

  function el(tag, className, text) {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
  }

  // ---------------------------------------------------------------------------
  // Exams and predicted dates
  // ---------------------------------------------------------------------------

  const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

  function nthSunday(year, month, n) {
    const first = new Date(year, month, 1);
    const offset = (7 - first.getDay()) % 7;

    return new Date(year, month, 1 + offset + (n - 1) * 7);
  }

  const pad = (value) => String(value).padStart(2, "0");
  const iso = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

  // Typical sitting for each exam. These are predictions, not official dates.
  const EXAMS = Object.freeze([
    { id: "cuet", label: "CUET", on: (year) => new Date(year, 4, 15) },
    { id: "neet", label: "NEET", on: (year) => nthSunday(year, 4, 1) },
    { id: "jee-main", label: "JEE Main", on: (year) => new Date(year, 0, 22) },
    { id: "jee-advanced", label: "JEE Advanced", on: (year) => nthSunday(year, 4, 3) },
    { id: "boards-12", label: "Class 12 Boards", on: (year) => new Date(year, 1, 15) },
    { id: "boards-10", label: "Class 10 Boards", on: (year) => new Date(year, 1, 15) }
  ]);

  /** The next date on or after `today` that matches the exam's usual timing. */
  function predictDate(exam, today = new Date()) {
    const from = startOfDay(today);

    for (let year = from.getFullYear(); year <= from.getFullYear() + 1; year += 1) {
      const date = exam.on(year);

      if (date >= from) return iso(date);
    }

    return iso(exam.on(from.getFullYear() + 1));
  }

  const SUBJECTS = Object.freeze([
    "Physics",
    "Chemistry",
    "Mathematics",
    "Biology",
    "English",
    "General Test",
    "Reasoning",
    "Current affairs",
    "Economics",
    "Accountancy",
    "Computer science"
  ]);

  const MAX_SUBJECTS = 8;

  // ---------------------------------------------------------------------------
  // Account panel
  // ---------------------------------------------------------------------------

  async function renderPanel(container, { switchRow } = {}) {
    const ui = UI();
    const personal = await ui.getPersonal();
    const profile = personal.profile || {};

    const preset = EXAMS.find((exam) => exam.label === profile.exam_name);
    let examId = preset ? preset.id : profile.exam_name ? "other" : "";
    let examName = profile.exam_name || "";
    let examDate = profile.exam_date || "";
    const subjects = new Set(Array.isArray(profile.subjects) ? profile.subjects : []);

    const panel = el("section", "ay-panel study-panel");

    panel.setAttribute("aria-label", "Study mode");
    panel.append(
      el("h2", "ay-panel-title", "Study mode"),
      el(
        "p",
        "ay-panel-copy",
        "Videos for your exam and subjects, a countdown on Home, notes while you watch. No Up next, no autoplay."
      )
    );

    const details = el("div", "study-details");

    details.hidden = !ui.isStudy();

    if (switchRow) {
      panel.append(
        switchRow({
          title: "Study mode",
          copy: "Turn on to set up your exam.",
          checked: ui.isStudy(),
          onChange: (on) => {
            ui.setStudy(on);
            ui.state.feedKey = "";
            details.hidden = !on;
            ui.notify(on ? "Study mode is on." : "Study mode is off.");
          }
        })
      );
    }

    details.append(el("h3", "study-label", "Your exam"));

    const examChips = el("div", "study-chips");
    const nameField = el("label", "ay-field", "Exam name");
    const nameInput = el("input");
    const dateField = el("label", "ay-field", "Exam date");
    const dateInput = el("input");
    const hint = el("p", "study-hint");

    nameInput.type = "text";
    nameInput.maxLength = 60;
    nameInput.placeholder = "For example SSC CGL";
    nameInput.value = preset ? "" : examName;
    nameField.append(nameInput);
    dateInput.type = "date";
    dateInput.value = examDate;
    dateField.append(dateInput);

    const paintExam = () => {
      examChips.replaceChildren();

      for (const exam of [...EXAMS, { id: "other", label: "Other" }]) {
        const chip = el("button", "ay-chip", exam.label);

        chip.type = "button";
        chip.setAttribute("aria-pressed", String(examId === exam.id));
        chip.addEventListener("click", () => {
          examId = exam.id;

          if (exam.id === "other") {
            examName = nameInput.value.trim();
          } else {
            examName = exam.label;
            examDate = predictDate(exam);
            dateInput.value = examDate;
          }

          paintExam();
        });
        examChips.append(chip);
      }

      nameField.hidden = examId !== "other";
      dateField.hidden = !examId;
      hint.hidden = !examId || examId === "other";
      hint.textContent =
        "Date predicted from the usual schedule. Change it if the official date is different.";
    };

    nameInput.addEventListener("input", () => {
      examName = nameInput.value.trim();
    });
    dateInput.addEventListener("change", () => {
      examDate = dateInput.value;
    });
    paintExam();
    details.append(examChips, nameField, dateField, hint);

    details.append(el("h3", "study-label", "Subjects you want videos for"));

    const subjectChips = el("div", "study-chips");
    const customRow = el("div", "study-custom");
    const customInput = el("input");
    const addButton = el("button", "ay-action", "Add");

    customInput.type = "text";
    customInput.maxLength = 40;
    customInput.placeholder = "Add your own subject";
    addButton.type = "button";

    const paintSubjects = () => {
      subjectChips.replaceChildren();

      for (const subject of [...new Set([...SUBJECTS, ...subjects])]) {
        const chip = el("button", "ay-chip", subject);

        chip.type = "button";
        chip.setAttribute("aria-pressed", String(subjects.has(subject)));
        chip.addEventListener("click", () => {
          if (subjects.has(subject)) {
            subjects.delete(subject);
          } else if (subjects.size >= MAX_SUBJECTS) {
            ui.notify(`Choose up to ${MAX_SUBJECTS} subjects.`);
            return;
          } else {
            subjects.add(subject);
          }

          paintSubjects();
        });
        subjectChips.append(chip);
      }
    };

    const addCustom = () => {
      const value = customInput.value.trim().replace(/\s+/g, " ").slice(0, 40);

      if (!value) return;

      if (subjects.size >= MAX_SUBJECTS && !subjects.has(value)) {
        ui.notify(`Choose up to ${MAX_SUBJECTS} subjects.`);
        return;
      }

      subjects.add(value);
      customInput.value = "";
      paintSubjects();
    };

    addButton.addEventListener("click", addCustom);
    customInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addCustom();
      }
    });
    paintSubjects();
    customRow.append(customInput, addButton);
    details.append(subjectChips, customRow);

    const save = el("button", "ay-action ay-action-primary", "Save study setup");

    save.type = "button";
    save.addEventListener("click", async () => {
      save.disabled = true;

      try {
        if (examId === "other") examName = nameInput.value.trim();

        await lib().saveProfile({
          exam_name: examId ? examName : "",
          exam_date: examId ? dateInput.value || null : null,
          subjects: [...subjects]
        });
        ui.invalidatePersonal();
        ui.state.feedKey = "";
        ui.notify("Study setup saved.");
      } catch (error) {
        ui.notify(error.message || "Could not save.");
      } finally {
        save.disabled = false;
      }
    });

    const actions = el("div", "ay-inline");

    actions.append(save);
    details.append(actions);
    panel.append(details);
    container.append(panel);
  }

  // ---------------------------------------------------------------------------
  // Study feed (Home in study mode)
  // ---------------------------------------------------------------------------

  let observer = null;

  function daysUntil(isoDate) {
    const [year, month, day] = String(isoDate).split("-").map(Number);
    const target = new Date(year, month - 1, day);

    return Math.round((target - startOfDay(new Date())) / 86400000);
  }

  function examBar(profile) {
    if (!profile?.exam_date) return null;

    const days = daysUntil(profile.exam_date);

    if (!Number.isFinite(days) || days < 0) return null;

    const bar = el("div", "exam");
    const label = profile.exam_name || "your exam";

    bar.append(
      el("span", "exam-days", days === 0 ? "Today" : String(days)),
      el(
        "span",
        "exam-label",
        days === 0 ? label : `${days === 1 ? "day" : "days"} to ${label}`
      )
    );

    return bar;
  }

  async function fetchVideos(query, page = "") {
    const params = new URLSearchParams({ q: query, type: "video" });

    if (page) params.set("page", page);

    const response = await fetch(`/api/search?${params}`, {
      headers: { Accept: "application/json" }
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) throw new Error(data?.error || "Videos are unavailable right now.");

    return {
      items: Array.isArray(data.items) ? data.items : [],
      next: typeof data.nextpage === "string" && data.nextpage ? data.nextpage : ""
    };
  }

  /** Renders the study feed. Returns false when study mode has no subjects yet. */
  async function renderFeed(container, { current = () => true } = {}) {
    const ui = UI();
    const cards = Cards();

    observer?.disconnect();
    observer = null;

    const personal = await ui.getPersonal();
    const profile = personal.profile || {};
    const subjects = Array.isArray(profile.subjects) ? profile.subjects : [];

    if (!ui.isStudy() || !subjects.length) {
      document.body.dataset.studyFeed = "off";
      return false;
    }

    document.body.dataset.studyFeed = "on";

    const exam = profile.exam_name || "";
    const queryFor = (subject) => [exam, subject].filter(Boolean).join(" ");
    const seen = new Set();
    const usable = (video) =>
      ui.validVideoId(video.id) && !video.short && !ui.isBlocked(video);
    const progressOf = (video) => personal.map.get(video.id) || null;

    container.replaceChildren();
    container.removeAttribute("aria-busy");

    const bar = examBar(profile);

    if (bar) container.append(bar);

    const chips = el("div", "study-chips study-feed-chips");
    const body = el("div", "study-body");

    container.append(chips, body);

    let selected = null;
    let renderId = 0;

    const paintChips = () => {
      chips.replaceChildren();

      for (const subject of [null, ...subjects]) {
        const chip = el("button", "ay-chip", subject || "All");

        chip.type = "button";
        chip.setAttribute("aria-pressed", String(selected === subject));
        chip.addEventListener("click", () => {
          selected = subject;
          paintChips();
          show();
        });
        chips.append(chip);
      }
    };

    const card = (video) =>
      cards.createCard(video, { variant: "grid", progress: progressOf(video) });

    async function showAll(id) {
      body.replaceChildren(cards.skeletons(3, "grid"));

      const settled = await Promise.allSettled(
        subjects.map((subject) => fetchVideos(queryFor(subject)))
      );

      if (id !== renderId || !current()) return;

      body.replaceChildren();

      settled.forEach((result, index) => {
        if (result.status !== "fulfilled") return;

        const videos = result.value.items
          .map(ui.toVideo)
          .filter(usable)
          .filter((video) => !seen.has(video.id))
          .slice(0, 10);

        if (videos.length < 2) return;

        videos.forEach((video) => seen.add(video.id));

        const section = el("section", "feed-section");
        const head = el("div", "section-head lib-shelf-head");
        const more = el("button", "lib-more", "See all");
        const row = el("div", "hrow");

        head.append(el("h2", "", subjects[index]), more);
        more.type = "button";
        more.addEventListener("click", () => {
          selected = subjects[index];
          paintChips();
          show();
        });

        for (const video of videos) row.append(card(video));

        section.append(head, row);
        body.append(section);
      });

      if (!body.childNodes.length) {
        body.append(el("p", "feed-note", "Videos are unavailable right now. Try again."));
      }
    }

    async function showSubject(subject, id) {
      const grid = el("div", "grid");
      const sentinel = el("div", "feed-sentinel");
      const note = el("p", "feed-note");

      body.replaceChildren(grid, note, sentinel);
      grid.append(cards.skeletons(3, "grid"));

      let next = "";
      let busy = false;
      let done = false;
      let first = true;

      const more = async () => {
        if (busy || done || id !== renderId || !current()) return;

        busy = true;
        note.textContent = "";

        try {
          const page = await fetchVideos(queryFor(subject), next);

          if (id !== renderId || !current()) return;

          if (first) {
            grid.replaceChildren();
            first = false;
          }

          const videos = page.items.map(ui.toVideo).filter(usable).filter((v) => !seen.has(v.id));

          videos.forEach((video) => {
            seen.add(video.id);
            grid.append(card(video));
          });

          next = page.next;
          done = !next;

          if (!grid.childNodes.length) note.textContent = "No videos found.";
        } catch (error) {
          if (first) grid.replaceChildren();
          note.textContent = error.message || "Could not load videos.";
        } finally {
          busy = false;
        }

        // Keep loading while the sentinel is still on screen.
        if (!done && sentinel.getBoundingClientRect().top < window.innerHeight + 400) {
          setTimeout(more, 0);
        }
      };

      if ("IntersectionObserver" in window) {
        observer = new IntersectionObserver(
          (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) more();
          },
          { rootMargin: "600px 0px" }
        );
        observer.observe(sentinel);
      }

      await more();
    }

    function show() {
      renderId += 1;
      observer?.disconnect();
      observer = null;

      if (selected === null) {
        void showAll(renderId);
      } else {
        void showSubject(selected, renderId);
      }
    }

    paintChips();
    show();

    return true;
  }

  // ---------------------------------------------------------------------------
  // "Because you watched ..." shelves for normal mode
  // ---------------------------------------------------------------------------

  function shortTitle(title) {
    return String(title || "")
      .split(/[|\u2013\u2014(\[]|\s-\s/)[0]
      .replace(/[^\p{L}\p{N}\s']/gu, " ")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 6)
      .join(" ");
  }

  async function appendForYou(container, { current = () => true } = {}) {
    const ui = UI();
    const cards = Cards();

    if (ui.isStudy() || !container) return;

    let rows;

    try {
      rows = await lib().getHistory({ limit: 12 });
    } catch {
      return;
    }

    if (!rows.length) return;

    const watched = new Set(rows.map((row) => row.video_id));
    const shelves = [];

    for (const row of rows) {
      const topic = shortTitle(row.title);

      if (topic && !shelves.some((shelf) => shelf.query === topic)) {
        shelves.push({ label: `Because you watched ${topic}`, query: topic });
      }

      if (shelves.length >= 2) break;
    }

    const tally = new Map();

    for (const row of rows) {
      if (row.channel_title) tally.set(row.channel_title, (tally.get(row.channel_title) || 0) + 1);
    }

    const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];

    if (top) shelves.push({ label: `More from ${top[0]}`, query: top[0] });

    const slot = el("div", "foryou");

    container.prepend(slot);

    const settled = await Promise.allSettled(shelves.map((shelf) => fetchVideos(shelf.query)));

    if (!current()) {
      slot.remove();
      return;
    }

    const personal = await ui.getPersonal();
    const seen = new Set(watched);

    settled.forEach((result, index) => {
      if (result.status !== "fulfilled") return;

      const videos = result.value.items
        .map(ui.toVideo)
        .filter((video) => ui.validVideoId(video.id) && !video.short && !ui.isBlocked(video))
        .filter((video) => !seen.has(video.id))
        .slice(0, 10);

      if (videos.length < 3) return;

      videos.forEach((video) => seen.add(video.id));

      const section = el("section", "feed-section");
      const head = el("div", "section-head");
      const row = el("div", "hrow");

      head.append(el("h2", "", shelves[index].label));

      for (const video of videos) {
        row.append(
          cards.createCard(video, { variant: "grid", progress: personal.map.get(video.id) || null })
        );
      }

      section.append(head, row);
      slot.append(section);
    });
  }

  window.AyuTubeStudy = Object.freeze({
    EXAMS,
    SUBJECTS,
    predictDate,
    renderPanel,
    renderFeed,
    appendForYou
  });
})();
