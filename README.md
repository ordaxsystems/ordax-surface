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

## Aura — estados de carregamento e cancelamento

As apresentações **Aura do Home** e **Aura no aplicativo** consomem a
mesma porta `ordax.intelligence/1` fornecida pelo OS; esta Surface **não**
possui motor, credenciais de inferência, cópia de modelo nem adaptador de
rede próprio. A espera cancelável fica em
`system/surface/workspace/lib/intelligence/abortable.mjs`, reutilizada
pelos dois consumidores. Se um backend ignorar `AbortSignal`, o estado
de apresentação ainda termina; qualquer resultado tardio é descartado
sem simular uma conclusão. Solicitações já canceladas nunca são enviadas.

O **Home** mantém o orçamento interativo existente de **10 segundos**,
mostra o erro com finalização explícita do estado ocupado e preserva o
texto digitado para tentar novamente. A conversa do aplicativo Aura possui
um limite independente de **120 segundos** para solicitações gerais;
o prazo é apenas do consumidor UI, não cria um supervisor ou uma política
de execução no OS. Nenhum desses prazos promete que o modelo físico
responderá em tempo real: desempenho e prontidão efetiva precisam de
validação de hardware.

Testes de contrato e comportamento no repositório Surface cobrem
cancelamento antecipado, providers não cooperativos, rejeições tardias e
consistência Home/aplicativo. O gate de integração monta a revisão
candidata sobre `ordax-os/main` sem adicionar segunda fonte visual.

## Desenvolvimento e testes

1. Trabalhar somente no owner visual, em branch com PR. Não editar espelhos de `ui/` e `workspace/` no `ordax-os`.
2. O workflow [`Surface source integration candidate`](.github/workflows/validate-source-integration.yml) testa PRs visuais e a `main` do repositório. Ele separa a prova da **importação histórica imutável**, com dados em [`provenance/`](provenance/), da montagem da **Surface candidata** sobre o host e os testes atuais de `ordax-os/main`.
3. O gate confere os blobs da revisão candidata, recusa uma segunda cópia visual rastreada no OS, verifica imports/boundaries e executa testes Web e Native. A compatibilidade precisa ser revalidada sempre que os contratos do OS avançarem.
4. Após aprovação, a adoção pelo OS ainda exige atualizar **somente** `docs/contracts/surface-source.json` para o SHA Surface aprovado e passar os gates do consumidor, inclusive saúde/rollback pertinentes. Merge na Surface, por si só, **não** altera o source ativo nem promove release.

A prova histórica inicial permanece em `provenance/import.json` com `status: migration-candidate`: esse campo descreve a **importação original**, não o estado atual de ownership, e não deve ser reescrito para fingir outra proveniência.

## Publicação da apresentação — **desenvolvimento**

A Surface **já publica dois artefatos Dev independentes e atestados**. Ambos são gerados por workflows na `main`, com proveniência de commits/arquivos de origem, inventário de bytes e hashes externos. São **prereleases de desenvolvimento**, não distribuição de produto nem autorização de produção.

| Artefato | Publicador e evidência | Consumidor |
| --- | --- | --- |
| Marca (tokens, CSS, símbolo, landscape, fonte e licença Inter) | [`Surface Public Brand Candidate`](.github/workflows/public-brand-candidate.yml), [PR #14](https://github.com/ordaxsystems/ordax-surface/pull/14), [prerelease brand Dev](https://github.com/ordaxsystems/ordax-surface/releases/tag/brand-dev-863310a2e0a285f35fb1080c84c3cc5a88d41cde) | Site, com pin externo |
| Meridian (11 vistas read-only, fixture + CSS) | [`Surface source integration candidate`](.github/workflows/validate-source-integration.yml), [PR #13](https://github.com/ordaxsystems/ordax-surface/pull/13), [prerelease Meridian Dev](https://github.com/ordaxsystems/ordax-surface/releases/tag/meridian-dev-1ab73da4aae5991273a5f4ca380d5af135ffd8d5) | Site, com pin externo |

O Site é proprietário da integração estática, **não do renderer nem dos recursos visuais**. Seu único contrato operacional para essas dependências é [`ordax-site/contracts/dev-artifact-lock.json`](https://github.com/ordaxsystems/ordax-site/blob/main/contracts/dev-artifact-lock.json): SHA-40 do commit, SHA-256 do arquivo e do manifesto. O CI Site verifica a atestação GitHub vinculada ao workflow correto, `refs/heads/main` e source SHA, antes de construir o pacote; o builder confere os conteúdos sem confiar nas flags de status do próprio JSON. A integridade por hash detecta substituições mesmo que a plataforma de releases permita mudanças administrativas.

### Marca

[`tools/public-artifacts/brand.py`](tools/public-artifacts/brand.py) é o **único exportador** dos tokens e recursos da marca. O CI gera saídas determinísticas e valida cada arquivo, incluindo a licença OFL proveniente do blob canônico do OS. A publicação automática **Dev** é dependente da atestação `attest-main-brand` e faz conferência de roundtrip da prerelease, sem recompilar a marca no Site. O formato do manifesto conserva `candidate-not-published` porque a arte não tem autorização comercial/produção.

O workflow [`Surface Brand Draft Release (manual)`](.github/workflows/public-brand-draft-release.yml) oferece **somente** uma revisão manual em draft, separada do caminho automático Dev. Não é um segundo exportador, nem a fonte usada pelo Site, nem um mecanismo de promoção Stable.

### Demonstração Meridian

O renderer canônico da apresentação read-only está em [`tools/public-artifacts/meridian-preview-entry.tsx`](tools/public-artifacts/meridian-preview-entry.tsx) e [`meridian-preview.mjs`](tools/public-artifacts/meridian-preview.mjs). Os componentes visuais vêm de `system/surface/{ui,workspace}`; os dados de apps/atalhos/i18n vêm **da projeção OS-owned** integrada na [OS #2234](https://github.com/ordaxsystems/ordax-os/pull/2234). A composição ocorre em checkout descartável com identidade de ambas as origens, sem sessão ativa, capacidades reais ou JavaScript executável no pacote.

A [Site #7](https://github.com/ordaxsystems/ordax-site/pull/7) substituiu o snapshot demo do OS pela prerelease Surface. A [Site #10](https://github.com/ordaxsystems/ordax-site/pull/10) removeu o último snapshot de marca e integrou as duas releases. O [OS #2238](https://github.com/ordaxsystems/ordax-os/pull/2238) verificou o Site independente no portal e login Web, sem reintroduzir arquivos visuais em `ordax-os`. O código-fonte do Site e seus registros de distribuição pertencem aos seus owners respectivos.

### Autorização e evolução

A publicação Dev não altera o lock de source do OS, gravação física, USB, DNS, Vercel de produção, Identity, billing, downloads públicos ou Stable. A revisão visual ativa no OS continua determinada exclusivamente por [`surface-source.json`](https://github.com/ordaxsystems/ordax-os/blob/main/docs/contracts/surface-source.json). As revisões de Site/Surface devem atualizar seus pins por PR com CI, nunca copiar componentes para manter espelhos.

A [issue #3](https://github.com/ordaxsystems/ordax-surface/issues/3) registra a conclusão do **pacote de apresentação Dev**; quaisquer autorizações de produção são escopo separado. Homologação em hardware real, Identity em staging e acessibilidade manual continuam gates independentes.
