import assert from "node:assert/strict";
import test from "node:test";
import { mountNativeSidebarFit } from "../system/surface/ui/sidebar-layout.mjs";

function fixture({ count = 6, gap = 0, rowHeight = 43.5, headingHeight = 30,
  scale = 1, initialHeight = 186, canonicalGroups = true } = {}) {
  let height = initialHeight;
  let resize, disconnected = false, callbackCount = 0;
  const listeners = new Map();
  const stats = { groupQueries: 0, membershipQueries: 0, hiddenWrites: 0 };
  const document = {
    activeElement: null,
    fonts: {
      ready: Promise.resolve(),
      addEventListener(name, fn) { listeners.set(name, fn); },
      removeEventListener(name) { listeners.delete(name); },
    },
  };
  function visual(initial) {
    let hidden = initial;
    return {
      get hidden() { return hidden; },
      set hidden(value) { stats.hiddenWrites++; hidden = value; },
    };
  }
  const groups = [0, 1].map(groupIndex => ({
    ...visual(false),
    groupIndex,
    querySelectorAll(selector) {
      assert.equal(selector, ".meridian-nav-destination");
      stats.membershipQueries++;
      return destinations.filter(item => item.groupIndex === groupIndex);
    },
    querySelector(selector) {
      stats.groupQueries++;
      assert.equal(selector, ".meridian-nav-destination:not([hidden])");
      return destinations.find(item => item.groupIndex === groupIndex && !item.hidden) ?? null;
    },
  }));
  const destinations = Array.from({ length: count }, (_, index) => ({
    ...visual(false),
    index,
    groupIndex: Math.floor(index / (count / 2)),
    closest(selector) {
      assert.equal(selector, "[data-nav-group]");
      return groups[this.groupIndex];
    },
    getBoundingClientRect() { return boxes().get(this) ?? { bottom: 0, height: 0 }; },
  }));
  const buttons = destinations.map(destination => ({
    ...visual(false),
    closest(selector) {
      assert.equal(selector, ".meridian-nav-destination");
      return destination;
    },
    focus() { document.activeElement = this; },
  }));
  const more = {
    ...visual(true),
    getBoundingClientRect() { return boxes().get(this) ?? { bottom: 0, height: 0 }; },
    focus() { document.activeElement = this; },
  };
  function boxes() {
    let cursor = 100;
    const positions = new Map();
    function append(element, size) {
      if (positions.size) cursor += gap;
      positions.set(element, { top: cursor * scale, bottom: (cursor + size) * scale, height: size * scale });
      cursor += size;
    }
    groups.forEach((group, index) => {
      if (group.hidden) return;
      destinations.forEach(destination => {
        if (destination.groupIndex !== index || destination.hidden) return;
        append(destination, rowHeight + (destination.index === count / 2 ? headingHeight : 0));
      });
    });
    if (!more.hidden) append(more, rowHeight);
    return positions;
  }
  const nav = {
    clientHeight: initialHeight,
    ownerDocument: document,
    querySelectorAll(selector) {
      if (selector === ".meridian-nav-destination button") return buttons;
      if (selector === "[data-nav-group]") return groups;
      throw Error("unexpected sidebar selector: " + selector);
    },
    querySelector(selector) {
      assert.equal(selector, "[data-nav-menu-more]");
      return more;
    },
    getBoundingClientRect() {
      return { top: 100 * scale, height: height * scale, bottom: (100 + height) * scale };
    },
  };
  document.defaultView = {
    getComputedStyle() {
      return {
        height: String(height) + "px", boxSizing: "border-box",
        paddingBottom: "0px", borderBottomWidth: "0px",
      };
    },
    ResizeObserver: class {
      constructor(callback) { resize = callback; }
      observe() {}
      disconnect() { disconnected = true; }
    },
  };
  if (!canonicalGroups) {
    // Independent host fixtures may expose only the minimal selector API;
    // ensure those hosts retain the safe legacy DOM-query measurement path.
    destinations.forEach(destination => { destination.closest = undefined; });
    groups.forEach(group => { group.querySelectorAll = undefined; });
  }
  return {
    nav, buttons, destinations, groups, more, document, stats, listeners,
    get disconnected() { return disconnected; },
    get callbackCount() { return callbackCount; },
    mount() { return mountNativeSidebarFit(nav, () => { callbackCount++; }); },
    setHeight(nextHeight) { height = nextHeight; nav.clientHeight = nextHeight; },
    resize(nextHeight = height) { height = nextHeight; nav.clientHeight = nextHeight; resize(); },
  };
}

