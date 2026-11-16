import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = await readFile(
  new URL("../system/surface/ui/surface.mjs", import.meta.url), "utf8",
);
function excerpt(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, "expected real Surface function: " + start);
  return source.slice(a, b);
}

test("focus and move bypass catalogs while full owner events remain comprehensive", () => {
  const plan = runInNewContext(
    excerpt("function nativeRenderPlan(", "function areaLabel(") + "\nnativeRenderPlan",
  );
  const projection = value => ({
    catalog: value.catalog,
    windows: value.windows,
    focusedWindow: value.focusedWindow,
    movedWindow: value.movedWindow,
  });
  const expected = (catalog, windows, focusedWindow = false, movedWindow = false) =>
    ({ catalog, windows, focusedWindow, movedWindow });
  assert.deepEqual(projection(plan({ type: "window.move" }, null, "pt-BR", false)),
    expected(false, true, false, true));
  assert.deepEqual(projection(plan({ type: "window.focus" }, null, "pt-BR", false)),
    expected(false, true, true, false));
  assert.deepEqual(projection(plan({ type: "preference.set" }, "pt-BR", "pt-BR", false)),
    expected(false, false));
  assert.deepEqual(projection(plan({ type: "preference.set" }, "pt-BR", "pt-BR", true)),
    expected(false, true));
  for (const eventType of [
    "host.snapshot", "app.catalog.sync", "window.maximize", "window.minimize",
    "window.close", "window.focus.unsupported", "area.switch", "workspace.presentation",
  ]) {
    assert.deepEqual(projection(plan({ type: eventType }, null, "pt-BR", false)),
      expected(true, true), eventType + " remains full");
  }
  assert.deepEqual(projection(plan({ type: "preference.set" }, "pt-BR", "en-US", false)),
    expected(true, true), "locale change remains full");
  assert.deepEqual(projection(plan(null, null, "pt-BR", false)),
    expected(true, true), "manual render remains full");
});

test("movement reconciles only the moved node; focus only old/new active windows", () => {
  const area = {
    id: "area-1",
    activeWindowId: "b",
    windows: [
      { id: "a", appId: "notes", minimized: false },
      { id: "b", appId: "editor", minimized: false },
      { id: "c", appId: "studio", minimized: false },
    ],
  };
  const apps = new Map(area.windows.map(w => [w.appId, { id: w.appId }]));
  const nodes = new Map(area.windows.map(w => [w.id, { dataset: {
    appId: w.appId, windowId: w.id, windowAreaId: area.id,
  } }]));
  const updates = [];
  let fullReconcilations = 0;
  const select = runInNewContext(
    excerpt("  const renderSelectedWindows = (windowIds) => {", "  const renderDock = () => {")
      + "\nrenderSelectedWindows",
    {
      getActiveArea: () => area,
      state: {},
      catalog: { get: id => apps.get(id) ?? null },
      findRenderedWindow: id => nodes.get(id) ?? null,
      localization: {},
      syncWindowNode: (node, app, windowState, state, index, currentArea) => {
        updates.push({
          id: windowState.id, index, focused: currentArea.activeWindowId === windowState.id,
        });
      },
      renderWindows() { fullReconcilations++; },
    },
  );
  select(["b"]);
  assert.deepEqual(updates, [{ id: "b", index: 1, focused: true }]);
  assert.equal(fullReconcilations, 0);
  updates.length = 0;
  area.activeWindowId = "c";
  select(["b", "c"]);
  assert.deepEqual(updates, [
    { id: "b", index: 1, focused: false },
    { id: "c", index: 2, focused: true },
  ]);
  assert.equal(fullReconcilations, 0, "focus does not rebuild unrelated windows");
  updates.length = 0;
  nodes.delete("c");
  select(["b", "c"]);
  assert.equal(fullReconcilations, 1, "detached trusted window forces full repair");
  nodes.set("c", { dataset: { appId: "wrong", windowId: "c", windowAreaId: area.id } });
  select(["c"]);
  assert.equal(fullReconcilations, 2, "catalog identity mismatch forces full repair");
  assert.equal(updates.filter(x => x.id === "a").length, 0);
});

