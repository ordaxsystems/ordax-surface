import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = await readFile(new URL("../system/surface/ui/surface.mjs", import.meta.url), "utf8");

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
