# Carteirinhas Estudantis

> Levantamento de requisitos e plano de implementação.
> v0.1 em 01/10/2026 · v0.2 em 01/10/2026: incorpora as decisões do Matheus (cartão dobrável frente/verso, 4 por folha, logo do evento, validade, CPF censurado, permissões) e a **ficha de inscrição** por subpasta · **v0.3 em 01/10/2026**: fecha as quatro perguntas restantes (nome social, porta-crachá, CPF completo na ficha, vagas em branco) · **v0.4 em 01/10/2026**: o cartão troca o CPF censurado pelo **R.A. sem censura**, e **nenhum documento do módulo traz CPF** — a ficha também passa a usar o R.A.
> **Status (01/10/2026): Fases 1 a 7 implementadas** na branch `feat/carteirinhas` (Fase 6: lote pela lista, ordem manual, duplicar pasta e escolher o diretor; o QR do RF-CART-20 ficou de fora). **Pendente:** Fase 0 com o token real (formato e peso de `url_foto`), teste físico de impressão (Fase 3, item 5) e aplicar as migrations 014 e 015 em produção. Decisões tomadas na implementação em §9.3.
> Módulo paralelo ao histórico: não depende de a F5 estar 100% e não mexe em nenhuma regra do histórico.

## 1. Contexto e objetivo

Hoje a secretaria monta à mão as carteirinhas e as fichas de inscrição de eventos como a Copa Integração. Ela junta foto e dados do aluno, separa por modalidade e categoria, imprime, recorta e colhe a assinatura da direção. O dado necessário já está no sistema: o cadastro do aluno vem do Activesoft, e a API do Activesoft devolve a foto (ver §5).

O módulo gera **dois documentos** a partir do cadastro importado, organizados em **pastas** (o evento) e **subpastas** (a turma do evento):

| Documento | Unidade | Para quê |
|---|---|---|
| **Carteirinha** | Uma por aluno. Folha A4 com 4, dobráveis (frente à esquerda, verso à direita) | O aluno porta no evento |
| **Ficha de inscrição** | Uma por subpasta. A4 paisagem com 15 inscritos por folha | Controle de quem participou, com atesto e assinatura da direção |

Exemplo: a pasta *Copa Integração 2026* tem as subpastas *Sub 12 Vôlei*, *Sub 14 Futsal*, etc. Cada subpasta gera **um PDF de carteirinhas** e **uma ficha de inscrição**.

A carteirinha também pode ser emitida **individualmente**, pela ficha do aluno.

### Fora de escopo

- Carteirinha de identificação estudantil para meia-entrada (Lei 12.933/2013), que é outro produto, com emissores credenciados.
- Impressão em cartão PVC ou impressora de crachá. A saída é PDF A4 para papel comum ou couché.
- Envio ao responsável (portal, e-mail, WhatsApp).
- Carteirinha de colaborador ou responsável. A API tem `url_foto` para eles, então é extensão futura barata.

---

## 2. Glossário

| Termo | Significado | Exemplo |
|---|---|---|
| **Pasta** (pasta principal) | O evento. Leva o nome do evento, a logo do evento e a validade | Copa Integração 2026 |
| **Subpasta** | A turma do evento. É a unidade que gera os documentos, e o nome sai impresso no cartão como "turma" | Sub 12 Vôlei |
| **Inscrito** | Aluno dentro de uma subpasta. O mesmo aluno pode estar em várias subpastas | Ana Souza em *Sub 12 Vôlei* e *Sub 12 Handebol* |
| **Cartão dobrável** | Uma tira com frente e verso lado a lado, recortada e dobrada ao meio | — |
| **Ficha de inscrição** | Folha de controle da subpasta, no modelo de `docs/modelos/FICHA_INSCRICAO_MODELO.pdf` | — |

> **"Turma" do cartão não é a turma escolar.** No cartão, "turma" é o nome da subpasta (*Sub 12 Vôlei*), não a turma do Activesoft (*6º A*). Na interface o termo é sempre **subpasta**, para não confundir com o filtro de turma da lista de alunos.
>
> **Por que só dois níveis:** o caso real é *evento → turma do evento*, e é esse o recorte dos dois documentos. Um terceiro nível, se surgir, entra com `pasta.pai_id` sem refazer o resto.

---

## 3. Requisitos funcionais

### 3.1 Foto do aluno (RF-FOTO)

Pré-requisito dos dois documentos, com valor próprio: a ficha do aluno passa a mostrar a foto.

| ID | Requisito | Prioridade |
|---|---|---|
| RF-FOTO-01 | Importar a foto do Activesoft (`url_foto`) e **guardar uma cópia** no Storage. Nunca depender do link externo na hora de imprimir | Must |
| RF-FOTO-02 | Baixar de novo só quando `foto_data_hora_alteracao` mudar | Must |
| RF-FOTO-03 | Foto no cabeçalho da ficha do aluno, com as iniciais (`ficha-av`) como fallback | Must |
| RF-FOTO-04 | Upload manual na ficha (JPG/PNG/WebP, até 5 MB) | Must |
| RF-FOTO-05 | Foto enviada à mão **não é sobrescrita** pela reimportação (princípio do RF-INT-06). Se a origem mudou a foto, a importação registra um aviso | Must |
| RF-FOTO-06 | "Voltar à foto do Activesoft" | Should |
| RF-FOTO-07 | Recorte 3×4 no upload (enquadramento simples) | Could |

### 3.2 Pastas e subpastas (RF-CART)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-CART-01 | Criar, editar e arquivar **pastas**. Campos: **nome do evento**, **logo do evento** (upload PNG/JPG/SVG), **data de validade** e descrição opcional | Must |
| RF-CART-02 | Criar, renomear, reordenar e excluir **subpastas**. Nome único dentro da pasta. Campo opcional **professor(a) responsável**, que sai impresso na ficha de inscrição | Must |
| RF-CART-03 | Adicionar alunos a uma subpasta **em lote**: busca por nome/código/RA, filtro por série, turma escolar e ano letivo, checkbox e "selecionar todos do filtro" | Must |
| RF-CART-04 | Remover aluno de uma subpasta sem afetar as outras | Must |
| RF-CART-05 | Um aluno pode estar em várias subpastas, mas **uma só vez em cada** | Must |
| RF-CART-06 | Ordem dos inscritos: alfabética por padrão, ordem manual opcional. É a mesma ordem da numeração #01, #02… da ficha | Should |
| RF-CART-07 | Contadores por subpasta (inscritos, sem foto, sem CPF) e por pasta | Must |
| RF-CART-08 | Duplicar pasta com as subpastas, com ou sem os inscritos (Copa 2027 a partir da 2026). Validade e logo são copiadas, e a validade fica destacada para revisão | Could |
| RF-CART-09 | Excluir pasta só se estiver vazia. Pasta com subpastas é **arquivada** | Must |
| RF-CART-10 | Na **lista de alunos** (`/app/alunos`), selecionar vários e usar "Adicionar à subpasta…" | Should |

