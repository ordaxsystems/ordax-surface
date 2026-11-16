import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = (await readFile(
  new URL("../system/surface/ui/surface.mjs", import.meta.url), "utf8",
)).replace(/\r\n/g, "\n");

function section(begin, end) {
  const start = source.indexOf(begin);
  const stop = source.indexOf(end, start + begin.length);
  assert.ok(start >= 0 && stop > start, "missing real Surface source: " + begin);
  return source.slice(start, stop);
}

const helpers = section("function syncText(", "// A cosmetic preference");
const overflow = section("  const updateDockOverflow = () => {", "  const onNativeDockWheel =");
const dock = section("  const renderDock = () => {", "  const renderHomeAssistant = () => {");

function tracked(init = {}) {
  const writes = { dataset: 0, attributes: 0, removed: 0, title: 0, hidden: 0 };
  const values = { ...init };
  const dataset = new Proxy(values, {
    set(target, key, value) {
      writes.dataset += 1;
      target[key] = String(value);
      return true;
    },
    deleteProperty(target, key) {
      writes.dataset += 1;
      delete target[key];
      return true;
    },
  });
  const attributes = new Map();
  let title = "", hidden = false;
  const icon = { innerHTML: "<svg>editor</svg>", textContent: "" };
  return {
    writes, dataset, icon, type: "button",
    get hidden() { return hidden; },
    set hidden(value) { writes.hidden++; hidden = value; },
    get title() { return title; },
    set title(value) { writes.title++; title = value; },
    setAttribute(name, value) { writes.attributes++; attributes.set(name, value); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    hasAttribute(name) {
      return name.startsWith("data-")
        ? Object.hasOwn(dataset, name.replace(/^data-/, "").replace(/-([a-z])/g, (_, c) => c.toUpperCase()))
        : attributes.has(name);
    },
    removeAttribute(name) {
      writes.removed++;
      if (name.startsWith("data-")) {
        const key = name.replace(/^data-/, "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        delete dataset[key];
      } else attributes.delete(name);
    },
    querySelector(selector) { return selector === ".ordax-rail-icon" ? icon : null; },
    prepend() { throw Error("mounted dock icon must be reused"); },
    remove() { throw Error("unexpected dock removal"); },
  };
}

function mutationCount(...nodes) {
  return nodes.reduce((total, node) =>
    total + Object.values(node.writes).reduce((sum, value) => sum + value, 0), 0);
}

function scenario() {
  const pinned = tracked({ dockPinnedApp: "notes", launchApp: "notes" });
  const running = tracked({ openWindow: "w2" });
  const nativeDock = tracked();
  nativeDock.scrollWidth = 450;
  nativeDock.clientWidth = 200;
  nativeDock.scrollLeft = 0;
  const windows = [
    { id: "w1", appId: "notes", minimized: false },
    { id: "w2", appId: "editor", minimized: false },
  ];
  const area = { activeWindowId: "w1", windows };
  const apps = new Map([
    ["notes", { id: "notes", title: "Notes", monogram: "N" }],
    ["editor", { id: "editor", title: "Editor", monogram: "E" }],
  ]);
  let overflowCalls = 0;
  const runningApps = { children: [running] };
  const root = {
    querySelectorAll(selector) {
      assert.equal(selector, "[data-dock-pinned-app]");
      return [pinned];
    },
  };
  const environment = {
    root, nativeDock, runningApps, state: {},
    catalog: { get(id) { return apps.get(id) ?? null; } },
    getActiveArea: () => area,
    appTitle: (_, app) => app.title,
    localization: {
      translate(id, args = {}) { return id + (args.app ? ":" + args.app : ""); },
    },
    ICONS: { editor: "<svg>editor</svg>", notes: "<svg>notes</svg>" },
    element() { throw Error("mounted dock controls must be reused"); },
    placeChildAt(container, child) {
      assert.ok(container.children.includes(child));
    },
  };
  const functions = runInNewContext(
    helpers + overflow + dock + "\n({ renderDock, updateDockOverflow })",
    environment,
  );
  return { ...functions, pinned, running, nativeDock, area, windows, apps,
    get overflowCalls() { return overflowCalls; } };
}

test("dock reuses mounted controls and does not rewrite state on repeated focus events", () => {
  const h = scenario();
  h.renderDock();
  assert.equal(h.pinned.dataset.openWindow, "w1");
  assert.equal(h.pinned.dataset.active, "true");
  assert.equal(h.running.dataset.active, "false");
  assert.equal(h.pinned.hasAttribute("data-launch-app"), false);
  assert.equal(h.pinned.getAttribute("aria-current"), "true");
  assert.equal(h.running.getAttribute("aria-current"), null);
  assert.equal(h.pinned.title, "Notes · surface.dock.focus:Notes");
  const writes = mutationCount(h.pinned, h.running, h.nativeDock);
  h.renderDock();
  assert.equal(mutationCount(h.pinned, h.running, h.nativeDock), writes,
    "an unchanged dock must not mutate DOM even when rendering again");

  h.area.activeWindowId = "w2";
  h.renderDock();
  assert.equal(h.pinned.dataset.active, "false");
  assert.equal(h.running.dataset.active, "true");
  assert.equal(h.pinned.getAttribute("aria-current"), null);
  assert.equal(h.running.getAttribute("aria-current"), "true");
  const focusedWrites = mutationCount(h.pinned, h.running, h.nativeDock);
  h.renderDock();
  assert.equal(mutationCount(h.pinned, h.running, h.nativeDock), focusedWrites);

  h.windows[1].minimized = true;
  h.renderDock();
  assert.equal(h.running.dataset.minimized, "true");
  assert.equal(h.running.getAttribute("aria-label"), "surface.dock.restore:Editor");
  h.windows.splice(0, 1);
  h.renderDock();
  assert.equal(h.pinned.dataset.openWindow, undefined);
  assert.equal(h.pinned.dataset.launchApp, "notes");
  assert.equal(h.pinned.getAttribute("aria-current"), null);
  assert.equal(h.pinned.title, "Notes");
  const afterClose = mutationCount(h.pinned, h.running, h.nativeDock);
  h.renderDock();
  assert.equal(mutationCount(h.pinned, h.running, h.nativeDock), afterClose);
  h.apps.delete("notes");
  h.renderDock();
  assert.equal(h.pinned.hidden, true, "missing catalog app is hidden immediately");
});

test("first pinned window wins without repeated array searches", () => {
  assert.match(dock, /const firstWindowByAppId = new Map\(\)/);
  assert.doesNotMatch(dock, /area\.windows\.find\(\(item\) => item\.appId === appId\)/);
  const h = scenario();
  h.windows.push({ id: "w3", appId: "notes", minimized: false });
  h.renderDock();
  assert.equal(h.pinned.dataset.openWindow, "w1");
  h.windows.shift();
  h.renderDock();
  assert.equal(h.pinned.dataset.openWindow, "w3",
    "first remaining window stays the canonical pinned target");
});

test("scroll and resize update dock overflow indicators only across thresholds", () => {
  const h = scenario();
  h.updateDockOverflow();
  assert.equal(h.nativeDock.dataset.scrollBefore, "false");
  assert.equal(h.nativeDock.dataset.scrollAfter, "true");
  const first = mutationCount(h.nativeDock);
  for (let i = 0; i < 8; i++) h.updateDockOverflow();
  assert.equal(mutationCount(h.nativeDock), first);
  h.nativeDock.scrollLeft = 50;
  h.updateDockOverflow();
  assert.equal(h.nativeDock.dataset.scrollBefore, "true");
  h.nativeDock.scrollLeft = 249.5;
  h.updateDockOverflow();
  assert.equal(h.nativeDock.dataset.scrollAfter, "false");
  const last = mutationCount(h.nativeDock);
  h.updateDockOverflow();
  assert.equal(mutationCount(h.nativeDock), last);
  assert.match(overflow, /syncDataset\(nativeDock, "scrollBefore"/);
  assert.match(overflow, /syncDataset\(nativeDock, "scrollAfter"/);
});

test("dock keeps its existing security and lifecycle gates", () => {
  assert.match(dock, /const app = catalog\.get\(appId\)/);
  assert.match(dock, /if \(!app\) \{\s*syncHidden\(button, true\)/);
  assert.match(dock, /const app = catalog\.get\(windowState\.appId\)/);
  assert.match(dock, /button\.dataset\.minimized = String\(windowState\.minimized\)/,
    "preserves the source-level minimized indicator required by OS integration");
  assert.match(dock, /for \(const child of Array\.from\(runningApps\.children\)\)/);
  assert.match(dock, /updateDockOverflow\(\);/);
  assert.match(source, /nativeDock\?\.addEventListener\("scroll", updateDockOverflow/);
  assert.match(source, /dockObserver\?\.disconnect\(\)/);
});
