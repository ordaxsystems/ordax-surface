// Keep keyboard navigation within the one First Run modal. The Surface root
// remains inert while setup is open; this handles the dialog's own tab cycle.
const TABBABLE_SELECTOR = "a[href], button, input, select, textarea, summary, [tabindex]";

export function trapFirstRunKeyboardFocus(event, overlay, activeElement) {
  if (event.key !== "Tab") return false;

  const candidates = [...overlay.querySelectorAll(TABBABLE_SELECTOR)]
    .filter(node => node.tabIndex >= 0
      && !node.disabled
      && !node.closest("[hidden], [inert]")
      && node.getClientRects().length > 0);

  // The heading itself can receive programmatic focus (tabindex=-1).
  // Even if all controls become unavailable, Tab must not leave the modal.
  if (candidates.length === 0) {
    event.preventDefault();
    overlay.focus({ preventScroll: true });
    return true;
  }
  const index = candidates.indexOf(activeElement);
  const lastIndex = candidates.length - 1;
  const target = index < 0
    ? (event.shiftKey ? candidates[lastIndex] : candidates[0])
    : event.shiftKey && index === 0
      ? candidates[lastIndex]
      : !event.shiftKey && index === lastIndex
        ? candidates[0]
        : null;
  if (!target) return false; // Native browser traversal within the dialog.
  event.preventDefault();
  target.focus({ preventScroll: true });
  return true;
}

// Intentionally intercept Enter only after the input method commits its text.
 // During IME composition, Enter belongs to the candidate picker, not to setup.
export function shouldSubmitFirstRunEnter(event) {
  return event?.key === "Enter" && event.isComposing !== true && event.keyCode !== 229;
}
