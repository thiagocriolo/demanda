# Back-end: roteiro de implementação

Este documento é a fila oficial de implementação do back-end do Demanda. As
tarefas devem ser executadas na ordem, uma por vez. Uma tarefa só pode ser
marcada como concluída depois que seus critérios de aceite forem verificados.

## Decisões adotadas

- O back-end fará parte do próprio SvelteKit, sem um segundo servidor HTTP.
- PostgreSQL será a fonte de verdade dos dados compartilhados.
- Drizzle ORM e migrations SQL versionadas serão usados para acesso e evolução
  do banco.
- Entradas externas serão validadas no servidor antes de alcançar os serviços.
- Todo dado de negócio será isolado por `workspaceId` e toda autorização será
  repetida no servidor.
- Sessões usarão cookie HTTP-only e um token opaco; o banco guardará apenas o
  hash do token.
- Preferências pessoais, inclusive as visuais, são persistidas no PostgreSQL.
- O sistema começará com requisições HTTP normais. Tempo real só será adicionado
  depois que persistência, permissões e concorrência estiverem estáveis.

## Estado

| ID    | Tarefa                                   | Estado              |
| ----- | ---------------------------------------- | ------------------- |
| BE-01 | Fundação do back-end e banco             | Concluída           |
| BE-02 | Schema de usuários e workspaces          | Concluída           |
| BE-03 | Autenticação e sessões                   | Concluída           |
| BE-04 | Contexto da requisição e autorização     | Concluída           |
| BE-05 | Pessoas e contatos                       | Concluída           |
| BE-06 | Negócios                                 | Concluída           |
| BE-07 | Projetos, serviços e vínculos            | Concluída           |
| BE-08 | Tarefas e subtarefas                     | Concluída           |
| BE-09 | Configurações, catálogos e modelos       | Concluída           |
| BE-10 | Agenda                                   | Concluída           |
| BE-11 | Cronograma e conflitos                   | Concluída           |
| BE-12 | Financeiro                               | Concluída           |
| BE-13 | Perfil e uploads                         | Concluída           |
| BE-14 | Dashboard, atividades e busca            | Concluída           |
| BE-15 | Migração dos dados do navegador          | Próxima/única ativa |
| BE-16 | Notificações e atualização em tempo real | Pendente/opcional   |
| BE-17 | Segurança, testes e observabilidade      | Pendente            |
| BE-18 | Empacotamento, deploy e operação         | Pendente            |

## Fila sequencial de execução

Esta é a lista operacional do back-end. Apenas uma tarefa pode ficar em
andamento, e a próxima só começa depois que os critérios de aceite da anterior
forem verificados.

A BE-15 é a próxima e única tarefa liberada para implementação neste momento.

- [x] **BE-01 — Fundação do back-end e banco**
- [x] **BE-02 — Schema de usuários e workspaces**
- [x] **BE-03 — Autenticação e sessões**
- [x] **BE-04 — Contexto da requisição e autorização**
- [x] **BE-05 — Pessoas e contatos**
- [x] **BE-06 — Negócios**
- [x] **BE-07 — Projetos, serviços e vínculos**
- [x] **BE-08 — Tarefas e subtarefas**
- [x] **BE-09 — Configurações, catálogos e modelos**
- [x] **BE-10 — Agenda**
- [x] **BE-11 — Cronograma e conflitos**
- [x] **BE-12 — Financeiro**
- [x] **BE-13 — Perfil e uploads**
- [x] **BE-14 — Dashboard, atividades e busca**
- [ ] **BE-15 — Migração dos dados do navegador — próxima/única ativa**
- [ ] **BE-16 — Notificações e atualização em tempo real (opcional)**
- [ ] **BE-17 — Segurança, testes e observabilidade**
- [ ] **BE-18 — Empacotamento, deploy e operação**

## BE-01 — Fundação do back-end e banco

Objetivo: preparar uma base server-only que possa receber os schemas e serviços
sem conectar componentes Svelte diretamente ao PostgreSQL.

- [x] Instalar o driver PostgreSQL, ORM, migrador e validador.
- [x] Criar um contrato validado para variáveis privadas de ambiente.
- [x] Criar uma conexão lazy com pool, reutilizável durante o processo Node.
- [x] Configurar geração e execução de migrations.
- [x] Adicionar um comando de diagnóstico da conexão.
- [x] Criar testes automatizados do contrato de ambiente.
- [x] Documentar como configurar e verificar o banco local.

Critérios de aceite:

