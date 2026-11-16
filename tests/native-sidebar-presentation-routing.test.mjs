import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const ui = await readFile(new URL("../system/surface/ui/surface.mjs", import.meta.url), "utf8");
const stateSource = await readFile(new URL("../system/surface/ui/surface-state.mjs", import.meta.url), "utf8");
const shell = await readFile(new URL("../system/surface/ui/desktop-shell.mjs", import.meta.url), "utf8");
function sourceBetween(source, first, last) {
  const a = source.indexOf(first), b = source.indexOf(last, a + first.length);
  assert.ok(a >= 0 && b > a, "missing canonical code " + first);
  return source.slice(a, b);
}

const reduceSurfaceState = runInNewContext(
  sourceBetween(stateSource, "function freezeWindow(", "function activeFallback(")
    + stateSource.slice(stateSource.indexOf("export function reduceSurfaceState(")).replace(/^export /, "")
    + "\nreduceSurfaceState",
  {
    defaultAppRuntimeCatalog: {},
    assertAppRuntimeCatalog() {},
    recoverArea: (area) => area,
    resolveSidebarMode: (presentation, requested) =>
      presentation === "desktop" ? "collapsed" : requested,
    defaultSidebarForPresentation: presentation => presentation === "desktop" ? "collapsed" : "auto",
  },
);
function stateFixture() {
  return Object.freeze({
    presentation: "central", sidebarMode: "auto", launcherOpen: false,
    connectivity: "online", capabilityIds: Object.freeze(["network.status"]),
    activeAreaId: "area-1", nextAreaOrdinal: 2,
    preferences: Object.freeze({}),
    areas: Object.freeze([Object.freeze({
      id: "area-1", ordinal: 1, activeWindowId: null, nextWindowOrdinal: 1,
      windows: Object.freeze([]),
    })]),
  });
}

test("workspace.sidebar only changes the canonical mode; all other frozen owners retain identity", () => {
  const start = stateFixture();
  const expanded = reduceSurfaceState(start, { type: "workspace.sidebar", value: "expanded" });
  assert.equal(expanded.sidebarMode, "expanded");
  for (const key of ["areas", "capabilityIds", "preferences"]) {
    assert.strictEqual(expanded[key], start[key], key + " not cloned by sidebar update");
  }
  assert.strictEqual(reduceSurfaceState(expanded,
    { type: "workspace.sidebar", value: "expanded" }), expanded, "same mode remains a true no-op");
  const collapsed = reduceSurfaceState(expanded, { type: "workspace.sidebar", value: "collapsed" });
  assert.equal(collapsed.sidebarMode, "collapsed");
  assert.equal(collapsed.presentation, "central");
  const desktop = reduceSurfaceState(collapsed, { type: "workspace.presentation", value: "desktop" });
  assert.equal(desktop.presentation, "desktop");
  assert.equal(desktop.sidebarMode, "collapsed");
  assert.strictEqual(reduceSurfaceState(desktop, { type: "workspace.sidebar", value: "expanded" }),
    desktop, "Desktop ownership keeps the icon rail collapsed");
});