### 3.3 Emissão (RF-CART-EMI)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-CART-11 | **Emitir carteirinha** pela ficha do aluno: prévia frente/verso e duas saídas, **Baixar avulsa** (folha com um cartão) e **Adicionar a uma subpasta…**. A avulsa usa o evento e a turma da subpasta escolhida no modal, porque o cartão sempre pertence a um evento | Must |
| RF-CART-12 | **Carteirinhas da subpasta**: um PDF A4 com 4 cartões dobráveis por folha | Must |
| RF-CART-13 | **Ficha de inscrição da subpasta**: um PDF A4 paisagem, 15 inscritos por folha (§3.5) | Must |
| RF-CART-14 | **Emitir a pasta inteira** como um PDF único de fichas de inscrição (uma por subpasta, como no modelo anexado) e um ZIP com os PDFs de carteirinhas de cada subpasta | Should |
| RF-CART-15 | **Conferência antes de emitir.** **Bloqueia** se a pasta não tiver validade ou logo do evento, porque o cartão sairia incompleto em todos. **Avisa sem bloquear** se faltar foto, CPF ou nascimento de algum aluno: o campo sai com "—" e um quadro "sem foto" | Must |
| RF-CART-16 | Pré-visualização na tela com o mesmo template e CSS do PDF (princípio do RNF-04) | Should |
| RF-CART-17 | Registrar cada emissão (quem, quando, qual documento, quais alunos) e mostrar a última emissão por subpasta | Must |
| RF-CART-18 | Emitir só uma seleção de alunos da subpasta (reimprimir o cartão que estragou) | Should |
| RF-CART-19 | **Só admin e secretaria** emitem e gerenciam. Ver §4, RNF-CART-01 | Must |
| RF-CART-20 | QR de verificação no cartão, reaproveitando o RF-HIST-14 | Could |

### 3.4 O cartão

**Formato:** cartão dobrável. A tira é recortada inteira; a frente fica na metade esquerda e o verso na direita. A dobra é **tipo livro**, no eixo vertical, e o verso dobra para trás. Com essa dobra o verso já sai na orientação certa, sem girar nada no PDF, e a impressão é **só de um lado da folha** (sem duplex para alinhar).

**Medidas:**

| | |
|---|---|
| Cada face | **95 × 60 mm** (proporção do cartão de crédito, cerca de 11% maior). Confirmado que cabe no porta-crachá usado pelo colégio |
| Tira aberta | 190 × 60 mm |
| Folha | A4 retrato, **4 tiras por folha**, empilhadas e encostadas (cortes compartilhados) |
| Margens da folha | 10 mm laterais, 28,5 mm em cima e embaixo |
| Área de segurança | 2,5 mm por dentro de cada face |
| Marcas | Corte nos cantos de cada tira, por fora da área útil. Dobra: tracejado curto **só nas margens da folha**, alinhado ao eixo, para não marcar a face impressa |

Folha com 4 cartões: 4 cortes horizontais e 2 verticais, mais 4 dobras.

**Frente (metade esquerda):**

```
┌───────────────────────────────────────────────────┐
│ [logo     │   COPA INTEGRAÇÃO 2026     │ [logo    │  ← nome da pasta, até 2 linhas
│  colégio] │                            │  evento] │
├───────────────────────────────────────────────────┤
│               SUB 12 VÔLEI                        │  ← faixa azul #0F385A: nome da subpasta
├────────────┬──────────────────────────────────────┤
│            │ Nome                                 │
│   FOTO     │ ANA BEATRIZ SOUZA LIMA               │
│   3×4      │ R.A.                                 │
│ 25 × 33 mm │ 000.123.456-7                        │
│            │ Data de nascimento                   │
│            │ 09/04/2014                           │
├────────────┴──────────────────────────────────────┤
│                         Válida até 30/11/2026     │
└───────────────────────────────────────────────────┘
```

Alturas aproximadas, dentro dos 55 mm úteis: cabeçalho 11 mm, faixa da subpasta 5 mm, corpo 34 mm, rodapé 4 mm.

**Verso (metade direita):** a **logo do evento** centralizada e grande (até 70 × 45 mm, proporção preservada) em fundo branco. Nada mais.

**Regras do conteúdo:**

- **R.A. sem censura** (v0.4, no lugar do CPF censurado): sai como está no cadastro, sem máscara (a composição do R.A. varia, ver `shared/formatos.ts`). R.A. ausente sai como "—". O cartão **não leva CPF nenhum**: o objeto `Cartao` nem tem o campo.
- **Nome longo:** até duas linhas, com a fonte reduzindo até o mínimo legível (7 pt). Nunca corta letra.
- **Nome do evento longo:** até duas linhas no cabeçalho, com o mesmo ajuste.
- **Sem foto:** quadro tracejado "sem foto". A conferência avisa antes.
- **Logo do colégio:** vem do cadastro da instituição (RF-INST-06, bucket `institucional`), não da pasta.
- **Validade:** sai no formato `dd/mm/aaaa`, da pasta.
- **Nome social:** quando o aluno tiver `nome_social` preenchido, o cartão e a ficha imprimem o nome social; senão, `nome`. A regra mora numa função só, `nomeDeExibicao()`, usada pelos dois documentos. Isto é independente da pendência do histórico (`nome` × `nome_civil`): lá é documento oficial, aqui é identificação de convívio. **Dependência:** hoje o adaptador não preenche `nomeSocial` (`03-integracao-activesoft.md` §8), então até isso mudar o nome social só aparece se a secretaria o digitar na ficha do aluno. O que o Activesoft devolve em `nome` quando há nome social é exatamente a pendência aberta do histórico, e vale resolver as duas juntas.

### 3.5 Ficha de inscrição (RF-FICHA)