- `npm run test`, `npm run check` e `npm run build` passam.
- A aplicação compila sem exigir conexão com o banco durante o build.
- Quando `DATABASE_URL` não existir, os comandos de banco falham com uma
  mensagem clara e sem revelar segredos.
- Com uma URL válida, `npm run db:check` executa `select 1` e encerra o pool.

Verificação em 13/07/2026:

- 8 testes automatizados aprovados.
- `svelte-check` aprovado sem erros ou avisos.
- build de produção aprovado sem abrir conexão com o banco.
- ausência de `DATABASE_URL` rejeitada sem exibir valor sensível.
- conexão real com PostgreSQL 18 aprovada (`select 1`, 44 ms).
- auditoria das dependências de produção sem vulnerabilidades conhecidas.

## BE-02 — Schema de usuários e workspaces

Objetivo: criar a raiz multi-tenant da aplicação.

- [x] Criar tabelas `users`, `workspaces` e `workspace_members`.
- [x] Definir papéis `owner`, `admin` e `member` com constraints.
- [x] Adicionar timestamps, índices, unicidade e exclusão lógica aplicáveis.
- [x] Garantir exatamente um vínculo de proprietário por workspace.
- [x] Gerar a primeira migration SQL e revisar o SQL produzido.
- [x] Criar seed idempotente para desenvolvimento.
- [x] Testar constraints e relacionamentos no PostgreSQL.

Critério de aceite: a migration sobe e desce em um banco descartável, o seed
pode rodar duas vezes e os testes comprovam os limites principais.

Verificação em 13/07/2026:

- migrations reais aplicadas e removidas em schema PostgreSQL descartável;
- duas migrations aplicadas e reaplicadas no banco local sem duplicação;
- seed executado duas vezes, mantendo 1 usuário, 1 workspace e 1 owner;
- 7 testes de integração aprovados para constraints, transferência, cascade e
  isolamento;
- histórico de migrations aprovado pelo `drizzle-kit check`;
- 8 testes unitários, `svelte-check` e build de produção aprovados.

## BE-03 — Autenticação e sessões

Objetivo: substituir o `CURRENT_USER` fixo por uma identidade autenticada.

- [x] Criar tabelas para credenciais, sessões e tokens de recuperação.
- [x] Implementar hash seguro de senha e política mínima de senha.
- [x] Implementar cadastro, login, logout e expiração/revogação de sessão.
- [x] Usar cookies `HttpOnly`, `SameSite` e `Secure` em produção.
- [x] Implementar recuperação de senha sem revelar a existência da conta.
- [x] Adicionar testes de autenticação e fixação/roubo de sessão.

Critério de aceite: um usuário pode entrar, manter a sessão, sair e ter todas as
sessões revogadas; rotas privadas rejeitam visitantes.

Verificação em 13/07/2026:

- migrations `0002_authentication` e `0003_password-reset-revocation` aplicadas
  no PostgreSQL local e aprovadas pelo `drizzle-kit check`;
- cadastro transacional cria usuário, credencial, workspace pessoal, owner e
  sessão;
- senhas usam `scrypt` versionado, salt aleatório e política de 6–16
  caracteres, com maiúscula, minúscula e número;
  caracteres; tokens opacos têm 256 bits e somente o SHA-256 é persistido;
- login por username/e-mail, cookie protegido, logout atual, revogação das
  demais ou de todas as sessões e bloqueio das rotas privadas implementados;
- recuperação usa token de 30 minutos, uso único, resposta pública uniforme e
  revoga todas as sessões ao trocar a senha;
- 25 testes unitários e 15 testes PostgreSQL aprovados, incluindo token
  adulterado, hash apresentado como cookie, sessão revogada, senha antiga e
  reutilização do token de recuperação;
- `svelte-check` sem erros ou avisos e build de produção aprovado.

## BE-04 — Contexto da requisição e autorização

Objetivo: tornar o isolamento por workspace obrigatório em todas as operações.

- [x] Resolver usuário e sessão no hook do SvelteKit.
- [x] Tipar `App.Locals` com identidade e sessão.
- [x] Resolver o workspace ativo sem confiar apenas em um ID enviado pelo front.
- [x] Criar políticas reutilizáveis para leitura, escrita e administração.
- [x] Impedir enumeração de IDs entre workspaces.
- [x] Registrar operações administrativas em auditoria.

Critério de aceite: testes demonstram que nenhum papel acessa um workspace do
qual não é membro e que `member`, `admin` e `owner` têm limites diferentes.

Verificação em 13/07/2026:

- migrations `0004_request-context-authorization` e
  `0005_audit-metadata-object` aplicadas no PostgreSQL local e aprovadas pelo
  `drizzle-kit check`;
