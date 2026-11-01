import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ui = (name) => new URL("../system/surface/ui/" + name, import.meta.url);
const read = (name) => readFile(ui(name), "utf8");

function narrowHomeRules(css) {
  const marker = "@container meridian-native-home (max-width: 38rem) {";
  const start = css.indexOf(marker);
  assert.ok(start >= 0, "Home must respond to the actual workspace width");
  // The container closes with a stand-alone brace. Nested selector blocks
  // have indented closing braces; this extracts the actual responsive rules.
  const end = css.indexOf("\n}\n", start);
  assert.ok(end > start, "narrow Home container must close");
  return css.slice(start, end + 2);
}

test("narrow Native Home reflows the real shell destinations into a usable reading order", async () => {
  const [css, shell, concept] = await Promise.all([
    read("identity.css"),
    read("desktop-shell.mjs"),
    read("home-concept.mjs"),
  ]);
  const narrow = narrowHomeRules(css);
  const areas = [
    "intro", "hero", "resume", "quick", "status", "current",
    "files", "ecosystem", "session",
  ];
  for (const area of areas) {
    assert.match(narrow, new RegExp('"'+area+'"'),
      `responsive home must keep the ${area} destination`);
  }
  assert.match(narrow, /grid-template-columns:\s*minmax\(0, 1fr\);/);
  assert.match(narrow, /:not\(:has\(\[data-home-continuation\]\)\)[\s\S]*?grid-template-areas:/,
    "Home without a resume card needs its own complete responsive grid");
  assert.match(narrow, /\.ordax-home-intro\s*\{[\s\S]*?grid-template-areas:\s*"heading" "tagline" "search"/,
    "Search should follow the greeting instead of squeezing it");
  assert.match(narrow, /\.ordax-home-title\s*\{[\s\S]*?white-space:\s*normal;/,
    "Localized greetings must wrap rather than truncate");
  assert.match(narrow, /\.ordax-home-tagline\s*\{[\s\S]*?white-space:\s*normal;/,
    "Localized descriptions must wrap instead of disappearing");
  assert.match(narrow, /\.ordax-home-suggestions\s*\{[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/,
    "Aura suggestions need legible two-column targets");
  assert.match(narrow, /\.ordax-home-destination-grid,[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
    "Destinations and Files must become a single column at narrow width");
  assert.match(shell, /class="ordax-home-panel"/);
  for (const klass of ["ordax-home-intro", "ordax-home-search", "ordax-home-suggestions", "ordax-home-action-grid", "ordax-home-destination-grid"]) {
    assert.ok(shell.includes(klass), `the production shell must actually render ${klass}`);
  }
  for (const klass of ["ordax-home-status", "ordax-home-current-space"]) {
    assert.ok(concept.includes(klass), `the Home projection must actually render ${klass}`);
  }
});

test("responsive polish consumes existing Meridian tokens without a parallel palette or font", async () => {
  const [css, tokens] = await Promise.all([read("identity.css"), read("meridian.tokens.css")]);
  const narrow = narrowHomeRules(css);
  assert.match(css, /container:\s*meridian-native-home\s*\/\s*inline-size/);
  for (const token of ["--md-space-2", "--md-space-4"]) {
    assert.ok(narrow.includes(`var(${token})`), `responsive rules should consume ${token}`);
    assert.ok(tokens.includes(`${token}:`), `Meridian owns ${token}`);
  }
  assert.doesNotMatch(narrow, /#[0-9a-f]{3,8}\b/i, "do not introduce a new color palette");
  assert.doesNotMatch(narrow, /font-family\s*:/i, "do not introduce a second font source");
  assert.match(css, /@container meridian-native-home \(max-width: 66rem\)/);
  assert.match(css, /@container meridian-native-home \(max-width: 50rem\)/);
});
