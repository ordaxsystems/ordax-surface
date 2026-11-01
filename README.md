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

## Home Native — hierarquia responsiva do layout

A Home Meridian usa a largura **real da área de trabalho** por meio do
container `meridian-native-home`, sem adotar breakpoints globais da tela nem
uma segunda tabela de tamanhos. Em janelas estreitas (até `38rem` de
conteúdo), as seções se organizam na ordem: saudação e busca, Aura, retomar
quando disponível, acesso rápido, status, Space atual, arquivos e destinos,
encerrando na faixa de sessão. Busca e saudação deixam de competir pela
mesma linha; textos localizados podem quebrar linha em vez de serem cortados;
as sugestões da Aura passam para duas colunas e arquivos/destinos para uma.
Nas áreas mais largas, os layouts Meridian existentes são preservados.

A alteração utiliza apenas os tokens já definidos em `meridian.tokens.css`.
Não muda a paleta, tipografia, rotas, funcionalidade dos botões nem a
autoridade de dados do OS. A prova de CI combina asserções do CSS e dos slots
reais da Home com o smoke Chromium Native nos viewports de desktop e mobile.

## Home — Space atual sem reexibir snapshots antigos

A Home Native exibe o Space por meio do **único port de seleção
canônico do OS**. Esse runtime reconcilia a sessão, o catálogo de
Spaces e o sujeito; a Surface não reproduz essas regras, não consulta
armazenamento diretamente e não considera um nome em cache como
autorização. O `mountHomeSpaceCard` relê e valida
`spaceSelection.getSnapshot()` em **cada renderização**, incluindo
mudanças de idioma e notificações de assinatura. O payload de eventos
é apenas um sinal de atualização: uma entrega atrasada não pode
restaurar visualmente o Space de uma conta anterior.

A projeção visual isolada em `home-space-card-presentation.mjs`
apresenta três estados exclusivos usando as mesmas mensagens
e tokens existentes: selecionado, não selecionado e indisponível.
Nas transições para indisponível, nome, tipo e status são
substituídos juntos na atualização do DOM; nenhum dado anterior
fica exibido como placeholder. Não há nova autoridade nem nova
dependência exigida da composição Native do OS.

## Home, Conta e Spaces — continuidade de teclado após mudança de sessão

O seletor nativo de Space usa a mesma rotina `focus-recovery.mjs`
já aplicada às coleções da Home. Antes de atualizar as opções, conserva
somente a identidade do controle focado, sem reter permissões ou catálogos.
Se a opção continuar disponível, mantém o foco nela; se desaparecer,
ficar desabilitada, ocorrer mudança real de sujeito ou o menu fechar,
o foco volta ao **botão estável de seleção de Space**. Nunca transfere
foco para outra opção por posição, não abre outra tela e não
reabilita uma seleção revogada.

A mudança de conta continua usando `identityPresentationContextChanged`
para invalidar leituras pendentes e fechar o menu; heartbeat,
renovação de token e alteração de nome da mesma conta não são tratados
como troca de sujeito. A seleção e autorização continuam exclusivamente
em `deriveAuthorizedSpaces` e nos ports do OS. O helper genérico
de foco não lê sessão, não acessa rede nem armazena dados. A Home
segue usando o controle estável de busca como seu fallback próprio.
Nenhum token de design, serviço ou renderer alternativo foi criado.

## Home após autenticação — identidade e recuperação de foco

A Home Native mantém a apresentação de Conta ligada ao port público
de sessão e à disponibilidade do host. O botão de Conta da barra
lateral preserva o **nome acessível do comando localizado** exigido
pelo host OS; `aria-describedby` aponta aos textos já visíveis
de **nome e estado atuais** (conectado, sem conexão ou indisponível).
Esses textos continuam vindo da mesma projeção `projectSidebarAccount`,
sem cache de sessão, token ou segunda autoridade.