- hook global resolve uma vez o usuário, a sessão, o workspace ativo e o papel
  em `App.Locals`; sessões sem vínculo válido recebem um fallback autorizado;
- workspace ativo é persistido na sessão e toda troca revalida vínculo e sessão
  dentro de transação, sem confiar em IDs ou estado do navegador;
- matriz reutilizável diferencia leitura, escrita, administração e propriedade
  para `member`, `admin` e `owner`, com negação por padrão;
- UUID inexistente e workspace estrangeiro produzem a mesma resposta `404`,
  evitando enumeração entre tenants;
- mudanças de papel e transferência de propriedade reautorizam e bloqueiam as
  linhas envolvidas, gravando auditoria append-only na mesma transação;
- 57 testes unitários e 23 testes PostgreSQL aprovados, incluindo isolamento,
  fallback, matriz de papéis, contexto desatualizado e rollback de auditoria;
- `svelte-check`, histórico de migrations e build de produção aprovados.

## BE-05 — Pessoas e contatos

Objetivo: persistir os registros da aba Pessoas sem confundi-los com contas de
acesso ao sistema.

- [x] Modelar contatos, tipos, status, telefones, e-mails e observações.
- [x] Definir o vínculo opcional entre contato e usuário do sistema.
- [x] Implementar listagem, busca, criação, edição e arquivamento.
- [x] Adicionar paginação, validação e normalização de contato.
- [x] Trocar a persistência local da área Pessoas pelo servidor.
- [x] Adicionar testes de serviço, autorização e interface.

Critério de aceite: dois usuários do mesmo workspace enxergam a mesma alteração
e nenhum usuário externo ao workspace consegue consultar o contato.

Verificação em 13/07/2026:

- migrations `0006_people-contacts` e `0007_contact-index-hardening` aplicadas
  no PostgreSQL local e aprovadas pelo `drizzle-kit check`;
- contatos, telefones, e-mails e observações persistidos em tabelas próprias,
  com vínculo opcional a um membro e chaves compostas que reforçam o limite do
  workspace;
- API autenticada implementa listagem paginada, busca, filtros, ordenação,
  criação, leitura, edição e arquivamento sem aceitar `workspaceId` do cliente;
- leituras paginadas usam um snapshot consistente e escritas revalidam a
  permissão, bloqueiam o contato e atualizam os detalhes na mesma transação;
- a aba Contatos usa o servidor, preserva todos os telefones, e-mails e
  observações ao editar, enquanto Negócios, Projetos e Tarefas continuam no
  armazenamento legado até suas respectivas etapas;
- 68 testes unitários e 34 testes PostgreSQL aprovados, cobrindo normalização,
  paginação, busca, isolamento entre workspaces, vínculo com usuário,
  arquivamento e o adaptador da interface;
- fluxo HTTP real aprovado para dois usuários do mesmo workspace e para a
  resposta pública uniforme ao tentar acessar um contato de outro workspace;
- `svelte-check`, formatação, integridade do banco e build de produção
  aprovados.

## BE-06 — Negócios

Objetivo: persistir clientes/negócios e seus responsáveis.

- [x] Modelar negócios, categoria, etapa, responsáveis e observações.
- [x] Representar responsáveis em uma tabela relacional.
- [x] Implementar CRUD, busca e arquivamento.
- [x] Validar vínculos apenas com pessoas do mesmo workspace.
- [x] Substituir a persistência da área Negócios.
- [x] Testar relações e autorização.

Critério de aceite: vínculos inválidos são rejeitados no servidor e a tela deixa
de depender da chave `demanda:crud:negocios`.

Verificação em 14/07/2026:

- migrations `0008_businesses` e `0009_business-note-ordering` aplicadas no
  PostgreSQL local e aprovadas pelo `drizzle-kit check`;
- negócios, responsáveis e observações persistidos em tabelas próprias, com
  chaves compostas que impedem vínculos entre workspaces e ordem explícita para
  responsáveis e notas;
- API autenticada implementa listagem paginada, busca em negócio, responsável
  e nota, filtros, facets, ordenação, CRUD e arquivamento idempotente sem aceitar
  `workspaceId` do cliente;
- leituras paginadas usam snapshot consistente; escritas reautorizam o membro,
  bloqueiam as linhas envolvidas e rejeitam responsável estrangeiro ou um novo
  responsável arquivado na mesma transação;
- Registros, formulário de Negócio, Pauta e seletores de Projeto/Tarefa usam a
  API. Referências legadas de projetos e tarefas são preservadas sem associação
  automática por nome, com proveniência do workspace nos novos vínculos;
