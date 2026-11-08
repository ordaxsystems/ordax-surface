import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = await readFile(
  new URL("../system/surface/ui/store-overview-controls.mjs", import.meta.url), "utf8",
);
const actionsStart = source.indexOf("function operationAllowed(entry, operation) {");
const actionsEnd = source.indexOf("function versionSummary(", actionsStart);
const reconcilerStart = source.indexOf("  const reconcileAcceptedRequest = () => {");
const reconcilerEnd = source.indexOf("\n  const refreshResults = () => {", reconcilerStart);
const onClickStart = source.indexOf("  const onClick = (event) => {");
const onClickEnd = source.indexOf("\n  const focusStoreCatalogReturn =", onClickStart);
const appendStart = source.indexOf("function appendAction(");
const appendEnd = source.indexOf("\nfunction appMonogram(", appendStart);
assert.ok(actionsStart >= 0 && actionsEnd > actionsStart);
assert.ok(reconcilerStart >= 0 && reconcilerEnd > reconcilerStart);
assert.ok(onClickStart >= 0 && onClickEnd > onClickStart);
assert.ok(appendStart >= 0 && appendEnd > appendStart);

const entry = (appId, availableVersion = "1.0") => ({
  appId, state: "available", installedVersion: null, availableVersion,
  installable: true, updatable: false, removable: false,
  artifactIdentityVerified: true, provenanceVerified: true,
});
function harness() {
  const appA = entry("studio");
  const appB = entry("gallery");
  const catalog = { state: "ready", entries: [appA, appB] };
  const sent = [];
  let resolveNext = null;
  let defer = false;
  const focus = [];
  const context = {
    snapshot: catalog,
    mountedSlot: { contains: () => true },
    activeView: "discover", selectedAppId: null, batchInFlight: false,
    updateAll: null, requestSessionId: "c".repeat(32),
    pendingRequest: null, requestMessageId: null, requestReason: null,
    requestOrdinal: 0, removalConfirmationAppId: null, destroyed: false,
    uncertainRequestIds: new Map(), acceptedRequests: new Map(),
    OPERATIONS: new Set(["install", "update", "remove"]),
    APP_LIFECYCLE_REQUEST_SCHEMA: "ordax.app-lifecycle-request/1",
    validateAppLifecycleRequest(request) {
      assert.equal(request.authority, "none");
      assert.equal(request.operation, "install");
      return request;
    },
    validateAppLifecycleRequestResultForRequest(raw, request) {
      assert.equal(raw.requestId, request.requestId, "reply must match request identity");
      assert.ok(["accepted", "rejected"].includes(raw.state));
      return raw;
    },
    lifecycleRequests: {
      requestLifecycle(request) {
        sent.push(request);
        if (defer) {
          return new Promise(resolve => { resolveNext = () => resolve({
            state: "accepted", requestId: request.requestId,
          }); });
        }
        return Promise.resolve({ state: "accepted", requestId: request.requestId });
      },
    },
    render() {},
    makeButton(_doc, _class, label, datasetKey, datasetValue) {
      return {
        dataset: { [datasetKey]: datasetValue },
        label, disabled: false,
      };
    },
    t: id => id,
  };
  const compiled = [
    source.slice(actionsStart, actionsEnd),
    source.slice(appendStart, appendEnd),
    source.slice(reconcilerStart, reconcilerEnd),
    source.slice(onClickStart, onClickEnd),
    "({ onClick, reconcileAcceptedRequest, requestForEntry, appendAction })",
  ].join("\n");
  const handlers = runInNewContext(compiled, context);
  const click = (appId) => {
    const button = { dataset: { storeAppId: appId, storeOperation: "install" } };
    handlers.onClick({ target: {
      closest(selector) {
        return selector === "[data-store-operation][data-store-app-id]" ? button : null;
      },
    } });
  };
  const action = (app, targetRequest = handlers.requestForEntry(app)) => {
    const target = { append(button) { focus.push(button); } };
    handlers.appendAction({}, target, app, "install", context.lifecycleRequests,
      targetRequest, context.t, true);
    return focus.at(-1);
  };
  const state = () => ({
    pending: context.pendingRequest?.phase ?? null,
    accepted: [...context.acceptedRequests.keys()],
    messages: context.requestMessageId,
    sent: sent.map(request => request.appId),
  });
  return { appA, appB, catalog, context, handlers, click, action, state,
    sent, defer(value) { defer = value; },
    resolve() { resolveNext?.(); }, };
}
async function flush() { await new Promise(resolve => setImmediate(resolve)); }