Reproduz o modelo anexado (`docs/modelos/FICHA_INSCRICAO_MODELO.pdf`, *Campeonato 2026*).

| ID | Requisito | Prioridade |
|---|---|---|
| RF-FICHA-01 | Gerar a ficha de inscrição de uma subpasta: A4 **paisagem**, 15 inscritos por folha em **3 colunas × 5 linhas**, numerados `#01`, `#02`… na ordem da subpasta | Must |
| RF-FICHA-02 | **Cabeçalho:** "FICHA DE INSCRIÇÃO ESCOLAR"; abaixo, em caixa alta, **`<NOME DA PASTA> — <NOME DA SUBPASTA>`**; abaixo, "Registro Oficial de Inscritos e Homologação da Direção"; logo do evento no canto superior direito | Must |
| RF-FICHA-03 | **Cada inscrito:** foto 3×4, número, Nome, **R.A.** e Nasc. (v0.4: o CPF saiu da ficha). Aluno sem foto sai com o quadro "FOTO 3x4" vazio, como no modelo | Must |
| RF-FICHA-04 | **Rodapé de toda folha**, com três blocos. **Professor(a) responsável:** nome impresso se a subpasta tiver um, senão linha pontilhada, mais a linha de assinatura. **Direção do colégio:** "Atesto a veracidade das informações e documentos apresentados para os **N** alunos inscritos acima", com N igual ao número de inscritos **daquela folha**; "Diretor(a):" com o nome do diretor ativo em Signatários (RF-INST-05), ou linha pontilhada se não houver; linha de assinatura. **Carimbo:** quadro tracejado | Must |
| RF-FICHA-05 | Mais de 15 inscritos: continua em outra folha, com cabeçalho e rodapé repetidos e "Folha 1 de 2" no cabeçalho. Cada folha é assinada por si, porque o atesto fala "dos alunos acima" | Must |
| RF-FICHA-06 | Vagas não ocupadas na última folha saem **em branco**, com o quadro e a numeração seguinte, como no modelo, para inscrição de última hora à mão. O atesto continua contando só os inscritos impressos | Must |
| RF-FICHA-07 | Pasta inteira: um PDF com as fichas de todas as subpastas em sequência (o próprio modelo anexado é isso, com Futsal e Voleibol) | Should |
| RF-FICHA-09 | Pasta inteira, opcional (`?repetidos=1`, vale também para o ZIP): o aluno inscrito em mais de uma subpasta sai uma vez só, nas últimas folhas, agrupado por combinação de subpastas e com todas no título, em ordem alfabética ("Sub A \| Sub B"); professores distintos idem. No ZIP, vira um PDF à parte (`carteirinhas-varias-subpastas.pdf`), com as subpastas na faixa do cartão | Could |
| RF-FICHA-08 | Escolher o diretor no momento da emissão, quando houver mais de um signatário ativo com esse cargo | Could |

A ficha é um **documento de controle impresso e assinado à mão**. Assim como a carteirinha, o sistema não congela nem guarda a ficha: ela sai com o dado atual, e a via assinada é a de papel. O log de emissão registra quem gerou e para quais alunos (RF-CART-17).

---

## 4. Requisitos não-funcionais

| ID | Requisito |
|---|---|
| RNF-CART-01 | **Acesso restrito a admin e secretaria.** O módulo inteiro (menu, rotas, API, buckets) fica invisível para coordenação e leitura. Foto, nascimento e CPF de menor juntos são dado sensível (RNF-01, LGPD art. 14), e quem não emite não precisa vê-los em massa. A foto na **ficha do aluno** continua visível para todo papel ativo, como os demais dados da ficha |
| RNF-CART-02 | **Fidelidade de impressão:** impresso em 100%, cada face mede 95 × 60 mm ± 0,5 mm e o eixo da dobra cai no meio da tira ± 0,5 mm. O diálogo de emissão avisa para imprimir em tamanho real |
| RNF-CART-03 | **Desempenho:** 40 alunos geram as carteirinhas em menos de 10 s e a ficha em menos de 6 s. A foto entra no HTML já redimensionada (§6.3) |
| RNF-CART-04 | **Independência do histórico:** nenhuma tabela, função ou template do histórico é alterado (§8) |
| RNF-CART-05 | **Disponibilidade:** com o Activesoft fora do ar, a emissão funciona com as fotos já copiadas (RNF-05) |
| RNF-CART-06 | **Sem CPF nos documentos** (v0.4): o cartão e a ficha identificam o aluno pelo **R.A.**, sem censura. O CPF não sai em nenhum dos dois — os objetos montados nem têm o campo e o CPF nem é lido do banco pelo módulo, para que um erro de template não o vaze |

---

## 5. A foto no Activesoft

Conferido no schema OpenAPI de `siga03.activesoft.com.br` em 01/10/2026:

| Endpoint | Campos |
|---|---|
| `lista_alunos` | `url_foto`, `foto_data_hora_alteracao` |
| `lista_alunos_endereco` | `url_foto`, `foto_data_hora_alteracao` |
| `lista_alunos_dados_sensiveis` | `url_foto` (exige o escopo `dados_complementares`) |

O valor é um link para o S3 da Activesoft (`…s3.amazonaws.com/FOTO-ALUNO/SIGAWEB/…/foto.jpeg`), ou `null`.

**Não se sabe** se a URL é permanente ou **assinada e com validade**. A primeira tarefa da Fase 0 é ver uma resposta real. O desenho já assume o pior caso: copia na importação.

O adaptador já chama `lista_alunos` (`alunoBasicoSchema` com `.passthrough()`), então trazer a foto **não custa nenhuma requisição a mais** à API, só o download da imagem.

> **Achado lateral:** o schema mostra hoje `data_ultima_alteracao`, `periodo` e `periodo_sigla` em `lista_alunos`. O `03-integracao-activesoft.md` §8 registra que não existiam. Vale testar.

---

## 6. Desenho técnico

### 6.1 Modelo de dados

**Migration `014_foto_aluno.sql`**

```sql
alter table aluno add column if not exists foto_path            text;        -- bucket 'alunos-fotos'
alter table aluno add column if not exists foto_origem          text
  check (foto_origem is null or foto_origem in ('activesoft', 'manual'));
alter table aluno add column if not exists foto_alterada_origem timestamptz; -- foto_data_hora_alteracao do Activesoft
alter table aluno add column if not exists foto_atualizada_em   timestamptz;

insert into storage.buckets (id, name, public) values ('alunos-fotos', 'alunos-fotos', false)
on conflict (id) do nothing;
-- leitura: usuario_ativo()  ·  escrita: tem_papel('admin','secretaria')
```

