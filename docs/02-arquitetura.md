# Arquitetura — Secretaria Digital

## 1. Estado atual

```
Express 4 (server.js)
├── routes/pages.js   → res.render() de views EJS
├── routes/api.js     → JSON: auth, respostas, PDFs, submissões
├── routes/pdf.js     → rotas internas /internal/pdf/* (só o Puppeteer acessa)
├── lib/{supabase,auth,pdf,n8n,visita,avaliacao}.js
├── views/*.ejs       → páginas + templates de PDF
└── public/js/*.js    → JS vanilla, sem build step
                 ↓
         Supabase (Postgres + Auth + Storage), RLS por staff_emails
```

Pontos bons que ficam: sessão em cookie httpOnly assinado, `service_role` só no servidor, pipeline de PDF com Puppeteer resiliente (relançamento de browser morto, espera de fontes, medição de altura).

## 2. Arquitetura alvo

```
┌── Cliente ────────────────────────────────────────────┐
│  React 19 + Vite + TypeScript + React Router          │
│  ├── /app/*      painel da secretaria (autenticado)   │
│  └── /form/*     formulários públicos                 │
└───────────────────────────────────────────────────────┘
                 ↓ fetch /api (cookie httpOnly)
┌── Servidor: Express + TypeScript ─────────────────────┐
│  routes/   api REST por domínio                       │
│  services/ regras de negócio                          │
│  adapters/activesoft/  cliente + mapeamento           │
│  templates/*.ejs       SOMENTE templates de PDF       │
│  Puppeteer → /internal/pdf/*                          │
└───────────────────────────────────────────────────────┘
                 ↓
      Supabase — Postgres + Auth + Storage
                 ↓ (mantido)
      n8n — webhooks de visita e avaliação substitutiva
                 ↕
      API Activesoft (adaptador isolado)
```

### 2.1 Decisões

**D1 — React em todo o front, EJS só para PDF.**
Decidido migrar toda a interface para React. Os templates de PDF (`views/pdf-*.ejs`) **permanecem em EJS**: o Puppeteer renderiza uma URL server-side e precisa de HTML pronto no primeiro byte. Renderizar PDF a partir de SPA adiciona uma espera de hidratação sem nenhum ganho. Os arquivos migram para `server/templates/`.

**D2 — Mesma fonte de verdade para pré-visualização e PDF (RNF-04).**
Um único módulo (`services/historico/montar.ts`) produz o objeto `HistoricoDocumento`. A tela de pré-visualização renderiza esse objeto em React; o template EJS de PDF renderiza **o mesmo objeto**. O CSS de layout do documento vive em um arquivo compartilhado (`shared/historico-documento.css`), importado pelos dois. Divergência vira erro de teste de snapshot, não surpresa na impressão.

**D3 — Adaptador do Activesoft isolado.**
Nenhum serviço de negócio conhece o formato da API. O adaptador entrega o contrato canônico de `03-integracao-activesoft.md`. Trocar a API, migrar para importação por arquivo ou mudar de fornecedor afeta um diretório só.

**D4 — Servidor em TypeScript.**
O front já será TS. Os tipos do domínio (aluno, matrícula, nota, histórico) são compartilhados via `shared/types/` entre cliente e servidor — é o que evita o histórico sair com campo faltando por divergência de contrato. Migração incremental com `allowJs: true`.

**D5 — Express 4 mantido.**
Express 5 não traz nada necessário aqui e mudaria o tratamento de erros assíncronos. Migração de framework e migração de front na mesma fase é risco desnecessário.

**D6 — A SED é fonte de consulta, nunca destino de escrita.**
A API NCA da SED (cadastro de alunos) pode completar dados cadastrais faltantes, e só isso. Nada deste sistema escreve na SED: o `Manutencao` do NCA altera a ficha oficial do aluno no Estado, e uma gravação automática a partir de dado importado do Activesoft propaga erro para fora do colégio. Se a consulta for liberada, ela entra como um segundo adaptador atrás da mesma interface `AdaptadorAcademico`, com as capacidades que tiver.

**D7 — Autorização no servidor, não só por RLS.**
A RLS atual (`existe em staff_emails`) é binária. Com quatro papéis, a checagem de papel passa a ser middleware no Express (`exigirPapel('secretaria','admin')`), com a RLS como segunda barreira.

### 2.2 Estrutura de diretórios alvo