Os painéis dinâmicos **Retomar** (`home-continuation.mjs`) e
**Pendências** (`home-pending.mjs`) compartilham a regra
`restoreHomeCollectionFocus`. Quando o serviço retira um
projeto, arquivo, notificação ou pendência que estava focado,
o teclado retorna ao controle estável de busca/navegação da
Home, e nunca a outro item que tenha assumido sua posição.
Quando o item permanece autorizado e presente, o foco
permanece no mesmo controle. Atualizações sem foco dentro
do painel não movem o foco do usuário; nenhuma ação é
executada automaticamente, nem o estado vazio recebe
um cartão fictício. A lógica afeta somente a apresentação:
dados, sessão, notificações, projetos e permissões continuam
nos serviços canônicos do OS.

## Barra lateral — ajuste único Web/Native

O ajuste responsivo dos destinos da barra lateral reutiliza
`mountNativeSidebarFit` de `sidebar-layout.mjs` tanto no Web quanto no
Native. Todas as opções permanecem no DOM, agrupadas por seção; a rotina mede
o espaço disponível após mudanças de janela, largura da barra e carregamento
da fonte Meridian, ocultando somente os destinos que não cabem. O botão
**Mais destinos** mantém o acesso ao catálogo completo, e o foco retorna
para esse controle quando um item focado passa ao overflow.

A exportação `sidebarNavigationCapacity` segue disponível exclusivamente
para a suíte de contrato já existente no host OS. Sua remoção depende de
reconciliação pelo proprietário dos testes do OS, sem voltar a utilizá-la no
Web ou no Native.

O Web não mantém mais contador estimado nem uma segunda fórmula para
decidir quantos destinos exibir. Os estilos e os tokens de cores, tamanhos
e tipografia continuam compartilhados; nenhum estado de navegação é
persistido ou vira autoridade paralela.

## Conta, Ajustes e Sistema — navegação por seções

As três telas compartilham `section-navigation.mjs`, uma rotina somente de
**apresentação**. Ao selecionar uma seção, a barra horizontal revela o item
ativo sem mover a janela do aplicativo. Durante atualizações da mesma seção,
preserva a posição de rolagem escolhida pelo usuário. A geometria dos
controles usa uma classe comum, com alvos de no mínimo 44 CSS pixels,
respeitando os tokens Meridian existentes. Não há novas fontes, cores,
persistência, rotas ou autoridades de dados.

## Primeiro uso — ações de Conta vinculadas à sessão

O First Run considera as ações de entrar e sair da Conta como tentativas
transitórias da apresentação, sem autoridade independente. Quando o port
canônico informa outro sujeito autenticado ou fica indisponível, respostas
antigas não podem atualizar mensagens, executar refresh de sessão nem concluir
o fluxo `Continuar sem conta` iniciado pelo usuário anterior. O estado de
espera é liberado para a nova sessão. No logout normal
`signed-in → signed-out`, a tentativa continua válida para concluir a
transição explícita ao modo local. Credenciais e permissões permanecem sob
autoridade do OS/Platform, sem cópias persistidas pela Surface.

## Primeiro uso — confirmação final de identidade

Quando a configuração inicial termina em modo Conta, o First Run usa a
verificação canônica `verifyFirstRunIdentitySession` do OS **depois** de
qualquer renomeação assíncrona do dispositivo e imediatamente antes de
persistir o recibo de conclusão. Caso a conta autenticada não corresponda
ao sujeito selecionado, a interface retorna à etapa Conta, sem persistir
a conclusão como autenticada. Não existe uma segunda fonte de identidade,
nem a renomeação do dispositivo autoriza o recibo do First Run. A gravação
e a consistência transacional do recibo permanecem sob autoridade do
state store do OS, não da Surface.

## Primeiro uso — política de cadastro e sessão

