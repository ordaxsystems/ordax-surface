import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { nativeHomeAssistantApp, nativeHomeInstalledApps } from "../system/surface/ui/application-presentations.mjs";

const ui = (name) => new URL("../system/surface/ui/" + name, import.meta.url);
const read = (name) => readFile(ui(name), "utf8");

function narrowHomeRules(css) {
  css = css.replace(/\r\n/g, "\n");
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
  assert.match(narrow, /\.ordax-home-destination-grid,[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
    "Destinations and Files must become a single column at narrow width");
  assert.match(shell, /class="ordax-home-panel"/);
  assert.doesNotMatch(shell, /data-native-aura-prompt|data-home-aura-submit|meridian-planned-mark/,
    "Native Home and navigation must not render a second Aura");
  for (const klass of ["ordax-home-intro", "ordax-home-search", "ordax-home-action-grid", "ordax-home-destination-grid"]) {
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

test("Native Home shows Aura only for its signed installed Assistant app slot", async () => {
  const [shell, surface, styles] = await Promise.all([
    read("desktop-shell.mjs"), read("surface.mjs"), read("identity.css"),
  ]);
  assert.match(shell, /data-native-home-assistant hidden disabled/);
  assert.doesNotMatch(shell, /data-native-home-assistant[^>]*data-launch-app/);
  assert.match(styles, /\.ordax-home-action\[data-native-home-assistant\]\[hidden\] \{ display: none !important; \}/);
  assert.match(surface, /const app = nativeHomeAssistantApp\(catalog, state\.capabilityIds\)/);
  assert.match(surface, /button\.removeAttribute\("data-launch-app"\)/);
  assert.match(surface, /button\.dataset\.launchApp = app\.id;/);
  assert.match(surface, /renderSidebar\(\);\s*renderHomeAssistant\(\);/);
  assert.doesNotMatch(shell, /data-native-aura-prompt|data-home-aura-submit/);

  const installed = { id: "assistant", component: { kind: "app", releaseMode: "component-slot" },
    panels: [{ kind: "extension", extensionId: "assistant" }] };
  let app = null;
  let available = false;
  const catalog = {
    get: (id) => id === "assistant" ? app : null,
    isAvailable: (item) => item === app && available,
  };
  assert.equal(nativeHomeAssistantApp(catalog, []), null, "not installed");
  app = installed;
  assert.equal(nativeHomeAssistantApp(catalog, []), null, "installed but unavailable");
  available = true;
  assert.equal(nativeHomeAssistantApp(catalog, []), installed, "trusted installed slot");
  app = { ...installed, component: { kind: "app", releaseMode: "bundled" } };
  assert.equal(nativeHomeAssistantApp(catalog, []), null, "not a signed component slot");
  app = { ...installed, panels: [{ kind: "static" }] };
  assert.equal(nativeHomeAssistantApp(catalog, []), null, "not an external executable");
  app = null;
  assert.equal(nativeHomeAssistantApp(catalog, []), null, "removed during runtime");
});

test("Native Home quick access follows verified installed apps without duplicating Aura", async () => {
  const [shell, surface, styles] = await Promise.all([
    read("desktop-shell.mjs"), read("surface.mjs"), read("identity.css"),
  ]);
  assert.match(surface, /const installed = nativeHomeInstalledApps\(catalog, state\.capabilityIds\)/);
  assert.match(surface, /button\.dataset\.nativeHomeInstalledApp = app\.id/);
  assert.match(surface, /button\.dataset\.launchApp = app\.id/);
  assert.match(surface, /addAppButton\.before\(button\)/);
  assert.match(surface, /if \(button\.contains\(root\.ownerDocument\.activeElement\)\)/);
  assert.match(surface, /button\.remove\(\)/);
  assert.match(surface, /renderHomeAssistant\(\);\s*renderHomeInstalledApps\(\);/);
  assert.match(shell, /data-native-home-assistant hidden disabled/);
  assert.match(styles, /\[data-native-home-installed-app\] \.ordax-rail-icon/);
  assert.doesNotMatch(shell, /data-native-home-installed-app/,
    "no fabricated installed app should exist in the static shell");

  const installed = (id, requiredCapabilities = []) => ({
    id, monogram: "AP", component: { kind: "app", releaseMode: "component-slot" },
    panels: [{ kind: "extension", extensionId: id }], requiredCapabilities,
  });
  const assistant = installed("assistant");
  const studio = installed("studio");
  const notes = installed("notes", ["notes.read"]);
  const gallery = installed("gallery");
  const editor = installed("editor");
  const terminal = installed("terminal");
  const invalid = { ...installed("not-installed"), component: { kind: "app", releaseMode: "bundled" } };
  let current = [assistant, studio, notes, gallery, editor, terminal, invalid];
  const catalog = {
    get: (id) => current.find((app) => app.id === id) ?? null,
    list: () => current,
    isAvailable: (app, capabilities) => app.requiredCapabilities.every((id) => capabilities.includes(id)),
  };
  assert.equal(nativeHomeAssistantApp(catalog, []), assistant);
  assert.deepEqual(nativeHomeInstalledApps(catalog, []).map((app) => app.id),
    ["studio", "gallery", "editor", "terminal"], "only valid slots; bounded Home; no second Aura");
  assert.deepEqual(nativeHomeInstalledApps(catalog, ["notes.read"]).map((app) => app.id),
    ["studio", "notes", "gallery", "editor"], "granted capabilities change the Home projection");
  current = [assistant, notes, invalid];
  assert.deepEqual(nativeHomeInstalledApps(catalog, []).map((app) => app.id), [],
    "revoked capabilities and removed installations revoke Home shortcuts");
  current = [];
  assert.equal(nativeHomeAssistantApp(catalog, []), null);
  assert.deepEqual(nativeHomeInstalledApps(catalog, []).map((app) => app.id), []);
});
