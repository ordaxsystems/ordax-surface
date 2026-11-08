import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = await readFile(
  new URL("../system/surface/ui/account-overview-controls.mjs", import.meta.url),
  "utf8",
);
const start = source.indexOf("  const onSubmit = (event) => {");
const end = source.indexOf("\n  const onClick = (event) => {", start);
assert.ok(start !== -1 && end > start, "exercise the real account create handler");

function harness({ failCreate = false, failRefresh = false, failSelect = false,
  authorized = true } = {}) {
  const scenario = {
    failCreate, failRefresh, failSelect, authorized,
    intents: [], selects: [], refreshes: 0, renders: 0, prevented: 0,
  };
  const harnessSource = [
    'let destroyed = false;',
    'let sessionSnapshot = { state: "signed-in", subjectId: "owner-1" };',
    'let createPending = false;',
    'let createNameDraft = "  Pizzaria Solar  ";',
    'let createTypeDraft = "food:pizzeria";',
    'let createIdempotencyKey = null;',
    'let createReceipt = null;',
    'let createMessage = "";',
    'let createMessageTone = "attention";',
    'let createUnconfirmed = false;',
    'let createOrdinal = 0;',
    'let spaceMessage = "";',
    'const CREATABLE_SPACE_TYPES = [{ key: "food:pizzeria", domain: "food", subtype: "pizzeria" }];',
    'const desktopWindow = { crypto: { randomUUID() { return "uuid-1"; } } };',
    'const root = { contains: () => true };',
    'const t = value => value;',
    'const replaceView = () => { scenario.renders += 1; };',
    'const spaceCreatePort = { async create(intent) {',
    '  scenario.intents.push({ ...intent });',
    '  if (scenario.failCreate) throw new Error("creation uncertain");',
    '  return { space: { id: "space-1" } };',
    '} };',
    'const spacesPort = {',
    '  async refresh() {',
    '    scenario.refreshes += 1;',
    '    if (scenario.failRefresh) throw new Error("catalog unavailable");',
    '  },',
    '  getSnapshot() { return { state: "ready" }; },',
    '};',
    'const sessionPort = { getSnapshot: () => sessionSnapshot };',
    'const spaceSelectionPort = {',
    '  getSnapshot() { return { state: "unselected" }; },',
    '  select(id) {',
    '    scenario.selects.push(id);',
    '    if (scenario.failSelect) throw new Error("selection denied");',
    '  },',
    '};',
    'const validateSpacesSnapshot = value => value;',
    'const deriveAuthorizedSpaces = () => ({',
    '  ready: true,',
    '  visibleSpaces: scenario.authorized',
    '    ? [{ id: "space-1", ownerId: "owner-1", state: "active" }] : [],',
    '});',
    source.slice(start, end),
    '({',
    '  submit() {',
    '    onSubmit({',
    '      target: { matches: () => true },',
    '      preventDefault() { scenario.prevented += 1; },',
    '    });',
    '  },',
    '  state() {',
    '    return { createPending, createUnconfirmed, createNameDraft,',
    '      createIdempotencyKey, createMessage, createMessageTone, spaceMessage };',
    '  },',
    '});',
  ].join("\n");
  const controller = runInNewContext(harnessSource, { scenario });
  const state = () => JSON.parse(JSON.stringify(controller.state()));
  return { scenario, controller, state };
}

async function flush() {
  await new Promise(resolve => setImmediate(resolve));
}

test("Confirmed Space survives failed optional selection without retrying its creation", async () => {
  const { scenario, controller, state } = harness({ failSelect: true });
  controller.submit();
  await flush();
  assert.equal(scenario.prevented, 1);
  assert.equal(scenario.intents.length, 1);
  assert.equal(scenario.intents[0].idempotencyKey, "uuid-1");
  assert.equal(scenario.intents[0].name, "Pizzaria Solar");
  assert.equal(scenario.refreshes, 1, "catalog refresh required after receipt");
  assert.deepEqual(scenario.selects, ["space-1"], "select only after authorization");
  assert.deepEqual(state(), {
    createPending: false,
    createUnconfirmed: false,
    createNameDraft: "",
    createIdempotencyKey: null,
    createMessage: "account.spaces.create.createdPending",
    createMessageTone: "information",
    spaceMessage: "account.spaces.selection.failed",
  });
  controller.submit();
  await flush();
  assert.equal(scenario.intents.length, 1, "selection failure cannot resubmit creation");
});

