import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../system/surface/workspace/components/central/' + path, import.meta.url), 'utf8');

test('Home selects only current authorized, active Spaces via canonical Account selection port', () => {
  const source = read('home-space-picker.tsx');
  assert.match(source, /import \{ deriveAuthorizedSpaces \} from '\.\.\/\.\.\/\.\.\/\.\.\/services\/spaces\/authorized-view\.mjs'/);
  assert.match(source, /const \{ session, identity, authorized, offline \} = useWebAccount\(\)/);
  assert.match(source, /authorized\.visibleSpaces\.filter\(space => space\.state === 'active'\)/);
  assert.match(source, /session\.surface\.getSnapshot\(\)\.connectivity === 'offline'/);
  assert.match(source, /const liveIdentity = session\.identity\.getSnapshot\(\)/);
  assert.match(source, /deriveAuthorizedSpaces\(\s*liveIdentity, session\.spaces\.getSnapshot\(\), session\.selection\.getSnapshot\(\)/);
  assert.match(source, /meridianHomeContextKey\(liveIdentity, live\.activeSpace\)/);
  assert.match(source, /meridianHomeContextKey\(identity, active\)/);
  assert.match(source, /if \(!live\.ready \|\| !authorized\.ready/);
  assert.match(source, /meridianHomeContextKey\(liveIdentity, live\.activeSpace\)/);
  assert.match(source, /const liveSpaces: typeof authorized\.visibleSpaces = live\.visibleSpaces/);
  assert.match(source, /liveSpaces\.find\(space => space\.id === spaceId && space\.state === 'active'\)/);
  assert.match(source, /session\.selection\.select\(match\.id\)/);
  assert.match(source, /session\.selection\.clear\(\)/);
  assert.doesNotMatch(source, /(?:fetch\(|localStorage|sessionStorage|indexedDB|\.save\(|\.grant\(|\.activate\()/);
});

test('Home exposes honest recovery after page reload with a manageable session-only Space selector', () => {
  const picker = read('home-space-picker.tsx');
  const home = read('meridian-home.tsx');
  const desktop = read('desktop.tsx');
  assert.match(picker, /value=\{active\?\.id \?\? ''\}/);
  assert.match(picker, /disabled=\{offline \|\| !authorized\.ready \|\| choices\.length === 0\}/);
  assert.match(picker, /Seleção nesta página; recarregar exige escolher novamente/);
  assert.match(picker, /role="alert"/);
  assert.match(picker, /onClick=\{onManage\}/);
  assert.match(home, /<HomeSpacePicker onManage=\{\(\)=>onOpen\('Espaços'\)\}\/>/);
  assert.match(desktop, /após recarregar, escolha o Space novamente/);
  assert.match(desktop, /space\.state !== 'active' \|\| authorized\.activeSpace\?\.id === space\.id/);
  assert.doesNotMatch(desktop, /Os exemplos completos continuam disponíveis acima/);
});
