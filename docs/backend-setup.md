# Configuração local do back-end

## Pré-requisitos

- Node.js 20 ou superior.
- MySQL 8 em execução.
- Um banco e um usuário exclusivos para a aplicação.

Use a instância local MySQL configurada para o banco `demanda`.

## Preparar o ambiente

1. Copie `.env.example` para `.env`.
2. Crie o usuário e o banco com um administrador do MySQL:

   ```sql
   create database if not exists demanda character set utf8mb4 collate utf8mb4_0900_ai_ci;
   create user if not exists 'demanda_app'@'127.0.0.1' identified by 'uma-senha-local-forte';
   grant all privileges on demanda.* to 'demanda_app'@'127.0.0.1';
   ```

3. Atualize `MYSQL_URL` no `.env` com a senha escolhida e mantenha
   `APP_ORIGIN=http://localhost:5190` para gerar links locais confiáveis.
4. Confira a conexão:

   ```powershell
   npm run db:check
   ```

O arquivo `.env` é ignorado pelo Git. O diagnóstico não imprime a URL nem a
senha. Uma configuração ausente ou inválida informa apenas quais variáveis
precisam ser revistas.

## Comandos

```powershell
npm run db:generate # gera migration SQL a partir do schema TypeScript
npm run db:migrations:check # valida o histórico local de migrations
npm run db:migrate  # aplica migrations pendentes
npm run db:seed     # cria, de forma idempotente, as contas locais e seus workspaces pessoais
npm run db:setup    # aplica migrations e depois o seed
npm run db:studio   # abre o navegador de dados do Drizzle
npm run db:check    # testa a conexão sem alterar dados
npm run db:verify   # verifica seed e invariants de usuário/workspace/owner
npm run test:integration # testa serviços e schema no banco MySQL configurado
npm run verify:http:businesses # testa a API de negócios em um servidor local ativo
npm run verify:http:projects # testa projetos, modelos, rollback e isolamento via HTTP
npm run verify:http:tasks # testa tarefas, estados, concorrência e isolamento via HTTP
npm run media:cleanup # limpa temporários e relata órfãos; exclusão de órfãos é opt-in
npm run media:migrate-legacy # processa legado mantendo o objeto antigo como backup
npm test            # executa os testes unitários
npm run check       # valida TypeScript e componentes Svelte
npm run build       # gera o build de produção
npm start           # inicia o build carregando as variáveis de .env
npm run format:check # confere a formatação do repositório
```

O build não abre conexão com o MySQL. A configuração é validada quando um
serviço de banco é usado; `npm start` carrega `.env` antes de iniciar o SSR.

## Arquivos privados

Em desenvolvimento, mantenha no `.env`:

```dotenv
FILE_STORAGE_DRIVER=local
FILE_STORAGE_PATH=.data/uploads
```

O diretório é criado sob demanda, persiste entre reinicializações e é ignorado
pelo Git. Não coloque uploads em `static`, pois os arquivos são privados e sua
leitura passa por `/api/files/[fileId]/content` com sessão e autorização.

Em produção, use `FILE_STORAGE_DRIVER=s3` e configure `S3_ENDPOINT`, `S3_REGION`,
`S3_BUCKET`, `S3_ACCESS_KEY_ID` e `S3_SECRET_ACCESS_KEY`. O bucket deve permanecer
privado; `S3_FORCE_PATH_STYLE=true` atende provedores compatíveis com S3 que
exigem URLs path-style.

Fotos aceitam somente JPEG/JPG e PNG de até 15 MiB e 50 megapixels. O servidor
verifica extensão, MIME, magic bytes e decodificação real, corrige orientação,
remove metadados, limita o maior lado a 2048 px e grava somente a versão
processada, com meta de 700 KiB e teto de 1 MiB. Defina `BODY_SIZE_LIMIT=16M` no
runtime Node e limite o corpo também no proxy de produção.

Quota, limpeza, migração segura e decisões do pipeline estão documentadas em
[private-media.md](./private-media.md).

## Autenticação local

- Crie uma conta em `/cadastro`; o cadastro também cria o workspace pessoal.
- Rotas internas, como `/dashboard`, redirecionam visitantes para `/login`.
- O menu do avatar encerra a sessão atual. Em Sistema > Segurança é possível
  trocar a senha e encerrar as outras ou todas as sessões.
- Em desenvolvimento, o link solicitado em `/esqueci-senha` aparece somente no
  terminal do servidor. A URL usa `APP_ORIGIN`, nunca o cabeçalho `Host`.
