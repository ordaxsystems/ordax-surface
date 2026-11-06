import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../system/surface/workspace/components/central/space-members-panel.tsx', import.meta.url), 'utf8');

test('member action eligibility excludes role no-ops and unauthorized candidates', () => {
  const validator = source.slice(source.indexOf('function isProjectedActionAllowed('), source.indexOf('export function SpaceMembersPanel()'));
  assert.match(validator, /role !== undefined && role !== member\.role/);
  assert.match(validator, /member\.actions\.canChangeRole && member\.actions\.assignableRoles\.includes\(role\)/);
  assert.match(validator, /return member\.actions\.canRemove;/);
});

test('Space management is fail closed when actor differs, was suspended, or the selected Space was revoked', () => {
  const runAction = source.slice(source.indexOf('async function runAction('), source.indexOf('// A lost connection is not a sign-out'));
  assert.match(runAction, /authorized\.activeSpace\?\.id !== spaceId/);
  assert.match(runAction, /capabilityState !== 'ready'/);
  assert.match(runAction, /capability\?\.spaceId !== spaceId \|\| capability\.userId !== subjectId/);
  assert.match(runAction, /capability\.state !== 'active' \|\| !capability\.canManageMembers/);
  assert.match(runAction, /!isProjectedActionAllowed\(member, action, role\)/);
  assert.match(source, /const capabilityCurrent = capabilityState === 'ready' && capability\?\.spaceId === spaceId/);
  assert.match(source, /capability\.userId === subjectId && identity\.state === 'signed-in' && !offline/);
  assert.match(source, /const canManageMembers = capabilityCurrent && capability\.state === 'active'/);
  assert.match(source, /Não foi possível validar suas permissões para esta conta e Space/);
});

test('role change selector reflects only actual changes allowed by server, never a foreign current role', () => {
  assert.match(source, /const assignableRoles = actions\.assignableRoles\.filter\(\(role: ActionRole\) => role !== member\.role\)/);
  assert.match(source, /actions\.canChangeRole && assignableRoles\.length > 0/);
  assert.match(source, /<select value="" disabled=\{actionPending !== null\}/);
  assert.match(source, /<option value="" disabled>Escolha uma função<\/option>/);
  assert.match(source, /assignableRoles\.map\(\(role: ActionRole\) =>/);
  assert.doesNotMatch(source, /<select value=\{memberRole\}/);
  assert.match(source, /Sua função: <strong>\{roleLabels\[capability\.role\]/);
  assert.match(source, /Modo somente leitura; sem permissão para gerenciar membros/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|fetch\(/);
});

test('member mutations revalidate official actor capability before recording any attempt or sending writes', () => {
  const flow = source.slice(source.indexOf('async function runAction('), source.indexOf('// A lost connection is not a sign-out'));
  const read = flow.indexOf('const verified = await actorCapability.read({ spaceId })');
  const attempt = flow.indexOf('const attempt = attempts.current.begin(');
  const mutation = flow.indexOf('await membershipActions.changeMemberRole(');
  assert.ok(read > 0 && attempt > read && mutation > attempt, 'authorization read must precede idempotency and mutation');
  assert.match(flow, /if \(!isCurrent\(\)\) return;/);
  assert.match(flow, /verified\.spaceId !== spaceId \|\| verified\.userId !== subjectId/);
  assert.match(flow, /verified\.state !== 'active' \|\| !verified\.canManageMembers/);
  assert.match(flow, /setCapability\(verified\)/);
  assert.match(flow, /setCapabilityState\('ready'\)/);
  assert.match(flow, /A permissão de gerenciar membros foi revogada ou suspensa\. Nenhuma alteração foi enviada/);
  assert.match(flow, /Não foi possível confirmar a permissão da conta atual\. Nenhuma alteração foi enviada/);
  assert.match(flow, /if \(!mutationStarted\) \{\s*setCapability\(null\);\s*setCapabilityState\('error'\)/);
  assert.match(flow, /Não foi possível revalidar suas permissões\. Nenhuma alteração foi enviada/);
  assert.match(flow, /mutationStarted = true/);
  assert.match(flow, /current\.actorCapability === actorCapability/);
  assert.match(flow, /attempt\.confirm\(\)/);
  assert.doesNotMatch(flow, /fetch\(|localStorage|sessionStorage/);
});
