# AGENTS — OrdaX Surface

## Escopo e autoridade

Este repositório é o owner canônico da interface visual compartilhada após o cutover integrado em `ordax-os#2198`. O `ordax-os` continua sendo a autoridade para serviços, host Native, contratos públicos, release, atualização/rollback e ativação. O source visual é consumido por SHA exato do contrato `ordax-os/docs/contracts/surface-source.json`, não pela ponta móvel de `main`. Cutover de source não autoriza hardware físico nem Stable.

## Regras de execução

1. Verifique a `main`, PRs relevantes dos repositórios `ordax-surface` e `ordax-os` e os contratos `docs/contracts/repository-ownership.json`, `docs/contracts/module-boundaries.json` e `docs/contracts/runtime-configuration.json` no OS.
2. Preserve histórico de autoria e proveniência dos arquivos migrados, sem reescrever nenhuma `main`.
3. Somente UI, presentation state, estilos e assets pertencem à Surface. Serviços Python, brokers, host nativo, boot, grants, storage e Supervisor pertencem ao OS ou ao owner existente.
4. O OS consome um artefato/checkout imutável verificado e fornece capabilities através dos contratos públicos existentes. Não manter cópia source espelhada nem bridge permanente.
5. Reconciliar modificações concorrentes em ambos os repositórios sem force-push; não absorver outras frentes.
6. Para cada mudança visual, provar integração Web e Native com o host atual do OS, mantendo a proveniência histórica imutável. Qualquer novo SHA adotado pelo OS passa pelos gates canônicos de build/proveniência, QEMU, saúde do Supervisor e rollback/known-good; CI da Surface não equivale a promoção de release.
7. Não operar USB ou discos reais sem autorização específica.
8. Documentar baseline, evidências, decisões, merges e pendências nos owners correspondentes.

## Handoff

`README.md` registra o estado vigente e o procedimento de atualização; `provenance/` registra **somente** a importação histórica. Ownership e revisão operacional canônicos já são mantidos no OS em `docs/contracts/repository-ownership.json` e `docs/contracts/surface-source.json`. Não duplicar esses valores aqui, nem voltar a armazenar fonte visual no OS.
