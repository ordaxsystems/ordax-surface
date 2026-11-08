import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { meridianHomeContextKey } from "../system/surface/ui/meridian-home-context.mjs";

const read = path => readFile(new URL("../system/surface/" + path, import.meta.url), "utf8");
const signedIn = subjectId => ({ state: "signed-in", subjectId, displayName: "Pessoa" });
const space = id => ({ id, state: "active", name: id });

test("Web workspace remount key changes before another account/Space inherits window state", () => {
  const first = meridianHomeContextKey(signedIn("person-A"), space("workspace-A"));
  assert.equal(first, meridianHomeContextKey(signedIn("person-A"), space("workspace-A")),
    "same authorized context keeps drafts and open windows intact");
  for (const changed of [
    meridianHomeContextKey(signedIn("person-B"), space("workspace-A")),
    meridianHomeContextKey(signedIn("person-A"), space("workspace-B")),
    meridianHomeContextKey(signedIn("person-A"), null),
    meridianHomeContextKey({ state: "signed-out" }, null),
    meridianHomeContextKey({ state: "unavailable" }, null),
  ]) assert.notEqual(changed, first, "account or authorized Space transition invalidates window tree");
  assert.notEqual(meridianHomeContextKey({ state: "signed-out" }, null),
    meridianHomeContextKey({ state: "unavailable" }, null),
    "logout and identity-service outage remain distinct");
});

test("Web Central keys the complete window reducer and mounted app subtree, not Home alone", async () => {
  const central = await read("workspace/components/central/central.tsx");
  const wrapper = central.slice(central.indexOf("export function Central() {"),
    central.indexOf("function SessionScopedCentral() {"));
  const scoped = central.slice(central.indexOf("function SessionScopedCentral() {"));
  assert.match(wrapper, /const \{identity, authorized\} = useWebAccount\(\)/);
  assert.match(wrapper, /<SessionScopedCentral\s+key=\{meridianHomeContextKey\(identity, authorized\.activeSpace\)\}/);
  assert.doesNotMatch(wrapper, /useReducer|useState|onOpen/);
  assert.match(scoped, /const \[windows, dispatch\] = useReducer\(desktopReducer, initialDesktopState\)/);
  assert.match(scoped, /<WindowLayer state=\{windows\} dispatch=\{dispatch\}/);
  assert.match(scoped, /<WorkspaceNavigation /);
  assert.match(scoped, /const \[view, setView\] = useState/);
  assert.match(scoped, /const \[example, setExample\] = useState/);
  assert.doesNotMatch(central, /localStorage|sessionStorage|setTimeout\(|\.reload\(\)/,
    "context revocation is synchronous React lifecycle, not a second persisted session");
});

test("Web window resource/recovery state remains inside the keyed workspace", async () => {
  const layer = await read("workspace/components/central/window-layer.tsx");
  const content = await read("workspace/components/central/window-content.tsx");
  const reducer = await read("workspace/components/central/desktop-state.ts");
  const central = await read("workspace/components/central/central.tsx");
  assert.match(layer, /state\.windows\.map\(window =>/);
  assert.match(layer, /<WindowContent \{\.\.\.presentation\} title=\{window\.title\}/);
  assert.match(content, /<WindowContentBoundary key=\{attempt\}/);
  assert.match(reducer, /initialDesktopState: DesktopState = \{ windows: \[\], active: null/);
  assert.ok(central.indexOf("function SessionScopedCentral() {")
    < central.indexOf("<WindowLayer state={windows} dispatch={dispatch}"),
    "all window and app content is owned by the context-keyed child");
  assert.match(central, /key=\{meridianHomeContextKey\(identity, authorized\.activeSpace\)\}/);
});

test("Web account status remains authoritative without treating transport offline as logout", async () => {
  const source = await read("workspace/components/central/account-context.tsx");
  const keySource = await read("ui/meridian-home-context.mjs");
  assert.match(source, /useSyncExternalStore\(session\.identity\.subscribe, session\.identity\.getSnapshot/);
  assert.match(source, /deriveAuthorizedSpaces\(identity, catalog, selection\)/);
  assert.match(keySource, /if \(identity\?\.state === "signed-in"\)/);
  const keyImplementation = keySource.slice(keySource.indexOf("export function meridianHomeContextKey("));
  assert.doesNotMatch(keyImplementation, /connectivity|offline|navigator\.onLine/,
    "network reconnects cannot accidentally destroy valid window drafts");
});
