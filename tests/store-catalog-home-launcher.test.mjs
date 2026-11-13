import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { projectStoreCatalogPreview, storeEntryOpenAvailable } from '../system/surface/ui/store-entry-presentation.mjs';

const source = file => readFileSync(new URL('../system/surface/' + file, import.meta.url), 'utf8');
const entry = (appId, state, installedVersion = null) => ({
  appId, title: appId, state, installedVersion, availableVersion: state === 'available' ? '1.0.0' : null,
  updatable: false, installable: state === 'available', removable: installedVersion !== null,
});

test('verified Store entries are ordered for discovery without inventing installed apps', () => {
  const verified = { state:'ready', entries:[
    entry('Z available', 'available'),
    entry('C blocked', 'blocked', '1.0.0'),
    entry('B installed', 'installed', '1.0.0'),
    entry('A staging', 'staged'),
  ] };
  const projection = projectStoreCatalogPreview(verified, 3);
  assert.equal(projection.state, 'ready');
  assert.equal(projection.total, 4);
  assert.deepEqual(projection.entries.map(e => e.appId), ['B installed', 'C blocked', 'A staging']);
  assert.equal(projection.entries[1].state, 'blocked', 'blocked remains blocked');
  assert.equal(projection.entries[2].installedVersion, null, 'staged is not installed');
  assert.equal('launchable' in projection.entries[0], false, 'read-only catalog does not create execution authority');
  assert.equal(Object.isFrozen(projection.entries), true);
  assert.throws(() => projectStoreCatalogPreview(verified, 256), /bounded/);
});

test('Store exposes Open only for retained installed lifecycle states', () => {
  for (const state of ['installed', 'blocked', 'failed-retained']) {
    assert.equal(storeEntryOpenAvailable(entry('openable', state, '1.0.0')), true, state);
  }
  assert.equal(storeEntryOpenAvailable(entry('available', 'available')), false);
  for (const state of ['updating', 'removing', 'staged']) {
    assert.equal(storeEntryOpenAvailable(entry('busy', state, '1.0.0')), false, state);
  }
  const controls = source('ui/store-overview-controls.mjs');
  assert.match(controls, /data-store-open-app/);
  assert.match(controls, /storeEntryOpenAvailable\(entry\)/);
  assert.match(controls, /activation\.publish\(\{ appId, target: null \}\)/);
});

test('Store unavailability revokes every row instead of retaining previous installations', () => {
  const stale = { state: 'unavailable', entries:[entry('old', 'installed', '1.0.0')] };
  assert.deepEqual(projectStoreCatalogPreview(stale), { state:'unavailable', total:0, entries:[] });
  assert.deepEqual(projectStoreCatalogPreview({ state:'ready', entries:[] }), { state:'ready', total:0, entries:[] });
});

test('Native Home and launcher are subscribed to the same validated Store port, never a launch bridge', () => {
  const shell = source('ui/desktop-shell.mjs');
  const windows = source('ui/store-experience.mjs');
  const preview = source('ui/native-store-catalog-preview.mjs');
  assert.match(shell, /data-native-store-catalog-preview="home"/);
  assert.match(shell, /data-native-store-catalog-preview="launcher"/);
  assert.match(windows, /mountNativeStoreCatalogPreview\(root, catalogPort, surfaceLifecycle\)/);
  assert.match(windows, /nativePreview\.destroy\(\)/);
  assert.match(preview, /assertAppStoreCatalogPort\(catalogPort\)/);
  assert.match(preview, /validateAppStoreCatalogSnapshot\(snapshot\)/);
  assert.match(preview, /catalog\.subscribe\(render\)/);
  assert.match(preview, /projectStoreCatalogPreview\(/);
  assert.doesNotMatch(preview, /\.requestLifecycle\(|\.activate\(|data-launch-app|\.install\(/);
});

test('Web Home and launcher use existing StoreCatalogProvider with no fake open action', () => {
  const summary = source('workspace/components/store/catalog-summary.tsx');
  const webLauncher = source('workspace/components/web/launcher.tsx');
  const webApps = source('workspace/components/web/pages.tsx');
  const home = source('workspace/components/central/meridian-home.tsx');
  assert.match(summary, /const snapshot = useStoreCatalog\(\)/);
  assert.match(summary, /projectStoreCatalogPreview\(snapshot, limit\)/);
  assert.match(summary, /snapshot\.state !== 'ready'/);
  assert.match(summary, /O catálogo não autoriza a abertura de aplicativos/);
  for(const p of [webLauncher,webApps,home]) assert.match(p, /<StoreCatalogSummary/);
  assert.doesNotMatch(summary, /onOpen|onLaunch|fetch\(|requestLifecycle\(|localStorage|sessionStorage/);
});
