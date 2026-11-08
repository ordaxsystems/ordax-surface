import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

class FakeElement {
  constructor(tag, doc) {
    this.tag = tag;
    this.ownerDocument = doc;
    this.parentNode = null;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.events = new Map();
    this.hidden = false;
    this.disabled = false;
    this.className = "";
    this.textContent = "";
  }
  append(...children) {
    for (const child of children) {
      this.children.push(child);
      child.parentNode = this;
    }
  }
  replaceChildren(...children) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this.append(...children);
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  matches(selector) {
    if (selector.startsWith(".")) return this.className.split(" ").includes(selector.slice(1));
    const match = selector.match(/^\[data-([a-z-]+)\]$/);
    if (!match) return false;
    const key = match[1].replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    return Object.hasOwn(this.dataset, key);
  }
  querySelector(selector) {
    for (const child of this.children) {
      if (child.matches(selector)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
  querySelectorAll(selector) {
    const found = [];
    const visit = node => {
      for (const child of node.children) {
        if (child.matches(selector)) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }
  closest(selector) {
    let current = this;
    while (current) {
      if (current.matches(selector)) return current;
      current = current.parentNode;
    }
    return null;
  }
  focus() { this.ownerDocument.activeElement = this; }
  addEventListener(name, callback) { this.events.set(name, callback); }
  removeEventListener(name, callback) {
    if (this.events.get(name) === callback) this.events.delete(name);
  }
  emit(name, target) { this.events.get(name)?.({ target }); }
  remove() {
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter(node => node !== this);
      this.parentNode = null;
    }
  }
}

test("Native power controls appear on live Host authorization and disappear on revocation", async () => {
  const source = await readFile(new URL("../system/surface/ui/power-controls.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /if \(availableActions\(\)\.length === 0\) \{\s*return Object\.freeze/);
  assert.match(source, /toggle\.hidden = !available/);
  assert.match(source, /toggle\.disabled = !available \|\| pending !== null/);
  assert.match(source, /root\.querySelector\("\[data-workspace\]"\)\?\.focus/);

  const doc = { activeElement: null, createElement(tag) { return new FakeElement(tag, this); } };
  const root = new FakeElement("main", doc);
  const shell = new FakeElement("div", doc);
  shell.dataset.ordaxShell = "";
  const slot = new FakeElement("div", doc);
  slot.dataset.powerSlot = "";
  const workspace = new FakeElement("main", doc);
  workspace.dataset.workspace = "";
  root.append(shell, slot, workspace);

  let current = { allowed: [] };
  let publish = null;
  let unsubscribed = false;
  let executeCount = 0;
  const port = {
    getSnapshot: () => current,
    subscribe(callback) {
      publish = next => { current = next; callback(next); };
      return () => { unsubscribed = true; };
    },
    execute() { executeCount += 1; return Promise.resolve(); },
  };
  const localization = { translate: id => id, subscribe: () => () => {} };
  const lifecycle = { localization };
  const code = source.slice(source.indexOf("const ACTIONS =")).replace(
    "export function mountPowerControls(", "function mountPowerControls(",
  ) + "\nmountPowerControls";
  const mount = runInNewContext(code, {
    Element: FakeElement,
    assertPowerActionsPort: v => v,
    assertSurfaceRenderLifecycle: v => v,
    assertUpdateStatusPort: v => v,
    validatePowerActionsSnapshot: v => v,
    isPowerActionSupported: (snapshot, id) => snapshot.allowed.includes(id),
  });
  const controls = mount(root, port, lifecycle);
  assert.equal(typeof publish, "function", "port remains subscribed if initially unavailable");
  const toggle = slot.querySelector("[data-power-toggle]");
  const overlay = shell.querySelector("[data-power-menu]");
  assert.ok(toggle);
  assert.equal(toggle.hidden, true, "no unauthorised power action appears");
  assert.equal(toggle.disabled, true);
  assert.equal(overlay.hidden, true);

  publish({ allowed: ["restart", "shutdown"] });
  assert.equal(toggle.hidden, false, "authorized host action appears without remount");
  assert.equal(toggle.disabled, false);
  root.emit("click", toggle);
  assert.equal(overlay.hidden, false);
  const restart = overlay.querySelectorAll("[data-power-action]")
    .find(button => button.dataset.powerAction === "restart");
  assert.ok(restart);
  restart.focus();
  root.emit("click", restart);
  assert.equal(executeCount, 0, "first request is only confirmation");

  publish({ allowed: ["shutdown"] });
  assert.equal(overlay.hidden, false, "menu remains useful with another authorized action");
  const shutdown = overlay.querySelectorAll("[data-power-action]")
    .find(button => button.dataset.powerAction === "shutdown");
  assert.ok(shutdown);
  root.emit("click", shutdown);
  assert.equal(executeCount, 0, "revocation invalidates previous confirmation");

  // Confirmation re-renders the grid, so focus the current attached
  // action rather than an old detached button from the previous render.
  const currentShutdown = overlay.querySelectorAll("[data-power-action]")
    .find(button => button.dataset.powerAction === "shutdown");
  currentShutdown.focus();
  publish({ allowed: [] });
  assert.equal(toggle.hidden, true, "revoked power button disappears");
  assert.equal(toggle.disabled, true);
  assert.equal(overlay.hidden, true);
  assert.equal(doc.activeElement, workspace, "focus returns to the visible workspace");
  root.emit("click", toggle);
  assert.equal(overlay.hidden, true, "hidden toggle cannot reopen menu programmatically");

  publish({ allowed: ["restart"] });
  assert.equal(toggle.hidden, false, "authorization recovery needs no remount");
  root.emit("click", toggle);
  assert.equal(overlay.hidden, false);
  const restartAgain = overlay.querySelectorAll("[data-power-action]")[0];
  root.emit("click", restartAgain);
  assert.equal(executeCount, 0, "re-authorization never keeps an old confirmation");

  controls.destroy();
  assert.equal(unsubscribed, true);
  assert.equal(root.events.size, 0);
  assert.equal(toggle.parentNode, null);
  assert.equal(overlay.parentNode, null);
});