O `url_foto` cru **não** ganha coluna. Ele fica em `aluno.dados_importados`. Uma URL assinada numa coluna parece dado e é lixo uma hora depois.

**Migration `015_carteirinhas.sql`**

```sql
create table if not exists carteirinha_pasta (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,              -- nome do evento, impresso no cartão e na ficha
  descricao        text,
  logo_evento_path text,                       -- bucket 'carteirinhas'; frente, verso e ficha
  validade         date,                       -- "Válida até"; obrigatória para emitir (RF-CART-15)
  ano_letivo_id    uuid references ano_letivo (id),
  arquivada        boolean not null default false,
  criado_por       text,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

create table if not exists carteirinha_subpasta (
  id                    uuid primary key default gen_random_uuid(),
  pasta_id              uuid not null references carteirinha_pasta (id) on delete cascade,
  nome                  text not null,         -- "Sub 12 Vôlei": a "turma" do cartão
  professor_responsavel text,                  -- impresso na ficha de inscrição
  ordem                 int  not null default 0,
  ordenacao             text not null default 'alfabetica' check (ordenacao in ('alfabetica', 'manual')),
  criado_por            text,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  unique (pasta_id, nome)
);

create table if not exists carteirinha_inscrito (
  subpasta_id    uuid not null references carteirinha_subpasta (id) on delete cascade,
  aluno_id       uuid not null references aluno (id),          -- sem cascade: aluno nunca é apagado (RNF-02)
  ordem          int  not null default 0,
  adicionado_por text,
  adicionado_em  timestamptz not null default now(),
  primary key (subpasta_id, aluno_id)                          -- RF-CART-05
);
create index if not exists idx_carteirinha_inscrito_aluno on carteirinha_inscrito (aluno_id);

create table if not exists carteirinha_emissao (                -- RF-CART-17, só log
  id           uuid primary key default gen_random_uuid(),
  pasta_id     uuid references carteirinha_pasta (id) on delete set null,
  subpasta_id  uuid references carteirinha_subpasta (id) on delete set null,
  documento    text not null check (documento in ('carteirinhas', 'ficha_inscricao')),
  escopo       text not null check (escopo in ('subpasta', 'selecao', 'avulsa', 'pasta')),
  aluno_ids    uuid[] not null,
  emitido_por  text,
  emitido_em   timestamptz not null default now()
);

insert into storage.buckets (id, name, public) values ('carteirinhas', 'carteirinhas', false)
on conflict (id) do nothing;
```

**RLS:** em todas as quatro tabelas e no bucket `carteirinhas`, select, insert, update e delete só com `tem_papel('admin','secretaria')`. É mais fechado que o histórico, de propósito (RNF-CART-01). O trigger `marcar_atualizado_em` entra em pasta e subpasta. Se surgir função nova em `public`, ela segue a convenção da `007`.

**Decisões deliberadas:**

| Decisão | Por quê |
|---|---|
| **Sem snapshot nem numeração**, ao contrário do histórico | São documentos operacionais e reimprimíveis, não de guarda permanente. Saem sempre com o dado atual: corrigiu a foto, reimprime |
| **O PDF não é guardado** | É derivado e barato de regenerar. O log responde "quem imprimiu o quê" |
| **Validade e logo na pasta**, não na subpasta | São do evento. Uma Copa com validades diferentes por modalidade não é um caso real; se aparecer, vira um campo opcional na subpasta que sobrepõe o da pasta |
| **`on delete cascade`** de pasta→subpasta→inscrito | São listas de trabalho, não registro escolar. A pasta só é excluída vazia (RF-CART-09) |

### 6.2 Fluxo da foto

```
importação (servicos/importacao.ts, depois da etapa de alunos)
  └─ sincronizarFotos(db, alunos):
       foto_origem = 'manual'?                               → não toca; aviso se a origem mudou (RF-FOTO-05)
       foto_alterada_origem == fotoAlteradaEm e foto_path?   → pula (RF-FOTO-02)
       senão → baixa (timeout 10 s, ≤ 5 MB, image/*) → redimensiona (§6.3)
             → grava alunos-fotos/{aluno_id}.jpg (upsert) → atualiza as colunas foto_*
       falha no download → aviso no relatório; a importação SEGUE

upload manual (ficha)   → POST /api/alunos/:id/foto  → mesmo caminho, foto_origem='manual' + auditoria
leitura na tela         → GET  /api/alunos/:id/foto   → stream autenticado (Cache-Control: private)
leitura no PDF          → data URL montada no servidor (o Chromium não tem sessão, igual às assinaturas)
```

São 4 downloads em paralelo, só no modo **efetivo**. A **simulação** apenas conta "N fotos a baixar".

### 6.3 Peso das imagens no PDF

Uma foto de celular tem 2 a 4 MB. Com 40 fotos em data URL, o HTML passa de 100 MB e o Chromium sofre.

**Escolha:** redimensionar **uma vez, na entrada**, para 600 × 800 px JPEG q=82, cerca de 60 a 90 KB. Impressa a 25 × 33 mm, isso dá mais de 600 dpi. A ferramenta é o `sharp` (dependência nova, nativa; conferir o `Dockerfile`, glibc linux-x64). O `sharp` só entra se a Fase 0 mostrar fotos reais acima de 300 KB. Fora isso, basta redimensionar no navegador, via canvas, no upload manual.

A logo do evento é redimensionada para no máximo 1200 px no upload. Uma logo SVG é convertida para PNG, porque SVG de terceiros dentro do HTML do PDF é vetor de script.

### 6.4 Documentos: fonte única para tela e PDF

Mesmo padrão do histórico (D2 / RNF-04), em arquivos novos:

