import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { nativeHomeAssistantApp, nativeHomeInstalledApps, nativeNavigationInstalledApps } from "../system/surface/ui/application-presentations.mjs";

const ui = (name) => new URL("../system/surface/ui/" + name, import.meta.url);
const read = (name) => readFile(ui(name), "utf8");

function narrowHomeRules(css) {
  css = css.replace(/\r\n/g, "\n");
  const marker = "@container meridian-native-home (max-width: 38rem) {";
  const start = css.indexOf(marker);
  assert.ok(start >= 0, "Home must respond to the actual workspace width");
  // The container closes with a stand-alone brace. Nested selector blocks
  // have indented closing braces; this extracts the actual responsive rules.
  const end = css.indexOf("\n}\n", start);
  assert.ok(end > start, "narrow Home container must close");
  return css.slice(start, end + 2);
}

test("narrow Native Home reflows the real shell destinations into a usable reading order", async () => {
  const [css, shell, concept] = await Promise.all([
    read("identity.css"),
    read("desktop-shell.mjs"),
    read("home-concept.mjs"),
  ]);
  const narrow = narrowHomeRules(css);
  const areas = [
    "intro", "hero", "resume", "quick", "status", "current",
    "files", "ecosystem", "session",
  ];
  for (const area of areas) {
    assert.match(narrow, new RegExp('"'+area+'"'),
      `responsive home must keep the ${area} destination`);
  }
  assert.match(narrow, /grid-template-columns:\s*minmax\(0, 1fr\);/);
  assert.match(narrow, /:not\(:has\(\[data-home-continuation\]\)\)[\s\S]*?grid-template-areas:/,
    "Home without a resume card needs its own complete responsive grid");
  assert.match(narrow, /\.ordax-home-intro\s*\{[\s\S]*?grid-template-areas:\s*"heading" "tagline" "search"/,
    "Search should follow the greeting instead of squeezing it");
  assert.match(narrow, /\.ordax-home-title\s*\{[\s\S]*?white-space:\s*normal;/,
    "Localized greetings must wrap rather than truncate");
  assert.match(narrow, /\.ordax-home-tagline\s*\{[\s\S]*?white-space:\s*normal;/,
    "Localized descriptions must wrap instead of disappearing");
  assert.match(narrow, /\.ordax-home-destination-grid,[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
    "Destinations and Files must become a single column at narrow width");
  assert.match(shell, /class="ordax-home-panel"/);
  assert.doesNotMatch(shell, /data-native-aura-prompt|data-home-aura-submit|meridian-planned-mark/,
    "Native Home and navigation must not render a second Aura");
  for (const klass of ["ordax-home-intro", "ordax-home-search", "ordax-home-action-grid", "ordax-home-destination-grid"]) {
    assert.ok(shell.includes(klass), `the production shell must actually render ${klass}`);
  }
  for (const klass of ["ordax-home-status", "ordax-home-current-space"]) {
    assert.ok(concept.includes(klass), `the Home projection must actually render ${klass}`);
  }
});

test("responsive polish consumes existing Meridian tokens without a parallel palette or font", async () => {
  const [css, tokens] = await Promise.all([read("identity.css"), read("meridian.tokens.css")]);
  const narrow = narrowHomeRules(css);
  assert.match(css, /container:\s*meridian-native-home\s*\/\s*inline-size/);
  for (const token of ["--md-space-2", "--md-space-4"]) {
    assert.ok(narrow.includes(`var(${token})`), `responsive rules should consume ${token}`);
    assert.ok(tokens.includes(`${token}:`), `Meridian owns ${token}`);
  }
  assert.doesNotMatch(narrow, /#[0-9a-f]{3,8}\b/i, "do not introduce a new color palette");
  assert.doesNotMatch(narrow, /font-family\s*:/i, "do not introduce a second font source");
  assert.match(css, /@container meridian-native-home \(max-width: 66rem\)/);
  assert.match(css, /@container meridian-native-home \(max-width: 50rem\)/);
});

test("Native Home shows Aura only for its signed installed Assistant app slot", async () => {
  const [shell, surface, styles] = await Promise.all([
    read("desktop-shell.mjs"), read("surface.mjs"), read("identity.css"),
  ]);
  assert.match(shell, /data-native-home-assistant hidden disabled/);
  assert.doesNotMatch(shell, /data-native-home-assistant[^>]*data-launch-app/);
  assert.match(styles, /\.ordax-home-action\[data-native-home-assistant\]\[hidden\] \{ display: none !important; \}/);
  assert.match(surface, /const app = nativeHomeAssistantApp\(catalog, state\.capabilityIds\)/);
  assert.match(surface, /button\.removeAttribute\("data-launch-app"\)/);
  assert.match(surface, /button\.dataset\.launchApp = app\.id;/);
  assert.match(surface, /renderSidebar\(\);\s*renderHomeAssistant\(\);/);
  assert.doesNotMatch(shell, /data-native-aura-prompt|data-home-aura-submit/);

  const installed = { id: "assistant", component: { kind: "app", releaseMode: "component-slot" },
    panels: [{ kind: "extension", extensionId: "assistant" }] };
  let app = null;
  let available = false;
  const catalog = {
    get: (id) => id === "assistant" ? app : null,
    isAvailable: (item) => item === app && available,
  };
  assert.equal(nativeHomeAssistantApp(catalog, []), null, "not installed");
  app = installed;
  assert.equal(nativeHomeAssistantApp(catalog, []), null, "installed but unavailable");
  available = true;
  assert.equal(nativeHomeAssistantApp(catalog, []), installed, "trusted installed slot");
  app = { ...installed, component: { kind: "app", releaseMode: "bundled" } };
  assert.equal(nativeHomeAssistantApp(catalog, []), null, "not a signed component slot");
  app = { ...installed, panels: [{ kind: "static" }] };
  assert.equal(nativeHomeAssistantApp(catalog, []), null, "not an external executable");
  app = null;
  assert.equal(nativeHomeAssistantApp(catalog, []), null, "removed during runtime");
});

test("Native Home quick access follows verified installed apps without duplicating Aura", async () => {
  const [shell, surface, styles] = await Promise.all([
    read("desktop-shell.mjs"), read("surface.mjs"), read("identity.css"),
  ]);
  assert.match(surface, /const installed = nativeHomeInstalledApps\(catalog, state\.capabilityIds\)/);
  assert.match(surface, /button\.dataset\.nativeHomeInstalledApp = app\.id/);
  assert.match(surface, /button\.dataset\.launchApp = app\.id/);
  assert.match(surface, /addAppButton\.before\(button\)/);
  assert.match(surface, /if \(button\.contains\(root\.ownerDocument\.activeElement\)\)/);
  assert.match(surface, /button\.remove\(\)/);
  assert.match(surface, /renderHomeAssistant\(\);\s*renderHomeInstalledApps\(\);/);
  assert.match(shell, /data-native-home-assistant hidden disabled/);
  assert.match(styles, /\[data-native-home-installed-app\] \.ordax-rail-icon/);
  assert.doesNotMatch(shell, /data-native-home-installed-app/,
    "no fabricated installed app should exist in the static shell");

  const installed = (id, requiredCapabilities = []) => ({
    id, monogram: "AP", component: { kind: "app", releaseMode: "component-slot" },
    panels: [{ kind: "extension", extensionId: id }], requiredCapabilities,
  });
  const assistant = installed("assistant");
  const studio = installed("studio");
  const notes = installed("notes", ["notes.read"]);
  const gallery = installed("gallery");
  const editor = installed("editor");
  const terminal = installed("terminal");
  const invalid = { ...installed("not-installed"), component: { kind: "app", releaseMode: "bundled" } };
  let current = [assistant, studio, notes, gallery, editor, terminal, invalid];
  const catalog = {
    get: (id) => current.find((app) => app.id === id) ?? null,
    list: () => current,
    isAvailable: (app, capabilities) => app.requiredCapabilities.every((id) => capabilities.includes(id)),
  };
  assert.equal(nativeHomeAssistantApp(catalog, []), assistant);
  assert.deepEqual(nativeHomeInstalledApps(catalog, []).map((app) => app.id),
    ["studio", "gallery", "editor", "terminal"], "only valid slots; bounded Home; no second Aura");
  assert.deepEqual(nativeHomeInstalledApps(catalog, ["notes.read"]).map((app) => app.id),
    ["studio", "notes", "gallery", "editor"], "granted capabilities change the Home projection");
  current = [assistant, notes, invalid];
  assert.deepEqual(nativeHomeInstalledApps(catalog, []).map((app) => app.id), [],
    "revoked capabilities and removed installations revoke Home shortcuts");
  current = [];
  assert.equal(nativeHomeAssistantApp(catalog, []), null);
  assert.deepEqual(nativeHomeInstalledApps(catalog, []).map((app) => app.id), []);
});

test("Ctrl+K Native navigation projects, searches and revokes installed apps in place", async () => {
  const { runInNewContext } = await import("node:vm");
  const [shell, surface] = await Promise.all([read("desktop-shell.mjs"), read("surface.mjs")]);
  assert.match(shell, /data-native-navigation-installed-apps/);
  assert.match(surface, /renderNativeNavigationInstalledApps\(\);\s*const activeNavigationWindow/);
  assert.match(surface, /if \(!navigationMenu.hidden\) filterNativeNavigation\(navigationQuery.value\)/);
  assert.match(surface, /const handleNativeNavigationArrow = \(event\) => \{/);
  assert.match(surface, /if \(handleNativeNavigationArrow\(event\)\) return;/);
  assert.match(surface, /event.target === navigationQuery && !navigationMenu.hidden\s*&& event.key === "Enter"/);
  assert.match(surface, /if \(first\) \{\s*first.click\(\);/);
  assert.match(surface, /next.focus\(\{ preventScroll: true \}\)/);
  const start = surface.indexOf("  const renderNativeNavigationInstalledApps = () => {");
  const end = surface.indexOf("\n  const renderSidebar = () => {", start);
  assert.ok(start > 0 && end > start, "reuse the actual Native navigation renderer");

  class Node {
    constructor(tag, className = "", value = "") {
      this.tag = tag; this.className = className; this.textContent = value;
      this.dataset = {}; this.children = []; this.attributes = {};
    }
    append(...nodes) { for (const child of nodes) this.children.push(child), child.parent = this; }
    querySelector(selector) {
      const name = selector.slice(1);
      return this.children.find(node => node.className.split(" ").includes(name)) ?? null;
    }
    setAttribute(name, value) { this.attributes[name] = value; }
    contains(other) { return this === other || this.children.some(child => child.contains(other)); }
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this);
    }
  }
  const slot = new Node("div");
  const root = { ownerDocument: { activeElement: null } };
  const focusCalls = [];
  const navigationQuery = { focus: () => { focusCalls.push("query"); root.ownerDocument.activeElement = navigationQuery; } };
  const navigationMenu = { querySelector: () => slot };
  const state = { capabilityIds: [] };
  const localization = { getLocale: () => "pt-BR", translate: (id, values) => id + ":" + values.app };
  let entries = [];
  const catalog = {
    list: () => entries,
    isAvailable: (app, capabilities) => app.requiredCapabilities.every(cap => capabilities.includes(cap)),
  };
  const installed = (id, title, requiredCapabilities = []) => ({
    id, title, monogram: id.slice(0, 2), requiredCapabilities,
    component: { kind: "app", releaseMode: "component-slot" },
    panels: [{ kind: "extension", extensionId: id }],
  });
  const fixture = runInNewContext([
    surface.slice(start, end),
    "renderNativeNavigationInstalledApps",
  ].join("\n"), {
    navigationMenu, root, navigationQuery, state, localization, catalog,
    nativeNavigationInstalledApps, appTitle: (_locale, app) => app.title,
    element: (tag, klass, label) => new Node(tag, klass, label),
  });
  fixture();
  assert.equal(slot.children.length, 0, "absent apps produce no fake navigation");

  entries = [installed("assistant", "Aura"), installed("notes", "Notas", ["notes.read"])];
  fixture();
  assert.deepEqual(Array.from(slot.children, button => button.dataset.launchApp), ["assistant"]);
  assert.equal(slot.children[0].attributes["aria-label"], "surface.launcher.open:Aura");
  state.capabilityIds = ["notes.read"];
  fixture();
  assert.deepEqual(Array.from(slot.children, button => button.dataset.launchApp), ["assistant", "notes"]);
  const notesButton = slot.children[1];
  assert.equal(notesButton.textContent, "", "the label remains a child, not raw HTML");
  assert.equal(notesButton.querySelector(".ordax-nav-installed-app-label").textContent, "Notas");

  entries[1] = { ...entries[1], title: "Notes" };
  fixture();
  assert.equal(slot.children[1], notesButton, "localization refresh preserves keyboard focus");
  assert.equal(notesButton.querySelector(".ordax-nav-installed-app-label").textContent, "Notes");

  root.ownerDocument.activeElement = notesButton;
  state.capabilityIds = [];
  fixture();
  assert.deepEqual(Array.from(slot.children, button => button.dataset.launchApp), ["assistant"]);
  assert.deepEqual(focusCalls, ["query"], "revoked focused app returns focus to search");
  entries = [];
  fixture();
  assert.equal(slot.children.length, 0, "uninstalled app leaves no navigation action");
});

test("Ctrl+K keeps the active search and arrows traverse only visible enabled results", async () => {
  const { runInNewContext } = await import("node:vm");
  const source = await read("surface.mjs");
  const openStart = source.indexOf("  let navigationMenuTrigger = null;");
  const closeStart = source.indexOf("  const closeNativeNavigation =", openStart);
  const arrowsStart = source.indexOf("  const handleNativeNavigationArrow = (event) => {", closeStart);
  const arrowsEnd = source.indexOf("\n  const onClick = (event) => {", arrowsStart);
  assert.ok(openStart > 0 && closeStart > openStart && arrowsStart > closeStart && arrowsEnd > arrowsStart);

  class Focusable {
    constructor(id) { this.id = id; this.isConnected = true; this.focusCount = 0; }
    focus() { this.focusCount += 1; }
  }
  const trigger = new Focusable("trigger");
  const another = new Focusable("another");
  const query = new Focusable("query");
  query.value = "old";
  query.closest = () => null;
  const navigationMenu = { hidden: true };
  const expanded = [];
  const tasks = [];
  const filtered = [];
  const session = runInNewContext(
    source.slice(openStart, closeStart) + "\n({ openNativeNavigation, trigger: () => navigationMenuTrigger });",
    {
      document: { activeElement: trigger }, HTMLElement: Focusable,
      state: { launcherOpen: false }, areaMenu: { hidden: true },
      navigationMenu, navigationQuery: query,
      root: { querySelectorAll: () => [{ setAttribute: (_key, value) => expanded.push(value) }] },
      filterNativeNavigation: (value) => filtered.push(value),
      queueMicrotask: (task) => tasks.push(task),
    },
  );
  session.openNativeNavigation(trigger);
  assert.equal(navigationMenu.hidden, false);
  assert.equal(query.value, "");
  assert.equal(session.trigger(), trigger);
  assert.deepEqual(filtered, [""]);
  assert.deepEqual(expanded, ["true"]);
  query.value = "notas";
  session.openNativeNavigation(another);
  assert.equal(query.value, "notas", "repeated Ctrl+K cannot erase a typed search");
  assert.equal(session.trigger(), trigger, "Escape target remains the original opener");
  assert.equal(query.focusCount, 1, "repeated Ctrl+K focuses existing input");
  tasks[0]();
  assert.equal(query.focusCount, 2, "first open eventually focuses input");
  navigationMenu.hidden = true;
  tasks[0]();
  assert.equal(query.focusCount, 2, "a closed menu must not steal focus later");

  const activeGroup = { hidden: false };
  const hiddenGroup = { hidden: true };
  const focus = [];
  function button(id, group, { hidden = false, disabled = false } = {}) {
    return {
      id, hidden, disabled,
      closest(selector) {
        if (selector === "[data-nav-menu-item]") return this;
        if (selector === "[data-nav-menu-group]") return group;
        return null;
      },
      focus() { focus.push(id); },
    };
  }
  const a = button("a", activeGroup);
  const no = button("disabled", activeGroup, { disabled: true });
  const hidden = button("hidden", activeGroup, { hidden: true });
  const inactive = button("group-hidden", hiddenGroup);
  const b = button("b", activeGroup);
  let buttons = [a, no, hidden, inactive, b];
  navigationMenu.querySelectorAll = () => buttons.filter(x => !x.hidden && !x.disabled);
  const arrow = runInNewContext(
    source.slice(arrowsStart, arrowsEnd) + "\nhandleNativeNavigationArrow",
    { navigationMenu, navigationQuery: query },
  );
  const key = (target, direction) => {
    const event = { target, key: direction, prevented: false, preventDefault() { this.prevented = true; } };
    const used = arrow(event);
    assert.equal(event.prevented, used);
    return used;
  };
  navigationMenu.hidden = false;
  assert.equal(key(query, "ArrowDown"), true);
  assert.deepEqual(focus, ["a"], "skip disabled, hidden and hidden-group candidates");
  key(a, "ArrowDown");
  assert.deepEqual(focus, ["a", "b"]);
  key(b, "ArrowDown");
  assert.equal(query.focusCount, 3, "end of results returns to search");
  key(query, "ArrowUp");
  key(b, "ArrowUp");
  key(a, "ArrowUp");
  assert.deepEqual(focus, ["a", "b", "b", "a"]);
  assert.equal(query.focusCount, 4, "backtracking before first result returns to search");
  assert.equal(key(another, "ArrowDown"), false, "unrelated controls keep native arrow behavior");
  buttons = [no, hidden, inactive];
  assert.equal(key(query, "ArrowDown"), false, "no visible results means no synthetic selection");
  navigationMenu.hidden = true;
  assert.equal(key(query, "ArrowUp"), false, "hidden menu cannot capture keys");
  assert.match(source, /if \(handleNativeNavigationArrow\(event\)\) return;/);
  assert.match(source, /if \(event.key === "Escape" && !navigationMenu.hidden\) \{\s*event.preventDefault\(\)/);
});

test("Native Ctrl+K announces zero matches and restores focus when a result is hidden or revoked", async () => {
  const { runInNewContext } = await import("node:vm");
  const [source, markup, css] = await Promise.all([
    read("surface.mjs"), read("desktop-shell.mjs"), read("identity.css"),
  ]);
  assert.match(markup, /data-native-navigation-empty role="status" aria-live="polite" aria-atomic="true" hidden/);
  assert.match(css, /\.ordax-native-navigation-empty\[hidden\] \{ display: none; \}/);
  const start = source.indexOf("  const filterNativeNavigation = query => {");
  const end = source.indexOf("\n  const handleNativeNavigationArrow =", start);
  assert.ok(start >= 0 && end > start, "test the actual Native search filter");

  let currentLocale = "pt-BR";
  const group = { hidden: false, items: [], querySelector() {
    return this.items.find(button => !button.hidden) ?? null;
  } };
  const first = { textContent: "Início", hidden: false, disabled: false,
    matches: () => true, closest: () => group };
  const second = { textContent: "Notas", hidden: false, disabled: false,
    matches: () => true, closest: () => group };
  group.items = [first, second];
  const empty = { textContent: "", hidden: true };
  let activeElement = null;
  let restored = 0;
  const navigationQuery = { focus() { activeElement = navigationQuery; restored += 1; } };
  const root = { ownerDocument: { get activeElement() { return activeElement; } } };
  const navigationMenu = {
    hidden: false,
    querySelectorAll: (selector) => selector === "[data-nav-menu-item]" ? group.items : [group],
    querySelector: (selector) => selector === "[data-native-navigation-empty]" ? empty : null,
  };
  const filter = runInNewContext(source.slice(start, end) + "\nfilterNativeNavigation", {
    navigationMenu, navigationQuery, localization: { getLocale: () => currentLocale }, root,
  });
  filter("nótas");
  assert.equal(first.hidden, true);
  assert.equal(second.hidden, false, "accent-insensitive matching still works");
  assert.equal(group.hidden, false);
  assert.equal(empty.hidden, true);
  activeElement = second;
  filter("resultado que não existe");
  assert.equal(group.hidden, true);
  assert.equal(empty.hidden, false);
  assert.equal(empty.textContent, "Nenhum destino ou aplicativo encontrado.");
  assert.equal(activeElement, navigationQuery, "selected hidden result returns to search");
  assert.equal(restored, 1);

  currentLocale = "en-US";
  filter("not-found");
  assert.equal(empty.textContent, "No destinations or apps found.");
  filter("");
  assert.equal(empty.hidden, true, "normal results conceal the empty message");
  assert.equal(group.hidden, false);

  activeElement = second;
  second.disabled = true;
  filter("Notas");
  assert.equal(restored, 2, "a revoked active result returns focus to search");
  navigationMenu.hidden = true;
  activeElement = second;
  filter("not-found");
  assert.equal(restored, 2, "a closed menu never steals focus");
});
