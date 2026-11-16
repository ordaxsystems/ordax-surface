import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const ui = (name) => new URL("../system/surface/ui/" + name, import.meta.url);

test("identical host heartbeats do not rebuild Native Surface state", async () => {
  const source = await readFile(ui("surface-state.mjs"), "utf8");
  const start = source.indexOf('    case "host.snapshot": {');
  const end = source.indexOf("    default:", start);
  assert.ok(start >= 0 && end > start, "test must exercise the actual reducer case");

  let freezes = 0;
  const reduceHostSnapshot = runInNewContext([
    "(state, action) => { switch (action.type) {",
    source.slice(start, end),
    "default: return state; } }",
  ].join("\n"), {
    validateSurfaceSnapshot(snapshot) { return snapshot; },
    freezeState(next) { freezes += 1; return Object.freeze(next); },
  });

  const state = Object.freeze({
    connectivity: "online",
    capabilityIds: Object.freeze(["network.status", "network.manage"]),
    launcherOpen: false,
  });
  const same = reduceHostSnapshot(state, {
    type: "host.snapshot",
    snapshot: { connectivity: "online", capabilityIds: ["network.status", "network.manage"] },
  });
  assert.strictEqual(same, state, "new heartbeat objects must preserve state identity");
  assert.equal(freezes, 0, "identical observation does not freeze/copy/render");

  const offline = reduceHostSnapshot(state, {
    type: "host.snapshot",
    snapshot: { connectivity: "offline", capabilityIds: ["network.status", "network.manage"] },
  });
  assert.notStrictEqual(offline, state);
  assert.equal(offline.connectivity, "offline");
  const revoked = reduceHostSnapshot(state, {
    type: "host.snapshot",
    snapshot: { connectivity: "online", capabilityIds: ["network.status"] },
  });
  assert.equal(revoked.capabilityIds.length, 1);
  const granted = reduceHostSnapshot(state, {
    type: "host.snapshot",
    snapshot: { connectivity: "online", capabilityIds: ["network.status", "network.manage", "new.capability"] },
  });
  assert.equal(granted.capabilityIds.length, 3);
  const reordered = reduceHostSnapshot(state, {
    type: "host.snapshot",
    snapshot: { connectivity: "online", capabilityIds: ["network.manage", "network.status"] },
  });
  assert.notStrictEqual(reordered, state, "order changes conservatively trigger a reconciliation");
  assert.equal(freezes, 4);
});

test("Native launcher, windows and dock reuse indexed DOM nodes", async () => {
  const source = await readFile(ui("surface.mjs"), "utf8");
  const section = (start, end) => {
    const first = source.indexOf(start);
    const last = source.indexOf(end, first + start.length);
    assert.ok(first >= 0 && last > first, start);
    return source.slice(first, last);
  };
  const launcher = section("  const renderLauncher = () => {", "  const renderWindows = () => {");
  const windows = section("  const renderWindows = () => {", "  const renderDock = () => {");
  const dock = section("  const renderDock = () => {", "  const renderHomeAssistant = () => {");
  assert.match(launcher, /const existingButtons = new Map\(\)/);
  assert.doesNotMatch(launcher, /Array\.from\(appLauncher\.children\)\.find/);
  assert.match(launcher, /!retained\.has\(focusedButton\)/, "removed app restores keyboard focus");
  assert.match(windows, /const existingWindows = new Map\(\)/);
  assert.doesNotMatch(windows, /Array\.from\(windowLayer\.children\)\.find/);
  assert.match(dock, /const existingRunningButtons = new Map\(\)/);
  assert.doesNotMatch(dock, /Array\.from\(runningApps\.children\)\.find/);
  assert.match(dock, /icon\.innerHTML !== ICONS\[app\.id\]/, "unchanged SVG icon is preserved");
});
