import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
const source = await readFile(
  new URL("../system/surface/ui/surface.mjs", import.meta.url), "utf8",
);
function excerpt(start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, "missing production Surface code: " + start);
  return source.slice(a, b);
}
const overlayCode = excerpt(
  "  const syncLauncherVisibility = () => {",
  "  const renderConnectivityOnly = () => {",
);
const dispatchCode = excerpt(
  "  const dispatch = (action) => {",
  "  let launcherOpener = null;",
);

// The canonical OS app registry is supplied by composition, not duplicated
// inside Surface. Exercise the real reducer source with isolated collaborators
// instead of importing absent OS-owned modules into a standalone Surface test.
const stateSource = await readFile(
  new URL("../system/surface/ui/surface-state.mjs", import.meta.url), "utf8",
);
const defaultAppRuntimeCatalog = Object.freeze({});
const { reduceSurfaceState, freezeState } = runInNewContext(
  stateSource.slice(stateSource.indexOf("function freezeWindow("), stateSource.indexOf("function activeFallback("))
  + stateSource.slice(stateSource.indexOf("export function reduceSurfaceState("))
      .replace(/^export /, "")
  + "\n({ reduceSurfaceState, freezeState })",
  {
    defaultAppRuntimeCatalog,
    assertAppRuntimeCatalog() {},
    recoverArea: (area) => area,
    setPreferenceValue: (preferences, id, value) =>
      preferences[id] === value ? preferences : { ...preferences, [id]: value },
  },
);

function initialState() {
  return freezeState({
    launcherOpen: false,
    presentation: "central", sidebarMode: "expanded",
    connectivity: "online", capabilityIds: ["network.status"],
    activeAreaId: "area-1", nextAreaOrdinal: 2,
    areas: [{
      id: "area-1", ordinal: 1, windows: [],
      activeWindowId: null, nextWindowOrdinal: 1,
    }],
    preferences: {},
  });
}

test("canonical reducer limits launcher toggle/close to launcherOpen and preserves no-op identity", () => {
  const initial = initialState();
  const opened = reduceSurfaceState(initial, { type: "launcher.toggle" });
  assert.equal(opened.launcherOpen, true);
  for (const key of Object.keys(initial).filter(key => key !== "launcherOpen")) {
    assert.deepEqual(opened[key], initial[key], key + " stays identical in value");
  }
  assert.equal(opened.capabilityIds.length, 1);
  assert.equal(opened.areas[0].windows.length, 0);
  assert.strictEqual(opened.capabilityIds, initial.capabilityIds,
    "immutable capability IDs cannot be copied on overlay changes");
  assert.strictEqual(opened.areas, initial.areas,
    "immutable workspace windows cannot be copied on overlay changes");
  assert.strictEqual(opened.preferences, initial.preferences,
    "unchanged preferences must not appear modified or be persisted");
  assert.ok(Object.isFrozen(opened.preferences));
  const closed = reduceSurfaceState(opened, { type: "launcher.close" });
  assert.equal(closed.launcherOpen, false);
  assert.strictEqual(reduceSurfaceState(closed, { type: "launcher.close" }), closed,
    "already closed must not repaint");
  assert.equal(reduceSurfaceState(closed, { type: "launcher.toggle" }).launcherOpen, true);
});

test("launcher visibility projection is idempotent, updates all toggles and still notifies Native listeners", () => {
  let hidden = false;
  let visibilityWrites = 0;
  const launcher = {
    get hidden() { return hidden; },
    set hidden(value) { hidden = value; visibilityWrites++; },
  };
  const toggles = Array.from({ length: 2 }, () => ({
    attrs: new Map(), writes: 0,
    getAttribute(key) { return this.attrs.get(key) ?? null; },
    setAttribute(key, value) { this.writes++; this.attrs.set(key, value); },
  }));
  const queries = [];
  const root = { querySelectorAll(selector) {
    queries.push(selector);
    assert.equal(selector, "[data-launcher-toggle]");
    return toggles;
  }};
  const state = { ...initialState() };
  let notifications = 0;
  const run = runInNewContext(
    overlayCode + "\nrenderLauncherVisibilityOnly",
    {
      launcher, root, state,
      syncHidden(node, value) { if (node.hidden !== value) node.hidden = value; },
      syncAttribute(node, name, value) {
        if (node.getAttribute(name) !== value) node.setAttribute(name, value);
      },
      renderListeners: new Set([() => notifications++]),
    },
  );
  run();
  assert.equal(hidden, true);
  assert.deepEqual(toggles.map(t => t.getAttribute("aria-expanded")), ["false", "false"]);
  const writes = visibilityWrites + toggles.reduce((s, t) => s + t.writes, 0);
  run();
  assert.equal(visibilityWrites + toggles.reduce((s, t) => s + t.writes, 0), writes,
    "same projection never reassigns DOM state");
  state.launcherOpen = true;
  run();
  assert.equal(hidden, false);
  assert.deepEqual(toggles.map(t => t.getAttribute("aria-expanded")), ["true", "true"]);
  assert.equal(notifications, 3, "Native observers continue receiving state update notifications");
  state.launcherOpen = false;
  run();
  assert.equal(hidden, true);
  assert.equal(notifications, 4);
  assert.equal(queries.length, 4);
});

