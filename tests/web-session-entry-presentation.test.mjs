import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = '../system/surface/workspace/';
const read = path => readFileSync(new URL(root + path, import.meta.url), 'utf8');

test('Web workspace starts without fabricated running apps or pinned installations', () => {
  const windows = read('lib/web/windows.ts');
  const workspace = read('lib/web/workspace.ts');
  assert.match(windows, /export const initialWindows: WindowState\[\] = \[\];/);
  assert.match(workspace, /favorites: webWorkspaceEntries\.map\(app => app\.id\)/);
  assert.doesNotMatch(workspace, /favorites: \['files'|favorites: \['studio'/);
});

test('Home, launcher, app page and sidebar use one session UI projection', () => {
  const model = read('lib/web/model.ts');
  const home = read('components/web/home.tsx');
  const launcher = read('components/web/launcher.tsx');
  const pages = read('components/web/pages.tsx');
  const nav = read('components/web/navigation.tsx');
  assert.match(model, /export const webWorkspaceEntries = webApps\.filter\(/);
  assert.match(model, /app\.id === 'internet' \|\| app\.id === 'settings' \|\| app\.id === 'store'/);
  for (const [name, source] of [['Home', home], ['launcher', launcher], ['app page', pages], ['navigation', nav]]) {
    assert.match(source, /webWorkspaceEntries\.(?:map|filter)\(/, name + ' must consume shared session entries');
    assert.doesNotMatch(source, /\['studio', 'files'|\['studio', 'files', 'notes'|\['studio', 'files', 'internet'/, name + ' must not present demo installations');
  }
  assert.match(launcher, /A Loja informa quando o catálogo oficial estiver indisponível/);
  assert.match(home, /aria-label="Recursos do ambiente"/);
  assert.match(pages, /nenhuma instalação presumida/);
});