- nenhuma leitura ou gravação de Negócios depende de
  `demanda:crud:negocios`;
- 82 testes unitários e 46 testes PostgreSQL aprovados, incluindo ordem de três
  notas, rollback, anti-IDOR, paginação, busca, responsável arquivado e
  isolamento entre workspaces;
- fluxo HTTP real aprovado em 18 verificações com dois usuários, e os dados
  temporários foram removidos ao final;
- `svelte-check`, formatação, integridade do banco e build de produção
  aprovados.

## BE-07 — Projetos, serviços e vínculos

Objetivo: persistir projetos com tipos corretos e relações consistentes.

- [x] Modelar projetos, status, contrato, datas e valores monetários.
- [x] Relacionar projeto, workspace, negócio e serviços por IDs.
- [x] Modelar tags e responsáveis sem listas codificadas em texto.
- [x] Implementar CRUD, filtros, arquivamento e regras de datas.
- [x] Criar projetos a partir de modelos em uma transação.
- [x] Substituir a persistência da área Projetos.

Critério de aceite: criação por modelo é atômica e projetos nunca apontam para
negócios ou serviços de outro workspace.

Verificação em 14/07/2026:

- migration `0010_projects-services` aplicada no PostgreSQL local e aprovada
  pelo `drizzle-kit check`;
- serviços, tags, projetos e seus vínculos persistidos nas tabelas `services`,
  `tags`, `service_tags`, `service_responsibles`, `projects`,
  `project_services`, `project_tags`, `project_responsibles` e
  `project_installments`;
- rotas autenticadas de serviços e projetos implementam listagem, filtros,
  criação, leitura, edição e arquivamento idempotente. Projetos também expõem
  opções relacionais e criação por modelo;
- o workspace vem exclusivamente da sessão em `App.Locals`. Chaves
  estrangeiras compostas, consultas por `workspaceId + id`, reautorização e
  bloqueios transacionais impedem vínculos entre tenants e mantêm a mesma
  resposta pública para IDs inexistentes ou estrangeiros;
- valores monetários são inteiros exatos em centavos, dentro do intervalo
  seguro do JavaScript, e datas de negócio usam o tipo PostgreSQL `date` e o
  formato ISO, sem conversão implícita de fuso horário;
- tags, responsáveis e parcelas são relações próprias. Responsáveis precisam
  ser membros do workspace, parcelas mantêm ordem e soma exata, e vínculos já
  existentes com itens arquivados podem ser preservados sem permitir novas
  associações arquivadas;
- `POST /api/projects/from-service` valida e bloqueia o modelo, o negócio, os
  serviços adicionais, membros e tags; materializa o projeto, os snapshots, a
  data final e as parcelas em uma única transação, sem criar tarefas;
- os serviços desta etapa são modelos mínimos de projeto. Catálogos completos,
  versionamento e modelos adicionais permanecem no escopo da BE-09;
- Projetos, Registros, Pauta, Agenda e os seletores de Projeto/Tarefa consomem a
  API e não dependem operacionalmente de `demanda:crud:projetos`;
- ao concluir a BE-07, tarefas ainda eram locais e registravam o ID e a
  proveniência do workspace do projeto; esse limite foi removido pela BE-08. A
  ordenação de projetos na Agenda continua local em
  `demanda:agenda:schedule:v3` até a BE-10;
- dados antigos de projetos não eram importantes e não foram importados;
- 103 testes unitários e 58 testes PostgreSQL aprovados, além de
  `svelte-check` sem erros ou avisos, build de produção e histórico de
  migrations íntegros;
- `npm run verify:http:projects` aprovado contra servidor local real, cobrindo
  autenticação, snapshot do modelo, filtros, edição, arquivamento idempotente,
  anti-IDOR, vínculos entre tenants e rollback com limpeza dos dados de prova.

## BE-08 — Tarefas e subtarefas

Objetivo: criar a fonte de verdade usada por registros, pauta, agenda e
cronograma.

- [x] Modelar tarefas, subtarefas, ordem, duração, prioridade e status.
- [x] Relacionar tarefas a projeto, negócio, responsáveis e tags.
- [x] Implementar CRUD e mudanças de estado idempotentes.
- [x] Definir regras para conclusão, reabertura e arquivamento.
- [x] Atualizar Registros e Pauta para consumir o servidor.
- [x] Testar alterações concorrentes.

Critério de aceite: todas as telas que editam tarefas usam a mesma API e uma
alteração nunca sobrescreve silenciosamente uma versão mais recente.

Verificação em 14/07/2026:

