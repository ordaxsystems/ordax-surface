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

Não há GitHub Release oficial de marca/demonstração publicada da Surface nesta etapa. O OS já utiliza revisão Git imutável verificada como source de build e distribuição. Nenhuma nova versão visual passa a ativa por criar um artefato de apresentação pública.

O [exportador de marca para revisão](tools/public-artifacts/brand.py) projeta **somente as variáveis CSS** existentes em `tokens.css` e `meridian.tokens.css`, mantendo o mesmo design system sem redefinir paleta ou alterar os elementos `html/body` do Site. Os três arquivos visuais (símbolo, landscape e fonte Inter) são copiados byte a byte do Git source exato. A licença OFL não é duplicada no repositório: é importada e verificada contra o blob original `556792990d740c111b4fee7fe1938dc90bcee2ce` na revisão OS imutável de proveniência `f65acc4fb9f8ded376fc9b44b4c7c2068c793265`.

A CI [`Surface Public Brand Candidate`](.github/workflows/public-brand-candidate.yml) gera **duas vezes** o mesmo pacote, compara os bytes e manifestos, executa testes negativos de alterações/trocas de revisão e anexa um **artefato candidato de revisão**. A saída contém os seis arquivos contratados pelo Site e `manifest.json` com `artifact_class=ordax-brand`, revisão Source SHA e origem real dos seis blobs necessários. Permanece marcada `status=candidate-not-published`, não uma release oficial.

**Atestação criptográfica (restrita à `main`):** após CI de source validada, o job independente `attest-main-brand` reutiliza o pacote da **mesma execução** e gera um `ordax-brand-<SHA>.tar.gz` de metadados determinísticos. O `actions/attest` cria proveniência SLSA assinada pela identidade GitHub OIDC/Sigstore do workflow. O próprio job verifica com `gh attestation verify` o repositório, caminho exato do workflow, `refs/heads/main` e o commit. PRs não possuem acesso ao token de assinatura; não há tag/release, deploy, promoção Stable ou gravador de mídia.

**Procedimento obrigatório para o consumidor** (o bundle `.tar.gz` deve ser obtido da execução GitHub Actions da `main`, jamais enviado pelo browser do Site):

```sh
gh attestation verify ordax-brand-<SURFACE_SHA>.tar.gz \
  --repo ordaxsystems/ordax-surface \
  --signer-workflow ordaxsystems/ordax-surface/.github/workflows/public-brand-candidate.yml \
  --source-ref refs/heads/main \
  --source-digest <SURFACE_SHA> \
  --deny-self-hosted-runners
```

Em seguida, descompactar o arquivo **somente em diretório temporário seguro**, rejeitando entradas inesperadas, links e traversal, e verificar `manifest.json` pelo SHA-256 obtido do artefato atestado e pelo validador `tools/public-artifacts/brand.py verify`. A assinatura sozinha não valida autorização comercial/deploy. A política de confiança do Site deve exigir sua **própria** versão aprovada do artefato e não confiar no campo `status` que qualquer produtor de JSON poderia declarar.

O [`ordax-site#1`](https://github.com/ordaxsystems/ordax-site/pull/1) atualmente aceita **somente** a cópia de migração do OS por lock de desenvolvimento, e **deve continuar rejeitando** esta candidata enquanto o owner Surface não aprovar/publicar um manifesto atestado e o Site não implementar o verificador desse trust path. A [issue #3](https://github.com/ordaxsystems/ordax-surface/issues/3) controla também o pacote demo: sua fixture depende do catálogo, i18n e composição do OS, portanto não pode ser reclassificada como source puramente visual nem criada com outro gerador do Site.

A distribuição de `ordax-surface` nunca cria outro mecanismo de atualização de SO ou altera o `docs/contracts/surface-source.json` no OS.

**Segurança:** não realizar escrita em USB/discos físicos, publicação Stable ou ativação de produção sem os gates e autorizações correspondentes.
