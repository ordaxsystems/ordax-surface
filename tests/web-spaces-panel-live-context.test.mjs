import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { meridianHomeContextKey } from "../system/surface/ui/meridian-home-context.mjs";

const source = await readFile(
  new URL("../system/surface/workspace/components/central/desktop.tsx", import.meta.url), "utf8",
);
const begin = source.indexOf("  function selectSpace(id: string) {");
const end = source.indexOf("\n  return <Panel", begin);
assert.ok(begin >= 0 && end > begin, "exercise the actual full Web Spaces panel action");
const handler = source.slice(begin, end).replace("function selectSpace(id: string)", "function selectSpace(id)");

const space = (id, state = "active") => ({ id, kind: "work", state, name: id });
const subject = subjectId => ({ state: "signed-in", subjectId, displayName: "Pessoa" });

function setup() {
  const originalIdentity = subject("A");
  const originalSpaces = [space("shared"), space("another")];
  const originalActive = originalSpaces[0];
  const authorized = { ready: true, visibleSpaces: originalSpaces, activeSpace: originalActive };
  let identity = originalIdentity, catalog = { state: "ready", spaces: originalSpaces },
    selected = { state: "selected", subjectId: "A", selectedSpace: originalActive },
    connectivity = "online", message = null, failOperation = false;
  const calls = [];
  const session = {
    surface: { getSnapshot: () => ({ connectivity }) },
    identity: { getSnapshot: () => identity },
    spaces: { getSnapshot: () => catalog },
    selection: {
      getSnapshot: () => selected,
      select(id) {
        calls.push(["select", id]);
        if (failOperation) throw new Error("selection failed");
        selected = { state: "selected", subjectId: identity.subjectId,
          selectedSpace: catalog.spaces.find(s => s.id === id) };
      },
      clear() {
        calls.push(["clear"]);
        if (failOperation) throw new Error("clear failed");
        selected = { state: "unselected", subjectId: identity.subjectId, selectedSpace: null };
      },
    },
  };
  const deriveAuthorizedSpaces = (currentIdentity, currentCatalog, currentSelection) => {
    const ready = currentIdentity.state === "signed-in"
      && currentCatalog.state === "ready"
      && currentSelection.state !== "unavailable"
      && currentSelection.subjectId === currentIdentity.subjectId;
    return {
      ready, visibleSpaces: ready ? currentCatalog.spaces : [],
      activeSpace: ready && currentSelection.state === "selected"
        ? currentCatalog.spaces.find(s => s.id === currentSelection.selectedSpace?.id
          && s.state === "active") ?? null
        : null,
    };
  };
  const choose = runInNewContext(handler + "\nselectSpace", {
    session, identity: originalIdentity, authorized,
    deriveAuthorizedSpaces, meridianHomeContextKey,
    setError: next => { message = next; },
  });
  return {
    choose, calls, get error() { return message; },
    setIdentity(next) { identity = next; },
    setSelection(next) { selected = next; },
    setCatalog(next) { catalog = next; },
    setOffline() { connectivity = "offline"; },
    setFailOperation() { failOperation = true; },
  };
}

test("Full Web Spaces panel selects verified options and clears only its current Space", () => {
  const select = setup();
  select.choose("another");
  assert.deepEqual(select.calls, [["select", "another"]]);
  assert.equal(select.error, null);
  const clear = setup();
  clear.choose("");
  assert.deepEqual(clear.calls, [["clear"]]);
  assert.equal(clear.error, null);
});

test("An old account's panel cannot select or clear a same-named Space for a new account", () => {
  for (const intent of ["shared", "another", ""]) {
    const scene = setup();
    scene.setIdentity(subject("B"));
    scene.setSelection({ state: "selected", subjectId: "B", selectedSpace: space("shared") });
    scene.choose(intent);
    assert.deepEqual(scene.calls, [], "stale A event cannot mutate B's selection");
    assert.match(scene.error, /contexto da conta mudou/);
  }
});

test("An old panel cannot override another selection, including clear, in the same account", () => {
  for (const intent of ["shared", "another", ""]) {
    const scene = setup();
    scene.setSelection({ state: "selected", subjectId: "A", selectedSpace: space("another") });
    scene.choose(intent);
    assert.deepEqual(scene.calls, []);
    assert.match(scene.error, /contexto da conta mudou/);
  }
});

test("Newly unavailable identity/catalog and offline transport are not writable", () => {
  const signedOut = setup();
  signedOut.setIdentity({ state: "signed-out" });
  signedOut.setSelection({ state: "unavailable", subjectId: null, selectedSpace: null });
  signedOut.choose("another");
  assert.deepEqual(signedOut.calls, []);
  assert.match(signedOut.error, /contexto da conta mudou/);

  const loading = setup();
  loading.setCatalog({ state: "loading", spaces: [] });
  loading.choose("another");
  assert.deepEqual(loading.calls, []);
  assert.match(loading.error, /contexto da conta mudou/);

  const offline = setup();
  offline.setOffline();
  offline.choose("another");
  assert.deepEqual(offline.calls, []);
  assert.match(offline.error, /Reconecte/);
});

test("Panel rejects options that disappeared or became archived before the click", () => {
  for (const state of ["missing", "archived"]) {
    const scene = setup();
    scene.setCatalog({ state: "ready", spaces: [
      space("shared"), ...(state === "archived" ? [space("another", "archived")] : []),
    ] });
    scene.choose("another");
    assert.deepEqual(scene.calls, []);
    assert.match(scene.error, /Space não está disponível/);
  }
});

test("Selection and clear errors are both handled by the same existing feedback UI", () => {
  for (const action of ["another", ""]) {
    const scene = setup();
    scene.setFailOperation();
    scene.choose(action);
    assert.deepEqual(scene.calls, action === "" ? [["clear"]] : [["select", "another"]]);
    assert.match(scene.error, /Space não está disponível/);
  }
});

test("Both full-panel buttons use one guarded handler and no additional authority or persistence", () => {
  const handlerSource = source.slice(begin, end);
  assert.match(handlerSource, /deriveAuthorizedSpaces\(\s*liveIdentity, session\.spaces\.getSnapshot\(\), session\.selection\.getSnapshot\(\)/);
  assert.match(handlerSource, /meridianHomeContextKey\(liveIdentity, live\.activeSpace\)/);
  assert.match(handlerSource, /meridianHomeContextKey\(identity, authorized\.activeSpace\)/);
  assert.match(handlerSource, /authorized\.visibleSpaces\.find\(space => space\.id === id/);
  assert.match(handlerSource, /live\.visibleSpaces\.find\(space => space\.id === id/);
  assert.match(handlerSource, /session\.selection\.select\(id\)/);
  assert.match(handlerSource, /session\.selection\.clear\(\)/);
  assert.match(source, /onClick=\{\(\) => selectSpace\(''\)\}>Limpar seleção/);
  assert.match(source, /onClick=\{\(\) => selectSpace\(space\.id\)\}/);
  assert.doesNotMatch(handlerSource, /localStorage|sessionStorage|fetch\(|\.save\(|\.grant\(/);
});
