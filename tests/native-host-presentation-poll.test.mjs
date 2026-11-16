import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { sameHostPresentationSnapshot } from "../system/surface/ui/host-presentation-snapshot.mjs";

const read = name => readFile(new URL("../system/surface/ui/" + name, import.meta.url), "utf8");

test("host presentation ignores equivalent heartbeat objects but retains capability revocations", () => {
  const before = { connectivity: "online", capabilityIds: ["wifi", "audio"] };
  assert.equal(sameHostPresentationSnapshot(before, { connectivity: "online", capabilityIds: ["wifi", "audio"] }), true);
  assert.equal(sameHostPresentationSnapshot(before, { connectivity: "offline", capabilityIds: ["wifi", "audio"] }), false);
  assert.equal(sameHostPresentationSnapshot(before, { connectivity: "online", capabilityIds: ["wifi"] }), false);
  assert.equal(sameHostPresentationSnapshot(before, { connectivity: "online", capabilityIds: ["audio", "wifi"] }), false);
  assert.equal(sameHostPresentationSnapshot(null, before), false);
  assert.equal(sameHostPresentationSnapshot(before, { connectivity: "online", capabilityIds: null }), false);
});

test("Settings/System retain latest host snapshot and only repaint changed presentation", async () => {
  for (const name of ["settings-overview-controls.mjs", "system-overview-controls.mjs"]) {
    const source = await read(name);
    const start = source.indexOf("  const unsubscribeHost = hostPort.subscribe((snapshot) => {");
    const end = source.indexOf("\n  });", start);
    assert.ok(start >= 0 && end > start, name);
    const body = source.slice(start, end);
    assert.match(body, /const nextSnapshot = validateSurfaceSnapshot\(snapshot\)/);
    assert.match(body, /const presentationChanged = !sameHostPresentationSnapshot\(hostSnapshot, nextSnapshot\)/);
    assert.match(body, /hostSnapshot = nextSnapshot;/);
    assert.match(body, /if \(presentationChanged\) replaceView\(\);/);
  }
});

test("Settings network poll starts on focus, stops on section exit and never duplicates timers", async () => {
  const source = await read("settings-overview-controls.mjs");
  const start = source.indexOf("  const networkWindowIsActive = () => {");
  const end = source.indexOf("\n  const runNetworkAction = async ", start);
  assert.ok(start >= 0 && end > start, "exercise the actual polling code");
  const timers = new Map();
  let nextId = 0;
  let readCount = 0;
  const harness = runInNewContext([
    'let destroyed = false, activeSection = "appearance", networkPoll = null;',
    'let visible = true, focused = true, present = true;',
    'const SETTINGS_WINDOW_SELECTOR = "[data-window-id=settings]";',
    'const networkPort = {}, networkManagementPort = {};',
    'const findSlot = () => present ? { closest: () => ({ hidden: !visible, dataset: { active: focused ? "true" : "false" } }) } : null;',
    'const refreshNetwork = () => { readStatus(); };',
    'const refreshNetworkManagement = () => { readManagement(); };',
    source.slice(start, end),
    '({ section(x) { activeSection = x; }, visible(x) { visible = x; }, focused(x) { focused = x; }, present(x) { present = x; }, syncNetworkPoll, stop() { destroyed = true; syncNetworkPoll(); } })',
  ].join("\n"), {
    setInterval(fn, delay) { assert.equal(delay, 5000); const id = ++nextId; timers.set(id, fn); return id; },
    clearInterval(id) { timers.delete(id); },
    readStatus() { readCount++; },
    readManagement() { readCount++; },
  });

  harness.syncNetworkPoll();
  assert.equal(timers.size, 0, "unopened Network has no background timer");
  harness.section("network");
  harness.syncNetworkPoll();
  assert.equal(timers.size, 1);
  assert.equal(readCount, 2, "newly focused Network reads both ports once");
  harness.syncNetworkPoll();
  assert.equal(timers.size, 1, "no duplicate interval on repeated renders");
  assert.equal(readCount, 2, "repaint does not issue duplicate network reads");
  [...timers.values()][0]();
  assert.equal(readCount, 4);
  harness.focused(false);
  harness.syncNetworkPoll();
  assert.equal(timers.size, 0, "unfocused Network stops polling");
  harness.focused(true);
  harness.syncNetworkPoll();
  assert.equal(timers.size, 1);
  assert.equal(readCount, 6);
  harness.visible(false);
  harness.syncNetworkPoll();
  assert.equal(timers.size, 0, "minimized Settings stops polling");
  harness.visible(true);
  harness.syncNetworkPoll();
  assert.equal(timers.size, 1);
  harness.section("security");
  harness.syncNetworkPoll();
  assert.equal(timers.size, 0, "leaving Network stops polling");
  harness.section("network");
  harness.present(false);
  harness.syncNetworkPoll();
  assert.equal(timers.size, 0, "unmounted slot never starts a poll");
  harness.present(true);
  harness.syncNetworkPoll();
  assert.equal(timers.size, 1);
  harness.stop();
  assert.equal(timers.size, 0, "destroyed Settings has no timer");
  assert.match(source, /renderView\(sectionChanged\);\s*syncNetworkPoll\(\);/);
  assert.match(source, /if \(networkPoll !== null\) clearInterval\(networkPoll\);/);
});
