import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = await readFile(
  new URL("../system/surface/ui/surface.mjs", import.meta.url), "utf8",
);
function extract(start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, "missing canonical source: " + start);
  return source.slice(first, last);
}

const predicateCode = extract(
  "function isConnectivityOnlyHostUpdate(", "function areaLabel(",
);

test("host-only network updates bypass full render only when the ordered grants remain identical", () => {
  const onlyConnectivity = runInNewContext(predicateCode + "\nisConnectivityOnlyHostUpdate");
  const before = { connectivity: "online", capabilityIds: ["network.status", "network.manage"] };
  const changed = (connectivity, capabilityIds) => ({ connectivity, capabilityIds });
  assert.equal(onlyConnectivity({ type: "host.snapshot" }, before,
    changed("offline", [...before.capabilityIds])), true);
  assert.equal(onlyConnectivity({ type: "host.snapshot" }, before,
    changed("online", [...before.capabilityIds])), false, "identical network is not an event to paint");
  assert.equal(onlyConnectivity({ type: "host.snapshot" }, before,
    changed("offline", ["network.manage", "network.status"])), false, "reordered grants force full reconciliation");
  assert.equal(onlyConnectivity({ type: "host.snapshot" }, before,
    changed("offline", ["network.status"])), false, "revoked grant forces full reconciliation");
  assert.equal(onlyConnectivity({ type: "host.snapshot" }, before,
    changed("offline", [...before.capabilityIds, "new.grant"])), false, "new grant forces full reconciliation");
  assert.equal(onlyConnectivity({ type: "preference.set" }, before,
    changed("offline", [...before.capabilityIds])), false, "other actions never use host shortcut");
  assert.equal(onlyConnectivity(null, before,
    changed("offline", [...before.capabilityIds])), false, "manual paint remains full");
});

class Tracked {
  constructor(text = "") {
    this._text = text;
    this.textWrites = 0;
    this.dataset = {};
    this.title = "";
    this.titleWrites = 0;
    this.stateWrites = 0;
  }
  get textContent() { return this._text; }
  set textContent(value) { this.textWrites++; this._text = value; }
}
function makeContext() {
  const tray = new Tracked();
  const textNode = new Tracked();
  const icon = new Tracked();
  const badgeA = new Tracked("online");
  const badgeB = new Tracked("online");
  const nonNetworkPanel = new Tracked("unrelated");
  const selectors = {
    "[data-connectivity-tray]": tray,
    "[data-connectivity-label]": textNode,
    "[data-connectivity-icon]": icon,
  };
  const state = { connectivity: "offline", capabilityIds: ["network.status"] };
  let locale = "pt-BR", notifications = 0, panelQueries = 0;
  const context = {
    state,
    root: { querySelector: selector => {
      assert.ok(selectors[selector], "unknown network selector: " + selector);
      return selectors[selector];
    }},
    windowLayer: { querySelectorAll: selector => {
      assert.equal(selector, '[data-surface-panel-kind="connectivity"] .ordax-inline-status');
      panelQueries++;
      return [badgeA, badgeB];
    }},
    localization: { translate: (key, params) => locale + ":" + key + (params?.status ? ":" + params.status : "") },
    CONNECTIVITY_MESSAGE_IDS: {
      online: "surface.connectivity.online", offline: "surface.connectivity.offline",
      unknown: "surface.connectivity.unknown",
    },
    syncText(node, value) { if (node && node.textContent !== value) node.textContent = value; },
    syncDataset(node, key, value) {
      if (node.dataset[key] !== String(value)) {
        node.dataset[key] = String(value);
        node.stateWrites++;
      }
    },
    renderListeners: new Set([() => { notifications++; }]),
  };
  const render = runInNewContext(
    extract("  const syncConnectivityPresentation = () => {",
      "  const render = (action = null, previousLocale = null, previousActiveWindowId = null) => {")
    + "\nrenderConnectivityOnly",
    context,
  );
  return {
    state, tray, textNode, icon, badgeA, badgeB, nonNetworkPanel, render,
    setLocale(next) { locale = next; },
    get notifications() { return notifications; },
    get panelQueries() { return panelQueries; },
  };
}

