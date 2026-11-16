import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = await readFile(new URL("../system/surface/ui/surface.mjs", import.meta.url), "utf8");

function take(start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, "missing real render path " + start);
  return source.slice(a, b);
}

test("render plan only skips catalog and window work on non-locale preference changes", () => {
  const getPlan = runInNewContext(
    take("function nativeRenderPlan(", "function areaLabel(") + "\nnativeRenderPlan",
  );
  const full = { catalog: true, windows: true };
  const noPanels = { catalog: false, windows: false };
  const withPanels = { catalog: false, windows: true };
  const expect = (actual, wanted) => assert.deepEqual(
    { catalog: actual.catalog, windows: actual.windows }, wanted,
  );
  expect(getPlan(null, null, "pt-BR", false), full);
  expect(getPlan({ type: "preference.set" }, "pt-BR", "pt-BR", false), noPanels);
  expect(getPlan({ type: "preference.set" }, "pt-BR", "pt-BR", true), withPanels);
  expect(getPlan({ type: "preference.set" }, "pt-BR", "en-US", false), full);
  expect(getPlan({ type: "host.snapshot" }, null, "pt-BR", false), full);
  expect(getPlan({ type: "app.catalog.sync" }, null, "pt-BR", false), full);
  expect(getPlan({ type: "window.focus" }, null, "pt-BR", false), { catalog: false, windows: true });
  expect(getPlan({ type: "window.move" }, null, "pt-BR", false), { catalog: false, windows: true });
  expect(getPlan({ type: "area.switch" }, null, "pt-BR", false), full);
  expect(getPlan({ type: "workspace.presentation" }, null, "pt-BR", false), full);
  expect(getPlan({ type: "launcher.close" }, null, "pt-BR", false), full);
});

test("actual Native render tail keeps DOM catalogs untouched on cosmetic preference updates", () => {
  const snippet = take(
    "    if (renderPlan.catalog) renderNativeNavigationInstalledApps();",
    "\n  };\n\n  const dispatch = (action) =>",
  );
  const calls = [];
  const record = name => () => calls.push(name);
  const menuButton = { dataset: { navMenuApp: "notes" }, disabled: false, attributes: {} };
  const fakeMenu = {
    hidden: false,
    querySelectorAll: () => [menuButton],
  };
  const renderListeners = new Set([record("extension-render")]);
  const tail = runInNewContext(
    "(renderPlan, action = { windowId: \"w1\" }, previousActiveWindowId = null) => {\n" + snippet + "\n}",
    {
      renderNativeNavigationInstalledApps: record("ctrl-k-apps"),
      renderLauncher: record("launcher"),
      renderWindows: record("windows"),
      renderSelectedWindows: ids => calls.push("selected:" + ids.filter(Boolean).join(",")),
      renderDock: record("dock"),
      renderSidebar: record("sidebar"),
      renderHomeAssistant: record("home-assistant"),
      renderHomeInstalledApps: record("home-apps"),
      renderAreas: record("areas"),
      filterNativeNavigation: record("nav-filter"),
      updateDockOverflow: record("dock-geometry"),
      renderListeners,
      navigationMenu: fakeMenu,
      navigationQuery: { value: "notes" },
      state: {},
      getActiveArea: () => ({ activeWindowId: null, windows: [] }),
      catalog: {
        get: () => ({ id: "notes" }),
        isAvailable: () => true,
      },
      syncAttribute: () => {},
      syncDataset: () => {},
    },
  );
  tail({ catalog: false, windows: false });
  assert.deepEqual(calls, ["dock-geometry", "extension-render"],
    "a cosmetic preference must not visit launcher, dock contents or windows");
  calls.length = 0;
  tail({ catalog: false, windows: true });
  assert.deepEqual(calls, ["windows", "dock-geometry", "extension-render"],
    "an open preference-choice window still updates its selected option");
  calls.length = 0;
  tail({ catalog: true, windows: true });
  assert.deepEqual(calls, [
    "ctrl-k-apps", "launcher", "windows", "dock", "sidebar",
    "home-assistant", "home-apps", "areas", "nav-filter", "extension-render",
  ], "catalog, capabilities, locale and window actions must fully reconcile");
});

test("dispatch passes previous locale before reducing preference changes, while manual repaint stays full", () => {
  const render = take(
    "  const render = (action = null, previousLocale = null, previousActiveWindowId = null) => {",
    "\n  const dispatch = (action) =>",
  );
  assert.match(render,
    /const unchangedLocalePreference = action\?\.type === "preference\.set" && previousLocale === currentLocale/);
  assert.match(render,
    /getActiveArea\(state\)\.windows\.some\(\(windowState\) =>\s*catalog\.get\(windowState\.appId\)\?\.panels\?\.some\(\(panel\) => panel\.kind === "preference-choice"\)/);
  assert.match(render, /const renderPlan = nativeRenderPlan\(/);
  const dispatch = take("  const dispatch = (action) => {", "\n  let launcherOpener = null;");
  assert.match(dispatch,
    /const previousLocale = action\?\.type === "preference\.set" \? localization\.getLocale\(\) : null/);
  assert.match(dispatch, /render\(action, previousLocale, previousActiveWindowId\);/);
  assert.match(dispatch,
    /for \(const listener of \[\.\.\.preferenceListeners\]\) listener\(state\.preferences\)/);
  assert.match(render,
    /for \(const listener of \[\.\.\.renderListeners\]\) listener\(\)/,
    "Native host extensions must still see all preference events");
  assert.match(source, /else if \(current\.moved\) \{\s*render\(\);/,
    "pointer cancel still does a full repair render");
  assert.match(source, /const unsubscribeHost = host\.subscribe\(\(snapshot\) => dispatch\(\{ type: "host\.snapshot", snapshot \}\)\)/,
    "capability changes are still dispatched as full host updates");
  assert.match(source, /dispatch\(\{ type: "app\.catalog\.sync" \}\)/,
    "catalog replacement must not use the preference fast path");
});