```
csm-forms/
├── client/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── rotas.tsx
│   │   ├── app/                    painel
│   │   │   ├── alunos/  historicos/  importacoes/  configuracoes/  formularios/
│   │   ├── form/                   formulários públicos (wizards migrados)
│   │   ├── componentes/            UI compartilhada
│   │   ├── hooks/   api/   estilos/
│   └── vite.config.ts
├── server/
│   ├── index.ts
│   ├── rotas/        auth alunos notas historicos importacoes instituicao formularios pdf
│   ├── servicos/     historico/ nota/ importacao/ documento/
│   ├── adapters/activesoft/   cliente.ts  mapeamento.ts  tipos.ts  mock.ts
│   ├── lib/          supabase auth pdf n8n
│   └── templates/    pdf-historico.ejs  pdf-visita.ejs  pdf-avaliacao.ejs ...
├── shared/           types/  historico-documento.css
├── supabase/migrations/   001_base.sql ... 0NN_*.sql
└── docs/
```

**Build:** `vite build` → `client/dist`; Express serve os estáticos e faz fallback para `index.html` em rotas não-`/api`. O Dockerfile ganha a etapa de build do cliente antes do `npm start`. O Chromium via apt continua como está.

### 2.3 Migração de `supabase/schema.sql` para migrations

O `schema.sql` atual é um script reexecutável com `drop table` embutido — perigoso quando houver dado de aluno em produção. Passa a ser uma pasta de migrations numeradas e imutáveis, aplicadas em ordem. A primeira migration representa o estado atual.

---

## 3. Modelo de dados

### 3.1 Configuração institucional

```sql
instituicao
  id uuid pk · razao_social · nome_fantasia · cnpj · codigo_inep
  endereco_logradouro · numero · complemento · bairro · municipio · uf · cep
  telefone · telefone_secundario · email · site
  mantenedora_nome · mantenedora_cnpj
  orgao_regional            -- Diretoria/Secretaria de Ensino
  logo_path · brasao_path   -- Storage
  criado_em · atualizado_em

instituicao_ato
  id · instituicao_id fk
  etapa       enum(ei, ef_iniciais, ef_finais, em)
  tipo        enum(criacao, autorizacao, reconhecimento, renovacao)
  numero · orgao_emissor · data_ato
  veiculo_publicacao · data_publicacao · texto_extenso · observacao

instituicao_signatario
  id · instituicao_id fk
  nome · cargo enum(diretor, vice_diretor, secretario)
  rg · registro_autorizacao       -- nº de autorização do secretário escolar
  assinatura_path · ativo · ordem

ano_letivo
  id · ano int unique · data_inicio · data_fim · dias_letivos
  situacao enum(aberto, encerrado)
```

### 3.2 Cadastros acadêmicos

> Corrigido em 18/09/2026 a partir do modelo real (`05-modelo-historico.md`). A versão anterior tinha `area_conhecimento` como enum da BNCC e ligava a nota à disciplina — as duas coisas quebram no histórico real do colégio.

```sql
curso                      -- "Ensino Médio Bilíngue" é curso; "Ensino Médio" é etapa
  id · etapa enum(ei, ef_iniciais, ef_finais, em)
  nome                     -- vai no título: "HISTÓRICO ESCOLAR - ENSINO MÉDIO BILÍNGUE"
  razao_aula_hora numeric  -- 0,75 no EM Bilíngue (aula de 45 min)
  texto_promocao text      -- critério do Regimento, impresso em Observações
  ativo

serie
  id · curso_id fk · codigo · nome · ordem · ativo

bloco_curricular           -- nível 1, coluna vertical: "Formação Geral Básica"
  id · curso_id fk · nome · ordem

agrupamento_curricular     -- nível 2: "Linguagens e suas Tecnologias", "Ciclo Integrador", "Eletivas"
  id · bloco_id fk · nome · ordem

componente                 -- nível 3: catálogo de nomes
  id · nome · sigla · ativo

matriz_item                -- UMA LINHA DO HISTÓRICO
  id · ano_letivo_id fk · serie_id fk · agrupamento_id fk · componente_id fk
  ordem · carga_horaria int null      -- nullable: o modelo do EM não imprime por componente
  unique (ano_letivo_id, serie_id, agrupamento_id, componente_id)

matriz_total               -- as duas linhas de total da grade
  ano_letivo_id fk · serie_id fk
  total_aulas_anuais int · total_horas_anuais int
  primary key (ano_letivo_id, serie_id)

sistema_avaliacao
  id · curso_id fk · tipo enum(nota_0_10, nota_0_100, conceito)
  media_aprovacao numeric · frequencia_minima numeric
  escala_conceitos jsonb · legenda text

estabelecimento_externo
  id · nome · municipio · uf · cnpj · codigo_inep
```