- migration `0011_tasks` modela o agregado nas tabelas `tasks`,
  `task_subtasks`, `task_responsibles` e `task_tags`, com ordem geral e por
  quadro, prioridade, estado e timestamps. A duração de cada subtarefa vai de
  30 a 10.080 minutos em múltiplos de 30; valores válidos são preservados sem
  truncamento e valores fora do contrato são rejeitados;
- a chave estrangeira composta `workspace + projeto + negócio` garante que o
  negócio da tarefa seja o mesmo do projeto. Relações compostas também impedem
  subtarefas, responsáveis e tags de outro workspace. Tarefas já vinculadas a
  projeto ou negócio arquivado continuam visíveis e editáveis, mas não é
  permitido criar um novo vínculo com esses pais arquivados;
- `GET/POST /api/tasks` implementa listagem paginada, busca, filtros, facets e
  criação. `GET/PUT/DELETE /api/tasks/[taskId]` implementa leitura, edição e
  arquivamento. O `PUT` agregado salva conteúdo, status, relações e subtarefas
  na mesma transação, de modo que uma falha tardia desfaz toda a edição;
- rotas `PUT` próprias oferecem transições idempotentes de estado da tarefa e de
  cada subtarefa. `PUT /api/tasks/board` reordena em lote as visões por status,
  prioridade, negócio ou projeto;
- toda alteração de uma tarefa existente usa a `version` do agregado, bloqueio
  transacional e compare-and-swap. Uma versão obsoleta retorna `409`, sem
  sobrescrever uma alteração mais recente; mudanças em subtarefas também
  incrementam a versão da tarefa;
- a reordenação da Pauta bloqueia e valida todas as tarefas e versões antes de
  aplicar o lote. Se qualquer item falhar, a transação inteira sofre rollback e
  nenhuma posição, coluna ou relação é alterada;
- somente `PUT /api/tasks/board` atribui posições por quadro. Mudanças de status,
  prioridade, projeto ou negócio removem a posição obsoleta da dimensão; trocar
  o negócio de um projeto também atualiza e versiona, na mesma transação, todas
  as suas tarefas vinculadas, inclusive arquivadas;
- repetir uma transição cujo estado-alvo já foi atingido ou arquivar novamente
  é idempotente. Concluir uma tarefa exige todas as subtarefas concluídas;
  reabrir uma subtarefa exige reabrir primeiro a tarefa, e tarefas arquivadas
  não podem ser alteradas;
- Registros, Pauta e o formulário global editam pela API. Ao mover um card, a
  Pauta reindexa as colunas ativas completas de origem e destino, inclusive as
  tarefas ocultas por busca ou filtros, evitando posições duplicadas. Dashboard,
  Agenda, Cronograma, Workspaces e vínculos de Projeto também leem tarefas da
  API;
- Agenda e Cronograma passaram a persistir suas alocações no servidor nas
  etapas BE-10 e BE-11. As antigas chaves locais continuam intactas, fora das
  leituras e escritas normais, para a migração controlada da BE-15;
- o armazenamento legado `demanda:crud:entregas` permanece intacto e fora das
  leituras e escritas normais; sua importação explícita e validada pertence à
  BE-15;
- testes focados de validação, cliente, schema e serviço cobrem o agregado,
  limites de duração sem truncamento, pais arquivados já vinculados, isolamento,
  regras de estado, idempotência, reordenação em lote, rollback e concorrência;
- `npm run verify:http:tasks` aprovado contra servidor local real, cobrindo
  autenticação, CRUD e filtros, edição atômica de conteúdo e status,
  versionamento, lote atômico da Pauta com rollback, idempotência, regras de
  conclusão e reabertura, conflitos `409`, anti-IDOR, arquivamento e limpeza dos
  dados de prova.

## BE-09 — Configurações, catálogos e modelos

Objetivo: separar preferências do usuário das configurações compartilhadas.

- [x] Classificar cada configuração atual como local, do usuário ou do workspace.
- [x] Modelar catálogos de status, categorias, tags e prioridades.
- [x] Modelar modelos de projeto, entrega e subtarefa.
- [x] Implementar versionamento e validação dos modelos.
- [x] Manter localmente apenas preferências específicas do dispositivo.
- [x] Substituir importação/exportação irrestrita do armazenamento do navegador.

Critério de aceite: configurações compartilhadas respeitam permissões e
preferências pessoais não alteram a experiência de outros membros.

Verificação em 14/07/2026:

- migrations `0012_polite_leech` e `0013_absent_aaron_stack` aplicadas no
  PostgreSQL local e aprovadas pelo `drizzle-kit check`;
