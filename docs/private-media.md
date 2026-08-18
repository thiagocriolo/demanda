# Imagens privadas

## Contrato

Uploads de usuário aceitam somente JPEG/JPG (`image/jpeg`) e PNG
(`image/png`). Extensão, MIME declarado, magic bytes e decodificação pelo Sharp
precisam concordar. Os limites centralizados em
`src/lib/server/files/config.ts` são:

- entrada de até 15 MiB;
- até 50.000.000 pixels;
- maior lado definitivo de até 2048 px, sem ampliar imagens pequenas;
- meta de 700 KiB e teto obrigatório de 1 MiB para o arquivo definitivo.

JPEG, PNG opaco e fotografias sem transparência são emitidos como JPEG. PNG
com pixels transparentes permanece PNG. O processador aplica autorrotação,
redimensionamento proporcional e codificação sem copiar EXIF, GPS ou outros
metadados. As tentativas de qualidade e dimensão são limitadas; o upload falha
se não houver resultado aceitável sob o teto. Cada processo Node decodifica no
máximo duas imagens simultaneamente para limitar pressão de memória.

## Fluxo e componentes

`POST /api/files` autentica o usuário e faz as verificações baratas antes do
processamento. O original recebe uma chave temporária
`temp/{userId}/{uploadId}.upload`, é lido pelo `ImageProcessor` e sempre é
removido em `finally`. Somente o resultado validado é gravado em
`users/{userId}/media/{mediaId}.{jpg|png}`.

O PostgreSQL guarda em `stored_files` o proprietário, workspace, propósito,
backend, status, chave, nome original, MIME/tamanho/dimensões de entrada e de
saída, SHA-256 e datas. Os bytes nunca ficam no banco. O status `ready` é
necessário para leitura; `deleting` permite repetir exclusões interrompidas.

`user_storage_usage` mantém bytes usados, reservados e o limite opcional. Cada
upload reserva atomicamente 1 MiB antes da gravação definitiva, impedindo que
requisições concorrentes ultrapassem uma quota configurada. A confirmação troca
a reserva pelo tamanho real; falhas liberam a reserva. `GET /api/files/usage`
expõe o uso do usuário autenticado.

`PrivateFileStorage` isola filesystem e S3 compatível. Ambos implementam
upload sem sobrescrita intencional, leitura, exclusão idempotente, existência,
metadados e listagem. No momento, downloads passam pelo backend e por sua
autorização; URL assinada não é necessária para esse fluxo. Uma futura entrega
direta por S3 deverá acrescentar assinatura temporária ao adapter sem tornar o
bucket público.

## Privacidade

O ID, a chave ou uma URL antiga não provam autorização. O proprietário pode ler
e excluir sua mídia. Avatares também podem ser lidos por membros autorizados do
workspace porque aparecem em superfícies colaborativas. `attachment` fica
restrito ao proprietário até existir uma política explícita da entidade ligada.

O projeto ainda não possui entidade de diário. Quando ela for criada, o vínculo
de mídia deve usar uma chave estrangeira ou tabela relacional e revalidar a
propriedade do diário no servidor. Não aceite `diaryId`, `userId` ou
`storageKey` do cliente como autorização.

## Operação e legado

Execute uma reconciliação segura (órfãos apenas relatados):

```powershell
npm run media:cleanup
```

Para também remover objetos órfãos com mais de 24 horas:

```powershell
npm run media:cleanup -- --delete-orphans
```

A rotina sempre remove temporários vencidos, finaliza exclusões interrompidas e
descarta registros `pending`/`failed` antigos. A remoção de órfãos definitivos é
opt-in.

Para migrar arquivos anteriores ao pipeline, mantendo o objeto antigo como
backup e registrando sua chave em `legacy_storage_key`:

```powershell
npm run media:migrate-legacy
```

Depois de validar banco, contagem, SHA-256 e exibição, remova somente backups
verificados:

```powershell
npm run media:migrate-legacy -- --purge-backups
```

Nunca use a opção de purge como primeira etapa. A migration SQL `0028` não move
nem apaga objetos; apenas amplia metadados e inicializa a quota pela soma dos
arquivos ativos.

## Limitações conhecidas

- Não há thumbnails porque a interface atual não possui grid que justifique a
  variante e seu custo de quota.
- O multipart ainda é materializado por `request.formData()`. `Content-Length`
  é rejeitado antecipadamente quando disponível, `file.size` é conferido em
  seguida e `BODY_SIZE_LIMIT=16M` deve ser aplicado no runtime Node. O proxy de
  produção também precisa limitar o corpo a 16 MiB para uploads chunked.
- A integração específica com diários depende da criação desse domínio.
