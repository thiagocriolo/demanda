# Protocolo de comandos do assistente

Este documento define os comandos de Registros que o painel flutuante aceita.
O formato recomendado para uma IA é o JSON versionado em
`assistant-command-architecture.md`; as linhas abaixo continuam compatíveis para
uso manual.

## Regras gerais

- Para copiar uma resposta do ChatGPT, use o documento JSON recomendado.
- Para digitar manualmente, envie um comando de texto por linha na forma abaixo.
- Os comandos são processados de cima para baixo. Se uma linha falhar, as linhas
  anteriores já executadas permanecem gravadas e as posteriores não são executadas.
- Por enquanto o protocolo só cria registros. Não há comandos de edição,
  arquivamento, exclusão ou alteração financeira.
- Nomes devem ser completos o suficiente para evitar ambiguidade. Se houver dois
  registros com o mesmo nome, o assistente para e pede que a situação seja
  resolvida nos Registros.

## Comandos suportados

### Criar contato

```text
CRIE CONTATO: Nome completo
```

Exemplo:

```text
CRIE CONTATO: Caleb Martins
```

O contato aceita campos opcionais separados por `|`. As combinações são livres;
somente o nome é obrigatório. `STATUS` aceita exclusivamente `Lead`,
`Prospecto`, `Ativo`, `Desativado` ou `Arquivado`.

```text
CRIE CONTATO: Rafael Monteiro | STATUS: Ativo | TELEFONE: (88) 99999-0000 | E-MAIL: rafael@exemplo.com | PROFISSÃO: Designer | OBSERVAÇÕES: Indicado pela Camila
```

### Criar negócio

```text
CRIE NEGÓCIO: Nome do negócio | RESPONSÁVEL: Nome do contato
```

Se o contato responsável ainda não existir, ele é criado automaticamente como
um contato pessoa, em estágio de lead.

Exemplo:

```text
CRIE NEGÓCIO: Macajo | RESPONSÁVEL: Caleb Martins
```

Também são aceitos `CATEGORIA`, `STATUS` (ou `ETAPA`) e `OBSERVAÇÕES`. Para
vários responsáveis, separe os nomes por vírgula em `RESPONSÁVEL`.

### Criar projeto

```text
CRIE PROJETO: Nome do projeto | CONTRATO: Nome do contrato | TIPO: CÍCLICO ou PONTUAL
```

O projeto é criado em planejamento, com início na data atual, sem valor, e com
o usuário atual como responsável. Escolha `CÍCLICO` para uma recorrência ou
`PONTUAL` para uma entrega única.

Exemplo:

```text
CRIE PROJETO: Site institucional | CONTRATO: Fee Macajo | TIPO: PONTUAL
```

Também são aceitos `STATUS`, `INÍCIO`, `FIM`, `BRIEFING` e `TAGS` (separadas
por vírgula).

### Criar tarefa

```text
CRIE TAREFA: Nome da tarefa | PROJETO: Nome do projeto
```

A tarefa é criada em planejamento, prioridade normal, sem data de entrega, com
uma tarefa inicial de uma hora e o usuário atual como responsável.

Exemplo:

```text
CRIE TAREFA: Criar wireframe da página inicial | PROJETO: Site institucional
```

Também são aceitos `CATEGORIA`, `PRIORIDADE`, `STATUS`, `BRIEFING`,
`VENCIMENTO` e `TAGS`. `CRIE ENTREGA:` é sinônimo de `CRIE TAREFA:`.

### Criar contrato

```text
CRIE CONTRATO: Fee mensal | NEGÓCIO: Macajo | TIPO: RECORRENTE | VALOR: R$ 2.500,00 | INÍCIO: 2026-12-01 | FORMA PAGAMENTO: PIX | CONDIÇÕES: Vencimento todo dia 5
```

Além dos campos acima, o contrato aceita `FIM`, `VENCIMENTO` e `OBSERVAÇÕES`.
Para relações, use o nome completo e inequívoco do negócio ou projeto.

## Exemplo de lote completo

```text
CRIE CONTATO: Caleb Martins
CRIE NEGÓCIO: Macajo | RESPONSÁVEL: Caleb Martins
CRIE PROJETO: Site institucional | CONTRATO: Fee Macajo | TIPO: PONTUAL
CRIE TAREFA: Criar wireframe da página inicial | PROJETO: Site institucional
CRIE TAREFA: Definir identidade visual | PROJETO: Site institucional
```
