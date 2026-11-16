import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = await readFile(
  new URL("../system/surface/ui/account-overview-controls.mjs", import.meta.url),
  "utf8",
);
function section(begin, end) {
  const from = source.indexOf(begin);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, "Account subscription: " + begin);
  return source.slice(from, to);
}
const sessionBlock = section(
  "  const unsubscribeSession = sessionPort.subscribe((snapshot) => {",
  "  const unsubscribeAccountLifecycle =",
);
const actionsBlock = section(
  "  const unsubscribeActions = actionsPort.subscribe((snapshot) => {",
  "  const unsubscribeSync =",
);
function harness() {
  let publishSession, publishActions;
  let paintCount = 0, spaceResets = 0, bindingResets = 0;
  let spacesReads = 0, bindingReads = 0, policyReads = 0;
  const h = runInNewContext([
    'let sessionSnapshot = { state: "signed-out", subjectId: null, displayName: null };',
    'let actionsSnapshot = { supportedActions: ["sign-in", "register"] };',
    'let registrationPolicy = { registrationEnabled: true };',
    'let registrationLegalAccepted = true, registrationPolicyPending = true;',
    'let registrationPolicyOrdinal = 10, hostedSignupAllowed = true;',
    'let pendingAction = "register", actionOrdinal = 5, actionMessage = "keep";',
    'let closeOrdinal = 1, pendingClose = false, closePasswordDraft = "";',
    'let closeConfirmationChecked = false, closeMessage = "";',
    'let credentialPasswordDraft = "draft-password";',
    'let projectBindingMessage = "", pendingProjectBinding = null;',
    'let createOrdinal = 1, createPending = false, createIdempotencyKey = null;',
    'let createUnconfirmed = false, createNameDraft = "My Space";',
    'let createReceipt = null, createMessage = "";',
    'let profileOrdinal = 1, pendingProfileAction = null, pendingProfileSpaceId = null;',
    'let spaceMessage = "", profileMessage = "";',
    'let activeSection = "spaces";',
    'const validateIdentitySessionSnapshot = x => x;',
    'const validateIdentityActionsSnapshot = x => x;',
    'const isIdentityActionSupported = (x, action) => x.supportedActions.includes(action);',
    'const replaceView = () => countPaint();',
    'const refreshRegistrationPolicy = () => countPolicy();',
    'const refreshSpaces = () => countSpaces();',
    'const spacesPort = { reset: () => countSpaceReset() };',
    'const projectBindingPort = { reset: () => countBindingReset(), refresh: () => countBindings() };',
    'const sessionPort = { subscribe(callback) { captureSession(callback); return () => {}; } };',
    'const actionsPort = { subscribe(callback) { captureActions(callback); return () => {}; } };',
    sessionBlock,
    actionsBlock,
    '({',
    '  emitSession: snapshot => emitSession(snapshot),',
    '  emitActions: snapshot => emitActions(snapshot),',
    '  setDraft: value => { createNameDraft = value; },',
    '  read: () => ({ state: sessionSnapshot.state, subject: sessionSnapshot.subjectId,',
    '    displayName: sessionSnapshot.displayName, email: sessionSnapshot.email,',
    '    policy: registrationPolicy, legalAccepted: registrationLegalAccepted,',
    '    policyPending: registrationPolicyPending, actionMessage, pendingAction,',
    '    credentialPasswordDraft, createNameDraft,',
    '    actionOrdinal, createOrdinal, registrationPolicyOrdinal })',
    '});',
  ].join("\n"), {
    captureSession(fn) { publishSession = fn; },
    captureActions(fn) { publishActions = fn; },
    emitSession(value) { publishSession(value); },
    emitActions(value) { publishActions(value); },
    countPaint() { paintCount += 1; },
    countPolicy() { policyReads += 1; },
    countSpaces() { spacesReads += 1; },
    countBindings() { bindingReads += 1; },
    countSpaceReset() { spaceResets += 1; },
    countBindingReset() { bindingResets += 1; },
  });
  return { ...h, counts: () => ({ paintCount, spaceResets, bindingResets, spacesReads, bindingReads, policyReads }) };
}

