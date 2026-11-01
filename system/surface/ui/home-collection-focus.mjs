// Presentation-only keyboard recovery for Native Home sections rendered
// from OS-owned snapshots. A removed item is never replaced by a different
// actionable item simply because the collection's order changed.
export function restoreHomeCollectionFocus(homePanel, previouslyFocused, candidate = null) {
  if (!previouslyFocused) return false;
  const valid = (node) => Boolean(node && !node.disabled && !node.hidden
    && !node.closest?.("[hidden], [inert]") && typeof node.focus === "function");
  const restored = valid(candidate);
  const target = restored ? candidate : homePanel?.querySelector?.(".ordax-home-search");
  if (!valid(target)) return false;
  target.focus({ preventScroll: true });
  return restored;
}
