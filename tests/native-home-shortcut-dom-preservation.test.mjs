import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = (await readFile(new URL("../system/surface/ui/surface.mjs", import.meta.url), "utf8"))
  .replace(/\r\n/g, "\n");

function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, "missing production source: " + start);
  return source.slice(a, b);
}

class FakeNode {
  constructor(tag = "div", className = "", text = "") {
    this.tag = tag;
    this.className = className;
    this.parent = null;
    this.children = [];
    this.attrs = new Map();
    this.dataset = {};
    this._text = text;
    this._title = "";
    this._hidden = false;
    this._disabled = false;
    this.writes = 0;
    this.focusCount = 0;
  }
  get textContent() { return this._text; }
  set textContent(value) { this._text = value; this.writes++; }
  get title() { return this._title; }
  set title(value) { this._title = value; this.writes++; this.attrs.set("title", value); }
  get hidden() { return this._hidden; }
  set hidden(value) { this._hidden = value; this.writes++; }
  get disabled() { return this._disabled; }
  set disabled(value) { this._disabled = value; this.writes++; }
  append(...nodes) {
    for (const child of nodes) {
      this.children.push(child);
      child.parent = this;
    }
  }
  before(node) {
    if (!this.parent) throw Error("detached anchor");
    const index = this.parent.children.indexOf(this);
    this.parent.children.splice(index, 0, node);
    node.parent = this.parent;
  }
  querySelector(selector) {
    if (selector.startsWith(".")) {
      return this.children.find(child => child.className.split(" ").includes(selector.slice(1))) ?? null;
    }
    return null;
  }
  querySelectorAll(selector) {
    if (selector === "[data-native-home-installed-app]") {
      return this.children.filter(child => !!child.dataset.nativeHomeInstalledApp);
    }
    throw Error("unexpected selector " + selector);
  }
  setAttribute(name, value) { this.attrs.set(name, value); this.writes++; }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  hasAttribute(name) {
    if (name === "data-launch-app") return Object.hasOwn(this.dataset, "launchApp");
    return this.attrs.has(name);
  }
  removeAttribute(name) {
    this.writes++;
    if (name === "data-launch-app") delete this.dataset.launchApp;
    else {
      this.attrs.delete(name);
      if (name === "title") this._title = "";
    }
  }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  focus() { this.focusCount++; }
  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter(child => child !== this);
    this.parent = null;
  }
}

const element = (tag, klass, text) => new FakeNode(tag, klass, text);
const helpers = section("function syncText(", "// A cosmetic preference");
const assistantCode = section("  const renderHomeAssistant = () => {", "  const renderHomeInstalledApps = () => {");
const homeCode = section("  const renderHomeInstalledApps = () => {", "  const renderNativeNavigationInstalledApps = () => {");
const navigationCode = section("  const renderNativeNavigationInstalledApps = () => {", "  const renderSidebar = () => {");

test("Aura shortcut keeps mounted metadata on identical renders and removes access on revocation", () => {
  const button = new FakeNode("button");
  button.hidden = true;
  button.disabled = true;
  const labelNode = new FakeNode("span", "", "");
  button.querySelector = selector => {
    assert.equal(selector, "[data-native-home-assistant-label]");
    return labelNode;
  };
  let app = null, locale = "pt", capabilityIds = [];
  const state = { get capabilityIds() { return capabilityIds; } };
  const root = { querySelector(selector) {
    assert.equal(selector, "[data-native-home-assistant]");
    return button;
  }};
  const render = runInNewContext(helpers + assistantCode + "\nrenderHomeAssistant", {
    root, state,
    catalog: {},
    localization: { translate: (_, args) => locale + ":open " + args.app },
    nativeHomeAssistantApp: () => app,
    appTitle: (_localization, a) => locale + ":" + a.title,
  });

  const startWrites = button.writes + labelNode.writes;
  render();
  render();
  assert.equal(button.writes + labelNode.writes, startWrites,
    "missing app remains disabled without repeated clearing");
  app = { id: "assistant", title: "Aura" };
  render();
  assert.equal(button.hidden, false);
  assert.equal(button.disabled, false);
  assert.equal(button.dataset.launchApp, "assistant");
  assert.equal(button.getAttribute("aria-label"), "pt:open pt:Aura");
  const grantedWrites = button.writes + labelNode.writes;
  render();
  assert.equal(button.writes + labelNode.writes, grantedWrites,
    "available app is not hidden, disabled, erased or reconstructed");
  locale = "en";
  render();
  assert.equal(labelNode.textContent, "en:Aura");
  assert.equal(button.getAttribute("aria-label"), "en:open en:Aura");
  const translatedWrites = button.writes + labelNode.writes;
  render();
  assert.equal(button.writes + labelNode.writes, translatedWrites);
  app = null;
  capabilityIds = [];
  render();
  assert.equal(button.hidden, true);
  assert.equal(button.disabled, true);
  assert.equal(button.dataset.launchApp, undefined, "revoked app route fails closed");
  assert.equal(button.getAttribute("aria-label"), null);
  assert.equal(button.getAttribute("title"), null);
  assert.equal(labelNode.textContent, "");
  const revokedWrites = button.writes + labelNode.writes;
  render();
  assert.equal(button.writes + labelNode.writes, revokedWrites);
  assert.match(assistantCode, /const app = nativeHomeAssistantApp\(catalog, state\.capabilityIds\)/);
  assert.match(assistantCode, /button\.removeAttribute\("data-launch-app"\)/);
});