test("full-height rails avoid redundant DOM visibility writes and group rescans", () => {
  const x = fixture({ initialHeight: 800 });
  const fit = x.mount();
  assert.equal(x.stats.hiddenWrites, 0, "already-visible destinations and hidden More are untouched");
  assert.equal(x.stats.groupQueries, 0, "mounted group membership avoids per-row selectors");
  assert.equal(x.stats.membershipQueries, 2, "one DOM membership query per group on mount");
  for (let i = 0; i < 12; i++) x.resize(800);
  assert.equal(x.stats.hiddenWrites, 0, "repeated same geometry does not write identical visibility");
  assert.equal(x.stats.groupQueries, 0);
  assert.equal(x.stats.membershipQueries, 2, "membership remains DOM-derived without rebuilding a catalog");
  assert.equal(x.callbackCount, 13, "existing resize observer callback behavior is retained");
  fit.destroy();
  assert.equal(x.disconnected, true);
  assert.equal(x.listeners.size, 0);
  x.resize(25);
  assert.equal(x.stats.hiddenWrites, 0, "destroyed controller does not mutate DOM");
});

test("collapsed group accounting releases heading space before the next layout measurement", () => {
  for (const scale of [0.9, 1, 1.1, 1.2, 1.5, 2]) {
    const x = fixture({ scale, initialHeight: 186 });
    x.document.activeElement = x.buttons.at(-1);
    const fit = x.mount();
    assert.equal(x.buttons.filter(button => !button.hidden).length, 3,
      "all 3 first-group destinations fit, at scale " + scale);
    assert.equal(x.groups[0].hidden, false);
    assert.equal(x.groups[1].hidden, true);
    assert.equal(x.more.hidden, false);
    assert.strictEqual(x.document.activeElement, x.more,
      "focus reaches visible More destination");
    assert.equal(x.stats.groupQueries, 0,
      "no group is queried for visible descendants on each removed destination");
    x.resize(600);
    assert.ok(x.buttons.every(button => !button.hidden));
    assert.ok(x.groups.every(group => !group.hidden));
    assert.equal(x.more.hidden, true);
    assert.strictEqual(x.document.activeElement, x.buttons.at(-1));
    x.document.activeElement = x.buttons.at(-1);
    x.resize(186);
    assert.strictEqual(x.document.activeElement, x.more);
    assert.equal(x.stats.groupQueries, 0);
    fit.destroy();
  }
});

test("canonical overflow keeps group visibility and More geometry correct across resized heights", () => {
  const x = fixture({ initialHeight: 44, gap: 5 });
  const fit = x.mount();
  for (let height = 44; height <= 720; height += 3) {
    x.resize(height);
    const visible = x.buttons.filter(button => !button.hidden).length;
    assert.equal(x.more.hidden, visible === x.buttons.length, "More visibility at " + height);
    assert.ok(x.destinations.every((destination, i) => destination.hidden === x.buttons[i].hidden),
      "hidden rows leave no flex gap at " + height);
    for (const group of x.groups) {
      assert.equal(group.hidden,
        !x.destinations.some(item => item.groupIndex === group.groupIndex && !item.hidden),
        "empty groups must collapse at " + height);
    }
    if (!x.more.hidden) {
      assert.ok(x.more.getBoundingClientRect().bottom <= x.nav.getBoundingClientRect().bottom,
        "More must fit at " + height);
    }
  }
  assert.equal(x.stats.groupQueries, 0, "resizes never scan every group per hidden row");
  fit.destroy();
});

test("unknown host group structure falls back to DOM queries without changing overflow behavior", () => {
  const x = fixture({ initialHeight: 186, canonicalGroups: false });
  const fit = x.mount();
  assert.equal(x.buttons.filter(item => !item.hidden).length, 3);
  assert.equal(x.groups[1].hidden, true);
  assert.equal(x.more.hidden, false);
  assert.ok(x.stats.groupQueries > 0, "noncanonical structure retains proven DOM-query behavior");
  x.resize(600);
  assert.ok(x.buttons.every(button => !button.hidden));
  fit.destroy();
});

test("font reflow triggers fresh measurements; no size cache or second observer is introduced", () => {
  const x = fixture({ initialHeight: 600 });
  const fit = x.mount();
  assert.equal(x.callbackCount, 1);
  x.setHeight(186);
  x.listeners.get("loadingdone")();
  assert.equal(x.more.hidden, false, "fonts changing row metrics force a new layout fit");
  assert.equal(x.callbackCount, 2);
  fit.destroy();
});
