// Structural slots and geometry decisions shared by React and Native presenters.
export const SIDEBAR_LAYOUT = Object.freeze([
  { key: "brand", tag: "div", className: "sidebar-header" },
  { key: "home", tag: "div", className: "sidebar-home-row" },
  { key: "navigation", tag: "nav", className: "os-nav" },
  { key: "account", tag: "div", className: "sidebar-account-slot" },
  { key: "auxiliary", tag: "div", className: "sidebar-auxiliary" },
].map(slot => Object.freeze(slot)));
export function sidebarBrandMarkup() {
  return '<span class="brand"><span class="meridian-brand-symbol" aria-hidden="true"></span><span class="brand-wordmark"><span class="brand-name">OrdaX</span><span class="brand-sub">OS</span></span></span>';
}
export function escapeMarkup(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}
export function createSidebarMarkup({ id, label, content }) {
  return `<aside id="${escapeMarkup(id)}" class="ordax-rail ordax-product-sidebar" aria-label="${escapeMarkup(label)}">${SIDEBAR_LAYOUT.map(slot => `<${slot.tag} class="${slot.className}" data-sidebar-slot="${slot.key}">${content[slot.key] ?? ""}</${slot.tag}>`).join("")}</aside>`;
}
export function sidebarIsExpanded(sidebar) { return (sidebar.offsetWidth || sidebar.getBoundingClientRect().width) > 100; }
export function sidebarItemIsActive(activeWindow, button) {
  if (!activeWindow || !button?.dataset?.sidebarApp || activeWindow.appId !== button.dataset.sidebarApp) return false;
  const target = button.dataset.appTarget;
  return target ? activeWindow.target === target : activeWindow.target === null;
}
export function mountNativeSidebarFit(nav, onResize) {
  const buttons = [...nav.querySelectorAll(".meridian-nav-destination button")];
  const destinations = buttons.map(button => button.closest(".meridian-nav-destination"));
  const more = nav.querySelector("[data-nav-menu-more]") ?? nav.querySelector("[data-launcher-more]") ?? nav.querySelector("[data-launcher-toggle]");
  const groups = [...nav.querySelectorAll("[data-nav-group]")];
  let destroyed = false;
  function measure() {
    if (destroyed) return;
    const focusedButton = nav.ownerDocument.activeElement;
    // Measure a complete rail each time. Hidden headings and rounded row
    // heights must not determine which entries fit after a scale change.
    buttons.forEach((button, index) => {
      button.hidden = false;
      destinations[index].hidden = false;
    });
    groups.forEach(group => { group.hidden = false; });
    more.hidden = true;
    const bounds = nav.getBoundingClientRect();
    const style = nav.ownerDocument.defaultView.getComputedStyle(nav);
    const borderBoxHeight = parseFloat(style.height) + (style.boxSizing === "border-box" ? 0
      : (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0)
        + (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0));
    const scale = borderBoxHeight > 0 ? bounds.height / borderBoxHeight : 1;
    const bottom = bounds.bottom - ((parseFloat(style.paddingBottom) || 0)
      + (parseFloat(style.borderBottomWidth) || 0)) * scale;
    const lastDestination = destinations.at(-1);
    if (lastDestination && lastDestination.getBoundingClientRect().bottom > bottom) {
      more.hidden = false;
      for (let index = buttons.length - 1; index >= 0; index -= 1) {
        buttons[index].hidden = true;
        destinations[index].hidden = true;
        groups.forEach(group => {
          group.hidden = !group.querySelector(".meridian-nav-destination:not([hidden])");
        });
        if (more.getBoundingClientRect().bottom <= bottom) break;
      }
    }
    // A resize may move the focused destination into the overflow menu.
    // Keep keyboard users on the control that still exposes that destination.
    if (!more.hidden && (focusedButton === more || buttons.some(button => button.hidden && button === focusedButton))) {
      more.focus({ preventScroll: true });
    } else if (more.hidden && focusedButton === more) {
      buttons.at(-1)?.focus({ preventScroll: true });
    }
    onResize();
  }
  const Observer = nav.ownerDocument.defaultView.ResizeObserver;
  const observer = typeof Observer === "function" ? new Observer(measure) : null;
  observer?.observe(nav); measure();
  // The rail itself may keep its size while a loaded font changes heading
  // metrics. Refit using the bundled Meridian font on every host.
  const fonts = nav.ownerDocument.fonts;
  fonts?.ready.then(measure);
  fonts?.addEventListener("loadingdone", measure);
  return Object.freeze({ destroy() {
    destroyed = true;
    observer?.disconnect();
    fonts?.removeEventListener("loadingdone", measure);
  } });
}
