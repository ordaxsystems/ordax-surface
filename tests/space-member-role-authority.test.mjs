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
  assert.match(source, /const assignableRoles = actions\.assignableRoles\.filter\(role => role !== member\.role\)/);
  assert.match(source, /actions\.canChangeRole && assignableRoles\.length > 0/);
  assert.match(source, /<select value="" disabled=\{actionPending !== null\}/);
  assert.match(source, /<option value="" disabled>Escolha uma função<\/option>/);
  assert.match(source, /assignableRoles\.map\(\(role: ActionRole\) =>/);
  assert.doesNotMatch(source, /<select value=\{memberRole\}/);
  assert.match(source, /Sua função: <strong>\{roleLabels\[capability\.role\]/);
  assert.match(source, /Modo somente leitura; sem permissão para gerenciar membros/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|fetch\(/);
});
