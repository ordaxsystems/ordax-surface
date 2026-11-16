import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const read = name => readFile(new URL("../system/surface/ui/" + name, import.meta.url), "utf8");

test("Store ignores identical signed catalog emissions without erasing lifecycle receipts", async () => {
  const source = await read("store-overview-controls.mjs");
  const start = source.indexOf("  const unsubscribeCatalog = catalog.subscribe((next) => {");
  const end = source.indexOf("\n  const unsubscribeRender =", start);
  assert.ok(start >= 0 && end > start);
  let listener, paints = 0, reconciles = 0, cancels = 0;
  const initial = { state: "ready", entries: [{ appId: "studio", availableVersion: "1" }] };
  const state = runInNewContext([
    'let snapshot = { state: "ready", entries: [{ appId: "studio", availableVersion: "1" }] };',
    'let catalogFingerprint = JSON.stringify(snapshot);',
    'let pendingRequest = null, requestMessageId = "store.request.install.accepted", requestReason = null;',
    'let removalConfirmationAppId = null, batchPresentationGeneration = 0, batchReport = null;',
    'const uncertainRequestIds = new Map();',
    'const acceptedRequests = new Map([["studio", { operation: "install", candidateSignature: "signed" }]]);',
    'const catalog = { subscribe(callback) { register(callback); return () => {}; } };',
    'const updateAll = { cancelPending() { onCancel(); } };',
    'const validateAppStoreCatalogSnapshot = x => x;',
    'const sameLifecycleCandidate = () => true;',
    'const reconcileAcceptedRequest = () => onReconcile();',
    'const render = () => onRender();',
    source.slice(start,end),
    '({ read: () => ({ snapshot, requestMessageId, accepted: [...acceptedRequests.keys()], batchPresentationGeneration }) })'
  ].join("\n"),{
    register(fn){listener=fn;},onCancel(){cancels++;},onReconcile(){reconciles++;},onRender(){paints++}
  });
  listener({ state: "ready", entries: [{ appId: "studio", availableVersion: "1" }] });
  assert.deepEqual({paints,reconciles,cancels},{paints:0,reconciles:0,cancels:0});
  assert.equal(state.read().requestMessageId,"store.request.install.accepted");
  assert.equal(state.read().accepted[0],"studio");
  listener({ state: "ready", entries: [{ appId: "studio", availableVersion: "2" }] });
  assert.deepEqual({paints,reconciles,cancels},{paints:1,reconciles:1,cancels:0});
  listener({ state: "error", entries: [] });
  assert.deepEqual({paints,reconciles,cancels},{paints:2,reconciles:2,cancels:1},
    "catalog outage must continue to revoke UI actions and cancel batch");
  assert.equal(state.read().snapshot.state,"error");
  assert.equal(state.read().accepted[0],"studio","outage is not proof of installation");
});

test("Native Store does not reconstruct hidden or inactive app windows", async () => {
  const source = await read("store-overview-controls.mjs");
  const start = source.indexOf("  const render = () => {");
  const end = source.indexOf("    const searchField =",start);
  assert.ok(start>=0 && end>start);
  let windowNode = { hidden: true, dataset: { active: "false" } };
  const slot = { tag: "mounted" };
  let slotReads = 0;
  const sut = runInNewContext([
    'let destroyed = false, mountedSlot = null;',
    'const STORE_WINDOW_SELECTOR = "[data-window-id=store]";',
    'const STORE_EXTENSION_SELECTOR = "[data-app-extension=store-overview]";',
    'const resolveSlot = () => { slotRead(); return slot; };',
    'const root = { querySelector: () => currentWindow() };',
    'const slot = currentSlot();',
    source.slice(start,end) + "\n  };",
    '({ render, current: () => mountedSlot })'
  ].join("\n"),{currentWindow:()=>windowNode,currentSlot:()=>slot,slotRead:()=>slotReads++});
  sut.render();
  assert.equal(sut.current(),slot);
  windowNode={hidden:false,dataset:{active:"false"}};
  sut.render();
  assert.equal(sut.current(),slot);
  assert.equal(slotReads,2);
  assert.match(source,/const unsubscribeRender = lifecycle\.subscribeRender\(render\)/,
    "focus lifecycle still repaints latest catalog");
  assert.match(source,/windowNode\.hidden \|\| windowNode\.dataset\.active === "false"/);
});

test("Space switcher retains one trigger icon and label nodes across presentation updates", async () => {
  const source = await read("space-switcher-controls.mjs");
  const triggerSetup = source.slice(source.indexOf('  const control = element("div", "ordax-space-switcher");'),
    source.indexOf('  let open = false;'));
  const render = source.slice(source.indexOf("  const render = () => {"),
    source.indexOf("    trigger.dataset.profileConfigured",source.indexOf("  const render = () => {")));
  assert.match(triggerSetup,/trigger\.append\(mark, label, chevron\)/);
  assert.match(triggerSetup,/mark\.innerHTML =/);
  assert.match(triggerSetup,/label\.append\(title, kicker\)/);
  assert.doesNotMatch(render,/trigger\.replaceChildren\(/);
  assert.doesNotMatch(render,/mark\.innerHTML =/);
  assert.match(render,/if \(title\.textContent !== nextTitle\) title\.textContent = nextTitle/);
  assert.match(render,/if \(kicker\.textContent !== nextKicker\) kicker\.textContent = nextKicker/);
  assert.match(source,/restoreTransientActionFocus\(hadMenuFocus, null, trigger\)/,
    "focus fallback survives identity revocation");
});
