(() => {
  "use strict";

  // First page for a new visitor: create an account, sign in, or go
  // incognito (no account, the normal feed). Shown once per device.

  const UI = () => window.AyuTubeUI;
  const FLAG = "ayutube.welcomed";

  let root = null;
  let box = null;

  function el(tag, className, text) {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
  }

  const wanted = () => {
    if (UI().store.get(FLAG, false) === true) return false;

    // A shared video or channel link goes straight to its page.
    const params = new URLSearchParams(location.search);

    return !params.has("v") && !params.has("c");
  };

  function setInert(on) {
    document.querySelector(".app")?.toggleAttribute("inert", on);
  }

  function trapFocus(event) {
    if (event.key !== "Tab" || !root) return;

    const focusable = [...root.querySelectorAll("button, input, a[href]")].filter(
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

  function showForm(mode) {
    UI().state.authMode = mode;

    window.AyuTubeAccountUI.renderForm(box, "", {
      rerender: () => showForm(UI().state.authMode),
      onSignedIn: async () => {
        UI().store.set(FLAG, true);
        dismiss();
        await UI().afterSignIn();
      }
    });

    // Keep the "confirmation mail sent" notice visible: renderForm puts it
    // above the form, so nothing else is needed here.
    box.querySelector("input")?.focus();
  }

  function maybeShow() {
    if (root || !wanted()) return;

    root = el("div", "overlay welcome");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Welcome to ayutube");

    const inner = el("div", "overlay-inner");

    const brand = el("div", "overlay-brand");
    const mark = el("img", "brand-mark");

    mark.src = "/assets/icons/logo.svg";
    mark.alt = "";
    mark.width = 36;
    mark.height = 21;
    brand.append(mark, el("span", "brand-name", "ayutube"));

    box = el("div", "welcome-form");

    const incognito = UI().makeButton("Continue in incognito", "ay-action", () => {
      UI().store.set(FLAG, true);
      dismiss();
    });

    incognito.classList.add("welcome-incognito");

    inner.append(brand, box, incognito);
    root.append(inner);
    root.addEventListener("keydown", trapFocus);

    document.body.append(root);
    setInert(true);
    showForm("signup");
  }

  /** Close the welcome screen (also used when a session already exists). */
  function dismiss() {
    if (!root) return;

    root.remove();
    root = null;
    box = null;
    setInert(false);

    UI().store.set(FLAG, true);
  }

  window.AyuTubeWelcome = Object.freeze({ maybeShow, dismiss });
})();
