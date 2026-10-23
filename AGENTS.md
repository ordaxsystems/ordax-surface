# AGENTS — OrdaX Surface

## Escopo e autoridade

Este repositório possui o source da interface compartilhada após o cutover validado. Durante a migração, não confundir código importado/staged com fonte executável já promovida. O repositório `ordax-os` ainda é a autoridade para serviços, OS runtime, contratos públicos e distribuição até a integração completa.

## Regras de execução

1. Verifique a `main`, PRs relevantes dos repositórios `ordax-surface` e `ordax-os` e os contratos `docs/contracts/repository-ownership.json`, `docs/contracts/module-boundaries.json` e `docs/contracts/runtime-configuration.json` no OS.
2. Preserve histórico de autoria e proveniência dos arquivos migrados, sem reescrever nenhuma `main`.
3. Somente UI, presentation state, estilos e assets pertencem à Surface. Serviços Python, brokers, host nativo, boot, grants, storage e Supervisor pertencem ao OS ou ao owner existente.
4. O OS consome um artefato/checkout imutável verificado e fornece capabilities através dos contratos públicos existentes. Não manter cópia source espelhada nem bridge permanente.
5. Reconciliar modificações concorrentes em ambos os repositórios sem force-push; não absorver outras frentes.
6. Antes de retirar o source visual do OS, comprovar Web, Native, QEMU, build/proveniência, saúde do Supervisor e rollback/known-good.
7. Não operar USB ou discos reais sem autorização específica.
8. Documentar baseline, evidências, decisões, merges e pendências nos owners correspondentes.

## Handoff

`README.md` registra o estado da migração; `provenance/` registra a importação inicial. O contrato de ownership canônico continuará no OS e será atualizado no mesmo conjunto de alterações do cutover, nunca antecipadamente.
