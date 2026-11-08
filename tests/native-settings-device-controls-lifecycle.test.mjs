import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = await readFile(
  new URL("../system/surface/ui/settings-overview-controls.mjs", import.meta.url),
  "utf8",
);
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, "Native Settings source section: " + start);
  return source.slice(a, b);
}

const releaseSource = section(
  "  const releaseDeviceControls = () => {", "\n  const findSlot = () =>",
);
const mountsSource = section(
  "  const renderDisplayCapability = (view) => {", "\n  const renderConnector = (view) => {",
);
const paintSource = section(
  "  const paint = (slot) => {", "\n  const replaceView = () =>",
);

function element() {
  return {
    dataset: {},
    children: [],
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = [...items]; },
    closest() { return { hidden: false, dataset: { active: "true" } }; },
  };
}

function fixture() {
  const calls = [], lifetimes = [];
  let slot = element(), id = 0;
  const makeControl = kind => {
    const lifetime = { id: ++id, kind, destroyed: false, destroyCount: 0 };
    lifetimes.push(lifetime);
    calls.push("mount:" + kind + ":" + lifetime.id);
    return {
      destroy() {
        lifetime.destroyed = true;
        lifetime.destroyCount++;
        calls.push("destroy:" + kind + ":" + lifetime.id);
      },
    };
  };
  const ctx = {
    documentObject: {},
    activeSection: "display",
    SETTINGS_WINDOW_SELECTOR: "[data-window-id=\"settings\"]",
    findSlot: () => slot,
    captureInteractionState: () => null,
    restoreInteractionState: () => {},
    node: () => element(),
    mountDisplayOutputControls: () => makeControl("display"),
    mountAudioOutputControls: () => makeControl("audio"),
    t: value => value,
    displayOutputsPort: null,
    audioOutputsPort: null,
    settingsExamples: null,
    localization: { getLocale: () => "pt-BR" },
    mountSettingsJourneys: () => ({ overview: () => "", destroy: () => {} }),
    renderHeader: () => {},
    renderSectionNavigation: () => {},
    renderPreferences: () => {},
    renderKeyboardLayout: () => {},
    renderNetwork: () => {},
    renderIntelligence: () => {},
    renderSecurity: () => {},
    renderConnector: () => {},
    renderNotifications: () => {},
  };
  const vm = [
    "let destroyed = false, displayControls = null, audioControls = null;",
    "let mountedSlot = null, paintPending = false;",
    releaseSource,
    mountsSource,
    paintSource,
    "({ renderView, releaseDeviceControls, current: () => ({ displayControls, audioControls }) })",
  ].join("\n");
  const sut = runInNewContext(vm, ctx);
  return {
    sut, ctx, calls, lifetimes,
    section(name) { ctx.activeSection = name; },
    detach() { slot = null; },
    attach() { slot = element(); },
  };
}

test("Native Settings destroys display preview controller before repainting Audio", () => {
  const h = fixture();
  h.sut.renderView();
  assert.deepEqual(h.calls, ["mount:display:1"]);
  h.section("audio");
  h.sut.renderView(true);
  assert.deepEqual(h.calls, [
    "mount:display:1", "destroy:display:1", "mount:audio:2",
  ]);
  assert.equal(h.lifetimes[0].destroyCount, 1);
  assert.equal(h.lifetimes[1].destroyed, false);
});

test("Native Settings releases Audio listeners before mounting another Display controller", () => {
  const h = fixture();
  h.section("audio");
  h.sut.renderView();
  h.section("display");
  h.sut.renderView(true);
  assert.deepEqual(h.calls, [
    "mount:audio:1", "destroy:audio:1", "mount:display:2",
  ]);
  assert.equal(h.lifetimes[0].destroyCount, 1);
});

test("Repeated Native Settings repaints do not leave controllers or countdowns orphaned", () => {
  const h = fixture();
  h.sut.renderView();
  h.sut.renderView(true);
  h.sut.renderView(true);
  assert.deepEqual(h.calls, [
    "mount:display:1", "destroy:display:1",
    "mount:display:2", "destroy:display:2", "mount:display:3",
  ]);
  h.sut.releaseDeviceControls();
  h.sut.releaseDeviceControls();
  assert.deepEqual(h.lifetimes.map(x => x.destroyCount), [1, 1, 1],
    "no instance survives or receives a duplicate destructor call");
  assert.equal(h.sut.current().displayControls, null);
});

test("Settings disposes device controls when its Native slot disappears", () => {
  const h = fixture();
  h.sut.renderView();
  h.detach();
  h.sut.renderView();
  assert.equal(h.lifetimes[0].destroyCount, 1);
  assert.equal(h.sut.current().displayControls, null);
  h.attach();
  h.sut.renderView();
  assert.deepEqual(h.calls, [
    "mount:display:1", "destroy:display:1", "mount:display:2",
  ]);
});

test("Native Settings releases device controllers on root destroy before removing the view", () => {
  const destructor = section(
    "    destroy() {\n      destroyed = true;\n      releaseDeviceControls();",
    "\n      mountedSlot = null;", 
  );
  assert.match(destructor, /releaseDeviceControls\(\);\s*settingsExamples\?\.destroy\(\)/);
  assert.match(destructor, /unsubscribeRender\(\)/);
  assert.match(destructor, /slot\.replaceChildren\(\)/);
  assert.match(paintSource, /releaseDeviceControls\(\);\s*slot\.replaceChildren\(\)/);
  assert.match(paintSource, /if \(!slot\) \{\s*releaseDeviceControls\(\)/);
  assert.match(mountsSource, /displayControls = mountDisplayOutputControls\(/);
  assert.match(mountsSource, /audioControls = mountAudioOutputControls\(/);
  assert.doesNotMatch(releaseSource, /localStorage|sessionStorage|setTimeout|setInterval/);
});

test("Device controls' original destructors abort stale reads, listeners and preview countdown", async () => {
  const display = await readFile(
    new URL("../system/surface/ui/display-output-controls.mjs", import.meta.url), "utf8",
  );
  const audio = await readFile(
    new URL("../system/surface/ui/audio-output-controls.mjs", import.meta.url), "utf8",
  );
  assert.match(display, /destroy\(\) \{\s*destroyed = true;\s*stopPreviewCountdown\(\)/);
  assert.match(display, /if \(destroyed\) return;\s*snapshot = validateDisplayOutputsSnapshot/);
  assert.match(audio, /destroy\(\) \{\s*destroyed = true;\s*operation \+= 1;/);
  assert.match(audio, /if \(destroyed \|\| currentOperation !== operation\) return;/);
});
