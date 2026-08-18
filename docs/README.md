# Demanda

Nova base visual do projeto, construída com SvelteKit e TypeScript.

## Executar localmente

```powershell
npm install
npm run dev
```

A aplicação estará disponível em `http://localhost:5190`.

## Verificações

```powershell
npm run check
npm run build
```

O projeto já inclui PostgreSQL, migrations, autenticação, autorização por
workspace e persistência compartilhada de Pessoas/Contatos, Negócios, Serviços,
Projetos, Tarefas, Subtarefas, catálogos e modelos. Preferências pessoais e
configurações compartilhadas também usam APIs versionadas. Todas as superfícies
leem tarefas pela API; Agenda, Cronograma e Financeiro também persistem seus
dados no servidor. O Financeiro usa valores decimais, séries parceladas ou
recorrentes e operações versionadas/auditáveis. Fotos de perfil agora usam
arquivos privados com metadados no PostgreSQL, disco persistente em
desenvolvimento e driver S3 em produção; JPEG/PNG são processados pelo Sharp,
limitados a 2048 px e 1 MiB, contabilizados por usuário e nunca persistidos como
base64 nas preferências. A
BE-14 disponibiliza projeções autorizadas de Dashboard, atividades e busca no
back-end, sem alterar o layout existente nem adicionar uma busca ao cabeçalho.
Os dados locais legados são preservados para a migração controlada da BE-15,
que é a próxima e única etapa ativa.

O `PUT` agregado de uma tarefa salva conteúdo e status na mesma transação. A
Pauta reindexa as colunas ativas completas, mesmo sob filtros, e envia a
reordenação versionada em lote para `/api/tasks/board`; qualquer conflito desfaz
o lote inteiro. Subtarefas aceitam de 30 a 10.080 minutos, sem truncar valores
válidos. Uma tarefa mantém visibilidade e edição quando seu projeto ou negócio
já vinculado é arquivado, embora novos vínculos com pais arquivados sejam
rejeitados.

Leia [architecture.md](./architecture.md) antes de criar novas páginas.

O roteiro de implementação do servidor está em
[backend-roadmap.md](./backend-roadmap.md).

As instruções do ambiente local estão em
[backend-setup.md](./backend-setup.md).

O pipeline e a operação de imagens privadas estão em
[private-media.md](./private-media.md).