```
shared/types/carteirinha.ts
    DocCarteirinhas  { evento: { nome, logo, validade }, colegio: { logo }, cartoes: Cartao[] }
    Cartao           { aluno_id, turma, nome, cpf_censurado, data_nascimento, foto | null, pendencias[] }
    DocFichaInscricao{ evento, subpasta: { nome, professor }, diretor | null, folhas: Inscrito[][] }   // folhas de 15; Inscrito.cpf completo
shared/formatos.ts                    + mascararCPF()  → "123.xxx.xxx-32" (cartão); formatarCPF() já existe (ficha)
                                      + nomeDeExibicao(aluno) → nome_social ?? nome
shared/carteirinha-documento.css      medidas em mm; .folha-cartoes (A4 retrato, 4 tiras) e .folha-ficha (A4 paisagem)
server/servicos/carteirinha/montar.ts montarCarteirinhas(), montarFichaInscricao()
server/servicos/carteirinha/pdf.ts    gerarPdfCarteirinhas(), gerarPdfFicha()
views/pdf-carteirinhas.ejs            frente | verso por tira, 4 tiras por folha, marcas de corte e dobra
views/pdf-ficha-inscricao.ejs         cabeçalho, grade 3×5, rodapé de assinaturas, repetido por folha
client/src/componentes/PreviaCarteirinhas.tsx  ·  PreviaFichaInscricao.tsx
```

`lib/pdf.js` ganha duas funções exportadas que chamam `renderInternalPagePdf` com `paginated: true`, como a avaliação substitutiva. A ficha precisa de `@page { size: A4 landscape }` e de `landscape: true` no `page.pdf()`. É a única opção nova no pipeline; o resto não muda.

Rotas internas no padrão de `server/rotas/pdf-interno.ts`, protegidas por `INTERNAL_PDF_SECRET`:
`/internal/pdf/carteirinhas?subpasta=…[&alunos=…]` e `/internal/pdf/ficha-inscricao?subpasta=…|pasta=…`.

### 6.5 API (`server/rotas/carteirinhas.ts`, montado em `/api/carteirinhas`, todo com `exigirPapel('admin','secretaria')`)

| Método e rota | O que faz |
|---|---|
| `GET /pastas?arquivadas=0\|1` | Pastas com contagem de subpastas e inscritos |
| `POST /pastas` · `PUT /pastas/:id` · `DELETE /pastas/:id` | CRUD. O `DELETE` recusa (409) pasta com subpasta e sugere arquivar |
| `POST /pastas/:id/logo` · `DELETE /pastas/:id/logo` · `GET /pastas/:id/logo` | Logo do evento |
| `POST /pastas/:id/duplicar` | RF-CART-08 |
| `GET /pastas/:id` | Pasta, subpastas, contadores e última emissão |
| `POST /pastas/:id/subpastas` · `PUT /subpastas/:id` · `DELETE /subpastas/:id` | CRUD de subpasta (nome, professor, ordem) |
| `GET /subpastas/:id` | Inscritos com conferência por aluno |
| `POST /subpastas/:id/inscritos` `{ aluno_ids[] }` | Adiciona em lote, idempotente: `{ adicionados, ja_estavam }` |
| `DELETE /subpastas/:id/inscritos/:alunoId` · `PUT /subpastas/:id/ordem` | Remover e reordenar |
| `GET /subpastas/:id/previa?doc=carteirinhas\|ficha` | Documento montado para a prévia |
| `GET /subpastas/:id/carteirinhas.pdf?alunos=…` | RF-CART-12/18. Registra a emissão |
| `GET /subpastas/:id/ficha.pdf` | RF-CART-13. Registra a emissão |
| `GET /pastas/:id/fichas.pdf` · `GET /pastas/:id/carteirinhas.zip` | RF-CART-14. Registra a emissão. `?repetidos=1`: RF-FICHA-09 |

No roteador de alunos:

| Rota | Papel | O que faz |
|---|---|---|
| `GET /api/alunos/:id/foto` | todo ativo | Mostra a foto |
| `POST` / `DELETE /api/alunos/:id/foto` | admin, secretaria | Troca ou remove a foto |
| `GET /api/alunos/:id/carteirinha.pdf?subpasta=…` | admin, secretaria | Avulsa |
| `GET /api/alunos/:id/carteirinhas` | admin, secretaria | Subpastas do aluno |

### 6.6 Contrato do adaptador

```ts
// shared/types/importacao.ts — AlunoOrigem
urlFoto?: string;         // baixável no momento da importação; pode expirar
fotoAlteradaEm?: string;  // ISO 8601 — chave para não baixar de novo
// adapters/activesoft/tipos.ts — Capacidades
fotoAluno: boolean;
```

| Adaptador | O que muda |
|---|---|
| `cliente.ts` | `url_foto` e `foto_data_hora_alteracao` entram no `alunoBasicoSchema` e no mapeamento. `fotoAluno: true` |
| `mock.ts` | Fixtures com e sem foto. `fotoAluno: true` |
| `arquivo.ts` | `fotoAluno: false`. A interface avisa que as fotos vêm por upload |

Nenhum serviço fora de `adapters/` conhece o nome `url_foto` (§1 de `03-integracao-activesoft.md`).

---

## 7. Telas

Seguem o padrão do painel: `Cabecalho`, `Card`, `Tabela`, `Modal`, `Tag`, `Aviso`, `EstadoVazio` de `ui.tsx`, as classes `.wrap`, `.filtros` e `.f-campo`, e a identidade do §5 de `04-telas-e-navegacao.md`.

### 7.1 Rotas e menu

```
/app/carteirinhas                          pastas
/app/carteirinhas/arquivadas
/app/carteirinhas/:pastaId                 subpastas da pasta
/app/carteirinhas/:pastaId/:subpastaId     inscritos + prévias + emissão
```

Tudo sob `SoPapel papeis={['admin','secretaria']}` em `rotas.tsx`. O item **Carteirinhas** entra em `OPERACAO` no `Shell.tsx`, com `papeis: ['admin','secretaria']` e o ícone novo `cartao`.

### 7.2 `/app/carteirinhas`: pastas

```
Carteirinhas                                    [ + Nova pasta ]
Pastas de eventos: carteirinhas e fichas         Arquivadas (2)

┌───────────────────────────┐ ┌───────────────────────────┐
│ [logo] Copa Integração    │ │ [logo] Jogos Escolares    │
│ 6 subpastas · 142 alunos  │ │ 3 subpastas · 48 alunos   │
│ válida até 30/11/2026     │ │ ⛔ sem validade            │
│ ⚠ 9 sem foto              │ │                           │
│ [Abrir]                   │ │ [Abrir]                   │
└───────────────────────────┘ └───────────────────────────┘
```

