# AGENTS — OrdaX Surface

> **Execução DEV — Evolução Rápida (regra transversal obrigatória):** aplicar a [política canônica OrdaX](https://github.com/ordaxsystems/ordax-os/blob/main/docs/DEVELOPMENT-WORKFLOW.md#regra-operacional-transversal--evolucao-rapida-dev-2026-11-04) antes de iniciar trabalho. Entregar a alteração no owner correto primeiro e validar com testes proporcionais depois; não ampliar escopo com auditorias, documentação, CI ou workflows sem causalidade. Preservar gates obrigatórios, integridade, segurança e autorização.

## Integração canônica no produto — 13/11/2026

A Surface é **producer da apresentação visual compartilhada**. Ela não integra Desktop, Creator, Runtime ou Apps por source. A composição Native pertence ao `ordax-os`.

- A revisão visual adotada pelo produto é fixada uma única vez pelo lock `ordax-os/docs/contracts/surface-source.json`.
- Desktop consome a composição OrdaX/OS; não deve manter um segundo pin da Surface.
- Creator consome mídia OrdaX verificada; não conhece source da Surface.
- Apps chegam à UI por catálogo/ports/lifecycle, nunca por cópia de código.
- Mudança visual compatível pode ser implementada, testada e integrada aqui sem abrir PR nos consumidores. O OS adota nova revisão somente quando houver intenção real de compor um novo candidato.
- Não disparar kernel/USB/QEMU/Creator por alteração visual sem dependência causal.

Regra transversal: [`ordax-os/docs/DEVELOPMENT-WORKFLOW.md`](https://github.com/ordaxsystems/ordax-os/blob/main/docs/DEVELOPMENT-WORKFLOW.md#integração-multi-repositório--composição-do-produto-2026-11-13), ADR-031.

## Escopo e autoridade

Este repositório é o owner canônico da interface visual compartilhada após o cutover integrado em `ordax-os#2198`. O `ordax-os` continua sendo a autoridade para serviços, host Native, contratos públicos, release, atualização/rollback e ativação. O source visual é consumido por SHA exato do contrato `ordax-os/docs/contracts/surface-source.json`, não pela ponta móvel de `main`. Cutover de source não autoriza hardware físico nem Stable.

## Regras de execução

1. Localize na `main` os arquivos do pedido e eventuais PRs concorrentes relevantes. Consulte os contratos de ownership, limites de módulo e runtime do OS somente quando a mudança tocar essas fronteiras; não faça auditoria transversal para texto, CSS ou ajuste isolado.
2. Preserve histórico de autoria e proveniência dos arquivos migrados, sem reescrever nenhuma `main`.
3. Somente UI, presentation state, estilos e assets pertencem à Surface. Serviços Python, brokers, host nativo, boot, grants, storage e Supervisor pertencem ao OS ou ao owner existente.
4. O OS consome um artefato/checkout imutável verificado e fornece capabilities através dos contratos públicos existentes. Não manter cópia source espelhada nem bridge permanente.
5. Alterações locais da Surface não exigem reconciliação do OS. Somente ao adotar uma nova revisão visual no produto, revalidar o lock/composição contra a `main` atual do OS; não absorver outras frentes nem sincronizar branches por rotina.
6. **Validar por impacto após editar:** texto/CSS/ajuste visual isolado exige preview ou smoke específico; comportamento compartilhado exige testes existentes focados; mudança de integração Web/Native exige smoke dos modos afetados. **Não executar QEMU, rebuild de OS/USB, Supervisor ou prova física para cada mudança visual.** A adoção de novo SHA pelo OS ou promoção de release continua sujeita aos gates canônicos pertinentes ao impacto (incluindo proveniência, saúde, rollback e QEMU quando exigido); CI da Surface não equivale a promoção de release.
7. Não operar USB ou discos reais sem autorização específica.
8. Atualizar documentação canônica apenas se contrato, arquitetura, estado real ou decisão mudou. Não gerar relatório, evidência duplicada nem novo workflow para cada correção.

## Continuidade UI Aura/Fabric/MCP — 04/11/2026

**Se a tarefa for capacidades ou controle pela Aura:** ler o
[`INTELLIGENCE-HANDOFF.md` do OS](https://github.com/ordaxsystems/ordax-os/blob/main/INTELLIGENCE-HANDOFF.md)
e a [matriz do Capability Fabric](https://github.com/ordaxsystems/ordax-os/blob/main/docs/CAPABILITY-FABRIC.md),
verificando PRs/HEAD atuais. A Surface **apresenta** os ports
reais do OS: estado de app/ações declaradas, permissões ou
indisponibilidade derivadas. Nunca cria segundo catálogo
`fabric.json`, executor, token de MCP, verificador de instalação
ou grant na UI. `activeAppId` visual **não** prova app instalado
nem autorização de ação.

**Já concluído em outro owner:** a missão [Platform #291](https://github.com/ordaxsystems/ordax-platform/issues/291)
de MCP no Windows físico e limpeza dos devices DEV foi fechada;
não repeti-la como funcionalidade Surface. **Pendente:** a
[OS #2400](https://github.com/ordaxsystems/ordax-os/pull/2400)
ainda precisa integrar sua ponte Native Product; o port read-only
para Store `CURRENT` e E2E de Aura/MCP não estão homologados.
Exibir `unavailable`/não autorizado de forma honesta; não
habilitar controle mouse/teclado global só porque o app possui
botão. Quando o OS publicar um port funcional, a Surface fará
somente a apresentação/consentimento e teste visual
correspondentes, sem transportar o novo serviço para este repo.

## Handoff

`README.md` registra o estado vigente e o procedimento de atualização; `provenance/` registra **somente** a importação histórica. Ownership e revisão operacional canônicos já são mantidos no OS em `docs/contracts/repository-ownership.json` e `docs/contracts/surface-source.json`. Não duplicar esses valores aqui, nem voltar a armazenar fonte visual no OS.
