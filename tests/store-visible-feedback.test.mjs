import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Store displays operation receipts before the catalog, not beyond all app cards", async () => {
  const ui=await readFile(new URL("../system/surface/ui/store-overview-controls.mjs",import.meta.url),"utf8");
  const render=ui.slice(ui.indexOf("  const render = () => {"),ui.indexOf("  const onInput = (event) => {"));
  const header=render.indexOf("main.append(header)");
  const receipt=render.indexOf('message.dataset.storeRequestMessage = "true"');
  const batch=render.indexOf('status.dataset.storeUpdateAllStatus = state');
  const grid=render.indexOf('const grid = node(documentObject, "div", "ordax-store-grid")');
  const security=render.indexOf('security.dataset.storeAuthority = "none"');
  assert.ok(header>=0 && receipt>header && batch>receipt && grid>batch && security>grid);
  assert.equal((render.match(/status\.dataset\.storeUpdateAllStatus = state/g)??[]).length,1);
  assert.equal((render.match(/message\.dataset\.storeRequestMessage = "true"/g)??[]).length,1);
  assert.match(render,/message\.setAttribute\("aria-live", "polite"\)/);
  assert.match(render,/status\.setAttribute\("aria-atomic", "true"\)/);
  assert.match(render,/t\("store\.updateAll\.explanation"\)/);
  assert.match(render,/t\("store\.security\.note"\)/);
});

test("Missing host lifecycle explicitly disables Store actions without fallback delegation", async()=>{
  const ui=await readFile(new URL("../system/surface/ui/store-overview-controls.mjs",import.meta.url),"utf8");
  assert.match(ui,/snapshot\.state === "ready" && activeView !== "models"\s*&& \(lifecycleRequests === null \|\| requestSessionId === null\)/);
  assert.match(ui,/t\("store\.action\.unavailable"\)/);
  assert.match(ui,/unavailable\.dataset\.storeFeedbackState = "attention"/);
  assert.match(ui,/button\.disabled = lifecycleRequests === null \|\| !requestIdentityReady \|\| pendingRequest !== null/);
  assert.doesNotMatch(ui,/\b(?:installComponent|fakeInstall|temporaryLifecycle)\s*\(/);
});

test("Store feedback uses existing semantic Meridian tokens for caution", async()=>{
  const css=await readFile(new URL("../system/surface/ui/store.css",import.meta.url),"utf8");
  assert.match(css,/\.ordax-store-request-status,/);
  assert.match(css,/\.ordax-store-action-unavailable/);
  assert.match(css,/\.ordax-store-request-status\[data-store-feedback-state="attention"\]/);
  assert.match(css,/var\(--ordax-warning-bg\)/);
  assert.match(css,/var\(--ordax-warning\)/);
  assert.doesNotMatch(css,/#(?:[0-9a-f]{3}|[0-9a-f]{6})(?![0-9a-f])/i);
});
