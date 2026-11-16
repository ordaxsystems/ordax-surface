import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = await readFile(
  new URL("../system/surface/ui/surface.mjs", import.meta.url), "utf8",
);
function section(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, "missing Surface function: " + start);
  return source.slice(from, to);
}
const helpers = section("function syncText(", "function areaLabel(");

class Node {
  constructor() {
    this.dataset = {};
    this.attributes = {};
    this.children = new Map();
    this.actions = [];
    this._text = "";
    this.textWrites = 0;
    this.attrWrites = 0;
    this._hidden = false;
    this.hiddenWrites = 0;
  }
  get textContent() { return this._text; }
  set textContent(value) { this.textWrites++; this._text = value; }
  get hidden() { return this._hidden; }
  set hidden(value) { this.hiddenWrites++; this._hidden = value; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  setAttribute(name, value) { this.attrWrites++; this.attributes[name] = String(value); }
  querySelector(name) { return this.children.get(name) ?? null; }
  querySelectorAll(name) { return name === "[data-window-action]" ? this.actions : []; }
}

function mountWindowHarness() {
  const win = new Node(), heading = new Node(), title = new Node(), description = new Node();
  const titlebar = new Node(), body = new Node();
  heading.children.set("strong", title);
  heading.children.set("small", description);
  win.children.set(".ordax-window-title-group", heading);
  win.children.set("[data-window-titlebar]", titlebar);
  win.children.set(".ordax-window-body", body);
  win.actions = ["minimize", "maximize", "close"].map(action => {
    const button = new Node();
    button.dataset.windowAction = action;
    return button;
  });
  const styles = {};
  let styleWrites = 0, panelSyncs = 0, language = "pt-BR";
  const style = {
    getPropertyValue(name) { return styles[name] ?? ""; },
    setProperty(name, value) { styleWrites++; styles[name] = value; },
    removeProperty(name) { styleWrites++; delete styles[name]; },
  };
  for (const name of ["left", "top", "transform"]) {
    Object.defineProperty(style, name, {
      get() { return styles[name] ?? ""; },
      set(value) { styleWrites++; styles[name] = value; },
    });
  }
  win.style = style;
  const app = { id: "notes" };
  const windowState = {
    id: "w1", minimized: false, maximized: false,
    placementOrdinal: 1, positionX: 30, positionY: 60,
  };
  const state = { presentation: "desktop" };
  const area = { id: "area-1", activeWindowId: "w1" };
  const localization = { translate: (key, args) => language + ":" + key + ":" + (args?.app ?? "") };
  const paint = runInNewContext([
    helpers,
    section("function syncWindowNode(", "function createWindow("),
    "syncWindowNode",
  ].join("\n"), {
    appTitle: (_locale, currentApp) => language + ":" + currentApp.id,
    appDescription: (_locale, currentApp) => language + ":description:" + currentApp.id,
    syncWindowPanels() { panelSyncs++; },
  });
  return {
    win, title, description, titlebar, body, styles, windowState, state, area,
    locale(value) { language = value; },
    render() { paint(win, app, windowState, state, 0, area, localization); },
    counts() {
      return {
        text: title.textWrites + description.textWrites,
        aria: win.attrWrites + titlebar.attrWrites + win.actions.reduce((n, x) => n + x.attrWrites, 0),
        style: styleWrites, hidden: win.hiddenWrites, panels: panelSyncs,
      };
    },
  };
}

test("Native window retains labels, accessible controls and geometry on identical renders", () => {
  const h = mountWindowHarness();
  h.render();
  assert.equal(h.title.textContent, "pt-BR:notes");
  assert.equal(h.description.textContent, "pt-BR:description:notes");
  assert.equal(h.win.getAttribute("role"), "region");
  assert.equal(h.win.actions[1].getAttribute("aria-label"), "pt-BR:surface.window.maximize:pt-BR:notes");
  assert.equal(h.styles.left, "30px");
  assert.equal(h.styles["--ordax-window-offset"], "-8%");
  const initial = h.counts();
  h.render();
  assert.deepEqual(h.counts(), { ...initial, panels: initial.panels + 1 },
    "unchanged chrome has no text, attribute, style or visibility writes, while panels remain synchronized");
  h.area.activeWindowId = null;
  h.render();
  assert.equal(h.win.dataset.active, "false");
  assert.equal(h.counts().aria, initial.aria, "focus change does not rewrite accessible labels");
  h.windowState.positionX = 45;
  h.render();
  assert.equal(h.styles.left, "45px");
  assert.equal(h.styles.top, "60px");
  h.locale("en-US");
  h.render();
  assert.equal(h.title.textContent, "en-US:notes");
  assert.equal(h.description.textContent, "en-US:description:notes");
  assert.equal(h.win.actions[2].getAttribute("aria-label"), "en-US:surface.window.close:en-US:notes");
});

test("Native maximize, minimize and restore still update geometry and accessibility", () => {
  const h = mountWindowHarness();
  h.render();
  h.windowState.maximized = true;
  h.render();
  assert.equal(h.styles.left, undefined);
  assert.equal(h.styles.top, undefined);
  assert.equal(h.styles.transform, undefined);
  assert.equal(h.win.dataset.positioned, undefined);
  assert.equal(h.win.actions[1].getAttribute("aria-label"), "pt-BR:surface.window.restore:pt-BR:notes");
  const max = h.counts();
  h.render();
  assert.deepEqual(h.counts(), { ...max, panels: max.panels + 1 });
  h.windowState.minimized = true;
  h.render();
  assert.equal(h.win.hidden, true);
  assert.equal(h.win.dataset.active, "false");
  h.windowState.minimized = false;
  h.windowState.maximized = false;
  h.render();
  assert.equal(h.win.hidden, false);
  assert.equal(h.styles.left, "30px");
  assert.equal(h.win.dataset.positioned, "true");
  assert.equal(h.win.actions[1].getAttribute("aria-label"), "pt-BR:surface.window.maximize:pt-BR:notes");
});

test("Native panel synchronization avoids duplicate text and reacts to status and locale changes", () => {
  const nodes = new Map();
  for (const key of [".ordax-app-panel-label", ".ordax-app-panel-title", ".ordax-app-panel-body", ".ordax-inline-status"]) {
    nodes.set(key, new Node());
  }
  const panelNode = new Node();
  panelNode.querySelector = selector => nodes.get(selector) ?? null;
  const panel = { kind: "connectivity", body: true };
  const state = { connectivity: "online" };
  let language = "pt-BR";
  const localization = { translate: key => language + ":" + key };
  const sync = runInNewContext([
    helpers,
    section("function syncPanel(", "function syncWindowPanels("),
    "syncPanel",
  ].join("\n"), {
    panelCopy: (_localization, _app, _index, field) => language + ":" + field,
    CONNECTIVITY_MESSAGE_IDS: { online: "online", offline: "offline" },
    capabilityState: () => "available",
    renderCapabilitiesPanel: () => {},
    syncPreferenceChoice: () => {},
  });
  const paint = () => sync(panelNode, panel, state, 0, {}, localization);
  const count = () => [...nodes.values()].reduce((sum, node) => sum + node.textWrites, 0);
  paint();
  const initial = count();
  paint();
  assert.equal(count(), initial);
  state.connectivity = "offline";
  paint();
  assert.equal(nodes.get(".ordax-inline-status").textContent, "pt-BR:offline");
  assert.equal(nodes.get(".ordax-inline-status").dataset.state, "offline");
  language = "en-US";
  paint();
  assert.equal(nodes.get(".ordax-app-panel-title").textContent, "en-US:title");
  assert.equal(nodes.get(".ordax-app-panel-body").textContent, "en-US:body");
});