test("sidebar-only render changes rail geometry/ARIA and dock overflow, never catalog or windows", () => {
  const code = sourceBetween(ui,
    "  const syncSidebarPresentation = () => {", "  const renderConnectivityOnly = () => {");
  assert.doesNotMatch(code, /catalog\.(get|list|isAvailable)|renderWindows\(|renderLauncher\(|renderHome/);
  const state = { ...stateFixture() };
  const rail = { width: 190 };
  const sidebarToggle = { hidden: false };
  const root = {
    dataset: {},
    querySelector(selector) {
      if (selector === ".ordax-rail") return rail;
      if (selector === "[data-sidebar-toggle]") return sidebarToggle;
      throw Error("unexpected query " + selector);
    },
  };
  const calls = [];
  const render = runInNewContext(code + "\nrenderSidebarModeOnly", {
    root, state, launcher: {}, localization: {},
    sidebarIsExpanded: node => node.width > 100,
    syncDesktopSidebarToggle: (_, expanded) => calls.push("sidebar:" + expanded),
    syncDataset: (node, key, value) => {
      if (node.dataset[key] !== value) node.dataset[key] = value;
    },
    syncHidden: (node, value) => { if (node.hidden !== value) node.hidden = value; },
    updateDockOverflow: () => calls.push("dock-overflow"),
    renderListeners: new Set([() => calls.push("native-listener")]),
  });
  state.sidebarMode = "expanded";
  render();
  assert.equal(root.dataset.nativeSidebar, "expanded");
  assert.deepEqual(calls, ["sidebar:true", "dock-overflow", "native-listener"]);
  calls.length = 0;
  state.sidebarMode = "collapsed";
  rail.width = 70;
  render();
  assert.equal(root.dataset.nativeSidebar, "collapsed");
  assert.deepEqual(calls, ["sidebar:false", "dock-overflow", "native-listener"]);
  calls.length = 0;
  state.presentation = "desktop";
  render();
  assert.equal(sidebarToggle.hidden, true);
  assert.deepEqual(calls, ["sidebar:false", "dock-overflow", "native-listener"]);
});

test("real dispatch routes only sidebar changes narrowly and keeps presentation, catalog and grants full", () => {
  const calls = [];
  const context = {
    state: stateFixture(), catalog: {}, localization: { getLocale: () => "pt-BR" },
    reduceSurfaceState,
    getActiveArea: () => ({ activeWindowId: null }),
    preferenceDispatching: false, preferenceListeners: new Set(),
    preferencePersistence: { save: () => calls.push("preference-save") },
    workspacePort: null, WORKSPACE_PERSIST_ACTIONS: new Set(),
    renderSidebarModeOnly: () => calls.push("sidebar-only"),
    renderLauncherVisibilityOnly: () => calls.push("launcher-only"),
    renderConnectivityOnly: () => calls.push("network-only"),
    isConnectivityOnlyHostUpdate: () => false,
    render: () => calls.push("full"),
  };
  const dispatch = runInNewContext(
    sourceBetween(ui, "  const dispatch = (action) => {", "  let launcherOpener = null;")
      + "\ndispatch",
    context,
  );
  dispatch({ type: "workspace.sidebar", value: "expanded" });
  assert.deepEqual(calls, ["sidebar-only"]);
  assert.equal(context.state.sidebarMode, "expanded");
  dispatch({ type: "workspace.sidebar", value: "expanded" });
  assert.deepEqual(calls, ["sidebar-only"], "duplicate sidebar request is no-op");
  dispatch({ type: "workspace.presentation", value: "desktop" });
  assert.deepEqual(calls, ["sidebar-only", "full"],
    "Central/Desktop requires full projection of windows, Home and shortcuts");
  dispatch({ type: "workspace.sidebar", value: "expanded" });
  assert.equal(calls.length, 2, "Desktop rejects manual expand");
  dispatch({ type: "app.catalog.sync" });
  assert.equal(calls.at(-1), "full", "catalog must continue full reconciliation");
  assert.equal(calls.includes("preference-save"), false, "sidebar/presentation cannot write preferences");
});

test("sidebar, presentation and theme control helpers avoid identical SVG/ARIA rewrites", () => {
  const helpers = runInNewContext(
    sourceBetween(shell, "function syncControlAttribute(", "const SURFACE_LOCALE =")
      .replaceAll("export ", "")
      + sourceBetween(shell, "export function syncDesktopSidebarToggle(", "function railButton(")
        .replace(/^export /, "")
      + "\n({ syncDesktopSidebarToggle, syncDesktopPresentationToggle, syncDesktopThemeToggle })",
    {
      ICONS: {
        sidebarClose: "close", sidebarOpen: "open",
        system: "system", presentation: "presentation",
        moon: "moon", sun: "sun",
      },
      presentationDestination: current => current === "central"
        ? { target: "desktop", labelId: "switch.desktop" }
        : { target: "central", labelId: "switch.central" },
    },
  );
  let language = "pt";
  const localization = { getLocale: () => language, translate: key => language + ":" + key };
  const control = ({ expanded, glyph, target } = {}) => {
    let html = glyph ?? "";
    const icon = {
      writes: 0,
      get innerHTML() { return html; },
      set innerHTML(next) { this.writes++; html = next; },
    };
    const attrs = new Map();
    if (expanded !== undefined) attrs.set("aria-expanded", String(expanded));
    return {
      dataset: { ...(target ? { presentationDestination: target } : {}) },
      attrs, icon, writes: 0, title: "",
      getAttribute(name) { return this.attrs.get(name) ?? null; },
      setAttribute(name, value) { this.writes++; this.attrs.set(name, value); },
      querySelector(selector) {
        assert.ok(["svg", ".ordax-rail-icon"].includes(selector));
        return icon;
      },
    };
  };
  const sidebar = control({ expanded: true, glyph: "close" });
  helpers.syncDesktopSidebarToggle(sidebar, true, localization);
  const firstAttrs = sidebar.writes;
  helpers.syncDesktopSidebarToggle(sidebar, true, localization);
  assert.equal(sidebar.icon.writes, 0, "authored default icon is not replaced");
  assert.equal(sidebar.writes, firstAttrs, "identical ARIA values do not rewrite");
  helpers.syncDesktopSidebarToggle(sidebar, false, localization);
  assert.equal(sidebar.icon.writes, 1);
  helpers.syncDesktopSidebarToggle(sidebar, false, localization);
  assert.equal(sidebar.icon.writes, 1, "same collapsed glyph stays mounted");
  language = "en";
  helpers.syncDesktopSidebarToggle(sidebar, false, localization);
  assert.equal(sidebar.icon.writes, 1, "translation changes only labels");
  assert.equal(sidebar.getAttribute("aria-label"), "en:shell.sidebar.expand");
  const theme = control();
  language = "pt";
  helpers.syncDesktopThemeToggle(theme, { scheme: "light" }, localization);
  assert.equal(theme.icon.writes, 1, "theme icon initially mounted");
  helpers.syncDesktopThemeToggle(theme, { scheme: "light" }, localization);
  assert.equal(theme.icon.writes, 1);
  helpers.syncDesktopThemeToggle(theme, { scheme: "dark" }, localization);
  assert.equal(theme.icon.writes, 2, "new scheme replaces icon exactly once");
  const presentation = control({ glyph: "system", target: "desktop" });
  helpers.syncDesktopPresentationToggle(presentation, "central", localization);
  assert.equal(presentation.icon.writes, 0);
  helpers.syncDesktopPresentationToggle(presentation, "central", localization);
  assert.equal(presentation.icon.writes, 0);
  helpers.syncDesktopPresentationToggle(presentation, "desktop", localization);
  assert.equal(presentation.icon.writes, 1, "real presentation switch updates glyph");

  // The independent OS integration uses intentionally minimal host controls
  // without getAttribute. Real DOM elements still use the zero-write path.
  const nativeAttributes = {};
  let nativeGlyph = "";
  const minimal = {
    dataset: {}, title: "",
    setAttribute(name, value) { nativeAttributes[name] = value; },
    querySelector() { return { set innerHTML(value) { nativeGlyph = value; } }; },
  };
  helpers.syncDesktopSidebarToggle(minimal, true, localization);
  assert.equal(nativeAttributes["aria-expanded"], "true");
  assert.equal(nativeAttributes["aria-label"], "pt:shell.sidebar.collapse");
  assert.equal(nativeGlyph, "close");
  helpers.syncDesktopSidebarToggle(minimal, false, localization);
  assert.equal(nativeGlyph, "open");
  helpers.syncDesktopPresentationToggle(minimal, "central", localization);
  assert.equal(nativeAttributes["aria-pressed"], "false");
  assert.equal(minimal.dataset.presentationDestination, "desktop");
});
