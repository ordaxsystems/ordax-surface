// Presentation-only projection of the verified OS catalog. This module has
// no OS service imports so the behavior can be regression-tested standalone.
export const STORE_OPERATIONS = Object.freeze(["install", "update", "remove"]);

export function storeEntryVisualState(entry, pendingRequest = null) {
  const localRequest = pendingRequest?.appId === entry.appId
    && STORE_OPERATIONS.includes(pendingRequest.operation)
    && ["requesting", "accepted"].includes(pendingRequest.phase)
    ? pendingRequest : null;
  return Object.freeze({
    state: entry.state,
    updateAvailable: entry.state === "installed" && entry.updatable === true,
    blockedReason: entry.state === "blocked" ? entry.blockedReason : null,
    requestPhase: localRequest?.phase ?? null,
    requestOperation: localRequest?.operation ?? null,
  });
}

/** Present empty results without inventing catalog health or duplicating translations.
 *  All message IDs come from the OS-owned Store catalog. */
export function storeEmptyPresentation(totalEntries, visibleEntries, view, query = "") {
  if (visibleEntries > 0) return null;
  if (totalEntries === 0) return Object.freeze({
    reason: "catalog-empty",
    titleId: "store.empty.filtered",
    descriptionId: "store.section.description.discover",
  });
  if (query.trim().length > 0) return Object.freeze({
    reason: "search-empty",
    titleId: "store.empty.filtered",
    descriptionId: "store.empty.filteredDescription",
  });
  return Object.freeze({
    reason: "section-empty",
    titleId: "store.section." + view,
    descriptionId: "store.section.description." + view,
  });
}
