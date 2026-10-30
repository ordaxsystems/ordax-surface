import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuraConversationStore } from '../system/surface/workspace/lib/intelligence/conversation.mjs';

const response = text => ({ text, engineId: 'local-cpu', modelId: 'test-model' });

test('Aura conversation preserves completed turns in order and notifies subscribers', () => {
  const session = createAuraConversationStore();
  let notifications = 0;
  const release = session.subscribe(() => { notifications++; });
  const initial = session.getSnapshot();
  assert.equal(initial.length, 0);
  session.record('Primeiro?', response('Primeira resposta.'));
  session.record('E depois?', response('Segunda resposta.'));
  assert.equal(notifications, 2);
  assert.deepEqual(session.getSnapshot().map(turn => turn.prompt), ['Primeiro?', 'E depois?']);
  assert.notStrictEqual(session.getSnapshot(), initial);
  const context = session.context();
  assert.deepEqual(context.map(item => item.scope), ['user', 'document', 'user', 'document']);
  assert.ok(context[0].text.includes('Primeiro?'));
  assert.ok(context[1].text.includes('Primeira resposta.'));
  assert.ok(context[2].text.includes('E depois?'));
  release();
  session.clear();
  assert.equal(notifications, 2);
  assert.equal(session.getSnapshot().length, 0);
  assert.deepEqual(session.context(), []);
});

test('Aura context is bounded; invalid and unconfirmed answers never enter history', () => {
  const session = createAuraConversationStore();
  assert.throws(() => session.record('x', { text: '' }), /response/);
  assert.throws(() => session.record('', response('x')), /prompt/);
  assert.equal(session.getSnapshot().length, 0);
  for (let i = 0; i < 15; i++) session.record('P' + i + ' '.repeat(4000), response('R' + i + 'z'.repeat(9000)));
  assert.equal(session.getSnapshot().length, 8);
  assert.deepEqual(session.getSnapshot().map(turn => turn.id), [8, 9, 10, 11, 12, 13, 14, 15]);
  const context = session.context();
  assert.equal(context.length, 8);
  assert.equal(context[0].id, 'aura-turn-12-user');
  assert.equal(context.at(-1).id, 'aura-turn-15-reply');
  assert.ok(context.every(item => item.text.length < 2500));
  assert.ok(Object.isFrozen(context));
  assert.ok(Object.isFrozen(session.getSnapshot()));
});

test('Aura transcripts are isolated per client and can be reset', () => {
  const first = createAuraConversationStore(), second = createAuraConversationStore();
  first.record('Confidencial', response('Resposta local'));
  assert.equal(second.getSnapshot().length, 0);
  assert.equal(second.context().length, 0);
  first.clear();
  assert.equal(first.context().length, 0);
});

test('Aura UI uses the canonical client and never creates another provider/persistence', async () => {
  const { readFile } = await import('node:fs/promises');
  const root = new URL('../system/surface/workspace/', import.meta.url);
  const client = await readFile(new URL('lib/intelligence/client.mjs', root), 'utf8');
  const provider = await readFile(new URL('components/intelligence/client-context.tsx', root), 'utf8');
  const app = await readFile(new URL('components/intelligence/aura-content.tsx', root), 'utf8');
  assert.match(client, /context,\s*maxTokens/);
  assert.match(app, /conversation\.record\(normalized, response\)/);
  assert.match(app, /conversation\.context\(\)/);
  assert.match(app, /snapshot\.state === 'busy'/);
  assert.match(app, /snapshot\.state === 'error'/);
  assert.match(app, /snapshot\.state !== 'degraded'/);
  assert.match(app, /requestGeneration\.current\+\+/);
  assert.match(provider, /createAuraConversationStore\(\)/);
  assert.doesNotMatch(client + provider + app, /new WebSocket|localStorage|sessionStorage|llama-server|apiKey/);
});
