import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ui = (name) => new URL("../system/surface/ui/" + name, import.meta.url);
const read = async (name) => readFile(ui(name), "utf8");

test("Native Meridian shell receives the same canonical presentation as root", async () => {
  const [runtime, shell, styles] = await Promise.all([
    read("surface.mjs"),
    read("desktop-shell.mjs"),
    read("identity.css"),
  ]);

  assert.match(shell, /data-ordax-shell data-meridian-native data-view="central"/);
  assert.match(runtime, /root\.dataset\.workspacePresentation = state\.presentation;\s*root\.dataset\.view = state\.presentation;/);
  assert.match(
    runtime,
    /const shell = root\.querySelector\("\[data-ordax-shell\]"\);\s*if \(shell\) \{\s*shell\.dataset\.workspacePresentation = state\.presentation;\s*shell\.dataset\.view = state\.presentation;/,
  );
  assert.match(styles, /\.ordax-shell\.meridian-native-workspace\[data-view="desktop"\]/);
});

test("Sidebar utility touch targets retain at least 44 visual pixels across display zoom", async () => {
  const [layout, tokens, meridian] = await Promise.all([
    read("sidebar-layout.css"),
    read("tokens.css"),
    read("meridian.tokens.css"),
  ]);
  assert.match(meridian, /--md-sidebar-utility-size:\s*44px;/);
  assert.match(tokens, /--ordax-display-scale-factor:\s*1;/);
  assert.match(layout, /width:var\(--md-sidebar-utility-size\);\s*min-width:var\(--md-sidebar-utility-size\);\s*height:var\(--md-sidebar-utility-size\);\s*flex:0 0 var\(--md-sidebar-utility-size\)/);
  assert.match(layout, /\.meridian-rail-notification-slot > button \{[^}]*width:100%; height:100%;/);
  assert.match(layout, /\.meridian-rail-update-button \{[^}]*width:100%; height:100%;/);

  // Read the zoom and compensated sizing from their canonical CSS owners.
  // The historic 44px max() patch ignored the canvas zoom and cannot be
  // copied into this version of Meridian.
  for (const mode of ["compact", "comfortable", "large"]) {
    const zoomRule = new RegExp('html\\[data-ordax-display-scale="' + mode + '"\\]\\s*\\{\\s*--ordax-display-scale-factor:\\s*([\\d.]+);');
    const sizeRule = new RegExp('html\\[data-ordax-display-scale="' + mode + '"\\]\\s*\\.meridian-rail-utilities\\s*\\{\\s*--md-sidebar-utility-size:\\s*([\\d.]+)px;');
    const zoom = Number(tokens.match(zoomRule)?.[1]);
    const visualPx = Number(layout.match(sizeRule)?.[1]) * zoom;
    assert.ok(zoom > 0 && visualPx >= 43.999 && visualPx <= 44.001, mode + ": " + visualPx);
  }

  const automaticZooms = [...tokens.matchAll(/html\[data-ordax-display-scale="automatic"\]\s*\{\s*--ordax-display-scale-factor:\s*([\d.]+);/g)].map((m) => Number(m[1]));
  const automaticSizes = [...layout.matchAll(/html\[data-ordax-display-scale="automatic"\]\s*\.meridian-rail-utilities\s*\{\s*--md-sidebar-utility-size:\s*([\d.]+)px;/g)].map((m) => Number(m[1]));
  assert.equal(automaticZooms.length, 3);
  assert.equal(automaticSizes.length, automaticZooms.length);
  for (let i = 0; i < automaticZooms.length; i += 1) {
    const visualPx = automaticSizes[i] * automaticZooms[i];
    assert.ok(visualPx >= 43.999 && visualPx <= 44.001, "automatic/" + i + ": " + visualPx);
  }
});
