# AGENTS — OrdaX Surface

> **Execução DEV — Evolução Rápida (regra transversal obrigatória):** aplicar a [política canônica OrdaX](https://github.com/ordaxsystems/ordax-os/blob/main/docs/DEVELOPMENT-WORKFLOW.md#regra-operacional-transversal--evolucao-rapida-dev-2026-11-04) antes de iniciar trabalho. Entregar a alteração no owner correto primeiro e validar com testes proporcionais depois; não ampliar escopo com auditorias, documentação, CI ou workflows sem causalidade. Preservar gates obrigatórios, integridade, segurança e autorização.

## Escopo e autoridade

Este repositório é o owner canônico da interface visual compartilhada após o cutover integrado em `ordax-os#2198`. O `ordax-os` continua sendo a autoridade para serviços, host Native, contratos públicos, release, atualização/rollback e ativação. O source visual é consumido por SHA exato do contrato `ordax-os/docs/contracts/surface-source.json`, não pela ponta móvel de `main`. Cutover de source não autoriza hardware físico nem Stable.

## Regras de execução

1. Localize na `main` os arquivos do pedido e eventuais PRs concorrentes relevantes. Consulte os contratos de ownership, limites de módulo e runtime do OS somente quando a mudança tocar essas fronteiras; não faça auditoria transversal para texto, CSS ou ajuste isolado.
2. Preserve histórico de autoria e proveniência dos arquivos migrados, sem reescrever nenhuma `main`.
3. Somente UI, presentation state, estilos e assets pertencem à Surface. Serviços Python, brokers, host nativo, boot, grants, storage e Supervisor pertencem ao OS ou ao owner existente.
4. O OS consome um artefato/checkout imutável verificado e fornece capabilities através dos contratos públicos existentes. Não manter cópia source espelhada nem bridge permanente.
5. Reconciliar modificações concorrentes em ambos os repositórios sem force-push; não absorver outras frentes.
6. **Validar por impacto após editar:** texto/CSS/ajuste visual isolado exige preview ou smoke específico; comportamento compartilhado exige testes existentes focados; mudança de integração Web/Native exige smoke dos modos afetados. **Não executar QEMU, rebuild de OS/USB, Supervisor ou prova física para cada mudança visual.** A adoção de novo SHA pelo OS ou promoção de release continua sujeita aos gates canônicos pertinentes ao impacto (incluindo proveniência, saúde, rollback e QEMU quando exigido); CI da Surface não equivale a promoção de release.
7. Não operar USB ou discos reais sem autorização específica.
8. Atualizar documentação canônica apenas se contrato, arquitetura, estado real ou decisão mudou. Não gerar relatório, evidência duplicada nem novo workflow para cada correção.

## Handoff

`README.md` registra o estado vigente e o procedimento de atualização; `provenance/` registra **somente** a importação histórica. Ownership e revisão operacional canônicos já são mantidos no OS em `docs/contracts/repository-ownership.json` e `docs/contracts/surface-source.json`. Não duplicar esses valores aqui, nem voltar a armazenar fonte visual no OS.