O First Run só apresenta política e consentimento de cadastro vindos do port
canônico de identidade, sem autoridade ou persistência própria. Uma transição
efetiva entre `signed-out`, `signed-in` e `unavailable` invalida as leituras
de política ainda pendentes e limpa o consentimento temporário; assim, após
sair de uma conta, uma nova consulta não fica bloqueada por um pedido antigo.
Sucessos ou falhas atrasados da sessão anterior não substituem os termos,
não reabilitam cadastro nem ocultam um link de cadastro hospedado válido.
Emissões repetidas da mesma condição de sessão não descartam a consulta
atual nem o consentimento ainda em edição.

## Bloqueio local Native — isolamento de tentativas

A tela de bloqueio local segue exclusivamente o estado `locked/unlocked`
validado pelo port `ordax.local-session/1` do OS. Cada alteração efetiva
do estado invalida as conclusões de desbloqueio pendentes na Surface. Se a
sessão for desbloqueada e bloqueada novamente, um erro ou finalização de
requisição anterior não altera o aviso, não habilita o formulário da nova
sessão e não reaproveita sua credencial. Emissões repetidas de `locked`
não interrompem o desbloqueio atual. Foco agendado em elementos removidos
é descartado. Não há cache local, cópia de credenciais ou autoridade de
desbloqueio na UI; o OS continua aplicando verificação e rate limiting.

## Conta — isolamento de sessões

A apresentação de autenticação, encerramento de conta e consulta da política
de cadastro é vinculada à sessão que iniciou cada operação. Se o estado ou
o sujeito autenticado mudar durante uma resposta assíncrona, a Surface descarta
as conclusões antigas, limpa credenciais transitórias e libera os controles
visuais. Uma política de cadastro atrasada não substitui a leitura de uma
nova sessão; o encerramento de um usuário não atualiza a sessão de outro.
A autoridade de identidade, permissões e mutações continua exclusivamente
nos ports e serviços canônicos do OS/Platform.

## Spaces — seleção e sessão canônica

O seletor de Spaces Native obtém visibilidade, Space ativo e autorização
exclusivamente por `deriveAuthorizedSpaces` do OS. Uma emissão repetida da
sessão (por exemplo, renovação de credenciais ou mudança no nome exibido)
não altera esse contexto: mantém o menu, o foco, o feedback de seleção e
uma leitura do catálogo ainda válida. A troca real do sujeito autenticado,
o logout ou a indisponibilidade da sessão invalidam operações visuais
pendentes e fecham o seletor antes de expor o próximo contexto. Nenhuma
identidade, seleção de Space ou permissão é persistida pela Surface.

## Home Native — horários e preferência regional

As atividades recentes de projetos e arquivos são projeções dos ports canônicos
do OS, sem persistência nem catálogo paralelo na Surface. O Home apresenta
seus timestamps usando a mesma preferência de fuso horário
`regional.time-zone` já consumida pelo relógio do Desktop Native.
A mudança dessa preferência atualiza os horários apresentados sem alterar os
timestamps ou registros de origem. Em renderizadores que fornecem apenas o
contrato mínimo de ciclo de vida (sem o port de preferências), aplica-se o
padrão definido no serviço regional canônico do OS, não uma constante
duplicada de fuso na UI.

A mesma fonte canônica agora rege as datas e horários apresentados na
**bandeja de rede**, na seção **Rede dos Ajustes**, no **Sistema**
(atualizações, histórico e observações de métricas) e na **revisão local
de diagnósticos**. Mudanças em `regional.time-zone` reformatam a
apresentação já carregada, sem nova leitura de dados, alteração dos
timestamps originais, edição do relatório exportável ou duplicação da
preferência. Onde o ciclo de vida expõe apenas o contrato mínimo,
usa-se `resolveRegionalTimeZone()` do OS para o padrão canônico.

## Aura — estados de carregamento e cancelamento

