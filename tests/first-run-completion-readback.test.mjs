import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = await readFile(new URL("../system/surface/ui/first-run.mjs", import.meta.url), "utf8");
const helperStart = source.indexOf("  const revokeAccountSelection = () => {");
const finishStart = source.indexOf("  const finish = async () => {", helperStart);
const finishEnd = source.indexOf("  const onClick = (event) => {", finishStart);
assert.ok(helperStart >= 0 && finishStart > helperStart && finishEnd > finishStart,
  "execute the real First Run finish handler and its existing account-selection helper");

const terms = Object.freeze({
  documentId: "ordax-os-terms", version: "draft-2026-10-20",
  status: "draft", accepted: true,
});
const incomplete = () => ({
  schema: "ordax.first-run-state/1", completed: false,
  locale: "pt-BR", timeZone: "America/Bahia", accountMode: null,
});
function fixture({ noOp = false, failSave = false, readError = false,
  override = null, mode = "local-only", session = "signed-out", deferred = null } = {}) {
  let memory = incomplete();
  let saveCalls = 0;
  let renders = 0;
  let closed = 0;
  let identityChecks = 0;
  const settingCalls = [];
  const ctx = {
    destroyed: false, finishing: false, systemTermsAccepted: true,
    draft: { locale: "pt-BR", timeZone: "America/Bahia", accountMode: mode },
    stepIndex: 2, STEPS: ["welcome", "account", "ready"],
    stepIndexFor: name => ["welcome", "account", "ready"].indexOf(name),
    selectedIdentitySubjectId: mode === "identity" ? "account-A" : null,
    identityMessage: "", identityFeedbackTone: "information",
    completionError: "", productMode: "desktop",
    deviceProfilePort: null, deviceProfileSnapshot: null,
    preferencePort: { set(key, value) { settingCalls.push([key, value]); } },
    REGIONAL_LOCALE_PREFERENCE_ID: "regional.locale",
    REGIONAL_TIME_ZONE_PREFERENCE_ID: "regional.time-zone",
    sessionPort: { getSnapshot() { return { state: session, subjectId: "account-A" }; } },
    async verifyFirstRunIdentitySession(_port, subject) {
      identityChecks++;
      return session === "signed-in" && subject === "account-A";
    },
    createSystemTermsAcceptance: accepted => ({ ...terms, accepted }),
    completeFirstRunState: data => ({
      schema: "ordax.first-run-state/1",
      completed: true, locale: data.locale,
      timeZone: data.timeZone, accountMode: data.accountMode,
      systemTerms: data.systemTerms,
    }),
    validateFirstRunState(value) {
      if (!value || value.schema !== "ordax.first-run-state/1"
        || typeof value.completed !== "boolean"
        || typeof value.locale !== "string" || typeof value.timeZone !== "string"
        || (value.completed && !["local-only", "identity"].includes(value.accountMode))) {
        throw new TypeError("Invalid first-use state");
      }
      return value;
    },
    store: {
      async save(value) {
        saveCalls++;
        if (deferred) await deferred.promise;
        if (failSave) throw new Error("Host state persistence failed");
        if (!noOp) memory = override ? { ...value, ...override } : value;
        return true;
      },
      load() {
        if (readError) throw new Error("Readback failed");
        return memory;
      },
    },
    render() { renders++; },
    close() { closed++; },
  };
  const finish = runInNewContext(
    source.slice(helperStart, finishEnd) + "\nfinish", ctx,
  );
  return {
    finish, ctx,
    setMemory(value) { memory = value; },
    get memory() { return memory; },
    get saves() { return saveCalls; },
    get closes() { return closed; },
    get renders() { return renders; },
    get identityChecks() { return identityChecks; },
    settingCalls,
  };
}

test("First Run closes only after the accepted completion receipt is published by its store", async () => {
  const local = fixture();
  await local.finish();
  assert.equal(local.saves, 1);
  assert.equal(local.closes, 1);
  assert.equal(local.ctx.finishing, true);
  assert.equal(local.memory.completed, true);
  assert.equal(local.memory.accountMode, "local-only");
  assert.equal(local.memory.systemTerms.version, terms.version);
  assert.equal(local.settingCalls.length, 2);
  const signedIn = fixture({ mode: "identity", session: "signed-in" });
  await signedIn.finish();
  assert.equal(signedIn.saves, 1);
  assert.equal(signedIn.identityChecks, 1);
  assert.equal(signedIn.closes, 1);
  assert.equal(signedIn.memory.accountMode, "identity");
});

test("A resolved but no-op save must keep First Run open and report failure", async () => {
  const noOp = fixture({ noOp: true });
  await noOp.finish();
  assert.equal(noOp.saves, 1);
  assert.equal(noOp.closes, 0);
  assert.equal(noOp.memory.completed, false);
  assert.equal(noOp.ctx.finishing, false);
  assert.match(noOp.ctx.completionError, /Não foi possível salvar a configuração inicial/);
});

test("A mismatched locale, timezone, account mode or legal receipt never closes setup", async () => {
  for (const [name, override] of [
    ["locale", { locale: "en-US" }],
    ["timezone", { timeZone: "America/Manaus" }],
    ["account", { accountMode: "identity" }],
    ["terms version", { systemTerms: { ...terms, version: "draft-other" } }],
    ["terms acceptance", { systemTerms: { ...terms, accepted: false } }],
    ["terms missing", { systemTerms: undefined }],
    ["incomplete state", { completed: false, accountMode: null }],
  ]) {
    const h = fixture({ override });
    await h.finish();
    assert.equal(h.saves, 1, name);
    assert.equal(h.closes, 0, name);
    assert.equal(h.ctx.finishing, false, name);
    assert.match(h.ctx.completionError, /Não foi possível salvar a configuração inicial/, name);
  }
});

test("Host save and readback failures retain the First Run interface", async () => {
  for (const options of [{ failSave: true }, { readError: true }]) {
    const h = fixture(options);
    await h.finish();
    assert.equal(h.saves, 1);
    assert.equal(h.closes, 0);
    assert.equal(h.ctx.finishing, false);
    assert.ok(h.renders > 0);
    assert.match(h.ctx.completionError, /Não foi possível salvar a configuração inicial/);
  }
});

test("In-flight completion cannot be submitted twice", async () => {
  let resume;
  const deferred = { promise: new Promise(resolve => { resume = resolve; }) };
  const h = fixture({ deferred });
  const initial = h.finish();
  assert.equal(h.ctx.finishing, true);
  await h.finish();
  assert.equal(h.saves, 1);
  resume();
  await initial;
  assert.equal(h.closes, 1);
});

test("Closing after save does not require a second first-run store", () => {
  const block = source.slice(finishStart, finishEnd);
  assert.match(block, /await store\.save\(completeFirstRunState\(draft\)\)/);
  assert.match(block, /validateFirstRunState\(store\.load\(\)\)/);
  assert.match(block, /confirmed\.completed/);
  assert.match(block, /confirmed\.systemTerms\?\.version/);
  assert.match(block, /confirmed\.systemTerms\?\.version !== draft\.systemTerms\?\.version/);
  assert.match(block, /close\(\)/);
  assert.doesNotMatch(block, /localStorage|sessionStorage|indexedDB|fetch\(/);
});
