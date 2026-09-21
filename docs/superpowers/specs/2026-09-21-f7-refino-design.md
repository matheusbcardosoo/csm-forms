# F7 — Refino

> Spec de desenho. Última fase do roadmap de `02-arquitetura.md` §5.
> Escrita em 21/09/2026, logo depois de a F5 ser fechada.

## 1. Contexto

F0–F6 estão implementadas. O que a F7 junta são itens que ficaram de
fora das fases anteriores por não serem necessários para o sistema
funcionar — todos são **Could** em `01-requisitos.md`, exceto as
máscaras, que não têm RF porque são uso diário e não requisito de
negócio.

Isso muda o critério de ordenação: não há dependência técnica entre os
quatro incrementos. A ordem abaixo é por **irritação diária removida
por hora de trabalho**, do maior para o menor.

## 2. Escopo

| Incremento | Entrega | RF |
|---|---|---|
| **A** | Formatos e máscaras de campo no painel, e formatação defensiva do documento | — |
| **B** | QR / código de verificação de autenticidade e página pública de conferência | RF-HIST-14 |
| **C** | Geração de históricos em lote para uma turma | RF-HIST-13 |
| **D** | Relatórios da secretaria e importação agendada | RF-INT-10 |

**Fora de escopo:** RF-INT-12 (API NCA da SED) continua parada por
acesso externo; o acervo anterior ao Activesoft segue diferido em
`07-acervo-antigo-diferido.md`; RF-FORM-05 (ligar resposta de visita a
aluno) não é refino de secretaria e fica para depois do PR da fase.

## 3. Design detalhado

### 3.1 Incremento A — formatos e máscaras

O problema não é estético. `montar.ts` copia o CPF do cadastro direto
para o documento, e o texto do certificado interpola `CPF nº ${cpf}`:
um CPF que entrou pela importação do Activesoft como `12345678901` sai
impresso assim num documento permanente. Máscara na digitação resolve
o que for digitado de hoje em diante; não resolve o que já está no
banco nem o que a importação vai trazer amanhã.

Por isso o incremento tem **duas metades**:

1. **`shared/formatos.ts`** — formatadores canônicos (CPF, CNPJ, CEP,
   telefone, RA de SP), que aceitam valor cru ou já formatado e sempre
   devolvem a forma impressa. Ficam em `shared/` porque servidor e
   painel precisam dos mesmos: o painel para mascarar a digitação, o
   servidor para montar o documento.
2. **Formatação na montagem** (`montar.ts`): o documento formata o que
   recebe, venha do cadastro manual ou da importação. É a rede de
   segurança — a máscara é conveniência, esta é a garantia.

`CampoTexto` ganha uma prop `formato`, e não um componente novo: todos
os campos afetados já são `CampoTexto`, e trocá-los por `CampoCPF`,
`CampoCNPJ` etc. espalharia a mesma decisão por cinco componentes.

Campos afetados: CNPJ (Instituição, mantenedora, Estabelecimentos),
CEP e telefones (Instituição), CPF (ficha do aluno e cadastro rápido de
aluno, mais o CIN/CPF impresso e o CPF do texto do certificado).

**RG e RA ficam de fora de propósito.** RG não tem formato nacional —
cada estado compõe dígitos e letras do seu jeito, e mascarar o RG de
quem veio de outro estado é corromper o dado. O RA tem o mesmo
problema: a composição varia, e o que está no cadastro veio do
Activesoft ou da própria secretaria já na forma que eles usam. Inventar
uma máscara para os dois seria decidir um formato que não é nosso.

O que é **armazenado** continua sendo o que a pessoa digitou (com
máscara) ou o que a origem mandou (cru). Não há migration de
normalização: reescrever dado cadastral existente para caber num
formato é risco sem ganho, já que a camada de renderização resolve os
dois casos.

### 3.2 Incremento B — QR e verificação pública

Um QR no rodapé do documento apontando para
`/verificar/<codigo>`, e uma página pública que diz se aquele documento
é autêntico.

**O código não é o número de registro.** Registro é sequencial e
público no papel; usá-lo na URL deixaria qualquer pessoa enumerar
`/verificar/1/2026`, `/verificar/2/2026` e varrer os documentos
emitidos pela escola. O código é aleatório (22 caracteres, base62,
gerado na emissão e guardado na linha do histórico), o que torna a URL
adivinhável só por quem tem o papel na mão.