As apresentações **Aura do Home** e **Aura no aplicativo** consomem a
mesma porta `ordax.intelligence/1` fornecida pelo OS; esta Surface **não**
possui motor, credenciais de inferência, cópia de modelo nem adaptador de
rede próprio. A espera cancelável fica em
`system/surface/workspace/lib/intelligence/abortable.mjs`, reutilizada
pelos dois consumidores. Se um backend ignorar `AbortSignal`, o estado
de apresentação ainda termina; qualquer resultado tardio é descartado
sem simular uma conclusão. Solicitações já canceladas nunca são enviadas.

O **Home** mantém um watchdog visual de **12 segundos**,
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

## Aura — conversa, prontidão e continuidade na Surface

A janela Aura usa o destino canônico do OS e a porta ordax.intelligence/1 do Home. A sidebar abre a janela mesmo com o motor indisponível; a UI mostra os estados ready, busy, degraded e error sem presumir prontidão.

O aplicativo conserva somente respostas completas validadas na memória da sessão do cliente Surface: oito trocas visíveis, quatro trocas como contexto de próximas perguntas, com origem explícita e texto limitado. Cancelamento, prazo excedido e texto parcial não entram no histórico confirmado. Interromper a espera ou iniciar nova conversa não concede autoridade nem executa ferramentas.

Minimizar ou fechar a janela preserva os turnos enquanto o cliente Surface permanecer montado. Trocar de porta/cliente descarta o histórico. Não existe persistência em disco, sincronização Desktop/Web, memória permanente, nem garantia após recarga da página. Motor, contrato de contexto, readiness e inferência seguem sob responsabilidade do OS. Testes cobrem ordem, limites, isolamento e fronteira de integração, não homologação física Windows.

## Primeiro uso — recuperação acessível de erros

Os campos de e-mail e senha de Conta, senha de Wi-Fi e PIN/senha de
bloqueio local referenciam por `aria-describedby` a mensagem concreta
renderizada no First Run. As mensagens reutilizam
`markSurfaceFeedback`, compartilhado com Conta, Ajustes e Sistema,
para `role=status`, `aria-live=polite` e `aria-atomic=true`.
`aria-invalid` aparece somente quando a **validação local do
campo** falhou, nunca por falha de rede/serviço nem como prova de
senha incorreta. Erros conhecidos retornam foco ao campo relevante.

Quando o usuário começa a corrigir uma entrada inválida, a marcação
e o aviso antigos são limpos sem reconstruir a etapa e perder o cursor.
Confirmação de cadastro é informativa, não equivale a autenticação.
O fluxo segue permitindo configuração offline e mantém a proteção
existente contra conclusões assíncronas de outra sessão.
Não há novas autoridades, tokens, armazenamento de credenciais
ou fluxo paralelo de autenticação.

## Primeiro uso — continuidade de navegação durante atualização

O diálogo único de primeiro uso preserva o foco durante atualizações
assíncronas de sessão, Wi-Fi e política de cadastro. O contrato de
apresentação `first-run-presentation-state.mjs` distingue a ação e
o SSID: ao atualizar redes, o foco nunca muda para outra rede por
compartilharem `data-first-run-action`. Ações removidas ou revogadas
retornam o foco ao título seguro, sem habilitar um botão inválido.

A rolagem de leitura, os documentos expandidos e a navegação por etapas
continuam estáveis quando apenas os dados da mesma etapa mudam. A
navegação entre etapas mantém o foco intencional no título. Senhas,
tokens e permissões **não** são copiados para snapshots de
apresentação; apenas identidades de controles e seleção de texto
podem ser restauradas.

O estado de verificação de conta e os retornos de segurança e rede
são anunciados de modo acessível, sem presumir autenticação ou
conexão bem-sucedida. Controles têm mínimo de 44 px e rodapé
compacto adaptado ao próprio container, usando exclusivamente
tokens Meridian e os contratos originais.

## Formulários Native — foco, validação e janelas compactas