test("Host-accepted install never globally freezes unrelated Store apps", async () => {
  const h = harness();
  h.defer(true);
  h.click("studio");
  assert.equal(h.state().pending, "requesting");
  assert.equal(h.action(h.appB).disabled, true, "a write in flight still locks other actions");
  await flush();
  assert.deepEqual(h.state().sent, ["studio"]);
  h.resolve();
  await flush();

  assert.equal(h.state().pending, null, "validated acknowledgement releases global lock");
  assert.deepEqual(h.state().accepted, ["studio"]);
  assert.equal(h.action(h.appA).disabled, true, "accepted candidate is not submitted twice");
  assert.equal(h.action(h.appB).disabled, false, "unrelated app can be installed");
  assert.equal(h.handlers.requestForEntry(h.appA).phase, "accepted");
  assert.equal(h.handlers.requestForEntry(h.appB), null);
  h.click("studio");
  await flush();
  assert.deepEqual(h.state().sent, ["studio"], "even stale button events cannot resubmit A");
  h.defer(false);
  h.click("gallery");
  await flush();
  assert.deepEqual(h.state().sent, ["studio", "gallery"], "B may proceed independently");
  assert.deepEqual(h.state().accepted, ["studio", "gallery"],
    "accepted states are retained separately without pretending installation");
  assert.equal(h.context.requestMessageId, "store.request.install.accepted");
});

test("Accepted Store receipts are invalidated only by authoritative catalog candidate changes", async () => {
  const h = harness();
  h.click("studio");
  await flush();
  assert.deepEqual(h.state().accepted, ["studio"]);

  h.catalog.entries = [h.appA, entry("gallery", "2.0")];
  h.handlers.reconcileAcceptedRequest();
  assert.deepEqual(h.state().accepted, ["studio"],
    "unrelated app version changes cannot invalidate Studio's acceptance");

  h.catalog.state = "error";
  h.handlers.reconcileAcceptedRequest();
  assert.deepEqual(h.state().accepted, ["studio"],
    "catalog outage is not proof of accepted request completion");

  h.catalog.state = "ready";
  h.catalog.entries = [entry("studio", "2.0"), entry("gallery", "2.0")];
  h.handlers.reconcileAcceptedRequest();
  assert.deepEqual(h.state().accepted, [],
    "new OS catalog candidate revokes old receipt, allowing a new operation");
  assert.equal(h.action(h.catalog.entries[0]).disabled, false);
  h.click("studio");
  await flush();
  assert.deepEqual(h.state().sent, ["studio", "studio"]);
  assert.notEqual(h.sent[0].requestId, h.sent[1].requestId,
    "new candidate uses a fresh lifecycle request identity");
});

test("Store keeps pending and accepted semantics separate without a new inventory", () => {
  assert.match(source, /const acceptedRequests = new Map\(\)/);
  assert.match(source, /const requestForEntry = \(entry\) => \{/);
  assert.match(source, /batchInFlight \? \{ appId: "", operation: "update" \} : pendingRequest/);
  assert.match(source, /requestForEntry\(selectedEntry\)/);
  assert.match(source, /requestForEntry\(entry\)/);
  assert.match(source, /acceptedRequests\.has\(appId\)/);
  assert.match(source, /acceptedRequests\.set\(appId, Object\.freeze\(/);
  assert.match(source, /pendingRequest = null;/);
  assert.match(source, /acceptedRequests\.clear\(\)/);
  assert.doesNotMatch(source, /fakeInstall|simulateInstalled|forceInstall/);
});
