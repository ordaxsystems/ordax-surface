import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = await readFile(new URL("../system/surface/ui/surface.mjs", import.meta.url), "utf8");

test("Launcher search matches accented application names using an unaccented query", () => {
  const start = source.indexOf('    const normalizeSearch = value => ');
  const end = source.indexOf('\n    const query = normalizeSearch(', start);
  assert.ok(start > 0 && end > start, "use the production launcher normalizer");
  const normalize = runInNewContext(source.slice(start, end) + '\nnormalizeSearch', {
    locale: "pt-BR",
  });
  assert.equal(normalize("configuracoes"), normalize("Configurações"));
  assert.equal(normalize("musica"), normalize("Música"));
  assert.equal(normalize("configuracoes").includes(normalize("conta")), false);
  assert.match(source, /const query = normalizeSearch\(launcherQuery\.value\.trim\(\)\)/);
  assert.match(source, /const searchable = normalizeSearch\(`/);
});

test("Targeted launcher activation closes overlay only after successful authorized publish", () => {
  const start = source.indexOf('    const appButton = event.target.closest("[data-launch-app]");');
  const end = source.indexOf('\n    const preferenceButton = ', start);
  assert.ok(start > 0 && end > start, "test the production activation handler");
  const actions = [];
  const published = [];
  const state = { launcherOpen: true, capabilityIds: [] };
  const button = { dataset: { launchApp: "settings", appTarget: "network" } };
  const event = { target: { closest: selector => selector === "[data-launch-app]" ? button : null } };
  let allow = true;
  const handle = runInNewContext('(event) => {\n'+source.slice(start, end)+'\n}', {
    state, catalog: { get: id => ({ id }), isAvailable: () => allow },
    activationPort: { publish: activation => { published.push(activation); } },
    dispatch: action => { actions.push(action.type); if (action.type === "launcher.close") state.launcherOpen = false; },
    closeNativeNavigation: () => {}, launcherQuery: { value: "network" },
  });
  handle(event);
  assert.equal(published.length, 1);
  assert.equal(published[0].appId, "settings");
  assert.equal(published[0].target, "network");
  assert.deepEqual(actions, ["launcher.close"]);
  state.launcherOpen = true;
  allow = false;
  handle(event);
  assert.equal(state.launcherOpen, true, "unavailable targets cannot close launcher");
  assert.equal(published.length, 1, "unavailable targets cannot publish");
});

test("Dock toggles active windows while retaining focus on the surviving or restored window", () => {
  const start = source.indexOf('    const runningButton = event.target.closest("[data-open-window]");');
  const end = source.indexOf('\n    const control = event.target.closest("[data-window-action]");', start);
  const helperStart = source.indexOf('  const focusActiveWindowOrWorkspace = () => {');
  const helperEnd = source.indexOf('\n\n  const onClick = ', helperStart);
  assert.ok(start >= 0 && end > start && helperStart >= 0 && helperEnd > helperStart);
  const actions = [];
  const focused = [];
  const area = { activeWindowId: "store", windows: [
    { id: "settings", minimized: false }, { id: "store", minimized: false },
  ] };
  const context = {
    state: {}, getActiveArea: () => area,
    workspace: { focus: options => focused.push(["workspace", options.preventScroll]) },
    findRenderedWindow: id => area.windows.some(w => w.id === id && !w.minimized)
      ? { querySelector: selector => selector === "[data-window-titlebar]"
        ? { focus: options => focused.push([id, options.preventScroll]) } : null } : null,
  };
  const focusActiveWindowOrWorkspace = runInNewContext(
    source.slice(helperStart, helperEnd) + '\nfocusActiveWindowOrWorkspace', context);
  const handle = runInNewContext('(event) => {\n' + source.slice(start, end) + '\n}', {
    ...context, focusActiveWindowOrWorkspace,
    dispatch(action) {
      actions.push([action.type, action.windowId]);
      const window = area.windows.find(w => w.id === action.windowId);
      if (!window) return;
      if (action.type === "window.minimize") {
        window.minimized = true;
        area.activeWindowId = area.windows.findLast(w => !w.minimized)?.id ?? null;
      } else if (action.type === "window.focus") {
        window.minimized = false;
        area.activeWindowId = window.id;
      }
    },
  });
  const click = id => handle({ target: { closest: selector => selector === "[data-open-window]"
    ? { dataset: { openWindow: id } } : null } });
  click("store");
  assert.deepEqual(actions.at(-1), ["window.minimize", "store"]);
  assert.deepEqual(focused.at(-1), ["settings", true]);
  click("store");
  assert.deepEqual(actions.at(-1), ["window.focus", "store"]);
  assert.deepEqual(focused.at(-1), ["store", true]);
  click("settings");
  assert.deepEqual(actions.at(-1), ["window.focus", "settings"]);
  assert.deepEqual(focused.at(-1), ["settings", true]);
  click("settings");
  assert.deepEqual(actions.at(-1), ["window.minimize", "settings"]);
  assert.deepEqual(focused.at(-1), ["store", true]);
  click("store");
  assert.deepEqual(actions.at(-1), ["window.minimize", "store"]);
  assert.deepEqual(focused.at(-1), ["workspace", true]);
  click("store");
  assert.deepEqual(actions.at(-1), ["window.focus", "store"]);
  assert.deepEqual(focused.at(-1), ["store", true]);
});

test("Minimizing or closing a window preserves keyboard focus on the next active window", () => {
  const start = source.indexOf('    const control = event.target.closest("[data-window-action]");');
  const end = source.indexOf('\n    const windowNode = event.target.closest("[data-window-id]");', start);
  assert.ok(start >= 0 && end > start, "exercise the real Native window action handler");
  let fallbackId = "next-window";
  const focused = [];
  const actions = [];
  const state = {};
  const titlebar = { focus(options) { focused.push(["next-window", options.preventScroll]); } };
  const workspace = { focus(options) { focused.push(["workspace", options.preventScroll]); } };
  const context = {
    state,
    getActiveArea: () => ({ activeWindowId: fallbackId }),
    findRenderedWindow: id => id === "next-window" ? {
      querySelector: selector => selector === "[data-window-titlebar]" ? titlebar : null,
    } : null,
    workspace,
  };
  const helperStart = source.indexOf('  const focusActiveWindowOrWorkspace = () => {');
  const helperEnd = source.indexOf('\n\n  const onClick = ', helperStart);
  const focusActiveWindowOrWorkspace = runInNewContext(
    source.slice(helperStart, helperEnd) + '\nfocusActiveWindowOrWorkspace', context);
  const onWindowAction = runInNewContext('(event) => {\n' + source.slice(start, end) + '\n}', {
    ...context, focusActiveWindowOrWorkspace,
    dispatch(action) { actions.push(action); },
  });
  const click = action => onWindowAction({
    target: { closest: selector => selector === "[data-window-action]" ? {
      dataset: { windowAction: action, windowId: "old-window" },
    } : null },
  });
  click("minimize");
  assert.deepEqual(focused, [["next-window", true]], "focus the next visible window instead of desktop");
  assert.equal(actions[0].type, "window.minimize");
  focused.length = 0;
  click("close");
  assert.deepEqual(focused, [["next-window", true]]);
  assert.equal(actions[1].type, "window.close");
  focused.length = 0;
  fallbackId = null;
  click("minimize");
  assert.deepEqual(focused, [["workspace", true]], "no remaining window falls back to desktop");
  focused.length = 0;
  click("maximize");
  assert.deepEqual(focused, [], "maximize should not steal the keyboard focus");
});

function keyboardHarness() {
  const state = { launcherOpen: true };
  const doc = { activeElement: null };
  let launched = [];
  const query = { kind: "query" };
  const option = (name, settings = {}) => ({
    name,
    hidden: false,
    disabled: false,
    parentHidden: false,
    focusOptions: null,
    scrollOptions: null,
    scrollIntoView(options) { this.scrollOptions = options; },
    focus(options) {
      this.focusOptions = options;
      doc.activeElement = this;
    },
    click() { launched.push(this.name); },
    closest(selector) {
      assert.equal(selector, "[hidden]");
      return this.parentHidden ? {} : null;
    },
    ...settings,
  });
  const apps = [
    option("Settings"),
    option("Installed Studio"),
    option("Unavailable", { disabled: true }),
    option("Hidden", { hidden: true }),
    option("Nested hidden", { parentHidden: true }),
    option("Store"),
  ];
  const launcher = { contains: target => target === query || apps.includes(target) };
  const appLauncher = {
    contains: target => apps.includes(target),
    querySelectorAll(selector) {
      assert.equal(selector, "button:not(:disabled):not([hidden])");
      return apps.filter(app => !app.disabled && !app.hidden);
    },
  };
  const start = source.indexOf("  const handleLauncherKeyboard = (event) => {");
  const end = source.indexOf("\n  const onKeyDown = (event) => {", start);
  assert.ok(start >= 0 && end > start, "test the real launcher keyboard handler");
  const handle = runInNewContext(source.slice(start, end) + "\nhandleLauncherKeyboard", {
    state, root: { ownerDocument: doc }, launcher,
    appLauncher, launcherQuery: query,
  });
  const key = (target, name) => {
    // A real keyboard event originates from the document's focused element.
    doc.activeElement = target;
    const event = {
      target, key: name, prevented: false,
      preventDefault() { this.prevented = true; },
    };
    const consumed = handle(event);
    return { consumed, prevented: event.prevented };
  };
  return { apps, query, doc, state, key, getLaunched: () => launched };
}

test("Native app launcher supports full keyboard traversal over available visible apps", () => {
  const { apps, query, doc, key } = keyboardHarness();

  assert.deepEqual(key(query, "ArrowDown"), { consumed: true, prevented: true });
  assert.equal(doc.activeElement, apps[0]);
  assert.equal(apps[0].focusOptions.preventScroll, true);
  assert.equal(apps[0].scrollOptions.block, "nearest");
  assert.equal(apps[0].scrollOptions.inline, "nearest");
  key(apps[0], "ArrowDown");
  assert.equal(doc.activeElement, apps[1]);
  key(apps[1], "ArrowDown");
  assert.equal(doc.activeElement, apps[5], "skip unavailable, hidden and hidden-parent apps");
  key(apps[5], "ArrowDown");
  assert.equal(doc.activeElement, apps[0], "wrap after last visible app");
  key(apps[0], "ArrowUp");
  assert.equal(doc.activeElement, apps[5], "wrap before first visible app");
  key(apps[5], "Home");
  assert.equal(doc.activeElement, apps[0]);
  key(apps[0], "End");
  assert.equal(doc.activeElement, apps[5]);
  assert.deepEqual(key(query, "Home"), { consumed: false, prevented: false },
    "Home stays a text-caret command in the search box");
  assert.deepEqual(key(query, "End"), { consumed: false, prevented: false });
  assert.deepEqual(key(query, "ArrowUp"), { consumed: true, prevented: true });
  assert.equal(doc.activeElement, apps[5]);
});

test("Launcher Enter launches only a current available item and ignores unrelated controls", () => {
  const { apps, query, state, key, getLaunched } = keyboardHarness();
  assert.deepEqual(key(query, "Enter"), { consumed: true, prevented: true });
  assert.deepEqual(getLaunched(), ["Settings"]);
  assert.deepEqual(key({ kind: "other" }, "ArrowDown"), { consumed: false, prevented: false });
  assert.deepEqual(key(apps[0], "Space"), { consumed: false, prevented: false });
  state.launcherOpen = false;
  assert.deepEqual(key(query, "Enter"), { consumed: false, prevented: false },
    "closed launcher must never trigger an app");
});

test("Opening Ctrl+K closes the launcher and area menu without losing a repeated search", () => {
  const start = source.indexOf("  let navigationMenuTrigger = null;");
  const end = source.indexOf("\n  const closeNativeNavigation = ", start);
  assert.ok(start >= 0 && end > start);
  const events = [];
  const state = { launcherOpen: true };
  const areaMenu = { hidden: false };
  const navigationMenu = { hidden: true };
  const navigationQuery = {
    value: "OLD",
    focusCount: 0,
    focus() { this.focusCount += 1; },
  };
  const toggle = { setAttribute(name, value) { events.push([name, value]); } };
  const opener = {};
  class HTMLElement {}
  const nav = runInNewContext(source.slice(start, end) + "\nopenNativeNavigation", {
    state,
    areaMenu,
    navigationMenu,
    navigationQuery,
    HTMLElement,
    document: { activeElement: opener },
    root: { querySelectorAll: () => [toggle] },
    queueMicrotask: fn => fn(),
    dispatch(action) {
      events.push(action.type);
      if (action.type === "launcher.close") state.launcherOpen = false;
    },
    setAreaMenuOpen(value) {
      events.push("area-menu.close");
      areaMenu.hidden = !value;
    },
    filterNativeNavigation(value) { events.push(["filter", value]); },
  });

  nav(opener);
  assert.equal(state.launcherOpen, false, "Ctrl+K owns the overlay after closing launcher");
  assert.equal(areaMenu.hidden, true);
  assert.equal(navigationMenu.hidden, false);
  assert.equal(navigationQuery.value, "");
  assert.equal(navigationQuery.focusCount, 1);
  assert.deepEqual(events.filter(x => x === "launcher.close"), ["launcher.close"]);

  navigationQuery.value = "Notes";
  nav(opener);
  assert.equal(navigationQuery.value, "Notes", "repeated Ctrl+K preserves the search");
  assert.equal(navigationQuery.focusCount, 2);
  assert.equal(events.filter(x => x === "launcher.close").length, 1);
});

test("Launcher Escape belongs to launcher and returns focus only to a usable opener", () => {
  assert.match(source, /event\.key === "Escape" && state\.launcherOpen\s*&& \(launcher\.contains\(event\.target\) \|\| launcherOpener\?\.contains\(event\.target\)\)/);
  assert.match(source, /launcherOpener\?\.isConnected && !launcherOpener\.hidden/);
  assert.match(source, /!launcherOpener\.disabled && !launcherOpener\.closest\("\[hidden\]"\)/);
  assert.match(source, /launcherOpener : workspace/);
  assert.match(source, /if \(handleLauncherKeyboard\(event\)\) return;/);
});
