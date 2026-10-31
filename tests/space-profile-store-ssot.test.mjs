import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('active Space apps are a read-only projection of the canonical OS and Store', () => {
  const source = read('system/surface/workspace/components/central/space-profile-apps.tsx');
  assert.match(source, /projectSpaceProfileStoreStatus/);
  assert.match(source, /useStoreCatalog/);
  assert.match(source, /useProfileCatalogReader/);
  assert.match(source, /readCatalog\(controller.signal\)/);
  assert.match(source, /controller\.abort\(\)/);
  assert.match(source, /!offline && authorized\.ready && identity\.state === 'signed-in'/);
  assert.match(source, /key={`\$\{identity.subjectId\}:\$\{active.id\}:\$\{active.profilePack \?\? ''\}`}/);
  assert.match(source, /'space-inactive'/);
  assert.match(source, /Nenhuma instalação foi presumida/);
  assert.doesNotMatch(source, /(?:fetch\(|requestLifecycle\(|\.install\(|\.activate\(|localStorage|sessionStorage|service_role)/);
});

test('Space and Profile catalog consume one shared Store status vocabulary', () => {
  const space = read('system/surface/workspace/components/central/space-profile-apps.tsx');
  const profiles = read('system/surface/workspace/components/central/profile-catalog.tsx');
  const labels = read('system/surface/workspace/components/store/app-status-labels.ts');
  assert.match(space, /storeAppStatusLabel\(app.status\)/);
  assert.match(profiles, /storeAppStatusLabel\(app.status\)/);
  for (const status of ['unknown','not-listed','installed','update-available','blocked','failed-retained','in-progress','unavailable']) {
    assert.ok(labels.includes(status), status);
  }
  assert.doesNotMatch(profiles, /\(\{ unknown: 'Estado indisponível'/);
});

test('Space app panel exists only in the account view and not in sample spaces', () => {
  const page = read('system/surface/workspace/components/central/spaces-experience.tsx');
  assert.match(page, /mode==='account'&&<>\{children\}<SpaceProfileAppsPanel\/><SpaceMembersPanel\/><\/>/);
  assert.match(page, /mode!=='examples'/);
  assert.match(page, /const \[mode,setMode\]=useState<'account'\|'examples'>\('account'\)/);
});