test("render tail skips catalog, Home and areas on focus/move yet updates active navigation and dock", () => {
  const tail = excerpt(
    "    if (renderPlan.catalog) renderNativeNavigationInstalledApps();",
    "\n  };\n\n  const dispatch = (action) =>",
  );
  const calls = [];
  const menuButton = { dataset: { navMenuApp: "editor" } };
  const run = runInNewContext(
    "(renderPlan, action, previousActiveWindowId) => {\n" + tail + "\n}",
    {
      state: {}, navigationMenu: {
        hidden: false, querySelectorAll: () => [menuButton],
      },
      navigationQuery: { value: "" },
      getActiveArea: () => ({ activeWindowId: "b", windows: [{ id: "b", appId: "editor" }] }),
      catalog: { get: id => ({ id }), isAvailable: () => true },
      syncDataset: (node, key, value) => { node.dataset[key] = String(value); calls.push("navigation-active"); },
      syncAttribute() {},
      renderNativeNavigationInstalledApps: () => calls.push("ctrl-k-catalog"),
      renderLauncher: () => calls.push("launcher"),
      renderWindows: () => calls.push("full-windows"),
      renderSelectedWindows: ids => calls.push("selected:" + ids.filter(Boolean).join(",")),
      renderDock: () => calls.push("dock"),
      renderSidebar: () => calls.push("sidebar"),
      renderHomeAssistant: () => calls.push("assistant"),
      renderHomeInstalledApps: () => calls.push("home-apps"),
      renderAreas: () => calls.push("areas"),
      filterNativeNavigation: () => calls.push("nav-filter"),
      updateDockOverflow: () => calls.push("overflow"),
      renderListeners: new Set([() => calls.push("extension-render")]),
    },
  );
  run({ catalog: false, windows: true, movedWindow: true, focusedWindow: false },
    { type: "window.move", windowId: "b" }, null);
  assert.deepEqual(calls, ["selected:b", "extension-render"]);
  calls.length = 0;
  run({ catalog: false, windows: true, movedWindow: false, focusedWindow: true },
    { type: "window.focus", windowId: "b" }, "a");
  assert.deepEqual(calls, [
    "navigation-active", "selected:a,b", "dock", "sidebar", "extension-render",
  ]);
  assert.equal(menuButton.dataset.active, "true");
  calls.length = 0;
  run({ catalog: true, windows: true, movedWindow: false, focusedWindow: false },
    { type: "host.snapshot" }, null);
  assert.deepEqual(calls, [
    "ctrl-k-catalog", "navigation-active", "launcher", "full-windows",
    "dock", "sidebar", "assistant", "home-apps", "areas", "nav-filter", "extension-render",
  ]);
});

test("finishing a rounded no-op pointer drag always clears its dragging marker", () => {
  const node = { dataset: { dragging: "true" } };
  let released = 0, moved = 0, repainted = 0;
  const finish = runInNewContext([
    'let dragSession = { pointerId: 8, windowId: "b", moved: true,',
    '  x: 24, y: 32, node, titlebar: { releasePointerCapture: () => release() } };',
    excerpt("  const finishPointerDrag = (event, commit) => {",
      "  const onPointerUp = (event) =>"),
    "finishPointerDrag",
  ].join("\n"), {
    node,
    release: () => { released++; },
    dispatch: () => { moved++; /* simulated reducer no-op: no repaint */ },
    render: () => { repainted++; },
  });
  finish({ pointerId: 8 }, true);
  assert.equal(node.dataset.dragging, undefined);
  assert.equal(released, 1);
  assert.equal(moved, 1);
  assert.equal(repainted, 0);
});
