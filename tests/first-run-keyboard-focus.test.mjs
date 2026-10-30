import test from "node:test";
import assert from "node:assert/strict";
import { trapFirstRunKeyboardFocus } from "../system/surface/ui/first-run-keyboard-focus.mjs";
import { shouldSubmitTextInputOnEnter } from "../system/surface/ui/keyboard-submit.mjs";

function setup() {
  let current = null;
  const node = (options = {}) => ({
    tabIndex: options.tabIndex ?? 0,
    disabled: options.disabled ?? false,
    closest: () => options.hidden ? {} : null,
    getClientRects: () => options.visible === false ? [] : [{}],
    focus: () => { current = options.name ?? "focus"; },
  });
  const first = node({ name: "first" });
  const last = node({ name: "last" });
  const overlay = {
    querySelectorAll: () => [first, last],
    focus: () => { current = "dialog"; },
  };
  const key = (shiftKey = false) => ({
    key: "Tab", shiftKey, prevented: false,
    preventDefault() { this.prevented = true; },
  });
  return { first, last, overlay, key, node, focused: () => current };
}

test("First Run wraps Tab and Shift+Tab at modal boundaries", () => {
  const s = setup();
  const forward = s.key();
  assert.equal(trapFirstRunKeyboardFocus(forward, s.overlay, s.last), true);
  assert.equal(forward.prevented, true);
  assert.equal(s.focused(), "first");

  const backward = s.key(true);
  assert.equal(trapFirstRunKeyboardFocus(backward, s.overlay, s.first), true);
  assert.equal(backward.prevented, true);
  assert.equal(s.focused(), "last");
});

test("First Run preserves normal browser traversal within the modal", () => {
  const s = setup();
  const forward = s.key();
  assert.equal(trapFirstRunKeyboardFocus(forward, s.overlay, s.first), false);
  assert.equal(forward.prevented, false);

  const backward = s.key(true);
  assert.equal(trapFirstRunKeyboardFocus(backward, s.overlay, s.last), false);
  assert.equal(backward.prevented, false);
});

test("First Run redirects Tab into its dialog when focus was not on a control", () => {
  const s = setup();
  const forward = s.key();
  assert.equal(trapFirstRunKeyboardFocus(forward, s.overlay, null), true);
  assert.equal(s.focused(), "first");
  const backward = s.key(true);
  assert.equal(trapFirstRunKeyboardFocus(backward, s.overlay, null), true);
  assert.equal(s.focused(), "last");
});

test("First Run excludes disabled and hidden controls from keyboard traversal", () => {
  const s = setup();
  const disabled = s.node({ disabled: true, name: "disabled" });
  const hidden = s.node({ hidden: true, name: "hidden" });
  const offscreen = s.node({ visible: false, name: "offscreen" });
  s.overlay.querySelectorAll = () => [disabled, hidden, s.first, offscreen, s.last];
  const forward = s.key();
  assert.equal(trapFirstRunKeyboardFocus(forward, s.overlay, s.last), true);
  assert.equal(s.focused(), "first");

  s.overlay.querySelectorAll = () => [disabled, hidden, offscreen];
  const empty = s.key();
  assert.equal(trapFirstRunKeyboardFocus(empty, s.overlay, null), true);
  assert.equal(s.focused(), "dialog");
});

test("First Run ignores keys other than Tab", () => {
  const s = setup();
  const event = { key: "Enter", preventDefault() { throw Error("unexpected"); } };
  assert.equal(trapFirstRunKeyboardFocus(event, s.overlay, s.last), false);
});

test("First Run does not treat IME candidate confirmation as form submission", () => {
  assert.equal(shouldSubmitTextInputOnEnter({ key: "Enter", isComposing: true }), false);
  assert.equal(shouldSubmitTextInputOnEnter({ key: "Enter", isComposing: false, keyCode: 229 }), false);
  assert.equal(shouldSubmitTextInputOnEnter({ key: "Process", isComposing: true, keyCode: 229 }), false);
  assert.equal(shouldSubmitTextInputOnEnter({ key: "Enter", isComposing: false, keyCode: 13 }), true);
  assert.equal(shouldSubmitTextInputOnEnter({ key: "Enter" }), true);
  assert.equal(shouldSubmitTextInputOnEnter({ key: "Tab" }), false);
  assert.equal(shouldSubmitTextInputOnEnter({ key: "Escape" }), false);
});

test("First Run wired keydown handler uses IME-safe Enter boundary", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../system/surface/ui/first-run.mjs", import.meta.url), "utf8");
  assert.match(source, /if \(!shouldSubmitFirstRunEnter\(event\)\) return;/);
  assert.match(source, /trapFirstRunKeyboardFocus\(event, overlay, documentObject\.activeElement\)/);
});
