# OrdaX Surface

**Repositório canônico da apresentação compartilhada** do OrdaX (Web, Desktop, USB e Native). O source visual pertence a este repositório; o host, os serviços e a distribuição do sistema operacional pertencem ao `ordaxsystems/ordax-os`.

## Estado da separação

**Cutover de source concluído no OS, sem promoção física ou Stable.**

- A [PR `ordax-os#2198`](https://github.com/ordaxsystems/ordax-os/pull/2198) retirou os 157 arquivos visuais antes rastreados em `ordax-os/system/surface/ui/` e `ordax-os/system/surface/workspace/`, preservando o host Native e os serviços.
- A [PR `ordax-os#2209`](https://github.com/ordaxsystems/ordax-os/pull/2209) completou a hidratação do source visual exato nos workflows adicionais de verificação. O material visual é montado em checkouts/staging descartáveis; **não** é reintroduzido no Git do OS.
- O **único lock operacional** de repositório, revisão e estado de ativação está em [`ordax-os/docs/contracts/surface-source.json`](https://github.com/ordaxsystems/ordax-os/blob/main/docs/contracts/surface-source.json). Não copiar SHA operacional para este README: atualizações visuais exigem alterar o lock canônico em PR própria no OS, com validações.
- O [registro detalhado de migração e rollback](https://github.com/ordaxsystems/ordax-os/blob/main/docs/SURFACE-REPOSITORY-MIGRATION.md) pertence ao OS. A prova QEMU do primeiro boot offline **não** substitui a homologação em hardware real nem autoriza Stable ou gravação física.

## Limites de ownership

- **Surface:** UI, estado de apresentação, design tokens, estilos, recursos gráficos, layout e testes visuais em `system/surface/ui/` e `system/surface/workspace/`.
- **OrdaX OS:** boot, Supervisor, recovery, WebKit/Cage/host, composições Native/Web, serviços, identidade, autorizações, domínio e contratos públicos.
- **OrdaX Apps:** código dos aplicativos removíveis e os respectivos dados.
- **OrdaX Platform/Runtime:** suas autoridades e integrações remotas, conforme contratos próprios.

A UI recebe capacidades por ports/contratos públicos do OS. Não adicionar adapters concretos, backend, serviços ou um segundo canal de atualização neste repositório.

## Desenvolvimento e testes

1. Trabalhar somente no owner visual, em branch com PR. Não editar espelhos de `ui/` e `workspace/` no `ordax-os`.
2. O workflow [`Surface source integration candidate`](.github/workflows/validate-source-integration.yml) testa PRs visuais e a `main` do repositório. Ele separa a prova da **importação histórica imutável**, com dados em [`provenance/`](provenance/), da montagem da **Surface candidata** sobre o host e os testes atuais de `ordax-os/main`.
3. O gate confere os blobs da revisão candidata, recusa uma segunda cópia visual rastreada no OS, verifica imports/boundaries e executa testes Web e Native. A compatibilidade precisa ser revalidada sempre que os contratos do OS avançarem.
4. Após aprovação, a adoção pelo OS ainda exige atualizar **somente** `docs/contracts/surface-source.json` para o SHA Surface aprovado e passar os gates do consumidor, inclusive saúde/rollback pertinentes. Merge na Surface, por si só, **não** altera o source ativo nem promove release.

A prova histórica inicial permanece em `provenance/import.json` com `status: migration-candidate`: esse campo descreve a **importação original**, não o estado atual de ownership, e não deve ser reescrito para fingir outra proveniência.

## Publicação

Não há GitHub Release própria publicada da Surface nesta etapa. O OS já utiliza revisão Git imutável verificada como source de build e distribuição. Qualquer artefato adicional para consumidores, como o Site público, deve ter manifesto de integridade e proveniência explícita, sem criar um segundo empacotador, duplicar CSS/JS ou contornar o lock do OS.

**Segurança:** não realizar escrita em USB/discos físicos, publicação Stable ou ativação de produção sem os gates e autorizações correspondentes.
