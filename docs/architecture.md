# Arquitetura da casca

## Princípio principal

Preferimos vários arquivos pequenos e específicos a um arquivo grande que
misture responsabilidades. Sessenta linhas são uma referência de leitura, não
uma meta artificial: um componente pode ultrapassá-la quando continuar tratando
de uma única peça coesa.

## Organização

```text
src/
├── hooks.server.ts contexto autenticado de cada requisição
├── lib/
│   ├── dashboard/   componentes exclusivos da visão geral
│   ├── server/      banco, autenticação, autorização e serviços server-only
│   ├── shell/       sidebar, topbar e navegação móvel
│   └── ui/          componentes realmente compartilhados
├── routes/
│   └── (app)/       uma pasta isolada para cada página
└── styles/          tokens e normalização global

static/              assets públicos versionados
.data/uploads/       arquivos privados locais (ignorado pelo Git)
```

## Regras de desenvolvimento

1. Uma página não importa componentes internos de outra página.
2. Componentes do `shell` organizam a tela, mas não conhecem regras de negócio.
3. Código compartilhado só entra em `ui` depois do segundo uso real.
4. Dados temporários recebem o sufixo `.mock.ts` e nunca simulam persistência.
5. Funções recebem comentários quando explicam uma decisão, limite ou efeito
   que não seja óbvio pela assinatura.
6. Uploads não entram em `src`, `static` ou no processo de build.
7. Novas dependências precisam resolver uma necessidade concreta do produto.

## Limite multi-tenant

O hook global resolve a sessão e o workspace ativo no servidor e publica esse
contexto tipado em `App.Locals`. Serviços recebem o contexto autorizado e ainda
revalidam papéis dentro da transação antes de escritas administrativas.

Consultas de entidades devem sempre combinar o ID do recurso com o ID do
workspace autorizado. Um recurso inexistente e um recurso de outro workspace
retornam a mesma resposta pública, e nenhum identificador vindo do navegador é
considerado prova de acesso.

Contatos, Negócios, Serviços, Projetos e Tarefas já foram migrados para esse
limite. O cliente conversa somente com suas rotas `/api`; elas extraem o
workspace da sessão e os serviços repetem o par `workspaceId + id` em consultas,
bloqueios e detalhes filhos. Essas entidades não reutilizam o armazenamento
genérico das entidades que ainda aguardam migração.

Responsáveis de um Negócio usam chaves estrangeiras compostas para Contatos do
mesmo workspace. Listagens paginadas são montadas em uma transação de leitura
com snapshot consistente, e criações/edições reautorizam o membro e bloqueiam
as linhas relacionadas antes de substituir os detalhes.

Projetos relacionam por chaves estrangeiras compostas o workspace, o Negócio e
os Serviços. Tags, responsáveis e parcelas vivem em tabelas próprias;
responsáveis são membros/usuários do workspace, não Contatos. Valores
monetários são inteiros em centavos, e datas civis usam PostgreSQL `date` e
strings ISO para não adquirir horário ou fuso acidentalmente.

As rotas `/api/services`, `/api/projects` e seus recursos individuais aplicam
corpos estritos, filtros, CRUD e arquivamento idempotente. A rota
`/api/projects/from-service` bloqueia e valida todas as dependências e cria o
projeto, os snapshots, vínculos e parcelas em uma única transação. Serviços são
os modelos de projeto compartilhados; a BE-09 acrescentou sua ordem e versão,
além dos modelos relacionais de entrega e subtarefa.

Tarefas formam um agregado em `tasks`, `task_subtasks`, `task_responsibles` e
`task_tags`. A chave composta `workspace + projeto + negócio` mantém o negócio
da tarefa coerente com seu projeto, enquanto outras relações compostas limitam
subtarefas, membros responsáveis e tags ao mesmo tenant. Ordem, duração,
prioridade, status e posição por quadro fazem parte do agregado. A duração de
uma subtarefa é validada entre 30 e 10.080 minutos, em múltiplos de 30, sem
truncar valores válidos.

As rotas `/api/tasks` e `/api/tasks/[taskId]` aplicam listagem, filtros, CRUD e
arquivamento. O `PUT` do agregado persiste conteúdo, status, relações e
subtarefas na mesma transação, permitindo concluir ou reabrir pai e filhos
atomicamente; uma falha tardia desfaz tudo. As rotas `PUT` específicas de estado
continuam disponíveis para transições focadas e idempotentes.

`PUT /api/tasks/board` recebe um lote para as visões por status, prioridade,
negócio ou projeto. O serviço bloqueia as tarefas em ordem estável, valida todas
as versões e relações e só então aplica posições e mudanças de coluna. Se um
item falhar, a transação sofre rollback integral. Toda alteração de uma tarefa
existente usa compare-and-swap; uma versão obsoleta retorna `409`, e alterar um
filho ou uma posição incrementa a versão do agregado.