**Modal Nova/Editar pasta:** nome do evento, validade (`type="date"`), logo do evento (upload com prévia), descrição. Ao lado, uma **prévia da frente e do verso do cartão** com um aluno de exemplo, atualizando enquanto se digita. É o mesmo recurso da prévia do cabeçalho em `/app/config/instituicao`.

### 7.3 `/app/carteirinhas/:pastaId`: subpastas

`Cabecalho`: nome do evento, logo e validade. Ações: **Nova subpasta**, **Fichas da pasta (PDF)**, **Carteirinhas da pasta (ZIP)**, **Editar pasta**, **Arquivar**.

| Subpasta | Inscritos | Professor(a) | Pendências | Última emissão | Ações |
|---|---|---|---|---|---|
| Sub 12 Vôlei | 14 | Carla Mendes | `Tag aviso` 2 sem foto | 28/09/2026 | Abrir · Carteirinhas · Ficha |
| Sub 14 Futsal | 18 | — | `Tag ok` pronta | — | Abrir · Carteirinhas · Ficha |

A ordem das subpastas muda com setas para cima e para baixo, acessível por teclado (RNF-10).

### 7.4 `/app/carteirinhas/:pastaId/:subpastaId`: subpasta

```
← Copa Integração 2026
Sub 12 Vôlei · 14 inscritos · Prof. Carla Mendes [editar]
                       [ + Adicionar alunos ] [ Carteirinhas ▸ ] [ Ficha de inscrição ▸ ]

┌ Conferência ─────────────────────────┐ ┌ Prévia ── [Carteirinhas | Ficha] ──┐
│ ⚠ 2 sem foto · 1 sem CPF             │ │  ┌─ frente ─┬─ verso ─┐            │
│   não bloqueia; sai com "—"          │ │  │          ┊         │            │
└──────────────────────────────────────┘ │  └──────────┴─────────┘            │
☐ #  Aluno            Série/turma  Pend. │  …                                 │
☐ 01 Ana B. S. Lima   6º A               │  Folha 1 de 4                      │
☐ 02 Bruno C. Dias    6º B     sem foto  └────────────────────────────────────┘
```

- O **#** é o número que o aluno terá na ficha de inscrição.
- Os checkboxes servem para **Carteirinhas só dos selecionados** e **Remover da subpasta**.
- "sem foto" leva à aba Dados da ficha do aluno.
- **Carteirinhas** e **Ficha** abrem uma confirmação curta: "Imprima em **tamanho real (100%)**". Para o cartão vem também uma instrução de 3 passos: recorte a tira, dobre na linha do meio, plastifique se quiser.

**Modal Adicionar alunos:** busca de `/api/alunos` com filtros de série, turma escolar e ano letivo. Checkbox no padrão do `HistoricoLote.tsx` e "Selecionar todos os N do filtro". Quem já está inscrito aparece marcado e desabilitado.

### 7.5 Ficha do aluno (`AlunoFicha.tsx`)

- **Cabeçalho:** foto no lugar de `ficha-av`. Para admin e secretaria, o botão **Carteirinha** ao lado de **Gerar histórico**.
- **Modal Carteirinha:** seletor **pasta › subpasta**, que define evento, turma, logo e validade do cartão, e a prévia frente/verso. Botões **Baixar avulsa** e, se o aluno ainda não estiver na subpasta, **Inscrever nesta subpasta**. Embaixo: "Inscrito em: Copa Integração 2026 › Sub 12 Vôlei".
- **Aba Dados:** bloco **Foto** com imagem, origem e os botões **Trocar foto** e **Voltar à do Activesoft**, com auditoria e motivo.

### 7.6 Lista de alunos (`Alunos.tsx`), Should

Coluna de checkbox e uma barra "**N selecionados** · Inscrever em subpasta…", que abre o mesmo seletor pasta › subpasta, com criação rápida de subpasta. Só para admin e secretaria.

> A `Tabela` de `ui.tsx` não tem seleção, e o `HistoricoLote` resolve isso por fora. Vale extrair uma prop opcional `selecao` na `Tabela` em vez de duplicar a solução uma terceira vez.

---

## 8. Convivência com o módulo de histórico

Branch própria `feat/carteirinhas`, a partir de `feat/secretaria-digital`. Pontos de contato, todos aditivos:

| Arquivo | Mudança | Risco de conflito |
|---|---|---|
| `client/src/rotas.tsx`, `Shell.tsx`, `Icones.tsx` | Rotas, menu, ícones `cartao` e `pasta` | Baixo |
| `client/src/componentes/ui.tsx` | Prop opcional `selecao` na `Tabela` | Médio: componente muito usado |
| `client/src/app/alunos/AlunoFicha.tsx` | Foto, botão, modal, bloco Foto | **Médio**: o histórico também mexe nele |
| `client/src/app/alunos/Alunos.tsx` | Seleção e barra | Médio |
| `server/index.ts` | Montar `/api/carteirinhas` e as rotas internas | Baixo |
| `server/rotas/alunos.ts` | Rotas de foto e avulsa | Baixo: no fim do arquivo |
| `server/servicos/importacao.ts` | Uma chamada a `sincronizarFotos()`, que mora em `server/servicos/fotos.ts` | **Médio**: centro da importação, por isso a lógica fica fora dele |
| `server/adapters/activesoft/*`, `shared/types/importacao.ts`, `shared/types/aluno.ts` | Campos opcionais | Baixo |
| `shared/formatos.ts` | `+ mascararCPF()` | Baixo |
| `lib/pdf.js` | Duas funções exportadas e a opção `landscape` | Baixo |

Nada em `server/servicos/historico/`, `views/pdf-historico.ejs`, `shared/historico-documento.css` ou nas migrations 001 a 013 é alterado.

---

## 9. Decisões e perguntas

### 9.1 Decidido em 01/10/2026

| Tema | Decisão |
|---|---|
| Conteúdo da frente | Logo do colégio · nome do evento (pasta) · logo do evento; nome da subpasta; foto · nome · CPF · nascimento; validade |
| Verso | Logo do evento |
| Tamanho e impressão | 4 por A4. Cartão dobrável: frente à esquerda, verso à direita, impressão de um lado só. Face de 95 × 60 mm |
| Validade | Personalizável **por pasta**, obrigatória para emitir |
| CPF | ~~Censurado, `123.xxx.xxx-32`, nos dois documentos~~ → v0.4: nenhum dos dois documentos traz CPF; ambos usam o R.A. sem censura |
| Quem emite | Só admin e secretaria. O módulo fica invisível para os demais papéis |
| Ficha de inscrição | Por subpasta, no modelo anexado (`docs/modelos/FICHA_INSCRICAO_MODELO.pdf`) |

