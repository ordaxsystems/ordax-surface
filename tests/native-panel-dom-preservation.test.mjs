import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = await readFile(
  new URL("../system/surface/ui/surface.mjs", import.meta.url), "utf8",
);
function extract(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, "Native renderer found: " + start);
  return source.slice(from, to);
}

class FakeElement {
  constructor(tag, className = "", value = "") {
    this.tagName = tag.toUpperCase();
    this.className = className;
    this._text = String(value);
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.parentElement = null;
    this.textWrites = 0;
    this.attributeWrites = 0;
    this.replacements = 0;
  }
  get textContent() {
    return this.children.length
      ? this.children.map(child => child.textContent).join("")
      : this._text;
  }
  set textContent(value) {
    this.textWrites++;
    this._text = String(value);
    for (const child of this.children) child.parentElement = null;
    this.children = [];
  }
  setAttribute(name, value) {
    this.attributeWrites++;
    this.attributes[name] = String(value);
  }
  getAttribute(name) { return this.attributes[name] ?? null; }
  querySelector(selector) {
    if (selector === "[data-surface-capabilities]") {
      return this.children.find(child => child.dataset.surfaceCapabilities !== undefined) ?? null;
    }
    if (selector === ".ordax-app-panel-body") {
      return this.children.find(child => child.className === "ordax-app-panel-body") ?? null;
    }
    return null;
  }
  insertBefore(child, before) {
    child.remove();
    const index = before ? this.children.indexOf(before) : -1;
    this.children.splice(index < 0 ? this.children.length : index, 0, child);
    child.parentElement = this;
  }
  append(...children) { for (const child of children) this.insertBefore(child, null); }
  replaceWith(child) {
    if (!this.parentElement) throw new Error("orphan replace");
    this.parentElement.insertBefore(child, this);
    this.remove();
  }
  replaceChildren(...children) {
    this.replacements++;
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this._text = "";
    this.append(...children);
  }
  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter(node => node !== this);
    this.parentElement = null;
  }
}

test("Capabilities retain the same DOM on heartbeat, handle revocation, and translate empty state", () => {
  const code = extract("function renderCapabilitiesPanel(", "function renderPanel(");
  const render = runInNewContext(code + "\nrenderCapabilitiesPanel", {
    element: (tag, className, text) => new FakeElement(tag, className, text),
  });
  const section = new FakeElement("section");
  const body = new FakeElement("p", "ordax-app-panel-body");
  section.append(body);
  const state = { capabilityIds: ["network.manage", "network.status"] };
  let locale = "pt";
  const localization = { translate: id => locale + ":" + id };
  render(section, state, localization);
  const list = section.querySelector("[data-surface-capabilities]");
  const first = list.children[0], second = list.children[1];
  assert.equal(list.tagName, "UL");
  assert.strictEqual(section.children[1], body, "capabilities stay before the app body");
  render(section, { capabilityIds: [...state.capabilityIds] }, localization);
  assert.strictEqual(section.querySelector("[data-surface-capabilities]"), list);
  assert.strictEqual(list.children[0], first);
  assert.strictEqual(list.children[1], second);
  assert.equal(list.replacements, 1, "no second list rebuild");
  state.capabilityIds = ["network.status"];
  render(section, state, localization);
  assert.strictEqual(section.querySelector("[data-surface-capabilities]"), list);
  assert.deepEqual(list.children.map(child => child.textContent), ["network.status"]);
  assert.equal(list.replacements, 2, "revocation must update visible capabilities");
  state.capabilityIds = [];
  render(section, state, localization);
  const empty = section.querySelector("[data-surface-capabilities]");
  assert.equal(empty.tagName, "P");
  assert.equal(empty.textContent, "pt:surface.capability.none");
  render(section, state, localization);
  assert.strictEqual(section.querySelector("[data-surface-capabilities]"), empty);
  assert.equal(empty.textWrites, 1);
  locale = "en";
  render(section, state, localization);
  assert.strictEqual(section.querySelector("[data-surface-capabilities]"), empty);
  assert.equal(empty.textContent, "en:surface.capability.none");
  state.capabilityIds = ["network.status"];
  render(section, state, localization);
  assert.equal(section.querySelector("[data-surface-capabilities]").tagName, "UL");
});

test("Preference choices keep focused buttons, but update selection, labels and revoked options", () => {
  const code = extract("function syncPreferenceChoice(", "function renderCapabilitiesPanel(");
  const sync = runInNewContext(code + "\nsyncPreferenceChoice", {
    element: (tag, className, text) => new FakeElement(tag, className, text),
    placeChildAt: (container, child, index) => {
      if (child.parentElement === container) return;
      container.insertBefore(child, container.children[index] ?? null);
    },
  });
  const choices = new FakeElement("div");
  const panel = {
    preferenceId: "appearance.scheme",
    options: [{ value: "dark", label: "Escuro" }, { value: "light", label: "Claro" }],
  };
  const state = { preferences: { "appearance.scheme": "dark" } };
  sync(choices, panel, state);
  const [dark, light] = choices.children;
  const darkTextWrites = dark.textWrites, darkAttrWrites = dark.attributeWrites;
  sync(choices, panel, { preferences: { ...state.preferences } });
  assert.strictEqual(choices.children[0], dark);
  assert.strictEqual(choices.children[1], light);
  assert.equal(dark.textWrites, darkTextWrites, "unchanged label stays untouched");
  assert.equal(dark.attributeWrites, darkAttrWrites, "unchanged pressed state stays untouched");
  state.preferences["appearance.scheme"] = "light";
  sync(choices, panel, state);
  assert.strictEqual(choices.children[0], dark);
  assert.equal(dark.getAttribute("aria-pressed"), "false");
  assert.equal(light.getAttribute("aria-pressed"), "true");
  assert.equal(dark.textWrites, darkTextWrites, "selection changes do not rewrite labels");
  panel.options[0] = { value: "dark", label: "Dark" };
  sync(choices, panel, state);
  assert.equal(dark.textContent, "Dark", "translation updates button in place");
  panel.options = [{ value: "dark", label: "Dark" }];
  sync(choices, panel, state);
  assert.equal(choices.children.length, 1, "revoked option is removed");
  assert.strictEqual(choices.children[0], dark);
});