Somente essa rota em lote atribui posições em `boardOrder`. Alterações feitas
pelas demais rotas removem a posição da dimensão que mudou. Se um projeto troca
de negócio, a mesma transação remove a posição por negócio de todas as tarefas
vinculadas, inclusive arquivadas, e incrementa suas versões.

A tarefa somente pode ser concluída quando todas as subtarefas ativas estão
concluídas; uma subtarefa só pode ser reaberta depois da tarefa, e o
arquivamento é separado do status e impede novas alterações. Registros, Pauta e
o formulário global editam pela API; todas as demais superfícies que exibem
tarefas também leem dessa fonte server-side.

Projeto ou negócio arquivado não torna órfã uma tarefa já vinculada: ela
continua visível e editável enquanto preservar esses pais, mas não pode criar um
novo vínculo com pais arquivados. Na Pauta, uma movimentação reindexa as colunas
ativas completas de origem e destino antes de montar o lote, sem limitar o
cálculo aos cards visíveis pela busca ou pelos filtros; isso impede que itens
ocultos mantenham posições duplicadas.

A Agenda persiste data, duração e posição em `agenda_entries`. O Cronograma
persiste blocos versionados em `cronograma_blocks`; ambos referenciam projetos,
tarefas ou subtarefas reais e não duplicam seu conteúdo.

## Configurações, catálogos e modelos

A BE-09 divide as configurações em três escopos explícitos:

- **usuário:** tema, densidade, aparência, telas e filtros padrão, preferências
  de Dashboard, Registros, Pauta, Agenda, Cronograma e Financeiro, idioma, fuso,
  jornada, lembretes e apresentação do perfil. O JSON validado vive em
  `user_preferences` e uma alteração nunca afeta outro usuário;
- **workspace:** status, categorias, prioridades, tags, categorias financeiras,
  modelos de projeto, entrega e subtarefa. Esses dados usam tabelas relacionais,
  são lidos por todos os membros e alterados somente por `owner` ou `admin`;
- **dispositivo:** estado transitório e visual da sessão, como expansão da barra
  lateral, drawer, aba ou visualização lembrada. Esses valores podem continuar
  locais e não entram no backup sincronizado.

`workspace_configurations` fornece a versão do agregado compartilhado. Serviços,
tags e modelos também têm versões próprias, e mudanças realizadas por outras
rotas invalidam uma tela de configuração antiga. Catálogos possuem chaves
normalizadas, ordem, proteção dos valores estruturais e arquivamento lógico.

As rotas `/api/preferences`, `/api/workspace-settings` e `/api/settings` leem os
escopos sem aceitar `userId` ou `workspaceId` como prova de acesso. Escritas usam
compare-and-swap e revalidam a permissão dentro da transação. A importação em
`/api/settings/import` valida o formato tipado completo, confere o workspace e
grava preferências e dados compartilhados atomicamente.

O armazenamento `demanda:settings` não recebe novas escritas. Ele é apenas uma
fonte de leitura para a migração explícita dos modelos antigos na tela Meu
Negócio; nada é importado silenciosamente, apagado ou enumerado em massa.

## Agenda

`agenda_entries` é uma projeção de projetos e tarefas reais. Cada linha aponta
por chave estrangeira composta para exatamente uma entidade do mesmo workspace
e guarda data civil, posição, duração e versão. Arquivamento remove a projeção
da leitura; exclusão da entidade faz cascade, portanto a Agenda não mantém
referências órfãs.

A constraint única considera `NULL` como um valor comparável e impede duas
posições iguais para o mesmo modo e dia, inclusive na lista sem data. Datas usam
PostgreSQL `date` e strings `YYYY-MM-DD`, sem conversão por fuso horário.

`GET /api/agenda` materializa projeções ausentes a partir das datas de entrega
atuais. `PUT /api/agenda` recebe o estado completo de projetos ou tarefas,
revalida a permissão, bloqueia o workspace e as linhas, confere versões e só
então troca datas e posições. Dois movimentos concorrentes não podem vencer com
a mesma versão.

`demanda:agenda:schedule:v3` deixou de ser lido ou escrito, mas permanece
intacto para a migração controlada da BE-15. Apenas modo, visualização e estado
do drawer continuam locais por serem preferências do dispositivo.

## Cronograma

`cronograma_blocks` guarda um bloco por subtarefa, com data civil, início,
duração e versão. Chaves estrangeiras compostas garantem que workspace, tarefa
e subtarefa coincidam; constraints limitam a grade a múltiplos de 30 minutos e
impedem que um bloco ultrapasse o fim do dia.

