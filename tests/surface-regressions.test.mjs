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
  assert.match(styles, /\.ordax-shell\.meridian-native-workspace\s*\{/);
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


test("Window titlebar and body use one dimension; viewport zoom is invertible", async () => {
  const [windowCss, tokens] = await Promise.all([read("surface.css"), read("tokens.css")]);
  const titlebarVariable = "var(--ordax-window-titlebar-height, 3.625rem)";
  assert.ok(windowCss.includes("min-height: " + titlebarVariable + ";"));
  assert.ok(windowCss.includes("height: calc(100% - " + titlebarVariable + ");"));
  assert.ok(!windowCss.includes("height: calc(100% - 58px);"));
  assert.match(tokens, /html\[data-ordax-text-scale="large"\] \{ font-size: 112\.5%; \}/);
  assert.match(tokens, /html\[data-ordax-text-scale="extra-large"\] \{ font-size: 125%; \}/);
  assert.doesNotMatch(tokens, /--ordax-text-scale-factor/);

  const root = tokens.match(/html\[data-ordax-display-scale\] #ordax-root \{([^}]+)\}/)?.[1];
  assert.ok(root, "scaled canvas must have one root");
  assert.ok(root.includes("width: var(--ordax-display-scale-viewport-width);"));
  assert.ok(root.includes("height: var(--ordax-display-scale-viewport-height);"));
  assert.ok(root.includes("zoom: var(--ordax-display-scale-factor);"));

  for (const mode of ["compact", "comfortable", "large"]) {
    const rule = tokens.match(new RegExp('html\\[data-ordax-display-scale="' + mode + '"\\] \\{([^}]+)\\}'))?.[1];
    assert.ok(rule, mode + " scale owner");
    const factor = Number(rule.match(/--ordax-display-scale-factor:\s*([\d.]+);/)?.[1]);
    const width = Number(rule.match(/--ordax-display-scale-viewport-width:\s*([\d.]+)vw;/)?.[1]);
    const height = Number(rule.match(/--ordax-display-scale-viewport-height:\s*([\d.]+)dvh;/)?.[1]);
    assert.ok(factor > 0, mode);
    assert.ok(Math.abs(factor * width - 100) < 0.001, mode + " viewport width");
    assert.ok(Math.abs(factor * height - 100) < 0.001, mode + " viewport height");
  }
});

test("Wallpaper is owned by Meridian once, not duplicated in identity CSS", async () => {
  const [meridian, identity, surfaceCss] = await Promise.all([
    read("meridian.css"), read("identity.css"), read("surface.css"),
  ]);
  const declaration = '--md-desktop-wallpaper:url("./brand/meridian-field.svg");';
  assert.equal(meridian.split(declaration).length - 1, 1);
  assert.match(meridian, /\[data-meridian\] :is\(\.classic-desktop,\.ordax-workspace\)::before \{[^}]*background:var\(--md-desktop-wallpaper\) center\/cover no-repeat;/);
  assert.doesNotMatch(identity, /--md-desktop-wallpaper:|background:var\(--md-desktop-wallpaper\)/);
  assert.doesNotMatch(identity + meridian, /url\("\.\/brand\/midnight-landscape\.png"\)/);
  assert.match(meridian, /\[data-meridian\] :is\(\.ordax-dock-shortcut,\.ordax-running-app,\.desktop-task\)\[data-active="true"\]/);
  // The historic asset's byte provenance continues in the OS visual contract;
  // this gate owns only current presentation CSS and must not redefine its hash.
  assert.ok(surfaceCss.includes('.ordax-running-app[data-active="true"]'));
});

test("Notification overlay remains viewport-bound without a mobile CSS fork", async () => {
  const css = await read("notification-center.css");
  const rule = css.match(/\.ordax-quick-panel-notifications \{([^}]+)\}/)?.[1];
  assert.ok(rule, "one shared quick-panel rule");
  assert.ok(rule.includes("position: fixed;"));
  assert.ok(rule.includes("width: min(380px, calc(100dvw - 24px));"));
  assert.ok(rule.includes("inset-inline-start: clamp(12px, calc(var(--notification-sidebar-edge, 0px) + 12px), calc(100dvw - min(380px, 100dvw - 24px) - 12px));"));
  assert.doesNotMatch(css, /@media\s*\(max-width:\s*600px\)/);
  assert.match(css, /\.ordax-notification-center \{[^}]*container-type: inline-size;[^}]*min-width: 0;/);
  assert.match(css, /@container\s*\(max-width:\s*360px\)/);

  // Deterministic geometry of the verified clamp formula at the original
  // problem viewports. This is a source-contract proof, not a browser E2E.
  for (const viewport of [320, 390, 844, 1280]) {
    const panelWidth = Math.min(380, viewport - 24);
    for (const sidebarEdge of [0, 192, 224, 400]) {
      const maxLeft = viewport - panelWidth - 12;
      const left = Math.max(12, Math.min(sidebarEdge + 12, maxLeft));
      assert.ok(left >= 12, viewport + ": left boundary");
      assert.ok(left + panelWidth <= viewport - 12, viewport + ": right boundary");
    }
  }
});


