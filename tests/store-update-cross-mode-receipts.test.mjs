import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = await readFile(
  new URL("../system/surface/ui/store-overview-controls.mjs", import.meta.url),
  "utf8",
);
const operationStart = source.indexOf("function operationAllowed(entry, operation) {");
const operationEnd = source.indexOf("function versionSummary(", operationStart);
const receiptsStart = source.indexOf("  const reconcileAcceptedRequest = () => {");
const receiptsEnd = source.indexOf("  const refreshResults = () => {", receiptsStart);
const clickStart = source.indexOf("  const onClick = (event) => {");
const clickEnd = source.indexOf("  const focusStoreCatalogReturn =", clickStart);
assert.ok(operationStart >= 0 && operationEnd > operationStart);
assert.ok(receiptsStart >= 0 && receiptsEnd > receiptsStart);
assert.ok(clickStart >= 0 && clickEnd > clickStart);

function installed(appId, availableVersion = "2.0") {
  return {
    appId, state: "installed", installedVersion: "1.0", availableVersion,
    installable: false, updatable: true, removable: true,
    artifactIdentityVerified: true, provenanceVerified: true,
  };
}
function outcome(appId, state = "accepted", toVersion = "2.0") {
  return {
    appId, state, fromVersion: "1.0", toVersion,
    requestId: "store:update:" + appId + ":id",
    reason: null,
  };
}
function report(outcomes) {
  return {
    schema: "ordax.store-update-request-batch/1",
    authority: "none",
    state: "requests-processed",
    acceptedRequests: outcomes.filter(x => x.state === "accepted").length,
    rejectedRequests: outcomes.filter(x => x.state === "rejected").length,
    skippedRequests: outcomes.filter(x => x.state === "skipped").length,
    intendedCount: outcomes.length, outcomes,
  };
}
function fixture() {
  const catalog = {
    state: "ready",
    entries: [installed("studio"), installed("gallery")],
  };
  let submitCount = 0;
  let renderCount = 0;
  let result = report([outcome("studio")]);
  const ctx = {
    snapshot: catalog, acceptedRequests: new Map(), pendingRequest: null,
    batchInFlight: false, batchReport: null, batchPresentationGeneration: 0,
    mountedSlot: { contains: () => true },
    activeView: "updates", selectedAppId: null, destroyed: false,
    STORE_UPDATE_BATCH_SCHEMA: "ordax.store-update-request-batch/1",
    updateAll: {
      submitAvailableUpdates() { submitCount += 1; return Promise.resolve(result); },
      cancelPending() { return true; },
    },
    render() { renderCount += 1; },
    lifecycleRequests: { requestLifecycle() { throw Error("must not use individual request"); } },
    requestSessionId: "a".repeat(32),
    OPERATIONS: new Set(["install", "update", "remove"]),
  };
  const program = [
    source.slice(operationStart, operationEnd),
    source.slice(receiptsStart, receiptsEnd),
    source.slice(clickStart, clickEnd),
    "({ reconcileAcceptedRequest, hasAcceptedUpdateRequest, recordBatchAcceptedUpdates, onClick, requestForEntry })",
  ].join("\n");
  const handlers = runInNewContext(program, ctx);
  const clickUpdateAll = () => handlers.onClick({ target: {
    closest(selector) {
      return selector === "[data-store-update-all]" ? { dataset: { storeUpdateAll: "true" } } : null;
    },
  } });
  return {
    catalog, ctx, handlers, clickUpdateAll,
    setResult(value) { result = value; },
    get submitCount() { return submitCount; },
    get renderCount() { return renderCount; },
  };
}
async function flush() {
  await new Promise(resolve => setImmediate(resolve));
}