- O provedor de e-mail de produção permanece uma configuração de operação: o
  fluxo, o token e o adaptador de entrega já estão separados para essa conexão.

## Contexto e autorização por workspace

- Cada requisição resolve no servidor o usuário, a sessão, o workspace ativo e
  o papel do membro. Rotas e serviços usam esse contexto por `App.Locals`.
- O workspace ativo fica associado à sessão. A API só aceita uma troca depois
  de confirmar no PostgreSQL que o usuário pertence ao workspace solicitado.
- Se o vínculo ativo deixar de existir, a próxima requisição escolhe de forma
  segura outro workspace autorizado, priorizando o pessoal.
- Leitura e escrita são permitidas a `member`, `admin` e `owner`; administração
  exige `admin` ou `owner`; transferência de propriedade exige `owner`.
- Mudanças administrativas geram registros append-only em `audit_logs` na mesma
  transação da alteração.
- O seletor usa a sessão autenticada e a seleção ativa é persistida no
  PostgreSQL; nenhum valor do navegador participa da autorização.

## Pessoas e contatos

- A aba Contatos de `/registros` usa a API autenticada `/api/contacts`; o
  workspace é sempre obtido da sessão no servidor e não é aceito no corpo ou
  nos filtros enviados pelo navegador.
- A API oferece listagem paginada com busca, filtros e ordenação, além de
  criação, leitura, edição e arquivamento lógico.
- Telefones são armazenados em E.164, e-mails são normalizados para minúsculas
  e uma edição preserva todos os endpoints e observações do contato.
- O vínculo com uma conta de acesso é opcional e só aceita membros do mesmo
  workspace. Um contato arquivado não bloqueia um novo vínculo ativo.
- Negócios usam o PostgreSQL desde a BE-06, Projetos desde a BE-07 e Tarefas
  desde a BE-08. Os formulários relacionais consultam essas entidades pela API
  e preservam a proveniência do workspace.

## Negócios

- A aba Negócios de `/registros` e o formulário global usam as rotas
  autenticadas `/api/businesses` e `/api/businesses/[businessId]`.
- O workspace vem exclusivamente da sessão. O corpo aceita nome, categoria,
  etapa, IDs dos contatos responsáveis e notas; qualquer campo extra, inclusive
  `workspaceId`, é rejeitado.
- Listagem, busca, filtros, facets e ordenação são paginados. O arquivamento é
  lógico e idempotente.
- Um responsável precisa ser um contato do mesmo workspace. Contatos arquivados
  já vinculados podem ser mantidos em uma edição, mas não podem ser adicionados
  a outro negócio.
- Pauta, Projeto e Tarefa carregam o catálogo completo de Negócios ativos pela
  API. Referências locais antigas são exibidas como legadas e nunca são
  associadas a um registro do servidor apenas pela coincidência do nome.

Para repetir a verificação HTTP, inicie a aplicação em um terminal e rode em
outro:

```powershell
$env:LIVE_BASE_URL = "http://localhost:5190"
npm run verify:http:businesses
npm run verify:http:projects
npm run verify:http:tasks
```

Os verificadores aceitam somente `localhost`, criam contas e workspaces
temporários, testam o isolamento e removem todos os dados de prova no bloco de
limpeza. O roteiro de projetos também confirma snapshot do modelo, parcelas,
arquivamento idempotente e rollback transacional. O roteiro de tarefas confirma
edição atômica de conteúdo e status, concorrência otimista com resposta `409`,
reordenação em lote com rollback integral, retries idempotentes, regras de
estado, anti-IDOR, isolamento entre workspaces, arquivamento e limpeza
transacional.

## Projetos e serviços

- Serviços são os modelos compartilhados usados para iniciar projetos. Seus
  CRUDs autenticados ficam em `/api/services` e `/api/services/[serviceId]`;
  ordem, versão, catálogos e modelos de entrega/subtarefa são administrados
  pelas APIs de configurações da BE-09.
- Projetos usam `/api/projects` e `/api/projects/[projectId]`. As opções
  relacionais vêm de `/api/projects/options`, e
  `/api/projects/from-service` cria um projeto a partir de um serviço em uma
  única transação.
- O workspace é obtido exclusivamente da sessão. Os corpos são estritos e
  rejeitam campos extras, inclusive `workspaceId`; todas as entidades e
  relações são verificadas novamente por workspace durante a escrita.
