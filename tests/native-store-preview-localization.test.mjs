import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { projectStoreCatalogPreview, storeEntryVisualState }
  from "../system/surface/ui/store-entry-presentation.mjs";

const source = await readFile(
  new URL("../system/surface/ui/native-store-catalog-preview.mjs", import.meta.url), "utf8",
);
const begin = source.indexOf("function renderPreview(slot, catalog, t) {");
const end = source.indexOf("\nexport function mountNativeStoreCatalogPreview(", begin);
assert.ok(begin >= 0 && end > begin, "exercise the actual shared Native preview renderer");

const renderPreview = runInNewContext(
  source.slice(begin, end) + "\nrenderPreview",
  {
    projectNativeStorePreview: projectStoreCatalogPreview,
    storeEntryVisualState,
  },
);

class FakeNode {
  constructor(tag, ownerDocument) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.dataset = {};
    this.children = [];
    this.className = "";
    this.textContent = "";
    this.attributes = new Map();
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
  setAttribute(key, value) { this.attributes.set(key, value); }
}
const doc = { createElement(tag) { return new FakeNode(tag, this); } };
const catalogs = {
  unavailable: { state: "error", entries: [] },
  empty: { state: "ready", entries: [] },
  full: {
    state: "ready",
    entries: [
      { appId: "assistant", title: "Aura", state: "installed",
        updatable: true, installedVersion: "1.0", availableVersion: "1.1", blockedReason: null },
      { appId: "studio", title: "Studio", state: "installed",
        updatable: false, installedVersion: "2.0", availableVersion: null, blockedReason: null },
      { appId: "gallery", title: "Galeria", state: "available",
        updatable: false, installedVersion: null, availableVersion: "1.0", blockedReason: null },
      { appId: "notes", title: "Notas", state: "blocked",
        updatable: false, installedVersion: null, availableVersion: "1.0", blockedReason: "Host negou" },
      { appId: "reader", title: "Leitor", state: "available",
        updatable: false, installedVersion: null, availableVersion: "1.0", blockedReason: null },
      { appId: "terminal", title: "Terminal", state: "installed",
        updatable: false, installedVersion: "1.0", availableVersion: null, blockedReason: null },
    ],
  },
};

function messages(locale) {
  const en = locale === "en-US";
  const map = {
    "store.presentation.official": en ? "Store · real catalog" : "Loja · catálogo real",
    "store.status.unavailableDetail": en ? "Verified catalog unavailable" : "Catálogo verificado indisponível",
    "store.empty.filtered": en ? "No applications found" : "Nenhum aplicativo encontrado",
    "store.results.count": en ? "{count} results" : "{count} resultados",
    "store.security.note": en ? "The Store only requests operations." : "A Loja apenas solicita operações.",
    "store.section.updates": en ? "Updates" : "Atualizações",
    "store.state.installed": en ? "Installed" : "Instalado",
    "store.state.available": en ? "Available" : "Disponível",
    "store.state.blocked": en ? "Blocked" : "Bloqueado",
    "store.version.update": en ? "Installed: {installedVersion} · Available: {availableVersion}"
      : "Instalado: {installedVersion} · Disponível: {availableVersion}",
    "store.version.installed": en ? "Installed: {version}" : "Instalado: {version}",
    "store.version.available": en ? "Available: {version}" : "Disponível: {version}",
    "store.details.blocked": en ? "Blocked:" : "Bloqueado:",
  };
  return (id, params = {}) => {
    assert.ok(Object.hasOwn(map, id), "Native Store preview must reuse canonical translated message: " + id);
    return map[id].replace(/\{([^}]+)\}/g, (_, key) => String(params[key]));
  };
}
function render(snapshot, locale = "pt-BR", surface = "home") {
  const slot = new FakeNode("section", doc);
  slot.dataset.nativeStoreCatalogPreview = surface;
  renderPreview(slot, { getSnapshot: () => snapshot }, messages(locale));
  return slot;
}
function flatten(node) {
  return [node, ...node.children.flatMap(flatten)];
}

test("Native Store previews preserve verified states while using the canonical English catalog", () => {
  const home = render(catalogs.full, "en-US");
  assert.equal(home.dataset.catalogState, "ready");
  assert.equal(home.children[0].textContent, "Store · real catalog");
  const list = home.children.find(child => child.tagName === "UL");
  assert.ok(list);
  assert.equal(list.attributes.get("aria-label"), "Store · real catalog");
  assert.equal(list.children.length, 4, "Home remains bounded to four official entries");
  assert.ok(flatten(list).some(node => node.textContent === "Updates"));
  assert.ok(flatten(list).some(node => node.textContent === "Installed: 1.0 · Available: 1.1"));
  assert.ok(flatten(list).some(node => node.textContent === "Blocked: Host negou"));
  assert.ok(home.children.some(node => node.textContent === "6 results"),
    "truncated preview announces authoritative total, not invented extra apps");
  assert.equal(home.children.at(-1).textContent, "The Store only requests operations.");
  assert.equal(flatten(home).some(node => node.tagName === "BUTTON"), false,
    "read-only preview never fabricates installation or launch authority");

  const launcher = render(catalogs.full, "en-US", "launcher");
  assert.equal(launcher.children.find(child => child.tagName === "UL").children.length, 6);
  assert.equal(launcher.children.some(child => child.textContent === "6 results"), false,
    "full result listing has no redundant truncation count");
});

test("Native Store locale changes and unavailable/empty catalog messages stay translated", () => {
  const pt = render(catalogs.full);
  assert.equal(pt.children[0].textContent, "Loja · catálogo real");
  assert.equal(pt.children.at(-1).textContent, "A Loja apenas solicita operações.");
  assert.ok(pt.children.some(child => child.textContent === "6 resultados"));
  for (const locale of ["pt-BR", "en-US"]) {
    const unavailable = render(catalogs.unavailable, locale);
    assert.equal(unavailable.dataset.catalogState, "unavailable");
    assert.equal(unavailable.children[1].textContent,
      locale === "en-US" ? "Verified catalog unavailable" : "Catálogo verificado indisponível");
    const empty = render(catalogs.empty, locale);
    assert.equal(empty.dataset.catalogState, "ready");
    assert.equal(empty.children[1].textContent,
      locale === "en-US" ? "No applications found" : "Nenhum aplicativo encontrado");
  }
});

test("Native Store does not maintain a second hardcoded catalog language or inventory", () => {
  assert.doesNotMatch(source, /Estado oficial dos aplicativos|Nenhum aplicativo consta do catálogo oficial|outros aplicativos no catálogo|Somente consulta\. Instalação/);
  assert.match(source, /store\.presentation\.official/);
  assert.match(source, /store\.security\.note/);
  assert.match(source, /store\.results\.count/);
  assert.match(source, /projectNativeStorePreview\(catalog\.getSnapshot\(\), limit\)/);
  assert.doesNotMatch(source, /\.requestLifecycle\(|\.install\(|\.activate\(|\.publish\(/);
});