test("Accepted batch outcomes become per-app receipts, not installed claims", async () => {
  const h = fixture();
  h.clickUpdateAll();
  assert.equal(h.ctx.batchInFlight, true);
  await flush();
  assert.equal(h.submitCount, 1);
  assert.equal(h.ctx.batchInFlight, false);
  assert.deepEqual([...h.ctx.acceptedRequests.keys()], ["studio"]);
  const saved = h.ctx.acceptedRequests.get("studio");
  assert.equal(saved.operation, "update");
  assert.equal(saved.phase, "accepted");
  assert.equal(saved.requestId, outcome("studio").requestId);
  assert.equal(h.handlers.requestForEntry(h.catalog.entries[0]).phase, "accepted");
  assert.equal(h.handlers.requestForEntry(h.catalog.entries[1]), null,
    "unrelated update remains individually operable");
  assert.equal(h.catalog.entries[0].state, "installed", "a batch receipt never changes OS inventory");

  h.handlers.onClick({ target: { closest(selector) {
    return selector === "[data-store-operation][data-store-app-id]"
      ? { dataset: { storeOperation: "update", storeAppId: "studio" } } : null;
  } } });
  assert.equal(h.catalog.entries[0].state, "installed");
  assert.equal(h.ctx.acceptedRequests.size, 1);
});

test("Individually accepted update blocks unsafe bulk replay, not other individual apps", async () => {
  const h = fixture();
  h.ctx.acceptedRequests.set("studio", {
    appId: "studio", operation: "update", phase: "accepted", requestId: "old",
    candidateSignature: JSON.stringify([
      "studio", "update", "installed", "1.0", "2.0", true, true, true,
    ]),
  });
  assert.equal(h.handlers.hasAcceptedUpdateRequest(), true);
  h.clickUpdateAll();
  await flush();
  assert.equal(h.submitCount, 0, "UI refuses duplicate batch when one candidate already accepted");

  const gallery = h.handlers.requestForEntry(h.catalog.entries[1]);
  assert.equal(gallery, null, "unrelated app is not globally blocked");

  h.catalog.entries = [installed("studio", "3.0"), installed("gallery")];
  h.handlers.reconcileAcceptedRequest();
  assert.equal(h.handlers.hasAcceptedUpdateRequest(), false,
    "new verified candidate clears prior receipt");
  h.clickUpdateAll();
  await flush();
  assert.equal(h.submitCount, 1);
});

test("Batch outcomes never accept unverifiable, replaced, rejected or foreign candidates", () => {
  const h = fixture();
  h.handlers.recordBatchAcceptedUpdates(report([
    outcome("studio", "rejected"),
    outcome("gallery", "accepted", "9.0"),
    outcome("unknown"),
  ]));
  assert.equal(h.ctx.acceptedRequests.size, 0);
  h.handlers.recordBatchAcceptedUpdates({
    ...report([outcome("studio")]), authority: "all",
  });
  assert.equal(h.ctx.acceptedRequests.size, 0);
  h.handlers.recordBatchAcceptedUpdates(report([outcome("studio")]));
  assert.deepEqual([...h.ctx.acceptedRequests.keys()], ["studio"]);
  h.catalog.state = "unavailable";
  h.handlers.recordBatchAcceptedUpdates(report([outcome("gallery")]));
  assert.deepEqual([...h.ctx.acceptedRequests.keys()], ["studio"]);
  assert.equal(h.handlers.hasAcceptedUpdateRequest(), false,
    "unavailable catalog cannot claim an actionable update");
});

test("Native Store enforces bulk exclusion in both UI and event handler", () => {
  assert.match(source, /action\.disabled = updateAll === null \|\| batchInFlight \|\| pendingRequest !== null\s*\|\| hasAcceptedUpdateRequest\(\)/);
  assert.match(source, /action\.dataset\.storeUpdateAllBlocked = "accepted-individual-update"/);
  assert.match(source, /snapshot\.state === "ready" && !hasAcceptedUpdateRequest\(\)/);
  assert.match(source, /recordBatchAcceptedUpdates\(report\);/);
  assert.match(source, /STORE_UPDATE_BATCH_SCHEMA/);
  assert.match(source, /catalogPort: catalog,/,
    "Update All keeps the existing OS-owned catalog and batch authority");
  assert.match(source, /lifecycleRequestPort: lifecycleRequests,/);
  assert.doesNotMatch(source, /fakeInstall|simulateInstall|grantInstall/);
});