Em Conta, campos de credenciais, confirmação legal e encerramento agora
restauram a identidade de foco depois de atualizações da UI. Campos de senha
e nome do Space também restauram a posição do cursor sem manter cópias das
senhas nos snapshots visuais. Limpeza de segredos e invalidação de operações
na mudança de sessão continuam com os contratos existentes. O formulário
de credenciais, criação de Space e encerramento compartilham campos e botões
Meridian com alvos mínimos de 44 px; o container `account-viewport`
adapta cada formulário à largura real da janela.

Em Ajustes, campos de senha de sessão local recebem nomes acessíveis,
`aria-describedby` associado ao feedback OS já existente, e
`aria-invalid` somente quando o próprio fluxo indica validação
ou credencial incorreta. O mesmo vínculo se aplica à senha Wi-Fi quando
falta uma senha. Controles de sessão e conexão passam a uma coluna em
janelas compactas via container existente `settings-viewport`.
Nenhuma credencial é persistida ou enviada por outra rota.

## Conta, Ajustes e Sistema — feedback Native sem duplicação

O renderer Native de Conta, Ajustes e Sistema compartilha
`surface-feedback.mjs`: anota mensagens geradas por operação com
`role=status`, `aria-live=polite` e `aria-atomic=true`, sem alterar
o texto localizado nem a autoridade do OS. As mensagens de sucesso
de Conta (Space criado, perfil ativado/desativado, encerramento confirmado)
são visualmente informativas, e falhas ou resultados inconclusivos
continuam em atenção, usando somente tokens semânticos Meridian.
A tonalidade é atribuída na transição real da operação, nunca inferida
de texto traduzido ou de estado presumido. Falhas de leitura em
Sistema também são apresentadas como alertas, mantendo a última leitura
somente onde o contrato já permite.

As três telas compartilham ainda `restoreSectionFocusFallback` em
`section-navigation.mjs`: se uma atualização do port remover,
desabilitar ou ocultar o controle que estava focado, o teclado volta
à seção ativa, sem retomar autoridade da ação revogada. A rolagem
horizontal da navegação, o foco de controles válidos e a restauração
do cursor de formulários continuam sob os controladores existentes.
Nenhum port, cache, permissão, tradução ou renderer paralelo foi criado.

## Loja — feedback de operações visível e acessível

As mensagens de solicitação de instalação, atualização e remoção da Loja são
apresentadas imediatamente após o cabeçalho, antes de qualquer grade ou
detalhe de aplicativo. O resultado de `Update All` e a nota de que um pedido
aceito **não equivale a instalação concluída** ficam no mesmo local, inclusive
em catálogos extensos. Não existe segundo log, toast ou armazenamento de
solicitações. O conteúdo usa somente mensagens existentes do catálogo de
localização do OS. `role=status` e `aria-live=polite` permitem anunciar
alterações sem assumir sucesso nem interromper o foco de navegação.

Quando o host não fornece um port de lifecycle ou identidade segura de
requisição, a Loja explica os controles desabilitados no cabeçalho, sem
tentar instalar por uma rota alternativa. Falhas e indisponibilidades recebem
a aparência de atenção sem adotar outra paleta: são utilizados somente tokens
Meridian da Surface. A nota de segurança permanece no rodapé.

## Loja — detalhes, foco e estados vazios

A Loja oficial diferencia três estados de lista vazia sem presumir erros do
catálogo: catálogo `ready` sem aplicativos, pesquisa sem correspondência e
categoria sem aplicativos aplicáveis. Quando o port informa indisponibilidade,
a UI mostra seu estado separado e continua bloqueando operações. Todos os
textos usam exclusivamente as mensagens localizadas existentes no OS, e
o contador acessível de resultados anuncia mudanças de filtros.

Ao receber um novo snapshot assinado, o renderer preserva o foco de teclado
sobre a ação ou navegação correspondente, se ela continuar válida. Quando
um botão desaparece ou é desabilitado pelo novo estado, o foco retorna para
Voltar (nos detalhes) ou para a categoria ativa. O comportamento não mantém
ações autorizadas por estado antigo e não altera o port de lifecycle.
Detalhes, verificação de identidade e estados de vazio se reorganizam pelo
**container real** de uma janela estreita (480px), sem novos tokens de cor,
fonte ou renderer.

