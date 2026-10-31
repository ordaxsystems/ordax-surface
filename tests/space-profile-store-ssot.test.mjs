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

test('Space composition uses the shared Store status vocabulary, without a second Profile screen', () => {
  const space = read('system/surface/workspace/components/central/space-profile-apps.tsx');
  const labels = read('system/surface/workspace/components/store/app-status-labels.ts');
  assert.match(space, /storeAppStatusLabel\(app.status\)/);
  for (const status of ['unknown','not-listed','installed','update-available','blocked','failed-retained','in-progress','unavailable']) {
    assert.ok(labels.includes(status), status);
  }
});

test('Space app panel exists only in the account view and not in sample spaces', () => {
  const page = read('system/surface/workspace/components/central/spaces-experience.tsx');
  assert.match(page, /mode==='account'&&<>\{children\}<SpaceProfileAppsPanel\/><SpaceMembersPanel\/><\/>/);
  assert.match(page, /mode!=='examples'/);
  assert.match(page, /const \[mode,setMode\]=useState<'account'\|'examples'>\('account'\)/);
});

test("Spaces is the sole user-facing destination for Profile composition in Native and Meridian", async () => {
  const fs = await import("node:fs/promises");
  const [account, desktop, home, profileApps] = await Promise.all([
    fs.readFile(new URL("../system/surface/ui/account-overview-controls.mjs", import.meta.url), "utf8"),
    fs.readFile(new URL("../system/surface/workspace/components/central/desktop.tsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../system/surface/workspace/components/central/meridian-home.tsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../system/surface/workspace/components/central/space-profile-apps.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(account, /id: "profiles", messageId:/);
  assert.match(account, /const initialTarget = lifecycle.getAppTarget\("account"\)/);
  assert.match(account, /renderProfiles\(advanced\)/);
  assert.match(account, /createDesktopSpaceCreatePort\(desktopWindow, sessionPort\)/);
  assert.match(account, /spaceCreatePort\.create\(intent\)/);
  assert.match(account, /await spacesPort\.refresh\(\)/);
  assert.match(account, /authorized\.visibleSpaces\.find\(space =>/);
  assert.match(account, /spaceCreatePort\?\.dispose\(\)/);
  assert.doesNotMatch(desktop, /ProfileCatalogPanel|title === 'Perfis profissionais'/);
  assert.doesNotMatch(home, /name:'Perfis profissionais'/);
  assert.match(home, /target:'Espaços'/);
  assert.match(profileApps, /export function SpaceProfileAppsPanel/);
});
