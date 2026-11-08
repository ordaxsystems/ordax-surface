import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = await readFile(
  new URL("../system/surface/ui/first-run.mjs", import.meta.url), "utf8",
);
function block(start, end) {
  const begin = source.indexOf(start);
  const finish = source.indexOf(end, begin);
  assert.ok(begin >= 0 && finish > begin, "real First Run block: " + start);
  return source.slice(begin, finish);
}
const revocation = block("  const revokeAccountSelection = () => {", "\n  const finish = async () => {");
const finishSource = block("  const finish = async () => {", "\n  const onClick = (event) => {");
const clickSource = block("  const onClick = (event) => {", "\n  const onInput = (event) => {");
const subscribeSource = block(
  "  unsubscribeSession = sessionPort.subscribe((snapshot) => {",
  "\n  unsubscribeActions = actionsPort.subscribe",
);
const stages = ["welcome", "account", "security", "ready"];
const offline = { state: "signed-out" };
const missingNetwork = { state: "unavailable" };
const signedIn = { state: "signed-in", subjectId: "owner-1", displayName: "Owner", email: "owner@example.test" };

function finishingFixture({ session = offline, deviceRename = null, accountMode = "local-only",
    identityValid = true } = {}) {
  let currentSession = session;
  const saved = [], advance = [], prefs = [];
  let renders = 0, closed = 0, verifyCalls = 0;
  const context = {
    draft: { locale: "pt-BR", timeZone: "America/Bahia", accountMode },
    finishing: false, destroyed: false, systemTermsAccepted: true,
    completionError: "", selectedIdentitySubjectId: "owner-1",
    stepIndex: 3, STEPS: stages,
    stepIndexFor: step => stages.indexOf(step),
    sessionSnapshot: session, identityMessage: "", identityFeedbackTone: "information",
    deviceProfilePort: deviceRename ? { rename: deviceRename } : null,
    deviceProfileSnapshot: deviceRename ? { displayName: "Before" } : null,
    deviceNameDraft: "After",
    sessionPort: { getSnapshot: () => currentSession },
    async verifyFirstRunIdentitySession() { verifyCalls += 1; return identityValid; },
    preferencePort: { set(k, v) { prefs.push([k, v]); } },
    REGIONAL_LOCALE_PREFERENCE_ID: "regional.locale",
    REGIONAL_TIME_ZONE_PREFERENCE_ID: "regional.timeZone",
    createSystemTermsAcceptance: accepted => ({ accepted }),
    completeFirstRunState: draft => ({ ...draft, completed: true }),
    store: { async save(next) { saved.push(next); } },
    close() { closed += 1; },
    render() { renders += 1; },
  };
  const finish = runInNewContext(revocation + finishSource + "\nfinish", context);
  return { context, finish, saved, prefs, advance,
    setSession(next) { currentSession = next; },
    get renders() { return renders; }, get closed() { return closed; },
    get verifyCalls() { return verifyCalls; },
  };
}
test("First Run local-only mode finishes offline without requesting online identity", async () => {
  for (const session of [offline, missingNetwork]) {
    const h = finishingFixture({ session });
    await h.finish();
    assert.equal(h.saved.length, 1);
    assert.equal(h.saved[0].accountMode, "local-only");
    assert.equal(h.closed, 1);
    assert.equal(h.verifyCalls, 0);
    assert.equal(h.prefs.length, 2);
  }
});
test("An authenticated Host session cannot be saved as local-only First Run", async () => {
  const h = finishingFixture({ session: signedIn });
  await h.finish();
  assert.equal(h.saved.length, 0);
  assert.equal(h.closed, 0);
  assert.equal(h.prefs.length, 0);
  assert.equal(h.context.draft.accountMode, null);
  assert.equal(h.context.stepIndex, stages.indexOf("account"));
  assert.equal(h.context.identityFeedbackTone, "attention");
  assert.match(h.context.identityMessage, /sessão da Conta OrdaX mudou/);
  assert.equal(h.context.finishing, false);
});
test("Local-only choice is rechecked after an awaited Native device rename", async () => {
  let resolveRename;
  const delayedRename = new Promise(resolve => { resolveRename = resolve; });
  const h = finishingFixture({
    session: offline,
    deviceRename: () => delayedRename,
  });
  const pending = h.finish();
  assert.equal(h.context.finishing, true);
  h.setSession(signedIn);
  resolveRename({ displayName: "After" });
  await pending;
  assert.equal(h.saved.length, 0);
  assert.equal(h.closed, 0);
  assert.equal(h.prefs.length, 0);
  assert.equal(h.context.draft.accountMode, null);
  assert.equal(h.context.stepIndex, 1);
});
test("Identity-mode First Run still verifies the selected account before completion", async () => {
  const good = finishingFixture({ session: signedIn, accountMode: "identity", identityValid: true });
  await good.finish();
  assert.equal(good.verifyCalls, 1);
  assert.equal(good.saved[0].accountMode, "identity");
  const revoked = finishingFixture({ session: signedIn, accountMode: "identity", identityValid: false });
  await revoked.finish();
  assert.equal(revoked.verifyCalls, 1);
  assert.equal(revoked.saved.length, 0);
  assert.equal(revoked.context.draft.accountMode, null);
  assert.equal(revoked.context.stepIndex, 1);
});