## Loja — estados reais e ações sem sucesso presumido

O catálogo oficial mantém os estados canônicos do OS (disponível, instalado,
instalando, atualizando, removendo, em validação, bloqueado e falha com versão
anterior preservada). O renderer compartilhado distingue estados
intermediários de estados finais **sem inventar percentual de conclusão**.
Quando o OS marca um aplicativo `installed` com `updatable: true`, a
interface exibe um indicador adicional de atualizações ao lado de
*Instalado*, sem presumir que a versão já foi aplicada. Se o OS informa
`blocked`, o cartão revela seu motivo, também disponível nos detalhes.

O feedback por aplicativo diferencia pedido sendo enviado e pedido aceito
pelo lifecycle. **Aceite não significa instalação concluída**: só o
catálogo OS confirma uma transição real. Os textos localizados reutilizam
`system/services/i18n/catalog/store.mjs`, do OS; não há nova paleta,
tradução duplicada, cache de inventário ou nova autoridade na Surface.

## Loja — navegação responsiva Web/Native

A Loja oficial usa a barra de categorias existente também em janelas pequenas,
sem duplicar renderer nem catálogo. A partir de `800px` de largura do
**container da janela**, as categorias formam uma faixa horizontal rolável em
vez de crescer em linhas; o item selecionado permanece acessível quando a
categoria muda ou quando o catálogo emite novos dados. A apresentação reutiliza
`section-navigation.mjs`, o mesmo comportamento de rolagem de Conta, Ajustes
e Sistema. A posição escolhida pelo usuário é preservada em atualizações da
mesma seção, sem mover a página inteira. Busca mantém foco e posição do cursor
ao receber atualizações. Os alvos de categoria, detalhe, voltar e ações têm
altura mínima de 44px, com foco, fontes e cores Meridian existentes.

As operações continuam dependendo dos ports reais do OS, e um aceite de
requisição **não** significa instalação concluída. Nenhum novo serviço, fixture,
catálogo, persistência ou autoridade foi criado na Surface.

## Loja — apresentação canônica Web/Native

A Loja oficial tem **um único renderer** em `system/surface/ui/store-experience.mjs`,
que monta `store-overview-controls.mjs` usando o catálogo e os ports do OS.
No Web, a rota e a janela compartilham `system/surface/workspace/components/store/meridian-store.tsx`;
o host Native utiliza diretamente o mesmo renderer. Nenhum desses consumidores
reimplementa o catálogo oficial ou estados de instalação.

As identidades de requisições `install`, `update` e `remove` da Loja
ficam exclusivamente em memória e são vinculadas ao aplicativo, operação
e candidato validado do catálogo OS. Uma resposta inconclusiva reutiliza
a identidade original; mudança de outro aplicativo ou apenas de seu título
não a invalida. Alteração do candidato ou revogação de elegibilidade
impedem repetir a identidade anterior. Se o catálogo ficar indisponível,
a UI bloqueia novos envios sem supor sucesso ou falha de requisições já
delegadas. O `Update All` reutiliza o lote canônico do OS, revalida cada
candidato e não é cancelado por progresso de outros aplicativos. Aceitação
de requisição nunca é tratada como instalação concluída.

A visualização de demonstração em `workspace/components/store/presentation/`
é **opcional e explicitamente selecionada**: mantém dados e operações simulados
isolados, sem instalar, autorizar ou alterar aplicativos reais. O runtime
`workspace/lib/store/{catalog,state}.mjs` pertence somente a essa prévia,
não à autoridade da Loja. A antiga segunda Loja React, seus estilos e imagem
exclusivos e as fachadas TypeScript sem consumidores foram removidos para
evitar duas experiências e dois caminhos de estado no Web.

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
