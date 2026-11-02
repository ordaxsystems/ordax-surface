import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { meridianHomeContextKey } from "../system/surface/ui/meridian-home-context.mjs";

const read = async name => readFile(new URL("../system/surface/workspace/components/central/" + name, import.meta.url), "utf8");
const signedIn = subjectId => ({ state: "signed-in", subjectId });
const space = id => ({ id, name: id, kind: "personal", state: "active" });

test("Home identity and authorized Space context remain isolated", () => {
  const from = meridianHomeContextKey(signedIn("user-a"), space("one"));
  assert.notEqual(from, meridianHomeContextKey(signedIn("user-b"), space("one")));
  assert.notEqual(from, meridianHomeContextKey(signedIn("user-a"), space("two")));
  assert.notEqual(from, meridianHomeContextKey({ state: "signed-out" }, null));
});

test("Web Home and Desktop cannot open a duplicate built-in Aura", async () => {
  const [home, central, desktop, navigation, content] = await Promise.all([
    read("meridian-home.tsx"), read("central.tsx"), read("desktop.tsx"),
    read("config.ts"), read("window-content.tsx")
  ]);
  assert.doesNotMatch(home, /onPrompt|meridian-prompt|Aura contextual|useIntelligenceClient/);
  assert.doesNotMatch(central, /onPrompt|title:'Aura'/);
  assert.doesNotMatch(desktop, /id: 'aura'|getSurfaceWindowTitle\('intelligence'\)/);
  assert.match(navigation, /filter\(item => item\.key !== 'intelligence'\)/);
  assert.match(navigation, /filter\(shortcut => shortcut\.id !== 'intelligence'\)/);
  assert.doesNotMatch(content, /AuraContent/);
});
