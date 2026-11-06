import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const home = readFileSync(new URL('../system/surface/workspace/components/central/meridian-home.tsx', import.meta.url), 'utf8');

test('Meridian Home no longer presents sample projects, files, checklists or appointments as real activity', () => {
  assert.doesNotMatch(home, /Projeto Atlas|exampleFiles|Direção visual|Referências do projeto|Agenda ilustrativa|onExample\(/);
  assert.doesNotMatch(home, /role="checkbox"|Colaboração · mock|meridian-mock-badge/);
  assert.match(home, /Nenhum projeto disponível nesta sessão/);
  assert.match(home, /Arquivos ainda não conectados/);
  assert.match(home, /Nenhum compromisso disponível/);
});

test('Meridian Home preserves real destinations and selected Space context without inventing services', () => {
  for (const destination of ['Projetos', 'Arquivos', 'Atividades', 'Dispositivos', 'Loja', 'Espaços']) {
    assert.ok(home.includes(`onOpen('${destination}')`), `missing real destination ${destination}`);
  }
  assert.match(home, /authorized\.activeSpace\?\.name/);
  assert.match(home, /A Central apresenta apenas o que está disponível ou identificado como não conectado/);
});