test("repeated signed-out session does not revoke drafts, consent or active registration request", () => {
  const h = harness();
  const before = h.read();
  h.emitSession({ state: "signed-out", subjectId: null, displayName: null });
  h.emitSession({ state: "signed-out", subjectId: null, displayName: null });
  const after = h.read();
  assert.equal(after.createNameDraft, before.createNameDraft);
  assert.equal(after.credentialPasswordDraft, before.credentialPasswordDraft);
  assert.equal(after.legalAccepted, true);
  assert.equal(after.policyPending, true);
  assert.equal(after.registrationPolicyOrdinal, before.registrationPolicyOrdinal);
  assert.equal(after.actionOrdinal, before.actionOrdinal);
  assert.equal(h.counts().spaceResets, 0);
  assert.equal(h.counts().bindingResets, 0);
  assert.equal(h.counts().policyReads, 0);
  assert.equal(h.counts().paintCount, 0);
});

test("same-user profile refresh repaints once without revoking account-bound work", () => {
  const h = harness();
  h.emitSession({ state: "signed-in", subjectId: "owner-a", displayName: "Ana", email: "ana@example.com" });
  const context = h.read();
  const counts = h.counts();
  h.setDraft("In progress");
  h.emitSession({ state: "signed-in", subjectId: "owner-a", displayName: "Ana", email: "ana@example.com" });
  assert.equal(h.counts().paintCount, counts.paintCount);
  h.emitSession({ state: "signed-in", subjectId: "owner-a", displayName: "Ana Silva", email: "ana@example.com" });
  assert.equal(h.counts().paintCount, counts.paintCount + 1);
  assert.equal(h.read().createNameDraft, "In progress");
  assert.equal(h.read().actionOrdinal, context.actionOrdinal);
  assert.equal(h.counts().spaceResets, counts.spaceResets);
  assert.equal(h.counts().spacesReads, counts.spacesReads);
  h.emitSession({ state: "signed-in", subjectId: "owner-a", displayName: "Ana Silva", email: "new@example.com" });
  assert.equal(h.counts().paintCount, counts.paintCount + 2, "email-only change repaints");
});

test("subject switches and sign-outs still invalidate account-scoped operations exactly once", () => {
  const h = harness();
  h.emitSession({ state: "signed-in", subjectId: "owner-a", displayName: "A" });
  h.setDraft("private");
  const before = h.read();
  const resets = h.counts().spaceResets;
  h.emitSession({ state: "signed-in", subjectId: "owner-b", displayName: "B" });
  assert.equal(h.read().createNameDraft, "");
  assert.equal(h.read().actionOrdinal, before.actionOrdinal + 1);
  assert.equal(h.counts().spaceResets, resets + 1);
  h.emitSession({ state: "signed-in", subjectId: "owner-b", displayName: "B" });
  assert.equal(h.counts().spaceResets, resets + 1);
  h.emitSession({ state: "signed-out", subjectId: null, displayName: null });
  assert.equal(h.counts().policyReads, 1);
  const out = h.read();
  h.emitSession({ state: "signed-out", subjectId: null, displayName: null });
  assert.equal(h.counts().policyReads, 1);
  assert.equal(h.read().actionOrdinal, out.actionOrdinal);
  h.emitSession({ state: "unavailable", subjectId: null, displayName: null });
  assert.equal(h.read().actionOrdinal, out.actionOrdinal + 1, "unavailable is a real identity transition");
});

test("unchanged supported actions preserve notices, while revocation still clears register consent", () => {
  const h = harness();
  h.emitActions({ supportedActions: ["sign-in", "register"] });
  assert.equal(h.read().actionMessage, "keep");
  assert.equal(h.read().legalAccepted, true);
  assert.equal(h.counts().policyReads, 0);
  assert.equal(h.counts().paintCount, 0);
  h.emitActions({ supportedActions: ["sign-in"] });
  assert.equal(h.read().actionMessage, "");
  assert.equal(h.read().legalAccepted, false);
  assert.equal(h.read().policy, null);
  assert.equal(h.counts().paintCount, 1);
  h.emitActions({ supportedActions: ["sign-in"] });
  assert.equal(h.counts().paintCount, 1);
});