test("narrow status render updates mounted panels, preserves Native network ownership and notifies extensions", () => {
  const h = makeContext();
  h.render();
  assert.equal(h.icon.dataset.state, "offline");
  assert.equal(h.textNode.textContent, "pt-BR:surface.connectivity.offline");
  assert.equal(h.badgeA.textContent, "pt-BR:surface.connectivity.offline");
  assert.equal(h.badgeB.dataset.state, "offline");
  assert.equal(h.nonNetworkPanel.textContent, "unrelated");
  assert.equal(h.notifications, 1, "host extensions receive a real connectivity update");
  const writes = [h.badgeA.textWrites, h.badgeB.textWrites, h.textNode.textWrites];
  h.render();
  assert.deepEqual([h.badgeA.textWrites, h.badgeB.textWrites, h.textNode.textWrites], writes,
    "identical presentation does not rewrite mounted network badges");
  h.tray.dataset.networkDetailOwner = "true";
  h.textNode.textContent = "Native: Wi-Fi";
  h.icon.dataset.state = "native";
  h.state.connectivity = "online";
  h.render();
  assert.equal(h.textNode.textContent, "Native: Wi-Fi", "Native network label remains authoritative");
  assert.equal(h.icon.dataset.state, "native", "Native signal icon remains authoritative");
  assert.equal(h.badgeA.textContent, "pt-BR:surface.connectivity.online",
    "Surface connectivity panels still receive host updates");
  h.setLocale("en-US");
  h.render();
  assert.equal(h.badgeA.textContent, "en-US:surface.connectivity.online");
  assert.equal(h.notifications, 4);
  assert.equal(h.panelQueries, 4);
});

test("dispatch routes validated host changes by capability equality and retains all other render paths", () => {
  const callbacks = [];
  const initial = { connectivity: "online", capabilityIds: ["network.status"], preferences: {} };
  const context = {
    state: initial,
    catalog: {},
    localization: { getLocale: () => "pt-BR" },
    preferencePersistence: { save() { callbacks.push("save"); } },
    preferenceListeners: new Set(),
    preferenceDispatching: false,
    workspacePort: null,
    WORKSPACE_PERSIST_ACTIONS: new Set(),
    getActiveArea: () => ({ activeWindowId: null }),
    reduceSurfaceState(previous, action) {
      if (action.type !== "host.snapshot") return { ...previous, other: action.type };
      const snapshot = action.snapshot;
      const equal = previous.connectivity === snapshot.connectivity
        && previous.capabilityIds.length === snapshot.capabilityIds.length
        && previous.capabilityIds.every((id, index) => id === snapshot.capabilityIds[index]);
      return equal ? previous : { ...previous, ...snapshot };
    },
    renderConnectivityOnly: () => callbacks.push("connectivity"),
    render: () => callbacks.push("full"),
  };
  const dispatch = runInNewContext([
    predicateCode,
    extract("  const dispatch = (action) => {", "  let launcherOpener = null;"),
    "\ndispatch",
  ].join("\n"), context);
  dispatch({ type: "host.snapshot", snapshot: { connectivity: "offline", capabilityIds: ["network.status"] } });
  assert.deepEqual(callbacks, ["connectivity"]);
  dispatch({ type: "host.snapshot", snapshot: { connectivity: "offline", capabilityIds: ["network.status"] } });
  assert.deepEqual(callbacks, ["connectivity"], "unchanged host observation never renders");
  dispatch({ type: "host.snapshot", snapshot: { connectivity: "online", capabilityIds: [] } });
  assert.deepEqual(callbacks, ["connectivity", "full"], "revocation restores full security reconciliation");
  dispatch({ type: "app.catalog.sync" });
  assert.deepEqual(callbacks, ["connectivity", "full", "full"]);
});