**Por que `matriz_item` e não `disciplina`.** No modelo real, "Língua Estrangeira Moderna - Inglês" aparece duas vezes na mesma grade — uma sob Linguagens (6,0 / 8,5 / -) e outra sob Ensino Bilíngue (- / - / 6,5) — com notas diferentes. Educação Física, Filosofia e Sociologia também. A nota pertence à **linha da matriz**, não ao componente.

**Como as três séries viram uma tabela.** As linhas do documento são a união dos `matriz_item` das séries envolvidas, casadas por `(agrupamento_id, componente_id)`. Componente ausente na matriz de um ano recebe `-` naquela coluna.

### 3.3 Alunos e trajetória

```sql
aluno
  id · codigo_activesoft unique · ra
  nome · nome_social · data_nascimento
  municipio_nascimento · uf_nascimento · pais_nascimento · nacionalidade
  sexo · cin · rg · rg_orgao · rg_uf · rg_data · cpf
  -- o histórico imprime CIN/CPF na identificação e RA só no certificado;
  -- rg/certidao/filiacao ficam no cadastro para outros documentos
  certidao_tipo · certidao_termo · certidao_livro · certidao_folha
  filiacao_1 · filiacao_2
  situacao enum(ativo, transferido, concluinte, evadido, inativo)
  origem enum(activesoft, manual) · sincronizado_em
  criado_em · atualizado_em

matricula
  id · aluno_id fk · ano_letivo_id fk · serie_id fk · curso_id fk
  turma · numero_matricula · data_matricula · data_saida
  estabelecimento_externo_id fk null     -- null = cursado no São Marcos
  situacao_final enum(em_curso, aprovado, aprovado_conselho, reprovado,
                      transferido, evadido)
  carga_horaria_total int
  observacao · origem · sincronizado_em
  unique (aluno_id, ano_letivo_id, serie_id)

nota
  id · matricula_id fk · matriz_item_id fk    -- NÃO disciplina: ver §3.2
  valor numeric(5,2) null · conceito text null
  carga_horaria int null · faltas int null
  situacao enum(aprovado, reprovado, dispensado, cursando, sem_registro)
  origem enum(activesoft, manual, importacao_arquivo)
  editado bool default false
  valor_importado jsonb      -- o que veio da origem, preservado
  criado_em · atualizado_em
  unique (matricula_id, matriz_item_id)

auditoria
  id · entidade text · entidade_id uuid · acao enum(criar, editar, excluir, emitir, cancelar)
  campo · valor_anterior jsonb · valor_novo jsonb
  motivo text · usuario_email · criado_em
```

> `valor_importado` é o que permite a reimportação controlada: o sistema compara o novo valor da API com `valor_importado` (e não com `valor`), sabendo assim se houve mudança na origem, edição local, ou ambas.

### 3.4 Documentos emitidos

```sql
historico
  id · aluno_id fk
  tipo enum(transferencia, conclusao_ef, conclusao_em, parcial, declaracao)
  etapa · status enum(rascunho, conferido, emitido, cancelado)
  numero_registro · livro · folha · via int default 1
  numero_registro_gdae text null   -- rótulo impresso: "Registro / Visto Confere";
                                   -- copiado da SED à mão (RF-HIST-15), 12 dígitos no modelo
  curso_id fk · com_certificado bool   -- bloco CERTIFICADO só em histórico de conclusão
  signatario_diretor_id fk · signatario_secretario_id fk
  observacoes text
  snapshot jsonb            -- documento congelado na emissão
  pdf_path text             -- Storage, bucket privado
  criado_por · conferido_por · emitido_por
  criado_em · conferido_em · emitido_em · cancelado_em · motivo_cancelamento

historico_sequencia
  ano int pk · ultimo_numero int      -- controle de numeração

observacao_modelo
  id · titulo · texto · base_legal · etapa · ativo
```

### 3.5 Importação

