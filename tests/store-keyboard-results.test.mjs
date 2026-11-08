import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = await readFile(
  new URL("../system/surface/ui/store-overview-controls.mjs", import.meta.url),
  "utf8",
);
const start = source.indexOf("  const focusStoreCatalogReturn = (appId) => {");
const end = source.indexOf("\n  const onKeyDown = (event) => {", start);
assert.ok(start > 0 && end > start, "use the real Native Store keyboard and focus handlers");

function fixture() {
  const documentObject = { activeElement: null };
  const clicks = [];
  const focus = [];
  const search = { name: "search", focus(options) {
    focus.push(this.name); documentObject.activeElement = this;
    assert.equal(options?.preventScroll, true);
  } };
  const view = { name: "view", focus(options) {
    focus.push(this.name); documentObject.activeElement = this;
    assert.equal(options?.preventScroll, true);
  } };
  const details = (id, { disabled = false, hidden = false, parentHidden = false } = {}) => ({
    name: id, dataset: { storeDetails: id }, disabled, hidden, parentHidden,
    click() { clicks.push(id); },
    focus(options) {
      assert.equal(options?.preventScroll, true);
      focus.push(id);
      documentObject.activeElement = this;
    },
    closest(selector) {
      if (selector === "[data-store-details]") return this;
      if (selector === "[hidden]") return this.parentHidden ? { hidden: true } : null;
      return null;
    },
  });
  const cards = [
    details("studio"),
    details("disabled", { disabled: true }),
    details("hidden", { hidden: true }),
    details("hidden-parent", { parentHidden: true }),
    details("gallery"),
  ];
  const slot = {
    contains(target) { return target === search || target === view || cards.includes(target); },
    querySelectorAll(selector) {
      assert.equal(selector, "[data-store-details]");
      return cards;
    },
    querySelector(selector) {
      if (selector === "[data-store-search]") return this.searchVisible ? search : null;
      if (selector === '[data-store-view][aria-current="page"]') return view;
      throw new Error("Unexpected selector " + selector);
    },
    searchVisible: true,
  };
  const ctx = {
    mountedSlot: slot, snapshot: { state: "ready" }, selectedAppId: null,
    activeView: "discover",
  };
  const functions = runInNewContext(
    source.slice(start, end) + "\n({ focusStoreCatalogReturn, handleStoreCatalogKeyboard })",
    ctx,
  );
  const key = (target, name) => {
    documentObject.activeElement = target;
    const event = { target, key: name, prevented: false,
      preventDefault() { this.prevented = true; } };
    const handled = functions.handleStoreCatalogKeyboard(event);
    return { handled, prevented: event.prevented };
  };
  return { ...functions, key, cards, search, view, slot, ctx, documentObject, clicks, focus };
}

test("Store search offers keyboard navigation among visible, enabled app details", () => {
  const f = fixture();
  assert.deepEqual(f.key(f.search, "ArrowDown"), { handled: true, prevented: true });
  assert.equal(f.documentObject.activeElement, f.cards[0]);
  f.key(f.cards[0], "ArrowDown");
  assert.equal(f.documentObject.activeElement, f.cards[4], "skip unavailable and filtered entries");
  f.key(f.cards[4], "ArrowDown");
  assert.equal(f.documentObject.activeElement, f.cards[0], "wrap down to first result");
  f.key(f.cards[0], "ArrowUp");
  assert.equal(f.documentObject.activeElement, f.cards[4], "wrap up to last result");
  f.key(f.cards[4], "Home");
  assert.equal(f.documentObject.activeElement, f.cards[0]);
  f.key(f.cards[0], "End");
  assert.equal(f.documentObject.activeElement, f.cards[4]);
  assert.deepEqual(f.key(f.search, "Home"), { handled: false, prevented: false },
    "text caret is not hijacked");
  assert.deepEqual(f.key(f.search, "End"), { handled: false, prevented: false });
  f.key(f.search, "ArrowUp");
  assert.equal(f.documentObject.activeElement, f.cards[4]);
});

test("Store Enter opens an actual verified catalog detail, never a lifecycle request", () => {
  const f = fixture();
  assert.deepEqual(f.key(f.search, "Enter"), { handled: true, prevented: true });
  assert.deepEqual(f.clicks, ["studio"]);
  assert.deepEqual(f.key(f.view, "Enter"), { handled: false, prevented: false });
  f.ctx.selectedAppId = "studio";
  assert.deepEqual(f.key(f.search, "Enter"), { handled: false, prevented: false });
  f.ctx.selectedAppId = null;
  f.ctx.snapshot = { state: "unavailable" };
  assert.deepEqual(f.key(f.search, "Enter"), { handled: false, prevented: false });
  f.ctx.snapshot = { state: "ready" };
  f.ctx.activeView = "models";
  assert.deepEqual(f.key(f.search, "ArrowDown"), { handled: false, prevented: false });
  f.ctx.activeView = "discover";
  for (const card of f.cards) card.hidden = true;
  assert.deepEqual(f.key(f.search, "Enter"), { handled: false, prevented: false });
  assert.equal(f.clicks.length, 1, "zero results must never open an app detail");
});

test("Store back restores focus to a visible result or safe search/category fallback", () => {
  const f = fixture();
  f.focusStoreCatalogReturn("gallery");
  assert.equal(f.documentObject.activeElement, f.cards[4]);
  f.cards[4].hidden = true;
  f.focusStoreCatalogReturn("gallery");
  assert.equal(f.documentObject.activeElement, f.search);
  f.cards[4].hidden = false;
  f.cards[4].parentHidden = true;
  f.focusStoreCatalogReturn("gallery");
  assert.equal(f.documentObject.activeElement, f.search);
  f.slot.searchVisible = false;
  f.focusStoreCatalogReturn("missing");
  assert.equal(f.documentObject.activeElement, f.view);
  assert.ok(f.focus.includes("gallery"));
  assert.match(source, /focusStoreCatalogReturn\(previousAppId\)/);
  assert.equal((source.match(/focusStoreCatalogReturn\(previousAppId\)/g) ?? []).length, 2,
    "both Back and Escape share the same safe focus restoration");
  assert.match(source, /if \(handleStoreCatalogKeyboard\(event\)\) return;/);
});
