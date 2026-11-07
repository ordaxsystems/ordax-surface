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

test("Aura client streams through the canonical Intelligence port and validates completion", async () => {
  const client = await readFile(new URL("../system/surface/workspace/lib/intelligence/client.mjs", import.meta.url), "utf8");
  const view = await readFile(new URL("../system/surface/workspace/components/intelligence/aura-content.tsx", import.meta.url), "utf8");
  assert.match(client, /createPresentationDeltaGate\(async \(delta\) =>/);
  assert.match(client, /onDelta: deltaGate\?\.onDelta \?\? null/);
  assert.match(client, /finally \{\s*deltaGate\?\.close\(\);/);
  assert.match(client, /validateIntelligenceResponse\(response\)/);
  assert.match(client, /signal\?\.aborted/);
  assert.match(view, /onDelta: \(delta: string\)/);
  assert.match(view, /generation !== requestGeneration\.current/);
  assert.match(view, /state: 'pending', prompt: normalized, partial:/);
  assert.match(view, /conversation\.record\(normalized, response\)/);
  assert.match(view, /conversation\.context\(\)/);
});


test("First Run reflows as one accessible Native wizard on narrow viewports", async () => {
  const css = await read("first-run.css");
  assert.match(css, /@container \(max-width: 900px\)/);
  assert.match(css, /@container \(max-width: 600px\)/);
  assert.match(css, /\.ordax-first-run-shell \{[^}]*min-width: 0;[^}]*grid-template-columns: minmax\(0, 1fr\);[^}]*grid-template-rows: auto minmax\(0, 1fr\);/s);
  assert.match(css, /\.ordax-first-run-steps \{[^}]*overflow-x: auto;/s);
  assert.match(css, /\.ordax-first-run-body \{[^}]*padding: 20px 16px;/s);
  assert.match(css, /\.ordax-first-run-footer \.ordax-first-run-action \{ min-height: 44px; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /container-type: inline-size;/);
  assert.doesNotMatch(css, /@media\s*\(max-width:/);
  assert.doesNotMatch(css, /@media\s+\(max-width:\s*\d+px\)[\s\S]*?position:\s*fixed;\s*inset:/);
});

test("Store starts with authoritative catalog state and never silently opens demonstration", async () => {
  const store = await read("store-experience.mjs");
  const catalog = await read("store-overview-controls.mjs");
  // Startup must not substitute a fixture because a real catalog is loading,
  // unavailable or empty. The existing overview renders those live states.
  assert.match(store, /let mode = 'official';/);
  assert.doesNotMatch(store, /let mode = catalogPort\.getSnapshot\(\)\.state/);
  assert.match(store, /mountStoreOverviewControls\(host, catalogPort, surfaceLifecycle/);
  assert.match(catalog, /snapshot\.state !== "ready"/);
  assert.match(catalog, /catalog\.subscribe\(\(next\) => \{/);
  // Loading the static preview must remain behind an intentional switch.
  assert.match(store, /if \(mode === 'planned'\) void loadPreview\(\);/);
  assert.match(store, /const onSwitch = \(\) => \{mode = mode === 'official' \? 'planned' : 'official';renderContext\(\);\};/);
  assert.match(store, /toggle\.addEventListener\('click', onSwitch\)/);
  assert.doesNotMatch(store, /catalogPort\.getSnapshot\(\)\.state === 'ready' \? 'official' : 'planned'/);
});


test("Web and Native Store share the canonical official renderer; legacy parallel UI stays absent", async () => {
  const file = path => readFile(new URL("../" + path, import.meta.url), "utf8");
  const [web, desktop, wrapper, experience, official, demo] = await Promise.all([
    file("system/surface/workspace/components/web/app-content.tsx"),
    file("system/surface/workspace/components/central/desktop.tsx"),
    file("system/surface/workspace/components/store/meridian-store.tsx"),
    read("store-experience.mjs"),
    file("system/surface/workspace/lib/store/official.ts"),
    file("system/surface/workspace/components/store/presentation/app.js"),
  ]);
  assert.match(web, /import \{ StoreExperience \} from '@\/components\/store\/meridian-store'/);
  assert.match(web, /if \(id === 'store'\) return <StoreExperience\/>/);
  assert.doesNotMatch(web, /components\/store\/store['"]|<StoreApp\b|onOpenApp=/);
  assert.match(desktop, /import\('\.\.\/store\/meridian-store'\)/);
  assert.match(wrapper, /export function StoreExperience\(\)/);
  assert.match(wrapper, /const catalogPort = useStoreCatalogPort\(\)/);
  assert.match(wrapper, /mountStoreExperience\(host\.current, \{ catalogPort, surfaceLifecycle, presentationAssets \}\)/);
  assert.match(experience, /let mode = 'official'/);
  assert.match(experience, /if \(mode === 'planned'\) void loadPreview\(\)/);
  assert.match(official, /export function createStoreSnapshotSource\(input: unknown\)/);
  assert.doesNotMatch(official, /projectOfficialStoreItems|officialEntryStatus|from '\.\/catalog'|from '\.\/state'/);
  // Retain the one explicit preview, not another authoritative catalog or Store.
  assert.match(demo, /lib\/store\/catalog\.mjs/);
  assert.match(demo, /lib\/store\/state\.mjs/);
  const { existsSync } = await import("node:fs");
  for (const legacy of [
    "system/surface/workspace/components/store/store.tsx",
    "system/surface/workspace/components/store/styles.css",
    "system/surface/workspace/assets/store-hero.jpg",
    "system/surface/workspace/lib/store/catalog.ts",
    "system/surface/workspace/lib/store/state.ts",
  ]) {
    assert.equal(existsSync(new URL("../" + legacy, import.meta.url)), false, legacy + " must not return");
  }
});


test("Store idempotency survives unrelated catalog updates without inventing authority", async () => {
  const source = await read("store-overview-controls.mjs");
  const handler = source.slice(
    source.indexOf('const button = event.target.closest?.("[data-store-operation][data-store-app-id]")'),
    source.indexOf("  const onKeyDown =", source.indexOf("  const onClick =")),
  );
  const subscription = source.slice(
    source.indexOf("  const unsubscribeCatalog = catalog.subscribe("),
    source.indexOf("  const unsubscribeRender =", source.indexOf("  const unsubscribeCatalog =")),
  );
  assert.match(source, /const uncertainRequestIds = new Map\(\)/);
  assert.match(handler, /const candidateSignature = lifecycleCandidateSignature\(entry, operation\)/);
  assert.match(handler, /const receipt = uncertainRequestIds\.get\(retryScope\)/);
  assert.match(handler, /receipt\?\.candidateSignature === candidateSignature \? receipt\.requestId : null/);
  assert.match(handler, /uncertainRequestIds\.set\(retryScope, Object\.freeze\(\{/);
  assert.ok(
    handler.indexOf("uncertainRequestIds.set(retryScope") < handler.indexOf("lifecycleRequests.requestLifecycle(request)"),
    "reserve the idempotency receipt before the async OS delegation",
  );
  assert.match(handler, /const isCurrentRequest = \(\) => !destroyed[\s\S]*?sameLifecycleCandidate\(snapshot, appId, operation, candidateSignature\)/);
  assert.match(handler, /validateAppLifecycleRequestResultForRequest\(rawResult, request\)/);
  assert.match(handler, /if \(uncertainRequestIds\.get\(retryScope\)\?\.requestId === request\.requestId\) \{\s*uncertainRequestIds\.delete\(retryScope\)/);
  assert.match(handler, /\/\/ No authoritative outcome arrived; keep the pre-delegation receipt\.\s*pendingRequest = null/);
  assert.doesNotMatch(source, /catalogGeneration|uncertainRequestIds\.clear\(\)/);

  assert.match(subscription, /if \(verified\.state === "ready"\) \{\s*for \(const \[scope, receipt\] of uncertainRequestIds\)/);
  assert.match(subscription, /if \(!sameLifecycleCandidate\(verified, receipt\.appId,\s*receipt\.operation, receipt\.candidateSignature\)\) \{\s*uncertainRequestIds\.delete\(scope\)/);
  assert.match(subscription, /if \(pendingRequest !== null && !sameLifecycleCandidate\(verified,/);
  assert.match(subscription, /if \(verified\.state !== "ready"\) \{[\s\S]*?updateAll\?\.cancelPending\(\)/);
  assert.doesNotMatch(
    subscription.slice(subscription.indexOf('if (verified.state === "ready")'), subscription.indexOf('if (verified.state !== "ready")')),
    /updateAll\?\.cancelPending\(\)|batchPresentationGeneration \+= 1/,
    "unrelated signed catalog changes cannot cancel Update All",
  );

  // Exercise the exact pure candidate matchers defined in the production UI,
  // not a second model of Store eligibility or OS lifecycle authority.
  const { runInNewContext } = await import("node:vm");
  const implementation = source.slice(
    source.indexOf("function operationAllowed(entry, operation) {"),
    source.indexOf("function versionSummary(t, entry) {"),
  );
  const { lifecycleCandidateSignature, sameLifecycleCandidate } = runInNewContext(
    implementation + "\n;({ lifecycleCandidateSignature, sameLifecycleCandidate })",
  );
  const app = (appId, overrides = {}) => ({
    appId, title: appId, state: "installed", installedVersion: "1.0.0",
    availableVersion: "2.0.0", installable: false, updatable: true,
    removable: true, blockedReason: null, artifactIdentityVerified: true,
    provenanceVerified: true, ...overrides,
  });
  const own = app("app-own");
  const other = app("app-other");
  const candidate = lifecycleCandidateSignature(own, "update");
  assert.equal(sameLifecycleCandidate({ state: "ready", entries: [own, other] }, own.appId, "update", candidate), true);
  assert.equal(sameLifecycleCandidate({
    state: "ready", entries: [own, app("app-other", { state: "updating", updatable: false })],
  }, own.appId, "update", candidate), true, "another app may advance without invalidating this retry");
  assert.equal(sameLifecycleCandidate({
    state: "ready", entries: [app("app-own", { title: "Renamed" }), other],
  }, own.appId, "update", candidate), true, "presentation-only title changes preserve lifecycle intent");
  assert.equal(sameLifecycleCandidate({
    state: "ready", entries: [app("app-own", { availableVersion: "3.0.0" }), other],
  }, own.appId, "update", candidate), false, "new artifact candidate must not replay old request ID");
  assert.equal(sameLifecycleCandidate({
    state: "ready", entries: [app("app-own", { updatable: false }), other],
  }, own.appId, "update", candidate), false, "revoked eligibility must fail closed");
  assert.equal(sameLifecycleCandidate({ state: "ready", entries: [other] }, own.appId, "update", candidate), false);
  assert.equal(sameLifecycleCandidate({ state: "unavailable", entries: [] }, own.appId, "update", candidate), false);
  const removeCandidate = lifecycleCandidateSignature(own, "remove");
  assert.equal(sameLifecycleCandidate({
    state: "ready", entries: [app("app-own", { availableVersion: "3.0.0" })],
  }, own.appId, "remove", removeCandidate), true, "a new available release does not change removal of installed version");
});


test("Native Home continuation reads the OS regional time-zone SSOT and reacts to preference changes", async () => {
  const home = await read("home-continuation.mjs");
  const shell = await read("desktop-shell.mjs");

  // The desktop clock already uses the canonical region preference. The Home
  // activity cards must read that same port rather than freezing Bahia time.
  assert.match(shell, /REGIONAL_TIME_ZONE_PREFERENCE_ID/);
  assert.match(home, /import \{ assertPreferenceRuntimePort \} from "\.\.\/\.\.\/contracts\/preference-runtime\.mjs"/);
  assert.match(home, /import \{ resolveRegionalTimeZone \} from "\.\.\/\.\.\/services\/preferences\/regional\.mjs"/);
  assert.match(home, /const preferencePort = lifecycle\.preferences == null\s*\? null : assertPreferenceRuntimePort\(lifecycle\.preferences\)/);
  assert.match(home, /const timeZone = resolveRegionalTimeZone\(preferencePort\?\.getSnapshot\(\) \?\? \{\}\)/);
  assert.match(home, /function formatActivity\(timestamp, locale, timeZone, unknownLabel\)/);
  assert.match(home, /new Intl\.DateTimeFormat\(locale, \{\s*timeZone,/);
  assert.match(home, /localization\.getLocale\(\),\s*timeZone,\s*t\("home\.continuation\.activityUnknown"\)/);
  assert.match(home, /const unsubscribePreferences = preferencePort\?\.subscribe\(render\)/);
  assert.match(home, /dispose\(\) \{[\s\S]*?unsubscribePreferences\?\.\(\)/);
  assert.doesNotMatch(home, /timeZone:\s*["']America\/Bahia["']/);

  // Same instant differs across two user-selectable OS zones. Formatting must
  // follow the selected region, even when the host's locale stays pt-BR.
  const moment = new Date("2026-11-01T12:00:00.000Z");
  const format = timeZone => new Intl.DateTimeFormat("pt-BR", {
    timeZone, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(moment);
  assert.notEqual(format("America/Bahia"), format("America/Manaus"));
});


test("Native audio refresh cannot invalidate an in-flight write and leave controls locked", async () => {
  const source = await read("audio-output-controls.mjs");
  const refresh = source.slice(source.indexOf("  const refresh = async () => {"), source.indexOf("  const apply = async (action) => {"));
  const apply = source.slice(source.indexOf("  const apply = async (action) => {"), source.indexOf("  const handleOutputChange ="));
  assert.ok(refresh.length > 0 && apply.length > 0, "Canonical audio read/write handlers must exist");
  assert.match(refresh, /if \(destroyed \|\| audioPort === null \|\| pending\) return;/);
  assert.match(refresh, /const currentOperation = \+\+operation;/);
  assert.match(refresh, /if \(destroyed \|\| currentOperation !== operation\) return;/);
  assert.match(apply, /if \(destroyed \|\| pending \|\| audioPort === null \|\| !selectedOutputId\) return;/);
  assert.match(apply, /const currentOperation = \+\+operation;\s*pending = true;/);
  assert.match(apply, /const result = await action\(audioPort, selectedOutputId\);\s*if \(destroyed \|\| currentOperation !== operation\) return;\s*[\s\S]*?snapshot = validateAudioOutputsSnapshot\(result\);/);
  assert.match(apply, /pending = false;\s*render\(\);/);
  assert.match(source, /refreshButton\.disabled = pending;/);
  assert.match(source, /operation \+= 1;\s*outputSelect\.removeEventListener/);
});


test("Native network, Settings, System and Diagnostics timestamps use the regional SSOT", async () => {
  const { runInNewContext } = await import("node:vm");
  const [network, settings, system, diagnostics] = await Promise.all([
    read("network-tray-controls.mjs"),
    read("settings-overview-controls.mjs"),
    read("system-overview-controls.mjs"),
    read("system-diagnostics-review.mjs"),
  ]);
  for (const [owner, source] of Object.entries({ network, settings, system, diagnostics })) {
    assert.match(source, /resolveRegionalTimeZone/);
    assert.doesNotMatch(source, /timeZone:\s*["']America\/Bahia["']/,
      owner + " must not override the user's regional choice");
  }

  assert.match(network, /const unsubscribePreferences = preferences\?\.subscribe\(rerenderPresentation\)/);
  assert.match(network, /unsubscribePreferences\?\.\(\)/);
  assert.match(settings, /const unsubscribePreferences = preferences\.subscribe/);
  assert.match(settings, /resolveRegionalTimeZone\(preferenceSnapshot\)/);
  assert.match(system, /const unsubscribePreferences = preferences\?\.subscribe/);
  assert.match(system, /unsubscribePreferences\?\.\(\)/);
  assert.match(diagnostics, /const unsubscribePreferences = preferences\?\.subscribe\(rerender\)/);
  assert.match(diagnostics, /unsubscribePreferences\?\.\(\)/);

  const extract = (source, start, end) => {
    const begin = source.indexOf(start);
    const finish = source.indexOf(end, begin);
    assert.ok(begin >= 0 && finish > begin, start + " and " + end + " must exist");
    return source.slice(begin, finish).replace(/^export /, "");
  };
  const networkTime = runInNewContext(
    extract(network, "export function formatNetworkReceivedAt(", "function signalLevel(")
      + "\n;formatNetworkReceivedAt",
    { Intl, Date, Number, resolveRegionalTimeZone: () => "America/Bahia" },
  );
  const settingsTime = runInNewContext(
    extract(settings, "function formatReceivedAt(", "const PREFERENCE_PRESENTATION_IDS")
      + "\n;formatReceivedAt",
    { Intl, Date, Number },
  );
  const overviewTimes = runInNewContext(
    extract(system, "function formatOverviewTimestamp(", "function validSystemSection(")
      + "\n;({ formatOverviewTimestamp, formatOverviewReceivedAt })",
    { Intl, Date, Number },
  );
  const diagnosticTime = runInNewContext(
    extract(diagnostics, "function displayLocale(", "function formatBytes(")
      + "\n;formatTimestamp",
    { Intl, Date, Number },
  );
  const instant = "2026-11-01T12:34:00.000Z";
  const millis = Date.parse(instant);
  const zones = ["America/Bahia", "America/Manaus"];
  const expected = ["09:34", "08:34"];
  const localization = {
    getLocale: () => "pt-BR",
    translate: () => "unknown",
  };
  const formatters = [
    zone => networkTime(millis, "pt-BR", zone),
    zone => settingsTime(millis, "pt-BR", zone),
    zone => overviewTimes.formatOverviewTimestamp(instant, "pt-BR", zone),
    zone => overviewTimes.formatOverviewReceivedAt(millis, "pt-BR", zone),
    zone => diagnosticTime(instant, localization, zone),
  ];
  for (const [i, formatter] of formatters.entries()) {
    assert.notEqual(formatter(zones[0]), formatter(zones[1]), "formatter " + i);
    for (let zoneIndex = 0; zoneIndex < zones.length; zoneIndex++) {
      assert.ok(formatter(zones[zoneIndex]).includes(expected[zoneIndex]),
        "formatter " + i + " / " + zones[zoneIndex] + ": " + formatter(zones[zoneIndex]));
    }
  }
  assert.equal(networkTime(null, "pt-BR", zones[0]), null);
  assert.equal(settingsTime(null, "pt-BR", zones[0]), null);
  assert.equal(overviewTimes.formatOverviewTimestamp("unknown", "pt-BR", zones[0]), null);
});


test("Account keeps only the current signed-out session registration policy", async () => {
  const { runInNewContext } = await import("node:vm");
  const source = await read("account-overview-controls.mjs");
  const start = source.indexOf("  const refreshRegistrationPolicy = async () => {");
  const end = source.indexOf("  const invoke = async (action) => {", start);
  assert.ok(start !== -1 && end > start);

  const makeDeferred = () => {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
  };
  const first = makeDeferred();
  const second = makeDeferred();
  const queue = [first, second];
  const script = [
    'let destroyed = false;',
    'let sessionSnapshot = { state: "signed-out" };',
    'let registrationPolicy = null;',
    'let registrationPolicyPending = false;',
    'let registrationPolicyOrdinal = 0;',
    'let registrationLegalAccepted = false;',
    'let hostedSignupAllowed = false;',
    'const credentialsPort = { registrationPolicy: () => nextPolicy() };',
    'const actionsSnapshot = {};',
    'const isIdentityActionSupported = () => true;',
    'const isHostedSignupEnabled = () => true;',
    'const replaceView = () => {};',
    source.slice(start, end),
    '({',
    'refreshRegistrationPolicy,',
    'switchIdentity(state) { sessionSnapshot = { state }; registrationPolicyOrdinal += 1; registrationPolicyPending = false; registrationPolicy = null; },',
    'current() { return { registrationPolicy, registrationPolicyPending, hostedSignupAllowed }; }',
    '});',
  ].join("\n");
  const harness = runInNewContext(script, { nextPolicy: () => queue.shift().promise });
  const firstRead = harness.refreshRegistrationPolicy();
  assert.equal(harness.current().registrationPolicyPending, true);
  harness.switchIdentity("signed-in");
  harness.switchIdentity("signed-out");
  const secondRead = harness.refreshRegistrationPolicy();
  second.resolve({ registrationEnabled: true, nonce: "new-policy" });
  await secondRead;
  first.resolve({ registrationEnabled: false, nonce: "old-policy" });
  await firstRead;
  assert.equal(harness.current().registrationPolicy.nonce, "new-policy");
  assert.equal(harness.current().registrationPolicyPending, false);
  assert.equal(harness.current().hostedSignupAllowed, true);

  const subscription = source.slice(
    source.indexOf("  const unsubscribeSession = sessionPort.subscribe("),
    source.indexOf("  const unsubscribeAccountLifecycle =", source.indexOf("  const unsubscribeSession =")),
  );
  assert.match(subscription, /if \(priorState !== sessionSnapshot\.state \|\| priorSubject !== currentSubject\) \{/);
  for (const guard of [
    "actionOrdinal += 1;", "pendingAction = null;",
    "closeOrdinal += 1;", "pendingClose = false;",
    "registrationPolicyOrdinal += 1;", "registrationPolicyPending = false;",
    "registrationPolicy = null;", 'credentialPasswordDraft = "";', 'closePasswordDraft = "";',
  ]) assert.ok(subscription.includes(guard), "missing session fence: " + guard);
});

test("Account close completion never refreshes or notifies a different subject", async () => {
  const { runInNewContext } = await import("node:vm");
  const source = await read("account-overview-controls.mjs");
  const start = source.indexOf("  const closeAccount = async () => {");
  const end = source.indexOf("  const onChange = (event) => {", start);
  assert.ok(start !== -1 && end > start);
  let finishClose;
  const response = new Promise((resolve) => { finishClose = resolve; });
  const script = [
    'let destroyed = false;',
    'let pendingClose = false;',
    'let closePasswordDraft = "do-not-preserve";',
    'let closeConfirmationChecked = true;',
    'let closeMessage = "";',
    'let closeOrdinal = 0;',
    'let sessionSnapshot = { state: "signed-in", subjectId: "subject-a" };',
    'const accountLifecyclePort = { closeAccount: () => closeResponse() };',
    'const accountLifecycleSnapshot = {};',
    'const isAccountLifecycleActionSupported = () => true;',
    'const t = (id) => id;',
    'const replaceView = () => {};',
    'let refreshCount = 0;',
    'const sessionPort = { refresh: async () => { refreshCount += 1; } };',
    source.slice(start, end),
    '({ closeAccount,',
    'switchIdentity() { sessionSnapshot = { state: "signed-in", subjectId: "subject-b" }; closeOrdinal += 1; pendingClose = false; closeMessage = ""; },',
    'state() { return { pendingClose, closeMessage, refreshCount, closePasswordDraft }; }',
    '});',
  ].join("\n");
  const harness = runInNewContext(script, { closeResponse: () => response });
  const action = harness.closeAccount();
  assert.equal(harness.state().pendingClose, true);
  harness.switchIdentity();
  finishClose({ closed: true });
  await action;
  assert.equal(harness.state().pendingClose, false);
  assert.equal(harness.state().closeMessage, "");
  assert.equal(harness.state().refreshCount, 0, "stale closure must not refresh subject-b");
  assert.equal(harness.state().closePasswordDraft, "");

  const invoke = source.slice(
    source.indexOf("  const invoke = async (action) => {"),
    source.indexOf("  const closeAccount = async () => {"),
  );
  assert.match(invoke, /if \(destroyed \|\| ordinal !== actionOrdinal\) return;\s*if \(typeof sessionPort\.refresh === "function"\)/);
});


test("Space switcher preserves same-user selection and closes only on identity transitions", async () => {
  const { runInNewContext } = await import("node:vm");
  const source = await read("space-switcher-controls.mjs");
  const helperStart = source.indexOf("function identityPresentationContextChanged(");
  const helperEnd = source.indexOf("// One presentation for the existing Account-owned Spaces", helperStart);
  const subscribeStart = source.indexOf("    identityPort.subscribe(() => {");
  const subscribeEnd = source.indexOf("    spacesPort.subscribe(render),", subscribeStart);
  assert.ok(helperStart !== -1 && helperEnd > helperStart);
  assert.ok(subscribeStart !== -1 && subscribeEnd > subscribeStart);
  const helper = source.slice(helperStart, helperEnd);
  const actualSubscribe = source.slice(subscribeStart, subscribeEnd).trim().replace(/,\s*$/, "");
  const harness = runInNewContext([
    helper,
    'let identitySnapshot = { state: "signed-in", subjectId: "owner-a", displayName: "Original" };',
    'let observedIdentity = identitySnapshot;',
    'let refreshRevision = 0;',
    'let loading = true;',
    'let open = true;',
    'let error = true;',
    'let selectionFailed = true;',
    'let repaintCount = 0;',
    'let identityListener = null;',
    'const render = () => { repaintCount += 1; };',
    'const identityPort = {',
    '  getSnapshot: () => identitySnapshot,',
    '  subscribe(callback) { identityListener = callback; callback(); return () => {}; },',
    '};',
    actualSubscribe + ";",
    '({',
    '  publish(value) { identitySnapshot = value; identityListener(); },',
    '  state() { return { refreshRevision, loading, open, error, selectionFailed, repaintCount }; },',
    '});',
  ].join("\n"));
  assert.equal(harness.state().refreshRevision, 0, "initial replay is not a session change");
  assert.equal(harness.state().open, true);
  harness.publish({ state: "signed-in", subjectId: "owner-a", displayName: "Updated" });
  assert.equal(harness.state().open, true, "profile refresh does not dismiss the menu");
  assert.equal(harness.state().loading, true, "an in-flight catalog read remains valid");
  assert.equal(harness.state().selectionFailed, true, "presentation feedback is preserved");
  assert.equal(harness.state().refreshRevision, 0, "same-subject refresh cannot revoke a read");
  harness.publish({ state: "signed-in", subjectId: "owner-b", displayName: "Another" });
  assert.equal(harness.state().open, false, "account switch dismisses previous menu");
  assert.equal(harness.state().loading, false, "old catalog wait is invalidated");
  assert.equal(harness.state().error, false);
  assert.equal(harness.state().selectionFailed, false);
  assert.equal(harness.state().refreshRevision, 1);
  harness.publish({ state: "signed-in", subjectId: "owner-b", displayName: "Another" });
  assert.equal(harness.state().refreshRevision, 1, "duplicate event must not revoke again");
  harness.publish({ state: "signed-out", subjectId: null });
  assert.equal(harness.state().refreshRevision, 2, "sign-out revokes context");
  harness.publish({ state: "signed-out", subjectId: null });
  assert.equal(harness.state().refreshRevision, 2);
  harness.publish({ state: "unavailable", subjectId: null });
  assert.equal(harness.state().refreshRevision, 3, "identity unavailability revokes context");
  assert.ok(harness.state().repaintCount >= 7, "all changes still repaint the authoritative view");

  assert.match(source, /const nextIdentity = identityPort\.getSnapshot\(\);/);
  assert.match(source, /if \(contextChanged\) \{[\s\S]*?refreshRevision \+= 1;[\s\S]*?open = false;/);
  assert.match(source, /if \(destroyed \|\| revision !== refreshRevision\) return;/);
  assert.match(source, /deriveAuthorizedSpaces\(identity, catalog, selection\)/);
});


test("Native lock rejects late unlock completions after a new lock cycle", async () => {
  const { runInNewContext } = await import("node:vm");
  const source = await read("local-session-lock.mjs");
  const submitStart = source.indexOf("  const onSubmit = (event) => {");
  const submitEnd = source.indexOf('  documentObject.addEventListener("submit", onSubmit);', submitStart);
  const subscribeStart = source.indexOf("  const unsubscribeSession = port.subscribe((next) => {");
  const subscribeEnd = source.indexOf("  const unsubscribeLocalization =", subscribeStart);
  assert.ok(submitStart !== -1 && submitEnd > submitStart);
  assert.ok(subscribeStart !== -1 && subscribeEnd > subscribeStart);

  const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
  };
  const first = deferred();
  const second = deferred();
  const responses = [first, second];
  const code = [
    'let snapshot = { state: "locked" };',
    'let destroyed = false;',
    'let pending = false;',
    'let attemptRevision = 0;',
    'let messageId = null;',
    'let renderCount = 0;',
    'const render = () => { renderCount += 1; };',
    'class HTMLInputElement { constructor() { this.value = "secret-valid"; } }',
    'const input = new HTMLInputElement();',
    'const form = { querySelector: () => input };',
    'const overlay = { contains: value => value === form };',
    'const port = { unlock: secret => nextResponse(secret), subscribe(listener) { this.notify = listener; listener(snapshot); return () => {}; } };',
    'const validateLocalSessionSnapshot = value => value;',
    source.slice(submitStart, submitEnd),
    source.slice(subscribeStart, subscribeEnd),
    '({',
    'submit() { input.value = "secret-valid"; onSubmit({ target: { closest: () => form }, preventDefault() {} }); },',
    'publish(state) { port.notify({ state }); },',
    'read() { return { state: snapshot.state, pending, messageId, attemptRevision, renderCount }; },',
    '});',
  ].join("\n");
  const harness = runInNewContext(code, {
    nextResponse: () => responses.shift().promise,
  });
  assert.equal(harness.read().attemptRevision, 0, "initial snapshot is not a new lock cycle");

  harness.submit();
  assert.equal(harness.read().pending, true);
  assert.equal(harness.read().attemptRevision, 1);
  harness.publish("locked");
  assert.equal(harness.read().pending, true, "same-state observation cannot drop a pending request");
  harness.publish("unlocked");
  assert.equal(harness.read().pending, false, "unlocked OS snapshot revokes the UI request");
  harness.publish("locked");
  assert.equal(harness.read().pending, false);
  harness.submit();
  assert.equal(harness.read().pending, true, "new lock cycle accepts its own attempt");
  const newRevision = harness.read().attemptRevision;

  first.reject({ status: 429 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(harness.read().pending, true, "old 429 must not release the new attempt");
  assert.equal(harness.read().messageId, null, "old 429 must not become the new lock's error");
  assert.equal(harness.read().attemptRevision, newRevision);
  second.reject({ status: 429 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(harness.read().pending, false);
  assert.equal(harness.read().messageId, "localSession.lock.message.rateLimited");

  assert.match(source, /if \(destroyed \|\| revision !== attemptRevision \|\| snapshot.state !== "locked"\) return;/);
  assert.match(source, /if \(snapshot.state !== previousState\) \{[\s\S]*?attemptRevision \+= 1;[\s\S]*?pending = false;/);
  assert.match(source, /!overlay\?\.contains\(input\)/, "stale queued focus must not target detached overlay input");
  assert.match(source, /render\(\{ preserveSecret: true \}\)/, "locale-only repaint keeps transient secret when safe");
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});


test("First Run rejects stale registration policy responses after sign-in and sign-out", async () => {
  const { runInNewContext } = await import("node:vm");
  const source = await read("first-run.mjs");
  const refreshStart = source.indexOf("  const refreshRegistrationPolicy = async () => {");
  const refreshEnd = source.indexOf("  const runIdentity = async (kind) => {", refreshStart);
  const sessionStart = source.indexOf("  unsubscribeSession = sessionPort.subscribe((snapshot) => {");
  const sessionEnd = source.indexOf("  unsubscribeActions = actionsPort.subscribe(", sessionStart);
  assert.ok(refreshStart >= 0 && refreshEnd > refreshStart);
  assert.ok(sessionStart >= 0 && sessionEnd > sessionStart);

  const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
  };

  for (const oldCompletion of ["success-before-new", "failure-after-new"]) {
    const first = deferred();
    const second = deferred();
    const pendingResponses = [first, second];
    const script = [
      'let destroyed = false;',
      'let sessionSnapshot = { state: "signed-out" };',
      'let registrationPolicy = null;',
      'let registrationLegalAccepted = false;',
      'let registrationPolicyPending = false;',
      'let registrationPolicyOrdinal = 0;',
      'let identityPending = null;',
      'let identityActionOrdinal = 0;',
      'let accountLocalRequested = false;',
      'let identityPasswordDraft = "";',
      'let passwordVisible = false;',
      'let hostedSignupAllowed = false;',
      'let draft = { accountMode: null };',
      'let finishing = false;',
      'let selectedIdentitySubjectId = null;',
      'let identityMessage = "";',
      'let stepIndex = 0;',
      'const STEPS = ["account", "ready"];',
      'const stepIndexFor = () => 0;',
      'const capabilitySnapshot = { registrationPolicy: true, identityRegister: true };',
      'const sameRegistrationLegalPolicy = () => false;',
      'const isHostedSignupEnabled = policy => policy.hostedSignup === true;',
      'const matchesFirstRunIdentitySelection = () => true;',
      'const credentialsPort = { registrationPolicy: () => nextPolicy() };',
      'let renderCount = 0;',
      'const render = () => { renderCount += 1; };',
      'const sessionPort = { subscribe(callback) { this.notify = callback; return () => {}; } };',
      'let unsubscribeSession = null;',
      source.slice(refreshStart, refreshEnd),
      source.slice(sessionStart, sessionEnd),
      '({',
      'refreshRegistrationPolicy,',
      'publish(state) { sessionPort.notify({ state }); },',
      'setAccepted(value) { registrationLegalAccepted = value; },',
      'current() { return { registrationPolicy, registrationLegalAccepted, registrationPolicyPending, registrationPolicyOrdinal, hostedSignupAllowed, renderCount }; }',
      '});',
    ].join("\n");
    const harness = runInNewContext(script, {
      nextPolicy: () => pendingResponses.shift().promise,
    });

    const oldRead = harness.refreshRegistrationPolicy();
    assert.equal(harness.current().registrationPolicyPending, true);
    harness.publish("signed-in");
    assert.equal(harness.current().registrationPolicyPending, false, "login invalidates stale policy wait");
    harness.publish("signed-out");
    assert.equal(harness.current().registrationPolicyPending, true, "new signed-out context can immediately query policy");
    const activeOrdinal = harness.current().registrationPolicyOrdinal;
    harness.setAccepted(true);
    harness.publish("signed-out");
    assert.equal(harness.current().registrationPolicyOrdinal, activeOrdinal, "duplicate signed-out notifications do not revoke new query");
    assert.equal(harness.current().registrationLegalAccepted, true, "unchanged session preserves consent draft");

    if (oldCompletion === "success-before-new") {
      first.resolve({ policyId: "outdated", registrationEnabled: true, hostedSignup: false });
      await oldRead;
      assert.equal(harness.current().registrationPolicyPending, true, "old success cannot release newer request");
      assert.equal(harness.current().registrationPolicy, null, "old success cannot reintroduce an outdated policy");
    }
    second.resolve({ policyId: "current", registrationEnabled: true, hostedSignup: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(harness.current().registrationPolicy?.policyId, "current");
    assert.equal(harness.current().registrationPolicyPending, false);
    assert.equal(harness.current().hostedSignupAllowed, true);
    if (oldCompletion === "failure-after-new") {
      first.reject(new Error("stale policy transport failure"));
      await oldRead;
      assert.equal(harness.current().registrationPolicy?.policyId, "current", "old error cannot erase new terms");
      assert.equal(harness.current().hostedSignupAllowed, true, "old error cannot hide a current hosted-signup link");
      assert.equal(harness.current().registrationPolicyPending, false);
    }
    assert.equal(harness.current().registrationPolicyOrdinal, activeOrdinal);
  }

  assert.match(source, /if \(previousSessionState !== sessionSnapshot\.state\) \{[\s\S]*?registrationPolicyOrdinal \+= 1;/);
  assert.match(source, /if \(destroyed \|\| ordinal !== registrationPolicyOrdinal\s*\|\| sessionSnapshot\.state !== "signed-out"/);
  assert.match(source, /if \(!destroyed && ordinal === registrationPolicyOrdinal\) \{\s*registrationPolicyPending = false;/);
});


test("First Run revalidates authenticated subject after the last awaited device rename", async () => {
  const { runInNewContext } = await import("node:vm");
  const source = await read("first-run.mjs");
  const start = source.indexOf("  const finish = async () => {");
  const end = source.indexOf("  const onClick = (event) => {", start);
  assert.ok(start >= 0 && end > start);
  const actualFinish = source.slice(start, end);
  assert.ok(actualFinish.indexOf("await deviceProfilePort.rename(nextName)")
    < actualFinish.indexOf("await verifyFirstRunIdentitySession(sessionPort, selectedIdentitySubjectId)"));
  assert.ok(actualFinish.indexOf("await verifyFirstRunIdentitySession(sessionPort, selectedIdentitySubjectId)")
    < actualFinish.indexOf("await store.save(completeFirstRunState(draft))"));

  const build = (accountMode = "identity") => {
    const calls = [];
    let currentSubject = "subject-A";
    let releaseRename;
    const renameWait = new Promise(resolve => { releaseRename = resolve; });
    const globals = {
      rename: async name => {
        calls.push("rename:" + name);
        await renameWait;
        return { displayName: name };
      },
      revalidate: async (_port, subjectId) => {
        calls.push("verify:" + subjectId + ":" + currentSubject);
        return currentSubject === subjectId;
      },
      preference: (key, value) => calls.push("preference:" + key + ":" + value),
      persist: async value => calls.push("save:" + value.accountMode),
      onClose: () => calls.push("close"),
      calls,
    };
    const code = [
      actualFinish,
      "({",
      "  finish,",
      "  state() { return { finishing, accountMode: draft.accountMode, selectedIdentitySubjectId, stepIndex, completionError, identityMessage }; }",
      "});",
    ].join("\n");
    const context = {
      ...globals,
      destroyed: false,
      finishing: false,
      draft: { accountMode, locale: "pt-BR", timeZone: "America/Bahia" },
      systemTermsAccepted: true,
      selectedIdentitySubjectId: "subject-A",
      stepIndex: 2,
      stepIndexFor: () => 1,
      identityMessage: "",
      completionError: "",
      deviceProfilePort: { rename: globals.rename },
      deviceProfileSnapshot: { displayName: "OrdaX Original" },
      deviceNameDraft: "OrdaX Revisado",
      STEPS: ["welcome", "account", "ready"],
      sessionPort: { getSnapshot: () => ({ state: "signed-in", subjectId: currentSubject }) },
      verifyFirstRunIdentitySession: globals.revalidate,
      preferencePort: { set: globals.preference },
      REGIONAL_LOCALE_PREFERENCE_ID: "regional.locale",
      REGIONAL_TIME_ZONE_PREFERENCE_ID: "regional.time-zone",
      createSystemTermsAcceptance: value => ({ accepted: value }),
      completeFirstRunState: draft => ({ ...draft, completed: true }),
      store: { save: globals.persist },
      close: globals.onClose,
      render: () => {},
      productMode: "desktop",
    };
    const harness = runInNewContext(code, context);
    return {
      ...harness,
      calls,
      releaseRename,
      setSubject: subject => { currentSubject = subject; },
    };
  };

  const swapped = build();
  const pending = swapped.finish();
  assert.deepEqual(swapped.calls, ["rename:OrdaX Revisado"]);
  swapped.setSubject("subject-B");
  swapped.releaseRename();
  await pending;
  assert.deepEqual(swapped.calls, [
    "rename:OrdaX Revisado",
    "verify:subject-A:subject-B",
  ], "stale subject cannot save an identity receipt or update preferences");
  assert.equal(swapped.state().accountMode, null);
  assert.equal(swapped.state().selectedIdentitySubjectId, null);
  assert.equal(swapped.state().stepIndex, 1);
  assert.equal(swapped.state().finishing, false);
  assert.match(swapped.state().identityMessage, /sessão da Conta OrdaX mudou/);

  const stable = build();
  const legitimate = stable.finish();
  stable.releaseRename();
  await legitimate;
  assert.deepEqual(stable.calls, [
    "rename:OrdaX Revisado",
    "verify:subject-A:subject-A",
    "preference:regional.locale:pt-BR",
    "preference:regional.time-zone:America/Bahia",
    "save:identity",
    "close",
  ], "stable identity is verified exactly once after rename before commit");
});


test("First Run old account logout and sign-in cannot mutate a newly authenticated subject", async () => {
  const { runInNewContext } = await import("node:vm");
  const source = await read("first-run.mjs");
  const actionStart = source.indexOf("  const runIdentity = async (kind) => {");
  const actionEnd = source.indexOf("  const finish = async () => {", actionStart);
  const sessionStart = source.indexOf("  unsubscribeSession = sessionPort.subscribe((snapshot) => {");
  const sessionEnd = source.indexOf("  unsubscribeActions = actionsPort.subscribe(", sessionStart);
  assert.ok(actionStart >= 0 && actionEnd > actionStart);
  assert.ok(sessionStart >= 0 && sessionEnd > sessionStart);

  const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
  };

  const build = ({ kind, originalState, originalSubject, localRequested = false }) => {
    const actionResponse = deferred();
    const calls = [];
    const context = [
      "let destroyed = false;",
      "let finishing = false;",
      "let sessionSnapshot = { state: originalState, subjectId: originalSubject };",
      "let actionsSnapshot = { supportedActions: ['sign-in', 'sign-out'] };",
      "let identityPending = null;",
      "let identityActionOrdinal = 0;",
      "let identityMessage = '';",
      "let identityEmailDraft = 'someone@example.test';",
      "let identityPasswordDraft = 'temporary-secret';",
      "let passwordVisible = false;",
      "let identityFormMode = 'sign-in';",
      "let accountLocalRequested = localRequested;",
      "let selectedIdentitySubjectId = originalSubject;",
      "let draft = { accountMode: 'identity' };",
      "let registrationPolicy = null;",
      "let registrationLegalAccepted = false;",
      "let hostedSignupAllowed = false;",
      "let registrationPolicyPending = false;",
      "let registrationPolicyOrdinal = 0;",
      "const capabilitySnapshot = { identityRegister: false, registrationPolicy: false };",
      "const STEPS = ['account', 'ready'];",
      "let stepIndex = 0;",
      "const stepIndexFor = () => 0;",
      "let renderCount = 0;",
      "const render = () => { renderCount += 1; };",
      "const go = index => { calls.push('go:' + index); stepIndex = index; };",
      "const overlay = { querySelectorAll: () => [], querySelector: () => ({ focus() {} }) };",
      "const isIdentityActionSupported = () => true;",
      "const matchesFirstRunIdentitySelection = () => true;",
      "const refreshRegistrationPolicy = () => {};",
      "const sessionPort = {",
      "  getSnapshot() { return sessionSnapshot; },",
      "  async refresh() { calls.push('refresh'); },",
      "  subscribe(callback) { this.notify = callback; return () => {}; },",
      "};",
      "const actionsPort = {",
      "  execute() { calls.push('execute'); return actionResponse.promise; },",
      "  getSnapshot() { return actionsSnapshot; },",
      "};",
      "const credentialsPort = {",
      "  signIn() { calls.push('signIn'); return actionResponse.promise; },",
      "  register() { throw new Error('unexpected register'); },",
      "};",
      "let unsubscribeSession = null;",
      source.slice(actionStart, actionEnd),
      source.slice(sessionStart, sessionEnd),
      "({",
      "  runIdentity,",
      "  publish(state, subjectId = null) { sessionPort.notify({ state, subjectId }); },",
      "  state() { return { identityPending, identityActionOrdinal, identityMessage, accountLocalRequested, accountMode: draft.accountMode, stepIndex, renderCount }; },",
      "});",
    ].join("\n");
    const harness = runInNewContext(context, {
      originalState,
      originalSubject,
      localRequested,
      calls,
      actionResponse,
    });
    return { ...harness, calls, actionResponse, kind };
  };

  for (const completion of ["resolve", "reject"]) {
    const attempt = build({
      kind: "sign-out",
      originalState: "signed-in",
      originalSubject: "account-A",
      localRequested: true,
    });
    const pending = attempt.runIdentity("sign-out");
    assert.equal(attempt.state().identityPending, "sign-out");
    attempt.publish("signed-out");
    assert.equal(attempt.state().identityPending, "sign-out",
      "normal logout must preserve the pending local-only handoff");
    attempt.publish("signed-in", "account-B");
    assert.equal(attempt.state().identityPending, null,
      "different authenticated subject releases the obsolete UI attempt");
    assert.equal(attempt.state().accountLocalRequested, false,
      "old logout must not proceed to local-only after account replacement");
    if (completion === "resolve") attempt.actionResponse.resolve();
    else attempt.actionResponse.reject(new Error("old logout failed"));
    await pending;
    assert.equal(attempt.state().accountMode, null);
    assert.equal(attempt.state().identityMessage, "",
      "old action completion cannot leave an error on the new account");
    assert.deepEqual(attempt.calls, ["execute"],
      "old logout may finish on its original authority but never navigate the next user");
  }

  const normal = build({
    kind: "sign-out",
    originalState: "signed-in",
    originalSubject: "account-A",
    localRequested: true,
  });
  const normalPending = normal.runIdentity("sign-out");
  normal.publish("signed-out");
  normal.actionResponse.resolve();
  await normalPending;
  assert.equal(normal.state().accountMode, "local-only");
  assert.deepEqual(normal.calls, ["execute", "go:1"],
    "the ordinary A -> signed-out path must still advance to local setup");

  const incoming = build({
    kind: "sign-in", originalState: "signed-out", originalSubject: null,
  });
  const signInPending = incoming.runIdentity("sign-in");
  assert.equal(incoming.state().identityPending, "sign-in");
  incoming.publish("signed-in", "account-B");
  assert.equal(incoming.state().identityPending, null);
  incoming.actionResponse.resolve({ authenticated: true });
  await signInPending;
  assert.deepEqual(incoming.calls, ["signIn"],
    "stale sign-in completion must not force a refresh over the newly authenticated session");
  assert.equal(incoming.state().identityMessage, "");

  assert.match(source, /if \(destroyed \|\| ordinal !== identityActionOrdinal\) return;/);
  assert.match(source, /identityActionOrdinal \+= 1;[\s\S]*?accountLocalRequested = false;/);
});


test("Native MCP receives the canonical Surface state port, never a DOM selector",async()=>{
  // This repository is a separately composed producer: imported OS contracts
  // are resolved by the OrdaX OS build, not duplicated here. Behavioral HTTP
  // tests for the consumer run in ordax-os.
  const [selector,surface]=await Promise.all([
    read("surface-state.mjs"),read("surface.mjs"),
  ]);
  assert.match(selector,/export function getActiveSurfaceAppId\(state\)/);
  assert.match(selector,/const area = getActiveArea\(state\)/);
  assert.match(selector,/area\.windows\.find\(\(item\) => item\.id === area\.activeWindowId\)/);
  assert.match(selector,/active && !active\.minimized \? active\.appId : null/);
  assert.match(surface,/getActiveAppId\(\)\s*\{\s*return getActiveSurfaceAppId\(state\)/);
  assert.doesNotMatch(surface,/getActiveAppId\(\)\s*\{[^}]*querySelector/);
});

test("Native notification events never restore stale OS entries or execute detached actions", async () => {
  const source = await read("notification-center-controls.mjs");
  const render = source.slice(source.indexOf("  const render = () => {"), source.indexOf("  const onClick ="));
  const click = source.slice(source.indexOf("  const onClick ="), source.indexOf("  const unsubscribeNotifications ="));

  assert.match(render, /snapshot = center\?\.getSnapshot\(\) \?\? null;/);
  assert.doesNotMatch(render, /snapshot = nextSnapshot/);
  assert.match(source, /center\?\.subscribe\(\(\) => render\(\)\)/);
  assert.doesNotMatch(source, /center\?\.subscribe\(render\)/);
  assert.match(click, /render\(\);\s*if \(!view\.contains\(button\) \|\| button\.hidden \|\| button\.disabled\) return;/);
  assert.match(click, /const entry = snapshot\.entries\.find\(candidate => candidate\.id === button\.dataset\.notificationOpen\)/);
  assert.match(click, /if \(!entry\?\.destination\) return;/);
});

test("Native display ignores delayed read and write results after UI teardown", async () => {
  const { runInNewContext } = await import("node:vm");
  const source = await read("display-output-controls.mjs");
  const start = source.indexOf("  const refresh = async () => {");
  const end = source.indexOf("  const handleRetry =", start);
  assert.ok(start !== -1 && end > start, "canonical display handlers");

  const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
    return { promise, resolve, reject };
  };
  const harness = (readValue) => runInNewContext([
    'let destroyed = false;',
    'let pending = false;',
    'let snapshot = { id: "initial" };',
    'let statusMessageId = "initial";',
    'let repaintCount = 0;',
    'const render = () => { repaintCount += 1; };',
    'const validateDisplayOutputsSnapshot = (value) => value;',
    'const outputPort = { read: () => readValue() };',
    source.slice(start, end),
    '({ refresh, run, destroy() { destroyed = true; },',
    '  state() { return { id: snapshot?.id, statusMessageId, repaintCount }; } });',
  ].join("\n"), { readValue });

  const slowRead = deferred();
  const reading = harness(() => slowRead.promise);
  const readingTask = reading.refresh();
  reading.destroy();
  slowRead.resolve({ id: "late-read" });
  await readingTask;
  assert.equal(reading.state().id, "initial");
  assert.equal(reading.state().statusMessageId, "initial");
  assert.equal(reading.state().repaintCount, 1);

  const slowWrite = deferred();
  let readbackCount = 0;
  const writing = harness(() => { readbackCount += 1; return Promise.resolve({ id: "readback" }); });
  const writingTask = writing.run(() => slowWrite.promise);
  writing.destroy();
  slowWrite.resolve({ id: "late-write" });
  await writingTask;
  assert.equal(writing.state().id, "initial");
  assert.equal(writing.state().repaintCount, 1);

  const failedWrite = deferred();
  const failure = harness(() => { readbackCount += 1; return Promise.resolve({ id: "fallback" }); });
  const failureTask = failure.run(() => failedWrite.promise);
  failure.destroy();
  failedWrite.reject(new Error("old display operation"));
  await failureTask;
  assert.equal(failure.state().id, "initial");
  assert.equal(failure.state().statusMessageId, "initial");
  assert.equal(failure.state().repaintCount, 1);
  assert.equal(readbackCount, 0, "destroyed controls must not initiate a recovery read");
});
