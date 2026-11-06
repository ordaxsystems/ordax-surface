import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { storeEntryVisualState } from '../system/surface/ui/store-entry-presentation.mjs';

const read = path => readFileSync(new URL('../system/surface/' + path, import.meta.url), 'utf8');

test('Store state projection distinguishes an update, in-flight installation and a blocked candidate', () => {
  const installed = storeEntryVisualState({
    appId: 'verified', state: 'installed', updatable: true, blockedReason: null,
  });
  assert.equal(installed.state, 'installed');
  assert.equal(installed.updateAvailable, true);
  assert.equal(installed.blockedReason, null);

  const installing = storeEntryVisualState({
    appId: 'verified', state: 'installing', updatable: false, blockedReason: null,
  });
  assert.equal(installing.state, 'installing');
  assert.equal(installing.updateAvailable, false);
  assert.equal(installing.blockedReason, null);

  const blocked = storeEntryVisualState({
    appId: 'verified', state: 'blocked', updatable: false, blockedReason: 'Proveniência não verificada',
  });
  assert.equal(blocked.updateAvailable, false);
  assert.equal(blocked.blockedReason, 'Proveniência não verificada');
  assert.equal('launchAuthorized' in installed, false);
  assert.equal('installGranted' in installed, false);
});

test('Native and Web summaries display canonical version transitions and reasons but never issue lifecycle or launch commands', () => {
  const native = read('ui/native-store-catalog-preview.mjs');
  const web = read('workspace/components/store/catalog-summary.tsx');
  for (const source of [native, web]) {
    assert.match(source, /storeEntryVisualState\(entry\)/);
    assert.match(source, /visual\.updateAvailable/);
    assert.match(source, /entry\.installedVersion/);
    assert.match(source, /entry\.availableVersion/);
    assert.match(source, /visual\.blockedReason/);
    assert.doesNotMatch(source, /\.requestLifecycle\(|\.install\(|\.activate\(|onLaunch\s*=|onOpen\s*=/);
  }
  assert.match(native, /t\("store\.version\.update"/);
  assert.match(native, /t\("store\.version\.available"/);
  assert.match(native, /t\("store\.version\.installed"/);
  assert.match(native, /reason\.textContent = t\("store\.details\.blocked"\)/);
  assert.match(web, /storeAppStatusLabel\(visual\.updateAvailable \? 'update-available' : visual\.state\)/);
  assert.match(web, /Motivo do bloqueio: \{visual\.blockedReason\}/);
  assert.match(web, /O catálogo não autoriza a abertura de aplicativos/);
});