### 9.2 Em aberto

Nenhuma bloqueia o início. Todas têm proposta padrão.

| # | Pergunta | Proposta padrão |
|---|---|---|
| 1 | **Nome social:** cartão e ficha usam o nome social quando houver? (Mesmo assunto pendente do histórico, `nome` × `nome_civil`, mas aqui é identificação de convívio, não documento oficial) | Nome social quando houver |
| 2 | **Porta-crachá:** a face de 95 × 60 mm cabe no que vocês usam? O padrão de cartão de crédito (85,6 × 54) cabe 5 por folha, não 4 | 95 × 60 mm. Se houver porta-crachá, medir na Fase 0 e ajustar uma variável CSS |
| 3 | **Ficha:** o "Doc" sai com CPF censurado como no cartão, ou a direção precisa ver o documento completo para atestar? | Censurado (RNF-CART-06). Quem atesta confere no cadastro |
| 4 | **Ficha:** as vagas vazias da última folha saem em branco para preencher à mão (como no modelo), ou somem? | Saem em branco (RF-FICHA-06) |
| 5 | A URL da foto do Activesoft é **assinada**? E qual o **peso** médio das fotos? | Responde-se na Fase 0. Decide o `sharp` |

---

### 9.3 Decidido na implementação (01/10/2026)

| Tema | Decisão | Por quê |
|---|---|---|
| Duas cópias da foto | `alunos-fotos/activesoft/{id}` e `manual/{id}`, sem extensão; `foto_path` aponta para a que vale | "Voltar à foto do Activesoft" fica instantâneo e funciona com a origem fora do ar. A reimportação continua atualizando a cópia da origem mesmo quando a manual manda, e avisa uma vez por mudança |
| `url_foto` não vai para `dados_importados` | Diferente do §6.1 | Um link assinado muda a cada chamada: entraria na comparação de campos e quebraria a idempotência (RNF-03), além de guardar um link de acesso à foto de um menor |
| Sem data de alteração | Baixa uma vez só | O link não serve de chave pelo mesmo motivo |
| Remover foto | Grava `foto_origem = 'manual'` sem arquivo | A reimportação não recoloca uma foto que a secretaria tirou de propósito |
| Tipo de imagem | Lido dos bytes (JPEG/PNG/WebP), nunca do nome ou do Content-Type | O servidor recusa SVG e qualquer outra coisa, mesmo que a tela seja contornada |
| `sharp` | **Não entrou.** Upload manual (foto e logo) é reduzido no navegador, via canvas: foto 3×4 a 600 × 800 JPEG q=0,82, logo até 1200 px PNG, SVG rasterizado | A foto do Activesoft entra como vem (até 5 MB). Com fotos de exemplo, 40 alunos geram as carteirinhas em 2,6 s e a ficha em 1,9 s. Reavaliar na Fase 0 com o peso real |
| Ficha sem validade/logo | Não bloqueia | O bloqueio do RF-CART-15 é das carteirinhas, que sairiam incompletas; a ficha não imprime validade e funciona sem logo |
| Subpasta vazia | A ficha sai com uma folha de 15 vagas em branco | Serve para inscrição à mão |
| R.A. no lugar do CPF (v0.4) | Cartão e ficha usam o R.A. sem censura; o CPF saiu dos dois (na ficha, o inscrito volta a ter duas linhas: Nome · R.A. + Nasc.). A conferência cobra "sem R.A." no lugar de "sem CPF", sem bloquear | Pedido do Matheus em 01/10/2026 |
| Tamanho do nome | Fonte escolhida pelo comprimento no servidor (9/8/7 pt) e não por medição | O mesmo número vai para a tela e para o PDF, sem depender da fonte instalada. O texto quebra linha e nunca é cortado |
| Fonte do documento | Arial / Liberation Sans, como o histórico | O Chromium do Docker só tem `fonts-liberation`, de métrica igual à Arial: tela e PDF quebram linha no mesmo lugar |
| Logo do colégio | `instituicao.logo_path`, senão `public/images/logo.jpg` — a logo principal, a mesma dos formulários e dos PDFs de visita. O brasão (`logo-brasao.png`) é a marca da São Marcos School e não entra. Sai no cabeçalho do cartão e no canto esquerdo da ficha de inscrição (a do evento fica à direita) | A tela de Instituição ainda não tem upload de logo; nenhum dos dois documentos sai sem a marca |
| Rotas internas do PDF | Arquivo próprio, `server/rotas/carteirinhas-pdf-interno.ts` | `pdf-interno.ts` é do histórico (RNF-CART-04) |
| Avulsa | O PDF registra escopo `avulsa`; o aluno não precisa estar inscrito na subpasta escolhida | O evento e a turma vêm da subpasta, como pede o RF-CART-11 |
| Ambiente local | `fake-supabase.mjs` ganhou um Storage mínimo em disco | Sem ele não dava para testar foto e logo de ponta a ponta. Não aplica RLS de bucket |

## 10. Plano de implementação

Sete fases pequenas, cada uma entregável e testável sozinha.

### Fase 0: preparação (½ dia)

- [ ] Criar `feat/carteirinhas` a partir de `feat/secretaria-digital`.
- [ ] Com o token real: `lista_alunos?limit=5`. Anotar o formato de `url_foto` (assinada?) e o peso de 3 fotos (pergunta 5). Testar de passagem `data_ultima_alteracao` e `periodo`.
- [ ] Medir o porta-crachá, se houver (pergunta 2).
- [ ] Copiar o modelo para `docs/modelos/FICHA_INSCRICAO_MODELO.pdf` (feito junto com este documento).

**Pronto quando:** as perguntas 2 e 5 estiverem respondidas e a decisão sobre o `sharp` tomada.

### Fase 1: foto do aluno (2 a 3 dias)

