import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = await readFile(
  new URL("../system/surface/ui/display-output-controls.mjs", import.meta.url), "utf8",
);
const begin = source.indexOf("  const render = () => {");
const end = source.indexOf("  const handleRetry = () => {", begin);
assert.ok(begin >= 0 && end > begin, "exercise original display render, refresh and apply handlers");

const unavailable = Object.freeze({ available: false, outputs: [], preview: null });
const display = Object.freeze({
  available: true, preview: null,
  outputs: [{
    id: "display-1", name: "Display 1", enabled: true, currentModeId: "mode-1",
    modes: [{ id: "mode-1", width: 1920, height: 1080, refreshHz: 60, preferred: true, current: true }],
  }],
});

function surface({ hasPort = true, initial = null, replies = [] } = {}) {
  let reads = 0;
  const nextReplies = [...replies];
  const ui = () => ({
    hidden: false, disabled: false, value: "",
    dataset: {}, textContent: "",
    replaceChildren(...children) { this.children = children; },
  });
  const status = ui(), retryButton = ui(), controls = ui(), outputLabel = ui(),
    modeLabel = ui(), actionRow = ui(), previewNote = ui(), keepButton = ui(),
    revertButton = ui(), previewButton = ui(), outputSelect = ui(), modeSelect = ui();
  const port = hasPort ? {
    async read() {
      reads++;
      const reply = nextReplies.shift();
      if (reply instanceof Error) throw reply;
      return reply ?? unavailable;
    },
  } : null;
  const context = {
    initialSnapshot: initial,
    outputPort: port,
    destroyed: false,
    mode: hasPort ? "native" : "web",
    translate: key => key,
    validateDisplayOutputsSnapshot(value) {
      if (value === null || typeof value !== "object" || typeof value.available !== "boolean") {
        throw new TypeError("Host display snapshot is invalid");
      }
      return value;
    },
    status, retryButton, controls, outputLabel, modeLabel, actionRow, previewNote,
    keepButton, revertButton, previewButton, outputSelect, modeSelect,
    documentObject: {},
    make: (_document, _tag, _className, label) => ({ value: "", textContent: label ?? "" }),
    formatMode: mode => mode.id,
    now: () => 0,
    setIntervalFn: () => 1,
  };
  const script = [
    "let snapshot = initialSnapshot, pending = false, destroyed = false;",
    "let statusMessageId = null, previewCountdown = null;",
    "const selectedOutput = () => snapshot?.outputs.find(output => output.id === outputSelect.value) ?? null;",
    "const selectedMode = output => output?.modes.find(item => item.id === modeSelect.value) ?? null;",
    "const stopPreviewCountdown = () => { previewCountdown = null; };",
    "const updatePreviewCountdown = () => {};",
    source.slice(begin, end),
    "({ render, refresh, run, getState: () => ({ snapshot, pending, statusMessageId }) })",
  ].join("\n");
  const app = runInNewContext(script, context);
  return {
    ...app, status, retryButton, controls,
    get reads() { return reads; },
    queue(reply) { nextReplies.push(reply); },
  };
}

test("Native display exposes manual retry on a valid unavailable Host snapshot and recovers after hotplug", async () => {
  const panel = surface({ replies: [unavailable, display] });
  await panel.refresh();
  assert.equal(panel.reads, 1);
  assert.equal(panel.retryButton.hidden, false, "manual retry remains reachable without outputs");
  assert.equal(panel.retryButton.disabled, false, "manual retry enabled after read finishes");
  assert.equal(panel.controls.hidden, true, "cannot mutate unavailable outputs");
  await panel.refresh();
  assert.equal(panel.reads, 2);
  assert.equal(panel.retryButton.hidden, true, "success hides the fallback retry button");
  assert.equal(panel.controls.hidden, false);
  assert.equal(panel.status.dataset.capabilityState, "available");
});

test("Failed display write and failed recovery read leave an enabled path to retry", async () => {
  const panel = surface({ initial: display, replies: [new Error("Host read failed")] });
  panel.render();
  assert.equal(panel.controls.hidden, false);
  await panel.run(async () => { throw new Error("Preview rejected"); });
  assert.equal(panel.reads, 1);
  assert.equal(panel.getState().snapshot, null);
  assert.equal(panel.getState().statusMessageId, "settings.display.host.applyFailed");
  assert.equal(panel.controls.hidden, true);
  assert.equal(panel.retryButton.hidden, false,
    "the user must be able to retry after both operation and readback fail");
  assert.equal(panel.retryButton.disabled, false);
  panel.queue(display);
  await panel.refresh();
  assert.equal(panel.reads, 2);
  assert.equal(panel.retryButton.hidden, true);
  assert.equal(panel.controls.hidden, false);
  assert.equal(panel.getState().statusMessageId, null);
});

test("Initial read failure is also recoverable without remounting Settings", async () => {
  const panel = surface({ replies: [new Error("No display data"), display] });
  await panel.refresh();
  assert.equal(panel.getState().statusMessageId, "settings.display.host.readFailed");
  assert.equal(panel.retryButton.hidden, false);
  await panel.refresh();
  assert.equal(panel.getState().statusMessageId, null);
  assert.equal(panel.retryButton.hidden, true);
});

test("A recoverable write failure with a valid readback retains controls instead of presenting unavailable state", async () => {
  const panel = surface({ initial: display, replies: [display] });
  await panel.run(async () => { throw new Error("Operation rejected"); });
  assert.equal(panel.reads, 1);
  assert.equal(panel.getState().statusMessageId, "settings.display.host.applyFailed");
  assert.equal(panel.controls.hidden, false);
  assert.equal(panel.retryButton.hidden, true);
});

test("Unavailable or missing display port never exposes a nonfunctional refresh action", () => {
  const panel = surface({ hasPort: false });
  panel.render();
  assert.equal(panel.retryButton.hidden, true);
  assert.equal(panel.controls.hidden, true);
  assert.equal(panel.status.dataset.capabilityState, "unavailable");
});

test("Display keeps its original retry wiring and prevents duplicate actions while a read is in flight", async () => {
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const panel = surface({ replies: [wait] });
  const first = panel.refresh();
  assert.equal(panel.retryButton.hidden, false);
  assert.equal(panel.retryButton.disabled, true);
  await panel.refresh();
  assert.equal(panel.reads, 1, "pending read is not duplicated");
  release(unavailable);
  await first;
  assert.equal(panel.retryButton.disabled, false);
  assert.match(source, /retryButton\.addEventListener\("click", handleRetry\)/);
  assert.match(source, /const handleRetry = \(\) => \{ void refresh\(\); \}/);
  assert.match(source, /retryButton\.removeEventListener\("click", handleRetry\)/);
  assert.doesNotMatch(source.slice(begin, end), /localStorage|sessionStorage/);
});