test("Home installed shortcuts reuse controls, update locale and revoke focused app", () => {
  const root = { ownerDocument: { activeElement: null } };
  const grid = new FakeNode("div", "ordax-home-action-grid");
  const add = new FakeNode("button", "ordax-home-add-app");
  grid.append(add);
  add.focus = () => { add.focusCount++; root.ownerDocument.activeElement = add; };
  root.querySelector = selector => selector === ".ordax-home-action-grid" ? grid : null;
  let locale = "pt";
  const notes = { id: "notes", title: "Notas", monogram: "NO" };
  const gallery = { id: "gallery", title: "Galeria", monogram: "GA" };
  let installed = [notes, gallery];
  const render = runInNewContext(homeCode + "\nrenderHomeInstalledApps", {
    root,
    state: { capabilityIds: [] },
    catalog: {},
    localization: { translate: (_, args) => locale + ":open " + args.app },
    nativeHomeInstalledApps: () => installed,
    appTitle: (_i18n, app) => locale + ":" + app.title,
    element,
  });
  render();
  const [notesButton, galleryButton] = grid.querySelectorAll("[data-native-home-installed-app]");
  assert.equal(grid.children.at(-1), add);
  assert.equal(notesButton.dataset.launchApp, "notes");
  assert.equal(notesButton.querySelector(".ordax-home-installed-app-label").textContent, "pt:Notas");
  const snapshot = [notesButton.writes, galleryButton.writes,
    ...[notesButton, galleryButton].flatMap(button =>
      button.children.map(child => child.writes))];
  render();
  assert.strictEqual(grid.children[0], notesButton);
  assert.deepEqual([notesButton.writes, galleryButton.writes,
    ...[notesButton, galleryButton].flatMap(button =>
      button.children.map(child => child.writes))], snapshot,
    "identical installed metadata never rewrites mounted elements");
  locale = "en";
  render();
  assert.equal(notesButton.querySelector(".ordax-home-installed-app-label").textContent, "en:Notas");
  assert.equal(notesButton.getAttribute("aria-label"), "en:open en:Notas");
  root.ownerDocument.activeElement = notesButton;
  installed = [gallery];
  render();
  assert.equal(grid.children.includes(notesButton), false, "revoked app is removed");
  assert.equal(add.focusCount, 1, "focus returns to Add App, not detached shortcut");
  assert.equal(grid.children[0], galleryButton, "unaffected shortcut stays mounted");
  installed = [];
  render();
  assert.equal(grid.querySelectorAll("[data-native-home-installed-app]").length, 0);
});

test("Ctrl+K installed apps reuse nodes, update labels and restore query focus after revocation", () => {
  const root = { ownerDocument: { activeElement: null } };
  const slot = new FakeNode("div");
  const navigationMenu = { querySelector(selector) {
    assert.equal(selector, "[data-native-navigation-installed-apps]");
    return slot;
  }};
  const query = { focusCount: 0, focus() {
    this.focusCount++;
    root.ownerDocument.activeElement = this;
  }};
  let locale = "pt";
  const assistant = { id: "assistant", title: "Aura", monogram: "AU" };
  const notes = { id: "notes", title: "Notas", monogram: "NO" };
  let installed = [assistant, notes];
  const render = runInNewContext(navigationCode + "\nrenderNativeNavigationInstalledApps", {
    root, navigationMenu, navigationQuery: query,
    state: { capabilityIds: [] },
    catalog: {},
    localization: { translate: (_, args) => locale + ":open " + args.app },
    nativeNavigationInstalledApps: () => installed,
    appTitle: (_i18n, app) => locale + ":" + app.title,
    element,
  });
  render();
  const [assistantButton, notesButton] = slot.children;
  assert.equal(notesButton.dataset.navMenuApp, "notes");
  assert.equal(notesButton.getAttribute("aria-label"), "pt:open pt:Notas");
  const snapshot = [notesButton.writes, ...notesButton.children.map(c => c.writes)];
  render();
  assert.strictEqual(slot.children[1], notesButton);
  assert.deepEqual([notesButton.writes, ...notesButton.children.map(c => c.writes)],
    snapshot, "unchanged installed app remains mounted with zero attribute/text writes");
  locale = "en";
  render();
  assert.equal(notesButton.querySelector(".ordax-nav-installed-app-label").textContent, "en:Notas");
  assert.equal(notesButton.getAttribute("aria-label"), "en:open en:Notas");
  root.ownerDocument.activeElement = notesButton;
  installed = [assistant];
  render();
  assert.strictEqual(slot.children[0], assistantButton);
  assert.equal(notesButton.parent, null);
  assert.equal(query.focusCount, 1, "revoked focused item returns to search");
  installed = [];
  render();
  assert.equal(slot.children.length, 0);
  assert.equal(query.focusCount, 1);
});

test("all three renderers depend on the trusted catalog projection, not a parallel registry", () => {
  assert.match(homeCode, /nativeHomeInstalledApps\(catalog, state\.capabilityIds\)/);
  assert.match(navigationCode, /nativeNavigationInstalledApps\(catalog, state\.capabilityIds\)/);
  assert.match(homeCode, /const retained = new Set\(\)/);
  assert.match(navigationCode, /const retained = new Set\(\)/);
  assert.doesNotMatch(homeCode + navigationCode + assistantCode,
    /localStorage|sessionStorage|new MutationObserver|setInterval/);
});