`GET /api/cronograma` aceita intervalo e responsável opcionais. As escritas em
`/api/cronograma/[subtaskId]` bloqueiam o workspace, conferem a versão e validam
o estado final completo: subtarefas pendentes seguem sua ordem, responsáveis
não se sobrepõem e cada bloco cabe em um dia e turno configurado. Assim, duas
requisições concorrentes não podem confirmar o mesmo horário proibido.

Cronograma e Dashboard consomem essa API. A chave
`demanda:cronograma:schedule:v2` deixou de ser lida ou escrita, mas permanece
intacta para a importação explícita da BE-15.

## Financeiro

`financial_entries` guarda ocorrências de receita e despesa com valor
`numeric(18,2)`, competência, vencimento, estado, versão, autoria e exclusão
lógica. Séries identificam parcelas ou recorrências sem usar números de ponto
flutuante no contrato: a API recebe e soma centavos inteiros.

Parcelas de `project_installments` geram receitas automáticas com vínculo único
e idempotente. Seu conteúdo é editado no projeto de origem; a liquidação no
Financeiro atualiza também o estado da parcela. Lançamentos manuais podem ser
pontuais, parcelados ou recorrentes.

`GET /api/finance` aceita intervalo, tipo e base de data — vencimento ou
competência. Mutações bloqueiam o workspace, aplicam compare-and-swap e gravam
ações em `audit_logs`, que é append-only. Financeiro e Dashboard consomem essa
API; `demanda.finance.entries.v1` não é mais lida nem escrita e permanece
intacta para a BE-15.

## Perfil e arquivos privados

`stored_files` mantém somente metadados: workspace, proprietário, finalidade,
backend, chave opaca, nome original, MIME real, extensão, tamanho, dimensões e
SHA-256. O conteúdo fica fora do PostgreSQL e de `static`: em `.data/uploads`
no desenvolvimento ou em bucket S3 privado na produção.

`POST /api/files` aceita multipart e processa somente JPEG/JPG ou PNG. Extensão,
MIME, magic bytes e decodificação precisam concordar. O original vive sob
`temp/` apenas durante o processamento; Sharp autorrotaciona, remove metadados,
limita o maior lado a 2048 px e garante uma versão definitiva de até 1 MiB.
`GET /api/files/[fileId]/content` exige o proprietário ou um membro do workspace
do arquivo; IDs externos recebem a mesma resposta de recurso ausente. A
exclusão usa estado recuperável, remove o objeto do storage, desconta a quota e
é auditada. Anexos genéricos permanecem restritos ao proprietário.

O recorte do avatar produz um `File` temporário e envia bytes para a API. O JSON
de preferências guarda apenas a URL privada; a migration da BE-13 remove fotos
`data:` legadas. A finalidade `attachment` já existe nos metadados para anexos
futuros. Ainda não há entidade de diário; sua futura integração deverá criar
vínculo explícito e autorizar pelo proprietário da entidade. Consulte
[private-media.md](./private-media.md) para pipeline, quota, limpeza e migração.

## Dashboard, atividade e busca

`GET /api/dashboard` é a projeção operacional do workspace ativo: agrega
indicadores, financeiro, carga, agenda de hoje e atividade recente diretamente
no PostgreSQL. O histórico usa `audit_logs` para ações auditáveis e timestamps
das entidades para criação e conclusão. Esse endpoint não impõe uma alteração
visual: o Dashboard existente permanece intacto até uma integração de produto
ser solicitada explicitamente.

`GET /api/search` usa busca textual indexada sobre contatos, negócios, projetos
e tarefas. Escopo e paginação são validados e o `workspaceId` vem apenas da
sessão. A API não adiciona automaticamente controles à interface. Dashboard e
busca informam `queryMs`; os testes de integração também inspecionam os índices
e o plano com `EXPLAIN ANALYZE`.

Não há persistência de dados no navegador. Dados de negócio, workspaces,
tarefas pessoais e preferências ficam no PostgreSQL; a sessão autenticada usa
cookie seguro e estados transitórios de navegação ficam na URL ou em memória.

## Cards de entidade

`EntityCard.svelte` é o componente unitário global para cards de pessoa,
negócio, projeto e tarefa. `EntityCardList.svelte` aplica o mesmo contrato a
coleções. Quando `level` é omitido, ambos usam a preferência global persistida,
sempre normalizada para uma das dez escalas disponíveis.

Cards de tarefa encaixados na grade do cronograma são a exceção: eles mantêm o
visual próprio de célula mesclada. Durante o arraste, o cronograma usa o card
global de tarefa com `level={5}`.

## Raiz do projeto

Os arquivos soltos na raiz são somente os exigidos pelas ferramentas:
`package.json`, configurações do Svelte/TypeScript/Vite e `.gitignore`.
Documentação, código, assets e dados persistentes ficam em suas próprias pastas.
