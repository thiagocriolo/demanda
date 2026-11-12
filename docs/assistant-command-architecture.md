# Arquitetura escalável do Assistente

O assistente não deve crescer como uma lista de frases ou `if`s de linguagem
natural. Ele recebe um **documento de comandos versionado**, produzido pelo
Projeto do ChatGPT, e executa somente operações registradas no catálogo.

```text
Pedido em português
  → Projeto do ChatGPT interpreta e gera JSON
  → painel Assistente valida o protocolo
  → catálogo confere recurso + ação permitidos
  → executor autorizado chama a API de domínio
  → resultado e auditoria retornam ao usuário
```

## Documento de comando

```json
{
  "protocol": "demanda.commands/v1",
  "commands": [
    {
      "id": "contact-caleb",
      "action": "create",
      "resource": "contact",
      "data": { "name": "Caleb" }
    },
    {
      "id": "business-macajo",
      "action": "create",
      "resource": "business",
      "data": {
        "name": "Macajo",
        "responsibleContactName": "Caleb"
      }
    }
  ]
}
```

Cada comando tem:

- `id`: identificador local para auditoria e resposta de erro;
- `action`: `create`, `update` ou `delete`;
- `resource`: o objeto de domínio, sem referência a URL ou banco de dados;
- `target`: necessário para alteração/exclusão, por `id` ou nome;
- `data`: dados específicos da ação.

## Catálogo de recursos

| Área       | Recursos                          | Ações projetadas          |
| ---------- | --------------------------------- | ------------------------- |
| Registros  | contato, negócio, projeto, tarefa | criar, modificar, excluir |
| Workspaces | workspace, membro                 | criar, modificar, excluir |
| Pauta      | posição/estado de tarefa          | modificar                 |
| Agenda     | item da agenda                    | modificar                 |
| Cronograma | bloco de agendamento              | criar, modificar, excluir |

O catálogo declara as ações possíveis, mas somente ações com executor no
backend são liberadas. Hoje, estão executáveis os quatro comandos `create` da
área Registros. Um comando futuro nunca deve ser considerado disponível só
porque aparece nesta tabela.

## Ordem de entrega recomendada

1. **Registros:** `update` e `delete` para contato, negócio, projeto e tarefa.
2. **Workspaces:** criar, editar, remover e gerenciar membros, sempre com
   confirmação explícita para ações administrativas.
3. **Pauta e Agenda:** mover/reordenar tarefas e projetos, com versão do
   registro para impedir sobrescrita concorrente.
4. **Cronograma:** criar, mover, redimensionar e remover blocos, validando
   conflitos de horário antes de persistir.
5. **Demais áreas:** acrescentar recursos ao catálogo, esquema de dados,
   executor de backend, testes de autorização e exemplos para o ChatGPT.

## Regras de segurança

- A IA só emite intenção; ela não executa SQL, não escolhe URL e não recebe
  tokens do banco de dados.
- Alterar ou excluir exige `target` não ambíguo. Se houver dois nomes iguais, o
  assistente pede uma escolha em vez de adivinhar.
- Comandos de lote são sequenciais. Até haver transações de lote por domínio,
  uma falha interrompe as próximas linhas e preserva as anteriores.
- Exclusões, mudanças de propriedade, permissões e valores financeiros devem
  apresentar uma confirmação antes da execução.
