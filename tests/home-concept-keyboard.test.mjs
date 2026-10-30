import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { handleHomeConceptKeyDown } from "../system/surface/ui/home-concept.mjs";
import { shouldSubmitTextInputOnEnter } from "../system/surface/ui/keyboard-submit.mjs";

function scenario({ key = "Enter", isComposing = false, keyCode = 13, value = "Pergunta", matches = true } = {}) {
  let clicks = 0;
  let prevented = 0;
  const root = {
    querySelector(selector) {
      assert.equal(selector, "[data-home-aura-submit]");
      return { click() { clicks += 1; } };
    },
  };
  const event = {
    key, isComposing, keyCode,
    target: { value, matches: selector => matches && selector === "[data-native-aura-prompt]" },
    preventDefault() { prevented += 1; },
  };
  return { event, root, clicks: () => clicks, prevented: () => prevented };
}

test("Home Aura never submits when Enter still belongs to IME candidate composition", () => {
  for (const config of [
    { isComposing: true, keyCode: 13 },
    { isComposing: false, keyCode: 229 },
    { key: "Process", isComposing: true, keyCode: 229 },
  ]) {
    const s = scenario(config);
    assert.equal(shouldSubmitTextInputOnEnter(s.event), false);
    assert.equal(handleHomeConceptKeyDown(s.event, s.root), false);
    assert.equal(s.clicks(), 0);
    assert.equal(s.prevented(), 0);
  }
});

test("Home Aura submits exactly once for committed non-empty Enter", () => {
  const s = scenario();
  assert.equal(shouldSubmitTextInputOnEnter(s.event), true);
  assert.equal(handleHomeConceptKeyDown(s.event, s.root), true);
  assert.equal(s.clicks(), 1);
  assert.equal(s.prevented(), 1);
});

test("Home Aura keeps blank prompt and unrelated keys from reaching the provider", () => {
  const empty = scenario({ value: "    " });
  assert.equal(handleHomeConceptKeyDown(empty.event, empty.root), true);
  assert.equal(empty.clicks(), 0);
  assert.equal(empty.prevented(), 1);

  const otherControl = scenario({ matches: false });
  assert.equal(handleHomeConceptKeyDown(otherControl.event, otherControl.root), false);
  assert.equal(otherControl.clicks(), 0);
  const tab = scenario({ key: "Tab" });
  assert.equal(handleHomeConceptKeyDown(tab.event, tab.root), false);
  assert.equal(tab.prevented(), 0);
});

test("First Run and Home consume one Surface-owned keyboard activation contract", async () => {
  const read = path => readFile(new URL("../system/surface/ui/" + path, import.meta.url), "utf8");
  const [home, setup, focus] = await Promise.all([
    read("home-concept.mjs"), read("first-run.mjs"), read("first-run-keyboard-focus.mjs"),
  ]);
  assert.match(home, /!shouldSubmitTextInputOnEnter\(event\)/);
  assert.match(setup, /!shouldSubmitTextInputOnEnter\(event\)/);
  assert.doesNotMatch(focus, /shouldSubmitFirstRunEnter/);
  assert.doesNotMatch(home + setup, /event\.keyCode !== 229|event\.isComposing !== true/);
});
