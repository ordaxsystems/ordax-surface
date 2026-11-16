import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const ui = name => readFile(new URL("../system/surface/ui/" + name, import.meta.url), "utf8");

class Node {
  constructor() {
    this.writes = 0;
    this._text = "";
    this._title = "";
    this._placeholder = "";
    this._hidden = false;
    this._disabled = false;
    this.attributes = {};
    this.children = new Map();
    this.dataset = new Proxy({}, {
      set: (target, key, value) => {
        this.writes++;
        target[key] = value;
        return true;
      },
    });
  }
  get textContent() { return this._text; }
  set textContent(value) { this.writes++; this._text = String(value); }
  get title() { return this._title; }
  set title(value) { this.writes++; this._title = String(value); }
  get placeholder() { return this._placeholder; }
  set placeholder(value) { this.writes++; this._placeholder = String(value); }
  get hidden() { return this._hidden; }
  set hidden(value) { this.writes++; this._hidden = value; }
  get disabled() { return this._disabled; }
  set disabled(value) { this.writes++; this._disabled = value; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  setAttribute(name, value) { this.writes++; this.attributes[name] = String(value); }
  hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
  querySelector(selector) {
    if (!this.children.has(selector)) this.children.set(selector, new Node());
    return this.children.get(selector);
  }
}

function rootFixture() {
  const nodes = new Map(), groups = new Map();
  const root = new Node();
  root.querySelector = selector => {
    if (!nodes.has(selector)) nodes.set(selector, new Node());
    return nodes.get(selector);
  };
  root.querySelectorAll = selector => groups.get(selector) ?? [];
  const add = (selector, setup = () => {}) => {
    const node = new Node();
    setup(node);
    groups.set(selector, [node]);
    return node;
  };
  const counts = () => [...nodes.values(),...groups.values().flat(),root]
    .reduce((total, node) => total + node.writes
      + [...node.children.values()].reduce((sum, child) => sum + child.writes, 0), 0);
  return { root, add, counts, node: selector => root.querySelector(selector) };
}

test("shell localization reads every translation but does not rewrite unchanged DOM", async () => {
  const source = await ui("desktop-shell.mjs");
  const start = source.indexOf("export function syncDesktopShellLocalization(");
  const end = source.indexOf("\nfunction regionalSettings(", start);
  assert.ok(start >= 0 && end > start);
  const h = rootFixture();
  h.add("[data-sidebar-app]", n => { n.dataset.sidebarApp = "account"; });
  h.add("[data-launcher-toggle]");
  h.add("[data-home-copy]", n => { n.dataset.homeCopy = "shell.home.tagline"; });
  h.add("[data-nav-group-label]", n => { n.dataset.navGroupLabel = "ecossistema"; });
  h.add("[data-nav-menu-group-label]", n => { n.dataset.navMenuGroupLabel = "ecossistema"; });
  h.add("[data-nav-menu-app]", n => { n.dataset.navMenuApp = "account"; });
  h.add("[data-meridian-destination]", n => { n.dataset.meridianDestination = "files"; });
  h.add("[data-meridian-menu-destination]", n => { n.dataset.meridianMenuDestination = "files"; });
  let locale = "pt-BR", revision = 1, translates = 0;
  const localization = {
    getLocale: () => locale,
    translate: (key, args) => {
      translates++;
      return locale + "/v" + revision + ":" + key + (args?.app ? ":" + args.app : "");
    },
  };
  const render = runInNewContext([
    source.slice(start, end),
    "syncDesktopShellLocalization",
  ].join("\n"), {
    assertLocalizationPort: x => x,
    MERIDIAN_RAIL_DESTINATIONS: [{ key: "files", name: "Arquivos", englishName: "Files" }],
  });
  const networkLabel = h.node("[data-connectivity-label]");
  networkLabel.textContent = "Rede conectada";
  render(h.root, localization);
  assert.equal(networkLabel.textContent, "Rede conectada",
    "shell locale updates cannot reset the live network state to unknown");
  const firstWrites = h.counts(), firstTranslations = translates;
  render(h.root, localization);
  assert.equal(h.counts(), firstWrites, "second render has no identical DOM writes");
  assert.ok(translates > firstTranslations, "must continue consulting localization owner");
  locale = "en-US";
  render(h.root, localization);
  assert.ok(h.counts() > firstWrites, "locale transition must update shell");
  const count = h.counts();
  revision = 2;
  render(h.root, localization);
  assert.ok(h.counts() > count, "same-locale copy refresh still updates translated text");
  const greeting = h.node("[data-home-greeting]");
  greeting.dataset.homeGreeting = "shell.home.greeting.evening";
  render(h.root, localization);
  assert.match(greeting.textContent, /evening$/, "changed greeting follows live scene");
});

test("global shell presentation writes only real theme, visibility, capability and network changes", async () => {
  const source = await ui("surface.mjs");
  const helperStart = source.indexOf("function syncText(");
  const helperEnd = source.indexOf("function areaLabel(", helperStart);
  const renderStart = source.indexOf("    const appearance = resolveColorAppearance(state.preferences);",
    source.indexOf("  const renderAreas = () => {"));
  const renderEnd = source.indexOf("    renderNativeNavigationInstalledApps();", renderStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart && renderStart > 0 && renderEnd > renderStart);
  const h = rootFixture();
  const launch = h.add("[data-launcher-toggle]");
  const navigate = h.add("[data-navigation-menu-toggle]");
  const capability = h.add("[data-requires-capability]", n => { n.dataset.requiresCapability = "network.manage"; });
  const menu = h.add("[data-nav-menu-app]", n => { n.dataset.navMenuApp = "account"; });
  const root = h.root, documentElement = new Node(), launcher = new Node();
  const state = {
    presentation: "central", sidebarMode: "full", launcherOpen: false,
    connectivity: "online", capabilityIds: ["network.manage"],
    preferences: { contrast: "normal", motion: "full", textScale: "100", displayScale: "100" },
  };
  const navigationMenu = { hidden: true, querySelectorAll: () => [menu] };
  const localization = { translate: key => "pt:" + key };
  const render = runInNewContext([
    source.slice(helperStart, helperEnd),
    "const run = () => {",
    source.slice(renderStart, renderEnd),
    "}; run",
  ].join("\n"), {
    root, documentElement, launcher, state, navigationMenu, localization,
    resolveColorAppearance: p => ({ scheme: p.theme ?? "light", colorTheme: p.palette ?? "native" }),
    syncDesktopThemeToggle() {}, syncDesktopSidebarToggle() {},
    syncDesktopPresentationToggle() {},
    sidebarIsExpanded: () => true,
    CONNECTIVITY_MESSAGE_IDS: { online: "online", offline: "offline" },
    ACCESSIBILITY_CONTRAST_PREFERENCE_ID: "contrast",
    ACCESSIBILITY_MOTION_PREFERENCE_ID: "motion",
    ACCESSIBILITY_TEXT_SCALE_PREFERENCE_ID: "textScale",
    DISPLAY_SCALE_PREFERENCE_ID: "displayScale",
    catalog: { get: () => ({ id: "account" }), isAvailable: () => true },
    getActiveArea: () => ({ activeWindowId: null, windows: [] }),
  });
  const count = () => h.counts() + documentElement.writes + launcher.writes;
  render();
  assert.equal(root.dataset.ordaxTheme, "light");
  assert.equal(root.dataset.view, "central");
  const baseline = count();
  render();
  assert.equal(count(), baseline, "identical global state must not mutate DOM");
  state.presentation = "desktop";
  state.preferences.theme = "dark";
  render();
  assert.equal(root.dataset.view, "desktop");
  assert.equal(root.dataset.ordaxTheme, "dark");
  assert.equal(h.node("[data-central-presentation]").hidden, true);
  state.capabilityIds = [];
  render();
  assert.equal(capability.disabled, true);
  assert.equal(capability.getAttribute("aria-disabled"), "true");
  state.connectivity = "offline";
  render();
  assert.equal(h.node("[data-connectivity-icon]").dataset.state, "offline");
  assert.equal(h.node("[data-connectivity-label]").textContent, "pt:offline");
  const network = h.node("[data-connectivity-tray]");
  network.dataset.networkDetailOwner = "true";
  const live = h.node("[data-connectivity-label]");
  live.textContent = "Wi-Fi nativo";
  render();
  assert.equal(live.textContent, "Wi-Fi nativo", "Native network owner stays authoritative");
  state.launcherOpen = true;
  render();
  assert.equal(launcher.hidden, false);
  assert.equal(launch.getAttribute("aria-expanded"), "true");
  assert.equal(navigate.getAttribute("aria-expanded"), "false");
});
