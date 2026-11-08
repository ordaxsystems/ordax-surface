import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = await readFile(
  new URL("../system/surface/ui/first-run.mjs", import.meta.url), "utf8",
);
const begin = source.indexOf("  const continueSecurity = async () => {");
const end = source.indexOf("\n  const continueDeviceName = async () => {", begin);
assert.ok(begin >= 0 && end > begin, "exercise First Run's real security continuation");

const localSnapshot = (credentialConfigured, state = "unlocked") => ({
  credentialConfigured,
  state,
  protectionScope: "surface-session-not-storage-encryption",
});

function fixture({
  response = localSnapshot(true),
  actual = response,
  secret = "secret-valid",
  confirmation = secret,
  fail = false,
  pending = null,
  alreadyConfigured = false,
  hasPort = true,
} = {}) {
  let configureCount = 0;
  let savedSecret = null;
  let renderCount = 0;
  const next = [];
  const focus = [];
  const state = {
    destroyed: false, localSessionPending: false,
    localSessionSecretDraft: secret, localSessionConfirmDraft: confirmation,
    localSessionValidationInvalid: false,
    localSessionFeedbackTone: "information", localSessionMessage: "",
    localSessionSnapshot: localSnapshot(alreadyConfigured),
    stepIndex: 2,
    localSessionPort: hasPort ? {
      async configureCredential(value) {
        configureCount += 1;
        savedSecret = value;
        if (pending) await pending.promise;
        if (fail) throw new Error("Host unavailable");
        return response;
      },
      getSnapshot() { return actual; },
    } : null,
    overlay: {
      querySelector(selector) {
        return { focus: options => focus.push({ selector, options }) };
      },
    },
    render() { renderCount += 1; },
    go(index) { next.push(index); },
    validateLocalSessionSnapshot(value) {
      if (!value || typeof value.credentialConfigured !== "boolean"
        || !["locked", "unlocked"].includes(value.state)
        || (value.state === "locked" && !value.credentialConfigured)
        || value.protectionScope !== "surface-session-not-storage-encryption") {
        throw new TypeError("Invalid Local Session snapshot");
      }
      return value;
    },
  };
  const handler = runInNewContext(source.slice(begin, end) + "\ncontinueSecurity", state);
  return {
    state, next, focus, handler,
    get configureCount() { return configureCount; },
    get savedSecret() { return savedSecret; },
    get renderCount() { return renderCount; },
  };
}

test("First Run advances only after both Host receipt and live local session confirm protection", async () => {
  const h = fixture();
  await h.handler();
  assert.deepEqual(h.next, [3]);
  assert.equal(h.configureCount, 1);
  assert.equal(h.savedSecret, "secret-valid");
  assert.equal(h.state.localSessionSnapshot.credentialConfigured, true);
  assert.equal(h.state.localSessionPending, false);
  assert.equal(h.state.localSessionSecretDraft, "");
  assert.equal(h.state.localSessionConfirmDraft, "");
  assert.equal(h.state.localSessionMessage, "");
});

test("Host no-op, stale positive receipt and inconsistent lock state cannot advance security", async () => {
  for (const [label, response, actual] of [
    ["no-op", localSnapshot(false), localSnapshot(false)],
    ["stale positive receipt", localSnapshot(true), localSnapshot(false)],
    ["reply denies success", localSnapshot(false), localSnapshot(true)],
    ["unexpected locked state", localSnapshot(true), localSnapshot(true, "locked")],
    ["malformed reply", { state: "unlocked" }, localSnapshot(true)],
  ]) {
    const h = fixture({ response, actual });
    await h.handler();
    assert.equal(h.configureCount, 1, label);
    assert.deepEqual(h.next, [], label);
    assert.equal(h.state.localSessionPending, false, label);
    assert.equal(h.state.localSessionFeedbackTone, "attention", label);
    assert.match(h.state.localSessionMessage, /Não foi possível criar a credencial local/, label);
    assert.equal(h.state.localSessionSecretDraft, "", label);
    assert.equal(h.state.localSessionConfirmDraft, "", label);
  }
});

test("Host exceptions cannot claim a local credential and retain First Run", async () => {
  const h = fixture({ fail: true });
  await h.handler();
  assert.deepEqual(h.next, []);
  assert.equal(h.configureCount, 1);
  assert.equal(h.state.localSessionPending, false);
  assert.equal(h.state.localSessionFeedbackTone, "attention");
});

test("Security remains optional, validates input, and never sends mismatched secrets", async () => {
  const empty = fixture({ secret: "", confirmation: "" });
  await empty.handler();
  assert.deepEqual(empty.next, [3]);
  assert.equal(empty.configureCount, 0);

  const configured = fixture({ alreadyConfigured: true });
  await configured.handler();
  assert.deepEqual(configured.next, [3]);
  assert.equal(configured.configureCount, 0);

  const missingPort = fixture({ hasPort: false });
  await missingPort.handler();
  assert.deepEqual(missingPort.next, [3]);
  assert.equal(missingPort.configureCount, 0);

  const mismatch = fixture({ secret: "secret-valid", confirmation: "different" });
  await mismatch.handler();
  assert.deepEqual(mismatch.next, []);
  assert.equal(mismatch.configureCount, 0);
  assert.equal(mismatch.state.localSessionValidationInvalid, true);
  assert.equal(mismatch.state.localSessionFeedbackTone, "attention");
  assert.equal(mismatch.focus[0]?.selector, "[data-first-run-local-session-confirm]");

  const tooShort = fixture({ secret: "1234", confirmation: "1234" });
  await tooShort.handler();
  assert.equal(tooShort.configureCount, 0);
  assert.equal(tooShort.focus[0]?.selector, "[data-first-run-local-session-secret]");
});

test("Concurrent submissions are serialized and destroyed First Run ignores late Host receipts", async () => {
  let resolve;
  const pending = { promise: new Promise(r => { resolve = r; }) };
  const h = fixture({ pending });
  const first = h.handler();
  assert.equal(h.state.localSessionPending, true);
  await h.handler();
  assert.equal(h.configureCount, 1, "another click cannot delegate a second credential");
  h.state.destroyed = true;
  resolve();
  await first;
  assert.deepEqual(h.next, [], "a destroyed setup cannot advance on a late result");
});

test("First Run never persists the local credential in the wizard state", () => {
  const scope = source.slice(begin, end);
  assert.match(scope, /localSessionPort\.configureCredential\(operationSecret\)/);
  assert.match(scope, /localSessionPort\.getSnapshot\(\)/);
  assert.match(scope, /!receipt\.credentialConfigured \|\| !verified\.credentialConfigured/);
  assert.match(scope, /go\(stepIndex \+ 1\)/);
  assert.doesNotMatch(scope, /store\.save|localStorage|sessionStorage|console\.(log|debug)/);
});