- preferências pessoais persistidas por usuário em `user_preferences`, com
  validação estrita e compare-and-swap por versão;
- catálogos compartilhados persistidos em `workspace_catalog_entries`, tags e
  modelos de projeto reutilizando `tags` e `services`, e modelos de entrega e
  subtarefa persistidos em tabelas relacionais próprias;
- configurações compartilhadas versionadas como um agregado por workspace.
  Apenas `owner` e `admin` podem alterá-las; membros podem ler a mesma fonte;
- APIs `/api/preferences`, `/api/workspace-settings` e `/api/settings` substituem
  a leitura e gravação operacional de `demanda:settings` nas telas. A chave
  antiga permanece somente como fonte de migração explícita;
- exportação usa um formato tipado e limitado aos escopos autorizados. A
  importação valida o arquivo inteiro e grava os escopos em uma única transação,
  com rollback integral em caso de conflito ou relação inválida;
- 130 testes unitários e 78 testes PostgreSQL aprovados, cobrindo validação,
  isolamento pessoal e entre workspaces, permissões, versionamento e rollback;
- `svelte-check`, build de produção, histórico de migrations e diagnóstico da
  conexão PostgreSQL aprovados.

## BE-10 — Agenda

Objetivo: persistir datas e ordenação da agenda sobre projetos e tarefas reais.

- [x] Definir se a agenda armazena eventos próprios ou projeções das entidades.
- [x] Persistir data, posição e duração com constraints.
- [x] Implementar movimentos em uma transação.
- [x] Tratar fuso horário e mudança de dia no servidor.
- [x] Substituir `demanda:agenda:schedule:v3`.
- [x] Testar ordenação e concorrência.

Critério de aceite: movimentos são consistentes entre sessões e não deixam
posições duplicadas ou referências órfãs.

Verificação em 14/07/2026:

- a Agenda foi definida como projeção persistida de projetos e tarefas reais,
  sem criar uma terceira entidade de negócio concorrente;
- migration `0014_sudden_proudstar` aplicada no PostgreSQL local e aprovada pelo
  `drizzle-kit check`; `agenda_entries` usa chaves estrangeiras compostas para
  manter cada projeção no mesmo workspace da entidade;
- data civil usa PostgreSQL `date`; posição, duração em múltiplos de 30 minutos
  e versão possuem constraints. A unicidade com `NULLS NOT DISTINCT` impede
  posições duplicadas inclusive na lista sem data;
- `GET /api/agenda` materializa projeções ausentes e remove projeções de itens
  arquivados. `PUT /api/agenda` valida o conjunto completo do modo, bloqueia o
  workspace e todas as posições, compara versões e reordena em uma transação;
- a tela Agenda consome a API e não lê, altera nem remove
  `demanda:agenda:schedule:v3`. Modo, visualização e drawer permanecem locais por
  serem preferências específicas do dispositivo;
- testes com dois movimentos simultâneos confirmam que apenas um vence e o
  segundo recebe conflito `409`, sem posições duplicadas ou gravação parcial;
- 135 testes unitários e 81 testes PostgreSQL aprovados, além de `svelte-check`,
  build de produção, migrations e diagnóstico da conexão.

## BE-11 — Cronograma e conflitos

Objetivo: tornar o servidor responsável pelas regras de alocação.

- [x] Modelar blocos de cronograma em horários reais.
- [x] Portar validação de sequência, duração e sobreposição para o servidor.
- [x] Bloquear conflitos dentro de uma transação.
- [x] Implementar leitura por intervalo e responsável.
- [x] Substituir `demanda:cronograma:schedule:v2`.
- [x] Testar gravações simultâneas e limites de jornada.

Critério de aceite: duas gravações simultâneas não conseguem criar um conflito
que seria proibido pela interface.

Verificação em 14/07/2026:

- a migration `0015_careless_grey_gargoyle` criou `cronograma_blocks` com data
  civil, início e duração em múltiplos de 30 minutos, versão, limite diário e
  chaves compostas para tarefa e subtarefa do mesmo workspace;
- `GET /api/cronograma` lê todos os blocos ou filtra por intervalo e responsável.
  `PUT` e `DELETE` em `/api/cronograma/[subtaskId]` usam compare-and-swap;
- toda escrita bloqueia o workspace e valida o estado final completo antes de
  gravar. Sequência de subtarefas, sobreposição por responsável, dias úteis e
  turnos pessoais são regras autoritativas do servidor;
- Cronograma e Dashboard consomem a API. A chave legada
  `demanda:cronograma:schedule:v2` não é mais lida nem escrita e foi preservada
  intacta para a importação explícita da BE-15;
