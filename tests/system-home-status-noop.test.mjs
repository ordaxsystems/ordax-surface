import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const read = file => readFile(new URL("../system/surface/ui/" + file, import.meta.url), "utf8");

test("System validates repeated host updates without repaint or history fetch", async () => {
  const source = await read("system-overview-controls.mjs");
  const begin = source.indexOf("  const unsubscribeUpdate = updatePort?.subscribe((snapshot) => {");
  const end = source.indexOf("\n  refreshVisibleSection();", begin);
  assert.ok(begin >= 0 && end > begin);
  let callback, validated = 0, repaints = 0, history = 0;
  const h = runInNewContext([
    'let updateSnapshot = { status: "running", lastAppliedSha: "a" };',
    'let updateFingerprint = JSON.stringify(updateSnapshot);',
    'let historyPrimed = true;',
    'const updatePort = { subscribe(fn) { register(fn); return () => {}; } };',
    'const validateUpdateStatusSnapshot = x => { countValidation(); return x; };',
    'const replaceView = () => countRepaint();',
    'const historyPort = {};',
    'const refreshVisibleSection = () => countHistory();',
    source.slice(begin,end),
    '({ read: () => ({ updateSnapshot, historyPrimed }) })',
  ].join("\n"), {
    register(fn) { callback = fn; },
    countValidation() { validated++; },
    countRepaint() { repaints++; },
    countHistory() { history++; },
  });
  callback({ status: "running", lastAppliedSha: "a" });
  assert.deepEqual([validated,repaints,history],[1,0,0]);
  callback({ status: "checking", lastAppliedSha: "a" });
  assert.deepEqual([validated,repaints,history],[2,1,0]);
  callback({ status: "checking", lastAppliedSha: "a" });
  assert.deepEqual([validated,repaints,history],[3,1,0]);
  callback({ status: "applied", lastAppliedSha: "b" });
  assert.deepEqual([validated,repaints,history],[4,2,1]);
  assert.equal(h.read().historyPrimed,false);
  callback({ status: "applied", lastAppliedSha: "b" });
  assert.deepEqual([validated,repaints,history],[5,2,1]);
});

test("Home indicators only write changed text and state while reading current ports", async () => {
  const source = await read("home-status.mjs");
  assert.match(source,/if \(element\.textContent !== item\.text\) element\.textContent = item\.text/);
  assert.match(source,/if \(element\.dataset\.state !== item\.state\) element\.dataset\.state = item\.state/);
  assert.match(source,/if \(connection\.textContent !== nextMessage\) connection\.textContent = nextMessage/);
  assert.match(source,/if \(connection\.dataset\.state !== connectionState\) connection\.dataset\.state = connectionState/);
  assert.match(source,/if \(note\.textContent !== nextMessage\) note\.textContent = nextMessage/);
  assert.match(source,/state\.account = validateIdentitySessionSnapshot\(identityPort\.getSnapshot\(\)\)/);
  assert.match(source,/state\.sync = validateSyncRuntimeSnapshot\(syncPort\.getSnapshot\(\)\)/);
});