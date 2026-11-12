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

### Criar projeto

```text
CRIE PROJETO: Nome do projeto | NEGÓCIO: Nome do negócio
```

O projeto é criado em planejamento, com início na data atual, sem valor, e com
o usuário atual como responsável.

Exemplo:

```text
CRIE PROJETO: Site institucional | NEGÓCIO: Macajo
```

### Criar tarefa

```text
CRIE TAREFA: Nome da tarefa | PROJETO: Nome do projeto
```

A tarefa é criada em planejamento, prioridade normal, sem data de entrega, com
uma subtarefa inicial de uma hora e o usuário atual como responsável.

Exemplo:

```text
CRIE TAREFA: Criar wireframe da página inicial | PROJETO: Site institucional
```

## Exemplo de lote completo

```text
CRIE CONTATO: Caleb Martins
CRIE NEGÓCIO: Macajo | RESPONSÁVEL: Caleb Martins
CRIE PROJETO: Site institucional | NEGÓCIO: Macajo
CRIE TAREFA: Criar wireframe da página inicial | PROJETO: Site institucional
CRIE TAREFA: Definir identidade visual | PROJETO: Site institucional
```