- O projeto aponta por ID para o negócio, serviço principal e serviços
  adicionais. Tags, responsáveis e parcelas usam tabelas relacionais;
  responsáveis são usuários membros do workspace, não contatos.
- Valores monetários são enviados e persistidos como inteiros em centavos.
  Datas de início e fim usam `YYYY-MM-DD`, correspondem ao tipo PostgreSQL
  `date` e não sofrem conversão implícita de fuso horário.
- A criação por modelo copia os padrões, tags e responsáveis do serviço,
  calcula a data final pela duração e divide o valor em parcelas mensais com
  soma exata. Qualquer falha desfaz toda a criação, e nenhuma tarefa é criada
  nessa operação.
- Projetos, Registros, Pauta, Agenda e seletores relacionados consultam o
  servidor.
- A Agenda persiste datas, duração e ordem em `agenda_entries` e usa
  `/api/agenda`. O Cronograma persiste blocos em `cronograma_blocks`, usa
  `/api/cronograma` e valida no servidor sequência e sobreposição por
  responsável. Movimentos manuais podem sair do expediente; a reorganização
  automática continua limitada à jornada configurada. A antiga chave
  `demanda:cronograma:schedule:v2` não recebe novas leituras ou escritas e
  permanece intacta até a migração da BE-15.
- O Financeiro persiste ocorrências em `financial_entries`, usa `/api/finance`
  e materializa parcelas de projeto por vínculo único. Valores usam
  `numeric(18,2)`; a antiga chave `demanda.finance.entries.v1` permanece apenas
  como fonte legada para a BE-15.
- As chaves legadas de projetos e tarefas, `demanda:crud:projetos` e
  `demanda:crud:entregas`, não são migradas automaticamente. Seus dados não são
  lidos, apagados nem sobrescritos e ficam disponíveis para uma importação
  futura, explícita e validada na BE-15.

## Tarefas e subtarefas

- O agregado é persistido em `tasks`, `task_subtasks`, `task_responsibles` e
  `task_tags`. A tarefa aponta para um projeto e herda seu negócio; chaves
  compostas garantem que projeto, negócio, responsáveis, tags e filhos sejam do
  mesmo workspace. Cada subtarefa aceita entre 30 e 10.080 minutos, sempre em
  múltiplos de 30; valores válidos, inclusive o limite superior, são preservados
  sem truncamento.
- `/api/tasks` aceita `GET` para listar e `POST` para criar tarefas.
  `/api/tasks/[taskId]` aceita `GET` para ler, `PUT` para editar e `DELETE` para
  arquivar, com a versão no corpo das edições e em `?version=` no arquivamento.
  O `PUT` agregado salva conteúdo, status, relações e subtarefas na mesma
  transação; qualquer falha desfaz o conjunto inteiro.
- `PUT` em `/api/tasks/[taskId]/state` e em
  `/api/tasks/[taskId]/subtasks/[subtaskId]/state` oferece transições focadas e
  idempotentes. A listagem oferece paginação, busca, filtros, facets e ordenação.
- `PUT /api/tasks/board` recebe um lote versionado para reordenar as visões por
  status, prioridade, negócio ou projeto. O servidor bloqueia e valida o lote
  completo antes de gravar; uma versão obsoleta ou relação inválida causa
  rollback e nenhuma tarefa do lote é alterada.
- Cada alteração de uma tarefa existente usa sua `version` como
  compare-and-swap dentro de uma transação. Versões obsoletas retornam `409`;
  alterações de subtarefa também incrementam a versão do agregado. Repetir um
  estado já atingido e arquivar novamente são operações idempotentes.
- Uma tarefa só chega a `conclusao` quando todas as subtarefas ativas estão
  `concluida`. Para reabrir uma subtarefa, reabra primeiro a tarefa. O
  arquivamento é separado do status e torna a tarefa imutável.
- Uma tarefa cujo projeto ou negócio já vinculado foi arquivado continua
  visível e pode ser editada mantendo esses pais. Novos vínculos com projeto ou
  negócio arquivado são rejeitados.
- Registros, Pauta e o formulário global editam pela API. A Pauta reindexa as
  colunas ativas completas de origem e destino antes de enviar o lote, incluindo
  tarefas temporariamente ocultas por busca ou filtros, para não duplicar
  posições. Dashboard, Agenda, Cronograma, Workspaces e relações de Projeto
  também leem a mesma fonte de verdade do servidor.