```sql
importacao
  id · origem enum(activesoft_api, arquivo_csv, arquivo_xlsx)
  tipo enum(alunos, matriculas, notas, completo)
  parametros jsonb           -- ano letivo, série, turma, aluno
  modo enum(simulacao, efetiva)
  status enum(pendente, executando, concluida, erro, cancelada)
  lidos · criados · atualizados · ignorados · com_divergencia  int
  erro text
  iniciado_por · iniciado_em · concluido_em

importacao_divergencia
  id · importacao_id fk
  entidade · entidade_id uuid null
  campo · valor_local jsonb · valor_origem jsonb
  resolucao enum(pendente, manter_local, aceitar_origem, ignorada)
  resolvido_por · resolvido_em

mapeamento_activesoft
  id · tipo enum(disciplina, serie, turma, situacao)
  codigo_origem text · descricao_origem text
  destino_id uuid null · destino_valor text null
  confirmado bool
  unique (tipo, codigo_origem)
```

### 3.6 Usuários

```sql
usuario_perfil                 -- substitui staff_emails
  email text pk · nome
  papel enum(admin, secretaria, coordenacao, leitura)
  ativo bool · criado_em · ultimo_acesso_em
```

Migration preserva os registros: `insert into usuario_perfil select email, nome, 'secretaria', true, created_at from staff_emails`.

### 3.7 RLS

| Tabela | anon | authenticated |
|---|---|---|
| `visita_respostas`, `avaliacao_*` | insert | select se em `usuario_perfil` ativo |
| `aluno`, `matricula`, `nota`, `historico` | — | select se papel ∈ {admin, secretaria, coordenacao, leitura}; insert/update se papel ∈ {admin, secretaria} |
| `instituicao*`, `serie`, `disciplina`, `matriz_curricular` | — | select para todos os papéis; escrita só `admin` |
| `importacao*`, `auditoria` | — | select {admin, secretaria}; escrita via `service_role` |
| `usuario_perfil` | — | select da própria linha; escrita só `admin` |

Nenhuma tabela de aluno, nota ou documento permite `delete` a nenhum papel (RNF-02). Exclusão é inativação.

---

## 4. Pipeline do histórico

```
 1. Secretaria escolhe aluno + tipo de documento
 2. servicos/historico/montar.ts
      carrega aluno, matrículas, notas, matriz, instituição, atos, signatários
      aplica regras do tipo (transferência vs. conclusão)
      roda validações (RF-ALU-08)
 3. → HistoricoDocumento (objeto tipado, shared/types)
 4. Pré-visualização React renderiza o objeto  ──┐
 5. Edição inline altera o objeto e persiste    │ mesmo objeto,
 6. Emissão: snapshot = HistoricoDocumento      │ mesmo CSS
 7. /internal/pdf/historico/:id → EJS ──────────┘
 8. Puppeteer (paginated: true) → PDF → Storage
```

Emitido, o `snapshot` é a verdade do documento. Reemissão da 2ª via renderiza o snapshot, não recalcula.

## 5. Fases

| Fase | Entrega | Depende de |
|---|---|---|
| **F0 — Fundação** | Vite + React + TS, migrations, `usuario_perfil` e papéis, login em React, shell do painel | — |
| **F1 — Instituição** | Cadastro da instituição, atos, signatários, anos letivos, pré-visualização do cabeçalho | F0 |
| **F2 — Cadastros base** | Cursos, séries, blocos/agrupamentos/componentes, matriz curricular e totais, sistema de avaliação, estabelecimentos externos | F1 |
| **F3 — Integração** | Adaptador Activesoft, importação com simulação, log e divergências, mapeamento de códigos | F2 + **doc da API** |
| **F4 — Alunos e notas** | Lista, ficha, grade de notas editável, auditoria, anos cursados fora, validações | F3 |
| **F5 — Histórico** | Montagem, pré-visualização, edição, emissão, numeração, PDF, 2ª via | F4 + **modelo validado com a DE de Mogi das Cruzes** + resposta sobre a SED (ver `01-requisitos.md` §5) |
| **F6 — Formulários** | Migração dos wizards e da tela de respostas para React, aposentadoria das views EJS de página | F0 |
| **F7 — Refino** | Geração em lote, importação agendada, QR de verificação, relatórios | F5 |

F1 e F2 podem começar antes de a documentação da API estar disponível — é o motivo de estarem primeiro. F6 é independente de F1–F5 e pode rodar em paralelo.
