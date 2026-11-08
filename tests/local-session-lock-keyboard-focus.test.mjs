import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import {
  trapModalKeyboardFocus,
  trapFirstRunKeyboardFocus,
} from "../system/surface/ui/first-run-keyboard-focus.mjs";

const lockSource = await readFile(
  new URL("../system/surface/ui/local-session-lock.mjs", import.meta.url), "utf8",
);

function scene() {
  let focused = null;
  const node = (name, options = {}) => ({
    name,
    tabIndex: options.tabIndex ?? 0,
    disabled: options.disabled ?? false,
    hidden: options.hidden ?? false,
    closest: () => options.hidden ? {} : null,
    getClientRects: () => options.visible === false ? [] : [{}],
    focus(opts) {
      assert.equal(opts?.preventScroll, true);
      focused = name;
    },
  });
  const secret = node("secret");
  const submit = node("submit");
  const hidden = node("hidden", { hidden: true });
  const disabled = node("disabled", { disabled: true });
  const overlay = {
    querySelectorAll(selector) {
      assert.match(selector, /button, input/);
      return [hidden, secret, disabled, submit];
    },
    focus(opts) {
      assert.equal(opts?.preventScroll, true);
      focused = "overlay";
    },
  };
  const keyboardEvent = (shiftKey = false) => ({
    key: "Tab", shiftKey, prevented: false,
    preventDefault() { this.prevented = true; },
  });
  return { secret, submit, hidden, disabled, overlay, keyboardEvent,
    getFocus() { return focused; } };
}

test("Lock and First Run share one focus trap without duplicating modal traversal", () => {
  assert.equal(trapFirstRunKeyboardFocus, trapModalKeyboardFocus);
  const s = scene();

  let event = s.keyboardEvent();
  assert.equal(trapModalKeyboardFocus(event, s.overlay, s.submit), true);
  assert.equal(event.prevented, true);
  assert.equal(s.getFocus(), "secret", "Tab wraps to the secret input");

  event = s.keyboardEvent(true);
  assert.equal(trapModalKeyboardFocus(event, s.overlay, s.secret), true);
  assert.equal(s.getFocus(), "submit", "Shift+Tab wraps to the submit button");

  event = s.keyboardEvent();
  assert.equal(trapModalKeyboardFocus(event, s.overlay, null), true);
  assert.equal(s.getFocus(), "secret", "Tab from outside enters locked dialog");

  event = s.keyboardEvent(true);
  assert.equal(trapModalKeyboardFocus(event, s.overlay, null), true);
  assert.equal(s.getFocus(), "submit", "Shift+Tab from outside enters locked dialog");

  event = s.keyboardEvent();
  assert.equal(trapModalKeyboardFocus(event, s.overlay, s.secret), false);
  assert.equal(event.prevented, false, "browser retains ordinary internal Tab movement");
});

test("Locked dialog does not make disabled/hidden controls keyboard destinations", () => {
  const s = scene();
  s.overlay.querySelectorAll = () => [s.hidden, s.disabled];
  const event = s.keyboardEvent();
  assert.equal(trapModalKeyboardFocus(event, s.overlay, null), true);
  assert.equal(event.prevented, true);
  assert.equal(s.getFocus(), "overlay", "empty modal still captures Tab");
});

test("Lock's real keydown listener traps only an active locked session", () => {
  const start = lockSource.indexOf("  const onKeyDown = (event) => {");
  const end = lockSource.indexOf('\n  documentObject.addEventListener("keydown"', start);
  assert.ok(start >= 0 && end > start, "exercise the actual lock keyboard handler");
  const s = scene();
  const context = {
    destroyed: false,
    snapshot: { state: "locked" },
    overlay: s.overlay,
    documentObject: { activeElement: s.submit },
    trapModalKeyboardFocus,
  };
  const handler = runInNewContext(lockSource.slice(start, end) + "\nonKeyDown", context);
  const first = s.keyboardEvent();
  handler(first);
  assert.equal(first.prevented, true);
  assert.equal(s.getFocus(), "secret");

  context.snapshot = { state: "unlocked" };
  const notLocked = s.keyboardEvent();
  handler(notLocked);
  assert.equal(notLocked.prevented, false, "unlocked user navigation is untouched");

  context.snapshot = { state: "locked" };
  context.overlay = null;
  const noDialog = s.keyboardEvent();
  handler(noDialog);
  assert.equal(noDialog.prevented, false);

  context.overlay = s.overlay;
  context.destroyed = true;
  const afterDestroy = s.keyboardEvent();
  handler(afterDestroy);
  assert.equal(afterDestroy.prevented, false);
});

test("Native lock wires and removes the capture-phase modal keyboard handler", () => {
  assert.match(lockSource, /documentObject\.addEventListener\("keydown", onKeyDown, true\)/);
  assert.match(lockSource, /documentObject\.removeEventListener\("keydown", onKeyDown, true\)/);
  assert.match(lockSource, /root\.inert = true;/);
  assert.match(lockSource, /root\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(lockSource, /overlay\.setAttribute\("aria-modal", "true"\)/);
  assert.match(lockSource, /trapModalKeyboardFocus\(event, overlay, documentObject\.activeElement\)/);
});