- o teste concorrente agenda duas subtarefas distintas do mesmo responsável no
  mesmo horário: apenas uma transação vence e a outra recebe conflito `409`.
- 143 testes unitários e 85 testes PostgreSQL aprovados, além de
  `svelte-check`, build de produção, migrations e diagnósticos do banco.

## BE-12 — Financeiro

Objetivo: persistir lançamentos financeiros sem usar números de ponto flutuante.

- [x] Modelar receitas, despesas, parcelas, recorrência e liquidação.
- [x] Usar `numeric`/decimal para valores monetários.
- [x] Relacionar lançamentos automáticos ao projeto de origem.
- [x] Implementar pausa, baixa, edição e exclusão auditável.
- [x] Substituir `demanda.finance.entries.v1`.
- [x] Testar totais, recorrência, competência e autorização financeira.

Critério de aceite: totais são calculados no servidor sem perda de precisão e
operações automáticas são idempotentes.

Verificação em 14/07/2026:

- a migration `0016_nifty_smasher` criou `financial_entries` com valores
  `numeric(18,2)`, competência, vencimento, estado, série, versão, autoria e
  exclusão lógica;
- parcelas de projetos são materializadas como receitas automáticas por vínculo
  único com `project_installments`. Leituras repetidas preservam IDs e versões,
  comprovando idempotência;
- lançamentos manuais aceitam ocorrências pontuais, até 99 parcelas ou até 120
  recorrências mensais. A soma das parcelas é validada em centavos inteiros;
- `/api/finance` consulta por vencimento ou competência. Criação, edição,
  pausa, retomada, liquidação e exclusão revalidam workspace e versão dentro da
  transação; cada mutação gera registro append-only em `audit_logs`;
- Financeiro e Dashboard consomem a API. `demanda.finance.entries.v1` não é
  mais lida nem escrita e permanece intacta para a importação explícita da
  BE-15;
- 148 testes unitários e 90 testes PostgreSQL aprovados antes da verificação
  final de build, migrations e saúde do banco.

## BE-13 — Perfil e uploads

Objetivo: retirar imagens em base64 das configurações e armazenar arquivos de
forma segura.

- [x] Criar metadados de arquivo e política de propriedade.
- [x] Validar MIME real, extensão, tamanho e dimensões.
- [x] Usar disco persistente no desenvolvimento e storage compatível com S3 em
      produção.
- [x] Implementar upload, leitura autorizada e exclusão.
- [x] Migrar foto de perfil e preparar anexos futuros.
- [x] Testar arquivos inválidos e acesso entre workspaces.

Critério de aceite: nenhum conteúdo base64 fica salvo no banco e um arquivo
privado não pode ser obtido por outro workspace.

Verificação executada em 14/07/2026: a migration `0017_wet_turbo` criou
`stored_files` e removeu fotos base64 legadas; validação binária, storage local,
perfil, auditoria, exclusão e isolamento entre workspaces foram cobertos por
testes unitários e de integração PostgreSQL. O driver S3 usa bucket privado e a
mesma política de metadados/autorização. A regressão final aprovou 157 testes na
suíte principal, 93 testes de integração, checagem Svelte/TypeScript e build de
produção; a consulta ao banco confirmou zero fotos base64 persistidas.

Revisão de mídia executada em 11/08/2026: a migration `0028_needy_skrulls`
acrescentou estados, metadados de entrada e quota concorrente. O upload passou a
aceitar somente JPEG/PNG, usar original temporário, autorrotação e remoção de
metadados pelo Sharp, maior lado de 2048 px, meta de 700 KiB e teto de 1 MiB.
Limpeza/reconciliação e migração legada preservam objetos antigos até purge
explícito. O domínio de diário ainda não existe e, portanto, seu vínculo não foi
inventado nesta etapa.

## BE-14 — Dashboard, atividades e busca

Objetivo: substituir mocks por projeções dos dados persistidos.

- [x] Definir eventos que alimentam o histórico de atividades.
- [x] Criar consultas agregadas para métricas e carga de trabalho.
- [x] Implementar agenda de hoje e atividades recentes.
- [x] Implementar busca global com escopo e paginação.
- [x] Adicionar índices orientados pelas consultas reais.
- [x] Remover dependência dos arquivos `.mock.ts` nas telas finais.

Critério de aceite: dashboard e busca refletem apenas dados autorizados e as
consultas críticas têm plano/tempo medido.

Verificação em 14/07/2026:

