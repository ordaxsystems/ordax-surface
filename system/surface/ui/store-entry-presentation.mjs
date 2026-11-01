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
