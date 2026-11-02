import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { shouldSubmitTextInputOnEnter } from "../system/surface/ui/keyboard-submit.mjs";

test("First Run keeps the shared keyboard activation guard", async () => {
  for (const value of [{ key: "Enter", isComposing: true, keyCode: 13 }, { key: "Enter", isComposing: false, keyCode: 229 }]) {
    assert.equal(shouldSubmitTextInputOnEnter(value), false);
  }
  assert.equal(shouldSubmitTextInputOnEnter({ key: "Enter", isComposing: false, keyCode: 13 }), true);
  const read = path => readFile(new URL("../system/surface/ui/" + path, import.meta.url), "utf8");
  const [home, setup, focus, shell] = await Promise.all([
    read("home-concept.mjs"), read("first-run.mjs"), read("first-run-keyboard-focus.mjs"), read("desktop-shell.mjs")
  ]);
  assert.match(setup, /!shouldSubmitTextInputOnEnter\(event\)/);
  assert.doesNotMatch(focus, /shouldSubmitFirstRunEnter/);
  assert.doesNotMatch(home, /handleHomeConceptKeyDown|data-native-aura-prompt/);
  assert.doesNotMatch(shell, /data-native-aura-prompt|data-home-aura-submit/);
});