test("Display read recovery stays in the canonical Surface control and is explicitly user-triggered", async () => {
  const source = await read("display-output-controls.mjs");
  assert.match(source, /retryButton\.dataset\.settingsDisplayRetry = "true"/);
  assert.match(source, /retryButton\.hidden = !outputPort \|\| statusMessageId !== "settings\.display\.host\.readFailed"/);
  assert.match(source, /retryButton\.disabled = pending/);
  assert.match(source, /const handleRetry = \(\) => \{ void refresh\(\); \}/);
  assert.match(source, /retryButton\.removeEventListener\("click", handleRetry\)/);
  assert.doesNotMatch(source, /setTimeout\([^\n]*refresh/);
});

test("Native Home Aura uses a measured quick-response budget and streamed provisional text", async () => {
  const source = await read("home-aura-composer.mjs");
  assert.match(source, /const HOME_AURA_QUICK_MAX_TOKENS = 128;/);
  assert.match(source, /maxTokens: HOME_AURA_QUICK_MAX_TOKENS/);
  assert.match(source, /signal: controller\.signal,\s*\/\/ Streamed tokens are provisional[\s\S]*?onDelta: async \(delta\) =>/);
  assert.match(source, /HOME_AURA_MAX_PROVISIONAL_CHARS = 131072/);
  assert.match(source, /provisionalText = next;\s*elements\.responseText\.textContent = provisionalText;/);
  assert.match(source, /const validated = validateIntelligenceResponse\(response\);\s*elements\.responseText\.textContent = validated\.text/);
  assert.match(source, /elements\.response\.dataset\.state = "error";\s*elements\.responseText\.textContent = localization\.translate\("home\.aura\.response\.error"\)/);
  assert.match(source, /activeController\?\.abort\(\)/);
  assert.doesNotMatch(source, /fetch\(|llama-server|apiKey|openai\.com|new WebSocket/);
});

test("Home Aura visibly ends a stuck request at ten seconds and aborts underlying inference", async () => {
  const source = await read("home-aura-composer.mjs");
  assert.match(source, /const HOME_AURA_MAX_REQUEST_MS = 10_000;/);
  assert.match(source, /const watchdog = setTimeout\(\(\) => \{[\s\S]*?deadlineReached = true;\s*controller\.abort\(\);\s*\}, HOME_AURA_MAX_REQUEST_MS\);/);
  assert.match(source, /if \(destroyed \|\| \(controller\.signal\.aborted && !deadlineReached\)\) return;/);
  assert.match(source, /clearTimeout\(watchdog\);\s*if \(activeController === controller\)/);
  assert.match(source, /failed = true;\s*elements\.response\.dataset\.state = "error"/);
  assert.match(source, /pending = false;\s*render\(\)/);
  assert.doesNotMatch(source, /fetch\(|new WebSocket|llama-server|cachedGreeting|fakeResponse/);
});


test("Aura client streams through the canonical Intelligence port and validates completion", async () => {
  const client = await readFile(new URL("../system/surface/workspace/lib/intelligence/client.mjs", import.meta.url), "utf8");
  const view = await readFile(new URL("../system/surface/workspace/components/intelligence/aura-content.tsx", import.meta.url), "utf8");
  assert.match(client, /onDelta: onDelta === null \? null : async/);
  assert.match(client, /validateIntelligenceResponse\(response\)/);
  assert.match(client, /signal\?\.aborted/);
  assert.match(view, /onDelta: \(delta: string\)/);
  assert.match(view, /generation !== requestGeneration\.current/);
  assert.match(view, /state: 'pending', partial:/);
  assert.match(view, /state: 'ready', text: response\.text/);
});