1. `014_foto_aluno.sql` e o `README` de migrations.
2. `shared/types/aluno.ts` com os campos `foto_*`.
3. Contrato: `urlFoto`, `fotoAlteradaEm` e `Capacidades.fotoAluno` nos três adaptadores (fixtures com foto no mock).
4. `server/servicos/fotos.ts`: `baixarFotoOrigem`, `gravarFoto` (redimensiona) e `sincronizarFotos` (concorrência 4, RF-FOTO-02/05).
5. `importacao.ts`: uma chamada depois da etapa de alunos, só em modo efetivo. Contadores `fotos_novas`, `fotos_atualizadas` e `fotos_com_erro` no relatório.
6. `alunos.ts`: rotas de foto, com auditoria.
7. `AlunoFicha.tsx`: foto no cabeçalho e bloco Foto.

**Pronto quando:** a importação via `mock` traz as fotos. Reimportar sem mudança não baixa nada. A foto manual sobrevive à reimportação. Sem sessão, a rota de foto dá 401. `npm run typecheck` passa.

### Fase 2: pastas, subpastas e inscritos (2 a 3 dias)

1. `015_carteirinhas.sql`: tabelas, bucket e RLS só para admin e secretaria.
2. `shared/types/carteirinha.ts` (entidades).
3. `server/rotas/carteirinhas.ts`: CRUD, upload de logo e inscritos em lote (sem PDF ainda).
4. Telas `Pastas.tsx`, `PastaDetalhe.tsx` e `SubpastaDetalhe.tsx`, modal **Nova/Editar pasta** (validade e logo, sem prévia ainda), modal **Adicionar alunos**, rotas, menu e ícones.

**Pronto quando:** dá para montar a *Copa Integração 2026* com validade, logo, 3 subpastas e 30 alunos sem tocar no banco. Inscrição duplicada é ignorada com aviso. Excluir pasta com subpasta é recusado. Um usuário **coordenação** não vê o menu, toma 403 na API e não lê o bucket.

### Fase 3: o cartão (3 dias)

1. `mascararCPF()` em `shared/formatos.ts`, com testes para 11 dígitos, vazio, formatado e inválido.
2. `shared/carteirinha-documento.css` (`.folha-cartoes`): tira 190 × 60, faces 95 × 60, 4 por A4, marcas de corte e de dobra, área de segurança, ajuste de nome longo.
3. `montarCarteirinhas()`, `views/pdf-carteirinhas.ejs`, a rota interna e `renderCarteirinhasPdf()`.
4. `PreviaCarteirinhas.tsx`, também na prévia do modal da pasta (§7.2).
5. **Teste físico:** imprimir em 100%, medir com régua (95 × 60 ± 0,5, dobra no meio), recortar, dobrar e conferir se frente e verso ficam alinhados e o verso fica de pé. Isso não se valida na tela.

**Pronto quando:** a prévia e o PDF batem visualmente, a folha impressa passa na régua e na dobra, e 40 alunos saem em menos de 10 s.

### Fase 4: a ficha de inscrição (2 dias)

1. `.folha-ficha` no CSS compartilhado (A4 paisagem, grade 3×5, rodapé fixo) e a opção `landscape` em `lib/pdf.js`.
2. `montarFichaInscricao()`: paginação de 15, numeração, N por folha, diretor ativo de Signatários e professor da subpasta.
3. `views/pdf-ficha-inscricao.ejs`, a rota interna e `PreviaFichaInscricao.tsx`.
4. Comparar o resultado lado a lado com `docs/modelos/FICHA_INSCRICAO_MODELO.pdf`.

**Pronto quando:** uma subpasta de 18 alunos gera 2 folhas (15 + 3 com 12 vagas em branco), cada uma com "N alunos inscritos acima" certo e cabeçalho e rodapé repetidos. A versão da pasta inteira junta as fichas de todas as subpastas num PDF.

### Fase 5: emissão (1 a 2 dias)

1. Rotas de PDF e ZIP da §6.5, cada uma registrando em `carteirinha_emissao`. Conferência com bloqueio (validade e logo) e aviso (foto, CPF, nascimento).
2. `SubpastaDetalhe.tsx`: conferência, prévia com alternância Carteirinhas/Ficha e os botões com o aviso de 100%.
3. `PastaDetalhe.tsx`: fichas da pasta, ZIP de carteirinhas e última emissão.
4. `AlunoFicha.tsx`: modal **Carteirinha** com o seletor pasta › subpasta.

**Pronto quando:** os caminhos ficha do aluno, subpasta e pasta produzem o PDF certo e aparecem no log, e uma pasta sem validade não emite.

### Fase 6: lote pela lista de alunos e acabamentos (1 a 2 dias, Should/Could)

1. Prop `selecao` na `Tabela` e barra de ação em `Alunos.tsx` (RF-CART-10).
2. Ordem manual (RF-CART-06), duplicar pasta (RF-CART-08) e escolher o diretor (RF-FICHA-08).
3. Se aprovado, QR de verificação (RF-CART-20).

### Fase 7: documentação e fechamento (½ dia)

- [ ] Atualizar `docs/README.md` (estado), `04-telas-e-navegacao.md` §1 (rotas e visibilidade por papel), `03-integracao-activesoft.md` (foto e `Capacidades.fotoAluno`) e o `README` da raiz (migrations 014 e 015).
- [ ] Revisão de LGPD: `url_foto` e CPF completo não aparecem em log, relatório de importação nem payload de erro.

**Estimativa total:** 12 a 15 dias. As Fases 1 e 2 podem andar em paralelo, e as Fases 3 e 4 também, depois da 2.

---

## 11. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| URL da foto expira antes do download | Médio | Baixar na mesma execução da importação (§6.2) |
| Fotos grandes travam o Chromium | Alto | Redimensionar na entrada (§6.3). Teste de 40 alunos como critério de pronto |
| Impressora reescala o PDF e a dobra sai fora do meio | Médio | Aviso de 100%. Marcas de dobra na margem. Teste físico na Fase 3 |
| Cartão de 95 × 60 não cabe no porta-crachá | Médio | Medir na Fase 0. O tamanho é uma variável CSS |
| Foto e dados de menor em documento perdido | Médio (LGPD) | Nenhum documento traz CPF (só R.A.). Módulo restrito a admin e secretaria. Buckets privados |
| Conflito de merge com o histórico | Baixo | Lógica em arquivos próprios, com uma linha de ligação nos compartilhados (§8) |
| Muitos alunos sem foto no Activesoft | Médio | Contador "sem foto" e atalho para o upload a partir da conferência |