test("Uncertain creation retains its exact request until the same intent succeeds", async () => {
  const { scenario, controller, state } = harness({ failCreate: true });
  controller.submit();
  await flush();
  assert.equal(state().createUnconfirmed, true);
  assert.equal(state().createNameDraft, "  Pizzaria Solar  ");
  assert.equal(state().createIdempotencyKey, "uuid-1");
  assert.equal(state().createMessage, "account.spaces.create.retryUnconfirmed");
  assert.equal(scenario.selects.length, 0);
  scenario.failCreate = false;
  controller.submit();
  await flush();
  assert.equal(scenario.intents.length, 2);
  assert.deepEqual(scenario.intents[1], scenario.intents[0],
    "retry preserves name/type/UUID instead of duplicating Space");
  assert.equal(state().createUnconfirmed, false);
  assert.equal(state().createNameDraft, "");
  assert.deepEqual(scenario.selects, ["space-1"]);
});

test("An unverified catalog never converts a mutation receipt into selection authority", async () => {
  for (const settings of [{ failRefresh: true }, { authorized: false }]) {
    const { scenario, controller, state } = harness(settings);
    controller.submit();
    await flush();
    assert.equal(state().createUnconfirmed, true);
    assert.equal(state().createMessage, "account.spaces.create.retryUnconfirmed");
    assert.equal(state().createIdempotencyKey, "uuid-1");
    assert.equal(scenario.selects.length, 0, "unverified Space cannot be selected");
    assert.equal(scenario.intents.length, 1, "the original command was sent once");

    scenario.failRefresh = false;
    scenario.authorized = true;
    controller.submit();
    await flush();
    assert.equal(scenario.intents.length, 1,
      "an accepted receipt must not trigger a second Host creation command");
    assert.equal(scenario.refreshes, 2,
      "retry verifies authoritative catalog instead of repeating the mutation");
    assert.deepEqual(scenario.selects, ["space-1"],
      "selection becomes available only after the authorized catalog confirms it");
    assert.equal(state().createUnconfirmed, false);
    assert.equal(state().createIdempotencyKey, null);
  }
});

test("A cached Space creation receipt is scoped to the current subject and unchanged intent", () => {
  const onSubmit = source.slice(start, end);
  const onInput = source.slice(source.indexOf("  const onInput = (event) => {"), start);
  const onChange = source.slice(source.indexOf("  const onChange = (event) => {"),
    source.indexOf("  const onInput = (event) => {"));
  const onSessionChange = source.slice(source.indexOf("  const unsubscribeSession = "),
    source.indexOf("  const unsubscribeAccountLifecycle = "));
  const onDestroy = source.slice(source.indexOf("    destroy() {"), source.length);

  assert.match(onSubmit, /const receipt = createReceipt \?\? await spaceCreatePort\.create\(intent\)/);
  assert.match(onSubmit, /createReceipt = receipt;\s*await spacesPort\.refresh\(\)/);
  assert.match(onSubmit, /typeof receipt\?\.space\?\.id !== "string"/);
  assert.match(onInput, /createNameDraft = input\.value;\s*createIdempotencyKey = null;\s*createReceipt = null;/);
  assert.match(onChange, /createTypeDraft = control\.value;\s*createIdempotencyKey = null;\s*createReceipt = null;/);
  assert.match(onSessionChange, /createOrdinal \+= 1;\s*createPending = false;\s*createIdempotencyKey = null;\s*createUnconfirmed = false;\s*createNameDraft = "";\s*createReceipt = null;/);
  assert.match(onDestroy, /spaceCreatePort\?\.dispose\(\);\s*createOrdinal \+= 1;\s*createReceipt = null;/);
});
