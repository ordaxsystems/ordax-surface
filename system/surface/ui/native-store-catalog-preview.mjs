import { assertAppStoreCatalogPort, validateAppStoreCatalogSnapshot } from "../../contracts/app-store.mjs";
import { assertSurfaceRenderLifecycle } from "../../contracts/surface-render-lifecycle.mjs";
import { projectStoreCatalogPreview } from "./store-entry-presentation.mjs";

// Read-only projection of the exact Store catalog already mounted by the OS.
// A catalog entry is never a launch grant; Native app activation remains owned
// by the host's separately verified installed-app runtime and authorization.
export function projectNativeStorePreview(snapshot, limit = 6) {
  return projectStoreCatalogPreview(validateAppStoreCatalogSnapshot(snapshot), limit);
}

function renderPreview(slot, catalog, t) {
  if (!slot) return;
  const doc = slot.ownerDocument;
  const home = slot.dataset.nativeStoreCatalogPreview === "home";
  const limit = home ? 4 : 10;
  slot.replaceChildren();
  const sectionTitle = doc.createElement("strong");
  sectionTitle.className = "ordax-store-preview-heading";
  sectionTitle.textContent = "Estado oficial dos aplicativos";
  slot.append(sectionTitle);
  let result;
  try { result = projectNativeStorePreview(catalog.getSnapshot(), limit); }
  catch { result = { state: "unavailable", entries: [], total: 0 }; }
  slot.dataset.catalogState = result.state;
  if (result.state !== "ready") {
    const text = doc.createElement("p");
    text.textContent = t("store.status.unavailableDetail");
    slot.append(text);
    return;
  }
  if (result.total === 0) {
    const text = doc.createElement("p");
    text.textContent = "Nenhum aplicativo consta do catálogo oficial nesta sessão.";
    slot.append(text);
    return;
  }
  const list = doc.createElement("ul");
  list.className = "ordax-store-preview-list";
  for (const entry of result.entries) {
    const row = doc.createElement("li");
    row.dataset.storeEntryState = entry.state;
    const title = doc.createElement("span");
    title.textContent = entry.title;
    const detail = doc.createElement("small");
    const stateLabel = entry.updatable ? t("store.section.updates") : t("store.state." + entry.state);
    detail.textContent = stateLabel + (entry.installedVersion ? " · " + entry.installedVersion : "");
    row.append(title, detail);
    list.append(row);
  }
  slot.append(list);
  if (result.total > result.entries.length) {
    const extra = doc.createElement("p");
    extra.textContent = (result.total - result.entries.length) + " outros aplicativos no catálogo. Consulte a Loja.";
    slot.append(extra);
  }
  const note = doc.createElement("small");
  note.textContent = "Somente consulta. Instalação não comprova autorização para abrir ou executar.";
  slot.append(note);
}

export function mountNativeStoreCatalogPreview(root, catalogPort, surfaceLifecycle) {
  const catalog = assertAppStoreCatalogPort(catalogPort);
  const lifecycle = assertSurfaceRenderLifecycle(surfaceLifecycle);
  const slots = [...root.querySelectorAll("[data-native-store-catalog-preview]")];
  const render = () => {
    for (const slot of slots) renderPreview(slot, catalog, lifecycle.localization.translate);
  };
  const unsubscribeCatalog = catalog.subscribe(render);
  const unsubscribeLocale = lifecycle.localization.subscribe(render);
  render();
  return Object.freeze({
    destroy() { unsubscribeCatalog(); unsubscribeLocale(); }
  });
}