test("real dispatch keeps launcher actions out of global catalog/window reconciliation", () => {
  const calls = [];
  const context = {
    state: initialState(),
    catalog: defaultAppRuntimeCatalog,
    localization: { getLocale: () => "pt-BR" },
    preferencePersistence: { save() { calls.push("save"); } },
    preferenceDispatching: false,
    preferenceListeners: new Set([() => calls.push("preference-notify")]),
    workspacePort: null,
    WORKSPACE_PERSIST_ACTIONS: new Set(),
    getActiveArea: () => ({ activeWindowId: null }),
    reduceSurfaceState,
    renderLauncherVisibilityOnly() { calls.push("visibility"); },
    isConnectivityOnlyHostUpdate() { return false; },
    renderConnectivityOnly() { calls.push("connectivity"); },
    render() { calls.push("full"); },
  };
  const dispatch = runInNewContext(dispatchCode + "\ndispatch", context);
  dispatch({ type: "launcher.toggle" });
  assert.equal(context.state.launcherOpen, true);
  assert.deepEqual(calls, ["visibility"]);
  dispatch({ type: "launcher.close" });
  assert.equal(context.state.launcherOpen, false);
  assert.deepEqual(calls, ["visibility", "visibility"]);
  dispatch({ type: "launcher.close" });
  assert.equal(calls.length, 2, "a no-op close never paints");
  dispatch({ type: "app.catalog.sync" });
  assert.deepEqual(calls, ["visibility", "visibility", "full"],
    "catalog changes continue their existing full path");
  assert.equal(context.state.capabilityIds[0], "network.status");
  assert.equal(context.state.areas[0].windows.length, 0);

  dispatch({ type: "preference.set", preferenceId: "theme", value: "dark" });
  assert.deepEqual(calls, ["visibility", "visibility", "full", "save", "full", "preference-notify"],
    "real preference changes still persist and notify");
  assert.equal(context.state.preferences.theme, "dark");
  dispatch({ type: "preference.set", preferenceId: "theme", value: "dark" });
  assert.equal(calls.length, 6, "repeated identical preference value is a no-op");
});

test("full render uses the same overlay projection, while keyboard focus and authorization remain intact", () => {
  const fullRender = excerpt(
    "  const render = (action = null, previousLocale = null, previousActiveWindowId = null) => {",
    "  const dispatch = (action) => {",
  );
  assert.match(fullRender, /\bsyncLauncherVisibility\(\);/);
  assert.match(source, /const openLauncher = \(trigger = null\) => \{[\s\S]*?launcherQuery\.focus\(\{ preventScroll: true \}\);\s*launcherQuery\.select\(\)/);
  assert.match(source, /event\.key === "Escape" && state\.launcherOpen[\s\S]*?launcherOpener\?\.isConnected[\s\S]*?opener\.focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /const app = catalog\.get\(appId\);[\s\S]*?!catalog\.isAvailable\(app, state\.capabilityIds\)/);
  assert.doesNotMatch(overlayCode, /catalog\.(list|get|isAvailable)|renderWindows\(|renderDock\(|renderHome/);
  assert.match(source, /if \(renderPlan\.catalog\) renderLauncher\(\)/);
  assert.match(source, /isConnectivityOnlyHostUpdate\(action, previousState, state\)/);
});
