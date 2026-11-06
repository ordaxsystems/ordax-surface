import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL('../system/surface/' + path, import.meta.url), 'utf8');

test('Web Store catalog rows are revoked on signed-out, unavailable Account and offline context', () => {
  const summary = read('workspace/components/store/catalog-summary.tsx');
  assert.match(summary, /const snapshot = useStoreCatalog\(\)/);
  assert.match(summary, /const \{ identity, offline \} = useWebAccount\(\)/);
  const guard = summary.indexOf("if (identity.state !== 'signed-in' || offline)");
  const rows = summary.indexOf('projectStoreCatalogPreview(snapshot, limit)');
  assert.ok(guard > 0 && rows > guard, 'Account/session guard must precede verified catalog projection');
  assert.match(summary, /identity.state === 'signed-out' \? 'Sessão encerrada/);
  assert.match(summary, /O serviço de Conta OrdaX está indisponível/);
  assert.match(summary, /Sem conexão/);
  assert.match(summary, /data-store-session-state=\{offline \? 'offline' : identity.state\}/);
  assert.doesNotMatch(summary, /requestLifecycle\(|localStorage|sessionStorage|fetch\(/);
});

test('Store UI unmounts session-scoped controls and uncertain request receipts on Account loss or owner change', () => {
  const web = read('workspace/components/store/meridian-store.tsx');
  assert.match(web, /const \{ identity, offline \} = useWebAccount\(\)/);
  assert.match(web, /if \(identity.state !== 'signed-in' \|\| offline\)/);
  assert.match(web, /return <AuthenticatedStoreExperience key=\{identity.subjectId\}\/>/);
  assert.match(web, /function AuthenticatedStoreExperience\(\)/);
  assert.match(web, /const store = mountStoreExperience\(/);
  assert.match(web, /return \(\) => \{ store.destroy\(\); instance.current = null; localization.dispose\(\); \}/);
  assert.match(web, /Sessão encerrada/);
  assert.match(web, /sem conexão/);
  assert.doesNotMatch(web, /localStorage|sessionStorage|requestLifecycle\(|\.install\(/);
});

test('Spaces discards prior owner/Space query and error state, without new persistence or selection authority', () => {
  const desktop = read('workspace/components/central/desktop.tsx');
  assert.match(desktop, /export function SpacesPanel\(\) \{\s*const \{ identity, catalog, authorized \} = useWebAccount\(\)/);
  assert.match(desktop, /const scopeKey = JSON.stringify\(\[/);
  assert.match(desktop, /identity.state, identity.subjectId, catalog.state, authorized.ready/);
  assert.match(desktop, /authorized.activeSpace\?\.id \?\? null/);
  assert.match(desktop, /return <ScopedSpacesPanel key=\{scopeKey\}\/>/);
  const scoped = desktop.slice(desktop.indexOf('function ScopedSpacesPanel()'));
  assert.match(scoped, /const \[error, setError\] = useState<string \| null>\(null\)/);
  assert.match(scoped, /const \[query, setQuery\] = useState\(''\)/);
  assert.match(scoped, /session.selection.select\(id\)/);
  assert.doesNotMatch(scoped, /localStorage|sessionStorage/);
});
