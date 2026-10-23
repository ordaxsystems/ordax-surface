# OrdaX Surface

Repositório destinado ao **código de apresentação compartilhado** da Surface do OrdaX (Web, Desktop, USB e Native), separado dos serviços e mecanismos de execução do `ordax-os`.

## Estado da separação

**MIGRAÇÃO EM ANDAMENTO — não promover como fonte canônica de execução antes do cutover verificado.**

O repositório `ordax-os` continua executando a implementação atualmente publicada enquanto o novo código é importado, integrado e testado. A transferência de ownership só se completa quando o OS consumir a fonte versionada deste repositório, todos os modos necessários passarem nas validações e a cópia anterior for retirada. Não manter espelhos permanentes.

## Limites

- **Surface:** componentes visuais, design tokens, estado de apresentação, UX, ativos de interface, layouts e testes visuais.
- **OrdaX OS:** boot, Supervisor, recovery, WebKit/Cage/host, serviços nativos, identidade, autorizações, domínio, contratos públicos e adapters de capacidades.
- **OrdaX Apps:** aplicativos removíveis e seus dados/app-owned.
- **OrdaX Platform/Runtime:** autoridades remotas e agentes externos conforme contratos existentes.

Sem APIs paralelas, sem import de adapters concretos pela UI. A interface recebe capabilities e ports públicos, sem assumir responsabilidades de serviço.

## Procedimento de migração

A primeira importação do código visual parte de `ordaxsystems/ordax-os` em SHA imutável, registra o mapa de blobs original e preserva o histórico de alterações relevante com filtragem de caminhos. O histórico importado é unido ao histórico deste repositório sem reescrever a `main`. Antes da integração final, executar smoke de Web/Native/QEMU, prova de distribuição/rollback e eliminar source visual duplicado no OS.

Não executar operações destrutivas em USB/discos físicos para a migração de código.
