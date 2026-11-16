import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = await readFile(
  new URL("../system/surface/ui/surface.mjs", import.meta.url), "utf8",
);
function section(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, "missing production Surface code: " + start);
  return source.slice(from, to);
}
const normalizeSource = section("function normalizeNativeSearch(", "function appTitle(");

function filteredButton(id, search) {
  let hidden = false, writes = 0;
  return {
    dataset: { launchApp: id, launcherSearch: search },
    disabled: false,
    get hidden() { return hidden; },
    set hidden(value) { writes++; hidden = value; },
    writes() { return writes; },
  };
}

test("launcher typing filters mounted controls without querying or rebuilding the catalog", () => {
  const filterCode = section("  const filterLauncher = (query = launcherQuery.value) => {",
    "  const renderLauncher = () => {");
  const renderCode = section("  const renderLauncher = () => {", "  const renderWindows = () => {");
  assert.doesNotMatch(filterCode, /catalog\.(list|get|isAvailable)/,
    "query-only filtering cannot reconstruct the authority");
  assert.match(renderCode, /for \(const \[index, app\] of catalog\.list\(\)\.entries\(\)\)/);
  assert.match(renderCode, /const available = catalog\.isAvailable\(app, state\.capabilityIds\)/);
  assert.match(renderCode, /syncDataset\(button, "launcherSearch", searchText\)/);
  assert.match(renderCode, /filterLauncher\(launcherQuery\.value\)/,
    "catalog and locale changes must also refresh search result visibility");
  assert.match(source, /if \(event\.target === launcherQuery\) filterLauncher\(launcherQuery\.value\)/,
    "input events must only filter");
  assert.doesNotMatch(source, /if \(event\.target === launcherQuery\) renderLauncher\(\)/);

  const cafe = filteredButton("cafe", "cafe expresso cafeteria");
  const notes = filteredButton("notes", "notas anotações notes");
  const appLauncher = {
    children: [cafe, notes],
    querySelector(selector) {
      if (selector !== "[data-launcher-empty]") return null;
      return this.children.find(node => node.dataset?.launcherEmpty !== undefined) ?? null;
    },
    contains(node) { return this.children.includes(node); },
  };
  let language = "pt-BR", inputFocus = 0, activeElement = null;
  const launcherQuery = { value: "", focus() { inputFocus++; activeElement = launcherQuery; } };
  const localization = {
    getLocale: () => language,
    translate: () => language.startsWith("en") ? "No apps found" : "Nenhum aplicativo",
  };
  const render = runInNewContext([
    normalizeSource, filterCode, "filterLauncher",
  ].join("\n"), {
    appLauncher, launcherQuery, localization, root: {
      ownerDocument: { get activeElement() { return activeElement; } },
    },
    syncHidden(node, next) { if (node.hidden !== next) node.hidden = next; },
    syncText(node, next) { if (node.textContent !== next) node.textContent = next; },
    element(tag, className, value) {
      return {
        tag, className, dataset: {}, textContent: value,
        remove() { appLauncher.children = appLauncher.children.filter(item => item !== this); },
      };
    },
    placeChildAt(container, node, index) {
      if (!container.children.includes(node)) container.children.splice(index, 0, node);
    },
  });
  render("câfé");
  assert.equal(cafe.hidden, false, "accent-insensitive title and description matching");
  assert.equal(notes.hidden, true);
  const writes = notes.writes();
  render("cafe");
  assert.equal(notes.writes(), writes, "same result set is not repainted");
  activeElement = cafe;
  render("notas");
  assert.equal(cafe.hidden, true);
  assert.equal(inputFocus, 1, "hidden focused app returns to the query input");
  render("sem resultados");
  const empty = appLauncher.querySelector("[data-launcher-empty]");
  assert.equal(empty.textContent, "Nenhum aplicativo");
  assert.equal(appLauncher.children.filter(x => x.dataset?.launcherEmpty !== undefined).length, 1);
  render("ainda sem resultados");
  assert.strictEqual(appLauncher.querySelector("[data-launcher-empty]"), empty);
  language = "en-US";
  render("still unmatched");
  assert.equal(empty.textContent, "No apps found", "locale change updates empty presentation");
  render("");
  assert.equal(appLauncher.querySelector("[data-launcher-empty]"), null);
  assert.equal(cafe.hidden, false);
  assert.equal(notes.hidden, false);
});

test("Ctrl+K filters each live item and each group once without repeated visibility writes", () => {
  const filterCode = section("  const filterNativeNavigation = query => {",
    "  const handleNativeNavigationArrow =");
  assert.match(filterCode, /const visibleGroups = new Set\(\)/);
  assert.doesNotMatch(filterCode, /group\.querySelector\("\[data-nav-menu-item\]:not\(\[hidden\]\)"\)/);

  function tracked(label, group) {
    let hidden = false, writes = 0;
    return {
      textContent: label,
      matches: () => true,
      closest: () => group,
      get hidden() { return hidden; },
      set hidden(v) { writes++; hidden = v; },
      writes: () => writes,
    };
  }
  const groups = [
    { hidden: false, writes: 0 },
    { hidden: false, writes: 0 },
  ];
  for (const group of groups) {
    let value = group.hidden;
    Object.defineProperty(group, "hidden", {
      get: () => value,
      set: v => { group.writes++; value = v; },
    });
  }
  const items = [tracked("Início", groups[0]), tracked("Notas", groups[1])];
  let language = "pt-BR", activeElement = null, focuses = 0;
  const empty = { textContent: "", hidden: true, writes: 0 };
  const navigationQuery = { focus() { focuses++; activeElement = navigationQuery; } };
  const navigationMenu = {
    hidden: false,
    querySelectorAll: selector => selector === "[data-nav-menu-item]" ? items : groups,
    querySelector: () => empty,
  };
  const filter = runInNewContext([normalizeSource, filterCode, "filterNativeNavigation"].join("\n"), {
    localization: { getLocale: () => language },
    navigationMenu, navigationQuery, root: { ownerDocument: { get activeElement() { return activeElement; } } },
    syncHidden(node, next) { if (node.hidden !== next) node.hidden = next; },
    syncText(node, next) { if (node.textContent !== next) node.textContent = next; },
  });
  filter("notás");
  assert.equal(items[0].hidden, true);
  assert.equal(items[1].hidden, false);
  assert.equal(groups[0].hidden, true);
  assert.equal(groups[1].hidden, false);
  const snapshot = [...items.map(x => x.writes()), ...groups.map(x => x.writes)];
  filter("notas");
  assert.deepEqual([...items.map(x => x.writes()), ...groups.map(x => x.writes)], snapshot);
  activeElement = items[1];
  filter("no-result");
  assert.equal(empty.hidden, false);
  assert.equal(focuses, 1, "hidden focused item returns to keyboard query");
  language = "en-US";
  filter("no-result");
  assert.equal(empty.textContent, "No destinations or apps found.");
  filter("");
  assert.equal(empty.hidden, true);
  assert.equal(groups[0].hidden, false);
  assert.equal(groups[1].hidden, false);
});
