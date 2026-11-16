import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = await readFile(
  new URL("../system/surface/ui/surface.mjs", import.meta.url), "utf8",
);
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, "missing Native renderer: " + start);
  return source.slice(a, b);
}

test("Home shortcuts, Ctrl+K apps and areas index existing controls once per repaint", () => {
  const home = section("  const renderHomeInstalledApps = () => {",
    "  const renderNativeNavigationInstalledApps = () => {");
  const navigation = section("  const renderNativeNavigationInstalledApps = () => {",
    "  const renderSidebar = () => {");
  const areas = section("  const renderAreas = () => {", "  const render = (action = null, previousLocale = null) => {");
  assert.match(home, /const existingButtons = new Map\(/);
  assert.doesNotMatch(home, /Array\.from\(grid\.querySelectorAll\("\[data-native-home-installed-app\]"\)\)\s*\.find/);
  assert.match(navigation, /const existingButtons = new Map\(\)/);
  assert.doesNotMatch(navigation, /Array\.from\(slot\.children\)\s*\.find/);
  assert.match(areas, /const existingButtons = new Map\(\)/);
  assert.doesNotMatch(areas, /Array\.from\(areaSwitcher\.children\)\.find/);
  assert.match(home, /button\.contains\(root\.ownerDocument\.activeElement\)/,
    "removing a focused Home shortcut must recover focus");
  assert.match(navigation, /navigationQuery\.focus\(\{ preventScroll: true \}\)/,
    "revoked Ctrl+K destination must recover focus");
});

test("Native area buttons and active dots persist across identical renders and switch safely", () => {
  const areaCode = section("  const renderAreas = () => {", "  const render = (action = null, previousLocale = null) => {");
  class FakeNode {
    constructor(className = "", value = "") {
      this.className = className;
      this.dataset = {};
      this.children = [];
      this.parentElement = null;
      this.attributes = {};
      this._text = value;
      this.writes = 0;
    }
    get textContent() { return this._text; }
    set textContent(value) {
      this._text = value;
      this.writes += 1;
      for (const child of this.children) child.parentElement = null;
      this.children = [];
    }
    querySelector(selector) {
      if (selector === ".ordax-area-dot") {
        return this.children.find(child => child.className === "ordax-area-dot") ?? null;
      }
      if (selector === "[data-area-create]") {
        return this.children.find(child => child.dataset.areaCreate !== undefined) ?? null;
      }
      return null;
    }
    insertBefore(child, sibling) {
      if (child.parentElement) child.remove();
      const index = sibling ? this.children.indexOf(sibling) : -1;
      this.children.splice(index < 0 ? this.children.length : index, 0, child);
      child.parentElement = this;
    }
    prepend(child) { this.insertBefore(child, this.children[0] ?? null); }
    setAttribute(name, value) { this.attributes[name] = value; }
    remove() {
      if (!this.parentElement) return;
      this.parentElement.children = this.parentElement.children.filter(child => child !== this);
      this.parentElement = null;
    }
  }
  const areaSwitcher = new FakeNode();
  const areaKicker = new FakeNode();
  const currentArea = new FakeNode();
  const root = { querySelector: selector => {
    assert.equal(selector, "[data-current-area]");
    return currentArea;
  }};
  const state = {
    activeAreaId: "a",
    areas: [{ id: "a", ordinal: 1 }, { id: "b", ordinal: 2 }],
  };
  let locale = "pt";
  const localization = {
    translate(id, params) {
      return id === "surface.area.label"
        ? locale + " " + params.ordinal
        : id + ": " + (params?.area ?? "");
    },
  };
  const render = runInNewContext([
    areaCode,
    "renderAreas",
  ].join("\n"), {
    areaSwitcher, areaKicker, root, state, localization,
    MAX_WORKSPACE_AREAS: 4,
    getActiveArea: state => state.areas.find(area => area.id === state.activeAreaId),
    areaLabel: (area, i18n) => i18n.translate("surface.area.label", {
      ordinal: String(area.ordinal).padStart(2, "0"),
    }),
    element: (_tag, klass, text = "") => new FakeNode(klass, text),
    placeChildAt: (container, child, index) => {
      if (child.parentElement === container) return;
      container.insertBefore(child, container.children[index] ?? null);
    },
  });
  render();
  const first = areaSwitcher.children.find(child => child.dataset.areaId === "a");
  const second = areaSwitcher.children.find(child => child.dataset.areaId === "b");
  const dot = first.querySelector(".ordax-area-dot");
  assert.ok(dot);
  assert.equal(second.querySelector(".ordax-area-dot"), null);
  const writes = first.writes;
  render();
  assert.equal(first.writes, writes, "unchanged area label is not rewritten");
  assert.strictEqual(first.querySelector(".ordax-area-dot"), dot,
    "active indicator is not rebuilt");
  state.activeAreaId = "b";
  render();
  assert.strictEqual(areaSwitcher.children.find(child => child.dataset.areaId === "a"), first);
  assert.strictEqual(areaSwitcher.children.find(child => child.dataset.areaId === "b"), second);
  assert.equal(first.querySelector(".ordax-area-dot"), null, "inactive dot removed");
  const secondDot = second.querySelector(".ordax-area-dot");
  assert.ok(secondDot, "new active area has a dot");
  render();
  assert.strictEqual(second.querySelector(".ordax-area-dot"), secondDot);
  locale = "en";
  render();
  assert.equal(second.textContent, "en 02", "locale change updates area label");
  assert.ok(second.querySelector(".ordax-area-dot"), "translated active area keeps its indicator");
  state.areas = [state.areas[1]];
  render();
  assert.equal(areaSwitcher.children.some(child => child.dataset.areaId === "a"), false,
    "removed area has no stale button");
});
