import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../system/surface/workspace/components/central/primitives.tsx', import.meta.url), 'utf8');

test('Account pending requests and notices reset before rendering another subject/session', () => {
  assert.match(source, /export function AccountPanel\(/);
  assert.match(source, /const \{ identity, offline \} = useWebAccount\(\)/);
  assert.match(source, /const sessionKey = JSON\.stringify\(\[identity\.state, identity\.subjectId, offline\]\)/);
  assert.match(source, /return <ScopedAccountPanel key=\{sessionKey\} onOpen=\{onOpen\}\/>/);
  assert.match(source, /function ScopedAccountPanel\(/);
  const scoped = source.slice(source.indexOf('function ScopedAccountPanel('));
  assert.match(scoped, /const \[pending, setPending\] = useState\(false\)/);
  assert.match(scoped, /const inFlight = useRef\(false\)/);
  assert.match(scoped, /const \[error, setError\] = useState<string \| null>\(null\)/);
  assert.match(scoped, /if \(mounted\.current\) setError/);
  assert.match(scoped, /if \(mounted\.current\) setPending\(false\)/);
});

test('Account commands recheck fresh Identity and supported actions before delegation', () => {
  const scoped = source.slice(source.indexOf('function ScopedAccountPanel('));
  const performer = scoped.slice(scoped.indexOf('async function perform('), scoped.indexOf('  return <Panel title="Minha conta"'));
  assert.match(performer, /session\.surface\.getSnapshot\(\)\.connectivity === 'offline'/);
  assert.match(performer, /const liveIdentity = session\.identity\.getSnapshot\(\)/);
  assert.match(performer, /session\.actions\.getSnapshot\(\)\.supportedActions\.includes\(action\)/);
  assert.match(performer, /const expectedState = action === 'sign-out' \? 'signed-in' : 'signed-out'/);
  assert.match(performer, /liveIdentity\.state !== expectedState/);
  assert.match(performer, /liveIdentity\.subjectId !== identity\.subjectId/);
  assert.ok(performer.indexOf('const liveIdentity') < performer.indexOf('session.actions.execute(action)'));
  assert.match(performer, /O estado da conta mudou\. Atualize a conexão/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|fetch\(|requestLifecycle\(/);
});

test('Account distinguishes ended session, unavailable identity and unverified Space while preserving recovery', () => {
  assert.match(source, /identity\.state === "signed-out" \? "Sessão encerrada" : "Serviço de conta indisponível"/);
  assert.match(source, /catalog\.state === 'error' \? 'Serviço de Spaces indisponível' : 'Acesso ao Space não confirmado'/);
  assert.match(source, /identity\.state === 'signed-out' && <Button disabled=\{pending \|\| offline \|\| !actions\.supportedActions\.includes\('sign-in'\)/);
  assert.match(source, /identity\.state === 'signed-in' && actions\.supportedActions\.includes\('sign-out'\)/);
  assert.match(source, /onClick=\{\(\) => void perform\(\)\}/);
  assert.match(source, /await session\.refresh\(\)/);
});