**O que a página mostra é o mínimo que serve para conferir**, porque
ela é pública: nome da escola, tipo do documento, nº e ano de registro,
data de emissão, status (válido / cancelado, com a data do
cancelamento) e o nome do aluno **parcialmente ocultado** (primeiro
nome e iniciais dos demais — `Matheus C. S.`). Quem está conferindo tem
o documento na mão e só precisa bater; quem achou o link por acaso não
recebe uma ficha de aluno. Sem notas, sem CPF, sem data de nascimento,
sem endereço.

A página é `noindex`, e a rota tem limite de tentativas por IP — um
código de 22 caracteres não se quebra por força bruta, mas o limite
evita que se tente.

Documento **cancelado responde**, e diz que está cancelado: é
justamente o caso em que alguém precisa descobrir que o papel na mão
não vale mais.

O QR é gerado como SVG no servidor e embutido no HTML — nada de script
de CDN, que o CSP dos formulários já não permite, e nada de imagem
externa num PDF que precisa render offline.

Documentos emitidos **antes** deste incremento não têm código. A
página de detalhe mostra isso e oferece gerar o código para eles sem
reemitir — o código não é parte do snapshot, é identificador da linha.

### 3.3 Incremento C — geração em lote

Alvo: os concluintes de uma turma, no fim do ano.

Fluxo: escolher ano letivo + série + turma → o sistema monta a
**conferência agregada** (quantos estão prontos, quantos bloqueados e
por qual motivo, agrupado por motivo, não por aluno) → criar os
rascunhos dos que estão prontos → conferir e emitir.

A emissão em lote **não é uma transação só**. Cada documento é emitido
pela mesma função `emitir_historico` que a emissão individual usa, uma
por vez: a numeração sequencial já é garantida dentro dela, e um erro
no aluno 14 não pode desfazer os 13 que já ganharam número de registro
— número de registro consumido não volta. O lote reporta o que emitiu e
o que falhou, e o que falhou continua rascunho.

Os PDFs são gerados em fila (o Puppeteer é um por vez) e entregues como
ZIP, com o progresso visível na tela.

### 3.4 Incremento D — relatórios e importação agendada

**Relatórios** que a secretaria de fato pede: documentos emitidos por
período (com tipo, 2ª via e cancelados separados), importações do
período com o que entrou e o que ficou pendente, e divergências em
aberto. Exportáveis em CSV, porque o destino deles é a planilha da
direção.

**Importação agendada**: um agendador no próprio processo Node, com a
periodicidade configurável na tela de Importações. Duas travas: roda
sempre em modo efetivo mas nunca resolve mapeamento sozinho além do que
o casamento automático já resolve (RF-INT-08), e registra na mesma
tabela `importacao`, com a origem marcada como agendada — para que o
relatório do dia seguinte mostre o que ela fez.

**Risco operacional a confirmar com o Matheus:** se a aplicação rodar
com mais de uma réplica no EasyPanel, o agendador dispara uma vez por
réplica. Enquanto for uma réplica só, um agendador em processo é o
suficiente e evita infraestrutura nova.

## 4. Tratamento de erro

Nenhum incremento pode deixar o sistema em estado pior que o de antes:

- Máscara que não reconhece o valor devolve o valor como está, nunca
  corta dígito. Um CPF com 10 dígitos aparece sem máscara e a
  conferência do histórico continua acusando o que falta.
- Verificação de código inexistente responde "não encontrado" sem dizer
  se o código já existiu — não é oráculo.
- Lote que falha no meio deixa os documentos já emitidos emitidos, e os
  demais em rascunho. Nunca reemite o que já tem número.
- Importação agendada que falha registra o erro como uma importação com
  erro e não tenta de novo no mesmo ciclo.

## 5. Verificação

Cada incremento fecha com `npm run typecheck` e `npm run build`, e com
o fluxo exercitado no ambiente local (`scripts/ambiente-local/`), não
em produção. O roteiro do README de lá ganha os passos novos.

O par pré-visualização/PDF continua sendo verificado aos pares: QR no
`PreviaDocumento.tsx` **e** em `views/pdf-historico.ejs`, senão o
RNF-04 quebra.

## 6. Riscos e decisões em aberto

| Assunto | Decisão tomada | A confirmar |
|---|---|---|
| Dado exposto na verificação pública | Mínimo conferível, nome parcialmente ocultado | Se a secretaria quer o nome completo na página |
| Biblioteca de QR | Geração de SVG no servidor, sem CDN | Dependência nova (`qrcode`) precisa entrar no `package.json` |
| Agendador | Em processo, uma réplica | Número de réplicas no EasyPanel |
| Documentos já emitidos sem código | Código gerado sob demanda, sem reemitir | — |