- `GET /api/dashboard` entrega, em uma projeção autorizada pelo workspace ativo,
  métricas de tarefas, projetos e financeiro, carga diária, agenda de hoje e as
  doze atividades mais recentes. A resposta informa intervalo e `queryMs`;
- o histórico combina ações append-only de `audit_logs` com os eventos
  persistidos `contact.created`, `business.created`, `project.created`,
  `task.created` e `task.completed`, sempre derivados de linhas do workspace;
- `GET /api/search` pesquisa Contatos, Negócios, Projetos e Tarefas, aceita
  escopo, página e tamanho, ordena correspondências exatas e prefixos primeiro
  e devolve links de destino. A BE-14 não altera o cabeçalho nem adiciona uma
  interface de busca sem uma decisão explícita de produto;
- a migration `0018_fixed_colonel_america.sql` adiciona quatro índices GIN de
  busca textual, sem extensão global, e um índice para prazos/status de
  projetos. O teste executa `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`, valida os
  cinco índices e limita a consulta crítica a 2 segundos;
- o endpoint agregado fica disponível para integrações futuras, mas a interface
  e o comportamento anteriores do Dashboard foram preservados integralmente.
  A página final não depende de `dashboard.mock.ts`; componentes demonstrativos
  não usados continuam intactos e fora da rota;
- isolamento positivo e anti-IDOR foram verificados com dois workspaces. A
  regressão aprovou 161 testes unitários, 95 testes PostgreSQL,
  `svelte-check` sem erros ou avisos, migrations isoláveis, integridade do banco
  e build de produção.

## BE-15 — Migração dos dados do navegador

Objetivo: oferecer uma passagem controlada do protótipo local para o banco.

- [ ] Inventariar todas as chaves, versões e migrations atuais.
- [ ] Importar `demanda:crud:entregas` e sua chave de versão somente por fluxo
      explícito e validado; a aplicação não lê, altera nem exclui esse legado desde
      a BE-08.
- [ ] Corrigir a diferença entre prefixos `demanda:` e `demanda.` no financeiro.
- [ ] Criar um formato de importação tipado e versionado.
- [ ] Validar o arquivo inteiro antes de começar a gravar.
- [ ] Importar tudo em uma transação idempotente.
- [ ] Exibir relatório de importados, ignorados e inválidos.
- [ ] Remover seeds automáticos do fluxo de produção.

Critério de aceite: importar o mesmo backup duas vezes não duplica registros e
uma falha não deixa migração parcial.

## BE-16 — Notificações e atualização em tempo real

Objetivo: adicionar sincronização somente onde houver ganho real de produto.

- [ ] Mapear telas que precisam de atualização imediata.
- [ ] Implementar notificações persistentes e marcação de leitura.
- [ ] Escolher SSE ou WebSocket conforme os fluxos confirmados.
- [ ] Revalidar autorização em cada conexão e evento.
- [ ] Implementar reconexão e recuperação por cursor.
- [ ] Testar quedas, duplicatas e eventos fora de ordem.

Critério de aceite: a funcionalidade continua correta sem a conexão em tempo
real e se recupera sem perder ou duplicar operações.

## BE-17 — Segurança, testes e observabilidade

Objetivo: endurecer o conjunto completo antes da produção.

- [ ] Cobrir serviços críticos com testes unitários e de integração.
- [ ] Cobrir jornadas principais com testes de ponta a ponta.
- [ ] Adicionar rate limiting, limites de payload e cabeçalhos de segurança.
- [ ] Revisar CSRF, XSS, injeção, enumeração e exposição de erros.
- [ ] Adicionar logs estruturados com ID da requisição, sem dados sensíveis.
- [ ] Criar métricas e alertas para erro, latência, pool e filas.
- [ ] Executar revisão de dependências e modelo de ameaças.

Critério de aceite: a matriz de autorização e os fluxos críticos têm cobertura
automatizada, e falhas de produção podem ser diagnosticadas sem expor segredos.

## BE-18 — Empacotamento, deploy e operação

Objetivo: executar a aplicação e suas migrations de maneira repetível.

- [ ] Criar imagem/artefato imutável do servidor Node.
- [ ] Separar build, migration e inicialização da aplicação.
- [ ] Configurar secrets, TLS, proxy e armazenamento persistente.
- [ ] Criar endpoints de liveness e readiness.
- [ ] Automatizar backup e testar restauração de banco e arquivos.
- [ ] Definir rollback de aplicação e estratégia de migration compatível.
- [ ] Documentar runbook de incidentes e manutenção.

Critério de aceite: uma implantação limpa e um rollback são reproduzíveis, e um
backup restaurado é validado em ambiente separado.
