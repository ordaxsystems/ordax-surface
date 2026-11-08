import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = await readFile(
  new URL("../system/surface/ui/audio-output-controls.mjs", import.meta.url), "utf8",
);
const begin = source.indexOf("  const selectedOutput = () => {");
const actualBegin = begin >= 0 ? begin : source.indexOf("  const selectedOutput = () =>");
const end = source.indexOf("\n  const handleOutputChange = () => {", actualBegin);
assert.ok(actualBegin >= 0 && end > actualBegin,
  "exercise the original Native audio render/read/apply functions");

const available = (volumePercent = 38, muted = false) => ({
  schema: "ordax.audio-outputs/1",
  available: true,
  reason: null,
  defaultOutputId: "speaker-1",
  outputs: [{
    id: "speaker-1", name: "Speaker", volumePercent, muted,
  }],
});
const unavailable = {
  schema: "ordax.audio-outputs/1",
  available: false,
  reason: "no-output-device",
  defaultOutputId: null,
  outputs: [],
};

function fixture({ initial = available(), replies = [], onRead = null } = {}) {
  const queue = [...replies];
  let reads = 0;
  const node = () => ({
    value: "", disabled: false, hidden: false, textContent: "", dataset: {},
    replaceChildren(...items) { this.children = items; },
    append(...items) { this.children ??= []; this.children.push(...items); },
    setAttribute(k, v) { this[k] = v; },
  });
  const status = node(), refreshButton = node(), controls = node(),
    outputSelect = node(), volumeInput = node(), volumeReadout = node(),
    muteButton = node();
  const port = {
    async read() {
      reads += 1;
      onRead?.();
      const next = queue.shift();
      if (next instanceof Error) throw next;
      return await (next ?? available());
    },
  };
  const context = {
    initial,
    status, refreshButton, controls, outputSelect, volumeInput, volumeReadout,
    muteButton, audioPort: port, mode: "native",
    translate: key => key,
    make: () => node(),
    documentObject: {},
    UNAVAILABLE_MESSAGES: { "no-output-device": "settings.audio.host.noOutput" },
    validateAudioOutputsSnapshot(value) {
      if (!value || value.schema !== "ordax.audio-outputs/1"
        || typeof value.available !== "boolean") throw new TypeError("invalid Host audio snapshot");
      return value;
    },
  };
  const script = [
    "let snapshot = initial, selectedOutputId = null, destroyed = false;",
    "let pending = false, operation = 0, statusMessageId = null;",
    source.slice(actualBegin, end),
    "({render, refresh, apply, destroy:()=>{ destroyed=true; operation++; }, state:()=>({snapshot,pending,operation,statusMessageId})})",
  ].join("\n");
  const sut = runInNewContext(script, context);
  return {
    ...sut, status, refreshButton, controls, outputSelect, volumeInput, muteButton,
    queue(next) { queue.push(next); },
    get reads() { return reads; },
  };
}

test("Audio retains an apply failure after fresh Host readback restores controls", async () => {
  const h = fixture({ replies: [available(38)] });
  h.render();
  assert.equal(h.status.textContent, "settings.audio.host.available");
  await h.apply(async () => { throw new Error("Host refused volume change"); });
  assert.equal(h.reads, 1);
  assert.equal(h.state().statusMessageId, "settings.audio.host.applyFailed");
  assert.equal(h.status.textContent, "settings.audio.host.applyFailed",
    "a successful readback must not imply a failed volume change succeeded");
  assert.equal(h.status.dataset.capabilityState, "error");
  assert.equal(h.controls.hidden, false, "verified outputs are usable for recovery");
  assert.equal(h.volumeInput.disabled, false);
  assert.equal(h.muteButton.disabled, false);
  assert.equal(h.refreshButton.disabled, false);

  h.queue(available(38));
  await h.refresh();
  assert.equal(h.reads, 2);
  assert.equal(h.state().statusMessageId, null);
  assert.equal(h.status.textContent, "settings.audio.host.available");
  assert.equal(h.status.dataset.capabilityState, "available");
});