function subscriptionFixture(mode = "local-only") {
  let listener = null;
  const context = {
    sessionSnapshot: offline,
    draft: { accountMode: mode },
    selectedIdentitySubjectId: mode === "identity" ? "owner-1" : null,
    identityPending: null, identityActionOrdinal: 0,
    accountLocalRequested: false, identityMessage: "", identityFeedbackTone: "information",
    identityPasswordDraft: "", passwordVisible: false,
    registrationPolicyOrdinal: 0, registrationPolicyPending: false,
    registrationPolicy: null, registrationLegalAccepted: false,
    hostedSignupAllowed: false, finishing: false,
    stepIndex: 2, stepIndexFor: step => stages.indexOf(step),
    STEPS: stages, destroyed: false,
    capabilitySnapshot: { registrationPolicy: false },
    sessionPort: { subscribe(fn) { listener = fn; return () => {}; } },
    matchesFirstRunIdentitySelection: (id, session) => id === session.subjectId,
    refreshRegistrationPolicy() { throw Error("No online policy needed"); },
    render() {},
  };
  runInNewContext(revocation + "let unsubscribeSession = null;\n" + subscribeSource, context);
  return { context, publish(next) { listener(next); } };
}
test("Live sign-in revokes an earlier local-only selection before Review", () => {
  const h = subscriptionFixture();
  h.publish(missingNetwork);
  assert.equal(h.context.draft.accountMode, "local-only",
    "offline or unavailable account authority must not block local setup");
  h.publish(signedIn);
  assert.equal(h.context.draft.accountMode, null);
  assert.equal(h.context.stepIndex, 1);
  assert.equal(h.context.identityFeedbackTone, "attention");
  assert.match(h.context.identityMessage, /sessão da Conta OrdaX mudou/);
});

function clickFixture({ live = offline, visible = offline, canSignOut = true,
    pending = null } = {}) {
  const calls = [];
  const context = {
    sessionSnapshot: visible,
    sessionPort: { getSnapshot() { return live; } },
    identityPending: pending,
    accountLocalRequested: false,
    actionsSnapshot: {}, identityMessage: "", identityFeedbackTone: "information",
    draft: { accountMode: null }, selectedIdentitySubjectId: "previous",
    isIdentityActionSupported: (_actions, kind) => kind === "sign-out" && canSignOut,
    runIdentity(kind) { calls.push(kind); },
    render() { calls.push("render"); },
    stepIndex: 1, go(index) { calls.push(index); },
    overlay: { contains: () => true },
  };
  const onClick = runInNewContext(clickSource + "\nonClick", context);
  const event = { target: {
    closest: selector => selector === "[data-first-run-action]"
      ? { disabled: false, dataset: { firstRunAction: "account-local" } } : null,
  } };
  return { context, calls, click: () => onClick(event) };
}
test("Stale signed-out UI cannot bypass a newly signed-in session", () => {
  const h = clickFixture({ live: signedIn, visible: offline });
  h.click();
  assert.equal(h.context.draft.accountMode, null);
  assert.equal(h.context.accountLocalRequested, true);
  assert.deepEqual(h.calls, ["sign-out"]);
  const unavailableAction = clickFixture({ live: signedIn, canSignOut: false });
  unavailableAction.click();
  assert.equal(unavailableAction.context.accountLocalRequested, false);
  assert.deepEqual(unavailableAction.calls, ["render"]);
  assert.equal(unavailableAction.context.identityFeedbackTone, "attention");
  const offlineUser = clickFixture({ live: missingNetwork });
  offlineUser.click();
  assert.equal(offlineUser.context.draft.accountMode, "local-only");
  assert.deepEqual(offlineUser.calls, [2]);
  const pendingAction = clickFixture({ pending: "sign-in" });
  pendingAction.click();
  assert.equal(pendingAction.context.draft.accountMode, null);
  assert.equal(pendingAction.calls.length, 0);
});
