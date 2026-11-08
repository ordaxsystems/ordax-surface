import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

class Node {
  constructor(tag = "div", data = {}) {
    this.tagName = tag.toUpperCase();
    this.dataset = { ...data };
    this.children = [];
    this.parentNode = null;
    this.hidden = false;
    this.disabled = false;
    this.isConnected = true;
    this.attributes = new Map();
    this.listeners = new Map();
    this.dispatched = [];
    this.focusCount = 0;
  }
  append(...nodes) {
    for (const node of nodes) {
      node.parentNode = this;
      this.children.push(node);
    }
  }
  matches(selector) {
    if (selector === "[hidden]") return this.hidden;
    if (selector === "button" || selector === "input") return this.tagName.toLowerCase() === selector;
    const m = selector.match(/^\[data-([a-z-]+)\]$/);
    const key = m?.[1].replace(/-([a-z])/g, (_, x) => x.toUpperCase());
    return !!key && Object.hasOwn(this.dataset, key);
  }
  closest(selector) {
    for (let node = this; node; node = node.parentNode) {
      if (node.matches(selector)) return node;
    }
    return null;
  }
  contains(node) {
    return node === this || this.children.some((child) => child.contains(node));
  }
  querySelectorAll(selector) {
    const matches = [];
    const candidates = selector.split(",").map((part) => part.trim());
    const visit = (node) => {
      for (const child of node.children) {
        if (candidates.some((candidate) => child.matches(candidate))) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  focus() { this.focusCount += 1; }
  setAttribute(key, value) { this.attributes.set(key, value); }
  addEventListener(type, cb) { this.listeners.set(type, cb); }
  removeEventListener(type, cb) {
    if (this.listeners.get(type) === cb) this.listeners.delete(type);
  }
  dispatchEvent(event) { this.dispatched.push(event.type); }
  send(type, target) {
    const event = {
      key: type === "keydown" ? "Escape" : undefined,
      target, prevented: false, stopped: false,
      preventDefault() { this.prevented = true; },
      stopPropagation() { this.stopped = true; },
    };
    this.listeners.get(type)?.(event);
    return event;
  }
}

test("Native quick panels do not capture Escape from another overlay or focus hidden triggers", async () => {
  const code = await readFile(
    new URL("../system/surface/ui/system-tray-quick-panels.mjs", import.meta.url),
    "utf8",
  );
  const mount = runInNewContext(
    code.replace("export function mountSystemTrayQuickPanels(", "function mountSystemTrayQuickPanels(")
      + "\nmountSystemTrayQuickPanels",
    {
      Element: Node,
      HTMLElement: Node,
      CustomEvent: class {
        constructor(type) { this.type = type; }
      },
    },
  );

  const root = new Node();
  const workspace = new Node("main", { workspace: "" });
  const network = new Node("button", { quickPanelToggle: "network" });
  const battery = new Node("button", { quickPanelToggle: "battery" });
  const clock = new Node("button", { quickPanelToggle: "datetime" });
  const networkPanel = new Node("section", { quickPanel: "network" });
  const batteryPanel = new Node("section", { quickPanel: "battery" });
  const clockPanel = new Node("section", { quickPanel: "datetime" });
  const closeNetwork = new Node("button", { quickPanelClose: "" });
  const closeBattery = new Node("button", { quickPanelClose: "" });
  const closeClock = new Node("button", { quickPanelClose: "" });
  networkPanel.append(closeNetwork);
  batteryPanel.append(closeBattery);
  clockPanel.append(closeClock);
  networkPanel.hidden = true;
  batteryPanel.hidden = true;
  clockPanel.hidden = true;
  root.append(workspace, network, battery, clock, networkPanel, batteryPanel, clockPanel);
  const controller = mount(root);

  const open = root.send("click", network);
  assert.equal(open.prevented, true);
  assert.equal(open.stopped, true);
  assert.equal(networkPanel.hidden, false);
  assert.equal(closeNetwork.focusCount, 1, "open panel gets keyboard focus");
  assert.deepEqual(networkPanel.dispatched, ["ordax:quick-panel-open"]);

  // A different overlay can open while the tray panel remains visible.
  const otherDialog = new Node("div", { nativeNavigationMenu: "" });
  root.append(otherDialog);
  const unrelatedEscape = root.send("keydown", otherDialog);
  assert.equal(unrelatedEscape.prevented, false);
  assert.equal(networkPanel.hidden, false, "Escape in Ctrl+K must not close the tray");
  assert.equal(network.focusCount, 0, "focus is not stolen from the active overlay");

  const relevantEscape = root.send("keydown", closeNetwork);
  assert.equal(relevantEscape.prevented, true);
  assert.equal(networkPanel.hidden, true);
  assert.equal(network.attributes.get("aria-expanded"), "false");
  assert.equal(network.focusCount, 1, "closing from the panel restores the visible trigger");

  battery.hidden = true;
  root.send("click", battery);
  assert.equal(batteryPanel.hidden, true, "hidden battery item cannot open a panel");
  battery.hidden = false;
  battery.disabled = true;
  root.send("click", battery);
  assert.equal(batteryPanel.hidden, true, "disabled quick action cannot open a panel");
  battery.disabled = false;
  root.send("click", battery);
  assert.equal(batteryPanel.hidden, false);
  assert.equal(closeBattery.focusCount, 1);

  battery.hidden = true;
  const revokedEscape = root.send("keydown", closeBattery);
  assert.equal(revokedEscape.prevented, true);
  assert.equal(batteryPanel.hidden, true);
  assert.equal(battery.focusCount, 0, "never focus the hidden battery trigger");
  assert.equal(workspace.focusCount, 1, "fallback focus goes to visible workspace");

  battery.hidden = false;
  root.send("click", network);
  root.send("click", clock);
  assert.equal(networkPanel.hidden, true, "switching panels closes the previous one");
  assert.equal(clockPanel.hidden, false);
  assert.equal(network.focusCount, 1, "switching must not steal focus back to previous trigger");
  assert.equal(closeClock.focusCount, 1);
  root.send("click", closeClock);
  assert.equal(clockPanel.hidden, true);
  assert.equal(clock.focusCount, 1);

  controller.destroy();
  assert.equal(root.listeners.size, 0, "clean teardown removes both handlers");
});