test("A later successful audio write clears the previous action error", async () => {
  const h = fixture({ replies: [available(38)] });
  h.render();
  await h.apply(async () => { throw new Error("output busy"); });
  assert.equal(h.status.textContent, "settings.audio.host.applyFailed");
  await h.apply(async () => available(52, true));
  assert.equal(h.state().statusMessageId, null);
  assert.equal(h.status.textContent, "settings.audio.host.available");
  assert.equal(h.volumeInput.value, "52");
  assert.equal(h.muteButton["aria-pressed"], "true");
  assert.equal(h.state().pending, false);
});

test("Apply and recovery-read failure show read error instead of permanent loading", async () => {
  const h = fixture({ replies: [new Error("Host read failed"), available()] });
  h.render();
  await h.apply(async () => { throw new Error("Host write failed"); });
  assert.equal(h.reads, 1);
  assert.equal(h.state().snapshot, null);
  assert.equal(h.state().pending, false);
  assert.equal(h.status.textContent, "settings.audio.host.readFailed");
  assert.equal(h.status.dataset.capabilityState, "unavailable");
  assert.equal(h.controls.hidden, true);
  assert.equal(h.refreshButton.hidden, false);
  assert.equal(h.refreshButton.disabled, false);
  await h.refresh();
  assert.equal(h.status.textContent, "settings.audio.host.available");
  assert.equal(h.controls.hidden, false);
});

test("Initial read failure is recoverable without hiding its error", async () => {
  const h = fixture({ initial: null, replies: [new Error("Host down"), available()] });
  h.render();
  assert.equal(h.status.textContent, "settings.audio.host.reading");
  await h.refresh();
  assert.equal(h.status.textContent, "settings.audio.host.readFailed");
  assert.notEqual(h.status.dataset.capabilityState, "reading");
  await h.refresh();
  assert.equal(h.status.textContent, "settings.audio.host.available");
});

test("A valid unavailable Host snapshot takes precedence over a stale action failure", async () => {
  const h = fixture({ replies: [unavailable] });
  h.render();
  await h.apply(async () => { throw new Error("Speaker detached"); });
  assert.equal(h.reads, 1);
  assert.equal(h.status.textContent, "settings.audio.host.noOutput");
  assert.equal(h.status.dataset.capabilityState, "unavailable");
  assert.equal(h.controls.hidden, true);
  h.queue(available());
  await h.refresh();
  assert.equal(h.status.textContent, "settings.audio.host.available");
  assert.equal(h.controls.hidden, false);
});

test("Destroyed audio ignores late recovery readbacks", async () => {
  let release, beganReading;
  const deferred = new Promise(resolve => { release = resolve; });
  const readStarted = new Promise(resolve => { beganReading = resolve; });
  const h = fixture({ replies: [deferred], onRead: () => beganReading() });
  h.render();
  const pending = h.apply(async () => { throw new Error("Host write rejected"); });
  await readStarted; // wait for the failing action to start recovery readback
  assert.equal(h.status.textContent, "settings.audio.host.applyFailed");
  h.destroy();
  release(available(70));
  await pending;
  assert.equal(h.state().snapshot, null);
  assert.equal(h.status.textContent, "settings.audio.host.applyFailed");
});

test("Recovery remains a user-triggered refresh using the existing Audio port, not a new store", () => {
  const body = source.slice(actualBegin, end);
  assert.match(body, /const refresh = async \(\{ preserveActionFailure = false \} = \{\}\) =>/);
  assert.match(body, /await refresh\(\{ preserveActionFailure: true \}\)/);
  assert.match(body, /statusMessageId = null/);
  assert.match(body, /statusMessageId = "settings\.audio\.host\.readFailed"/);
  assert.match(body, /statusMessageId = "settings\.audio\.host\.applyFailed"/);
  assert.match(source, /const handleRefresh = \(\) => \{ void refresh\(\); \}/);
  assert.match(source, /refreshButton\.addEventListener\("click", handleRefresh\)/);
  assert.doesNotMatch(body, /localStorage|sessionStorage|setInterval\(|setTimeout\(/);
});
