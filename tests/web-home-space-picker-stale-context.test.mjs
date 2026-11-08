import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { meridianHomeContextKey } from "../system/surface/ui/meridian-home-context.mjs";

const source = await readFile(
  new URL("../system/surface/workspace/components/central/home-space-picker.tsx", import.meta.url), "utf8",
);
const start = source.indexOf("  function choose(spaceId: string) {");
const end = source.indexOf("\n  return <div className=", start);
assert.ok(start >= 0 && end > start, "exercise the actual Web Space selector");
const handler = source.slice(start, end)
  .replace("function choose(spaceId: string)", "function choose(spaceId)")
  .replace("const liveSpaces: typeof authorized.visibleSpaces = live.visibleSpaces;",
    "const liveSpaces = live.visibleSpaces;");

const space = id => ({ id, state: "active", name: id });
const identity = subjectId => ({ state: "signed-in", subjectId, displayName: "Person" });
function fixture() {
  const spaces = [space("work"), space("personal")];
  const presentedIdentity = identity("person-A");
  const presentedActive = spaces[0];
  let currentIdentity = presentedIdentity;
  let selected = { state: "selected", subjectId: "person-A", selectedSpace: spaces[0] };
  let catalog = { state: "ready", spaces };
  let connectivity = "online";
  let message = null;
  const calls = [];
  const session = {
    surface: { getSnapshot: () => ({ connectivity }) },
    identity: { getSnapshot: () => currentIdentity },
    spaces: { getSnapshot: () => catalog },
    selection: {
      getSnapshot: () => selected,
      select(id) {
        calls.push(["select", id]);
        selected = { state: "selected", subjectId: currentIdentity.subjectId,
          selectedSpace: spaces.find(s => s.id === id) };
      },
      clear() {
        calls.push(["clear"]);
        selected = { state: "unselected", subjectId: currentIdentity.subjectId,
          selectedSpace: null };
      },
    },
  };
  const authorized = { ready: true, visibleSpaces: spaces, activeSpace: presentedActive };
  // Minimal read-only projection fixture; every intent is checked against
  // the current subject, catalog and selected Space, not a cached UI closure.
  const deriveAuthorizedSpaces = (current, snapshot, selection) => {
    const ready = current.state === "signed-in" && snapshot.state === "ready"
      && selection.state !== "unavailable" && selection.subjectId === current.subjectId;
    return {
      ready, visibleSpaces: ready ? snapshot.spaces : [],
      activeSpace: ready && selection.state === "selected"
        ? snapshot.spaces.find(s => s.id === selection.selectedSpace?.id) ?? null
        : null,
    };
  };
  const choose = runInNewContext(handler + "\nchoose", {
    session, identity: presentedIdentity, active: presentedActive,
    authorized, deriveAuthorizedSpaces, meridianHomeContextKey,
    setError(next) { message = next; },
  });
  return {
    choose, calls,
    get message() { return message; },
    setIdentity(next) { currentIdentity = next; },
    setSelection(next) { selected = next; },
    setCatalog(next) { catalog = next; },
    setConnectivity(next) { connectivity = next; },
  };
}

test("Genuine Space selections and clearing stay in the same authorized Web context", () => {
  const selected = fixture();
  selected.choose("personal");
  assert.deepEqual(selected.calls, [["select", "personal"]]);
  assert.equal(selected.message, null);
  const cleared = fixture();
  cleared.choose("");
  assert.deepEqual(cleared.calls, [["clear"]]);
  assert.equal(cleared.message, null);
});

test("A stale event from account A cannot select or clear a matching Space owned by account B", () => {
  for (const intent of ["personal", ""]) {
    const h = fixture();
    h.setIdentity(identity("person-B"));
    h.setSelection({ state: "selected", subjectId: "person-B", selectedSpace: space("work") });
    h.choose(intent);
    assert.deepEqual(h.calls, [], "stale event cannot mutate new account's selection");
    assert.match(h.message, /contexto da conta mudou/);
  }
});

test("An old picker cannot overwrite the Space selected elsewhere in the same account", () => {
  for (const intent of ["work", ""]) {
    const h = fixture();
    h.setSelection({ state: "selected", subjectId: "person-A", selectedSpace: space("personal") });
    h.choose(intent);
    assert.deepEqual(h.calls, [], "stale rendered Space cannot overwrite the current one");
    assert.match(h.message, /contexto da conta mudou/);
  }
});

test("Unavailable catalog, signed-out account and offline transport fail closed", () => {
  const offline = fixture();
  offline.setConnectivity("offline");
  offline.choose("personal");
  assert.deepEqual(offline.calls, []);
  assert.match(offline.message, /Reconecte/);

  const unauthorized = fixture();
  unauthorized.setIdentity({ state: "signed-out" });
  unauthorized.setSelection({ state: "unavailable", subjectId: null, selectedSpace: null });
  unauthorized.choose("personal");
  assert.deepEqual(unauthorized.calls, []);
  assert.match(unauthorized.message, /contexto da conta mudou/);

  const unavailable = fixture();
  unavailable.setCatalog({ state: "unavailable", spaces: [] });
  unavailable.choose("personal");
  assert.deepEqual(unavailable.calls, []);
  assert.match(unavailable.message, /contexto da conta mudou/);
});

test("A revoked or non-active Space is never sent to the Account selection runtime", () => {
  const h = fixture();
  h.choose("revoked");
  assert.deepEqual(h.calls, []);
  assert.match(h.message, /Não foi possível selecionar este Space/);
});

test("No parallel account authority or persisting store was added to the picker", () => {
  const body = source.slice(start, end);
  assert.match(body, /session\.identity\.getSnapshot\(\)/);
  assert.match(body, /session\.spaces\.getSnapshot\(\)/);
  assert.match(body, /session\.selection\.getSnapshot\(\)/);
  assert.match(body, /meridianHomeContextKey\(liveIdentity, live\.activeSpace\)/);
  assert.match(body, /meridianHomeContextKey\(identity, active\)/);
  assert.doesNotMatch(body, /fetch\(|localStorage|sessionStorage|grant\(|save\(/);
});
