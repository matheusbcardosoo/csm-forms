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
┌── Cliente: dois bundles Vite independentes ───────────┐
│  ├── client/vite.config.ts              painel        │
│  │     React 19 + TypeScript + React Router, /app/*   │
│  └── client/vite.formularios.config.ts  formulários    │
│        React 19 + TypeScript, SEM router (dois HTMLs   │
│        de entrada): /form-visitas, /form-avaliacao-    │
│        substitutiva — bundle leve, visitante não baixa  │
│        o JS do painel administrativo                    │
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

**D6b — Um único template de PDF, não versionado.**
A secretaria redigita histórico antigo no modelo atual em vez de reproduzir o documento da época, então o template nunca precisa ser versionado — só a estrutura curricular é. Vale para a v1 e continua valendo quando o acervo antigo for implementado (`07-acervo-antigo-diferido.md` D1).

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
│   │   ├── componentes/            UI compartilhada
│   │   ├── hooks/   api/   estilos/
│   │   └── compartilhado/          shared useAssistente, agruparPorData
│   ├── vite.config.ts              painel
│   ├── vite.formularios.config.ts
│   └── formularios/                2º bundle Vite (public/, sem router):
│       ├── visita.html / avaliacao.html  entradas independentes
│       ├── visita/, avaliacao/           um wizard cada
│       └── comum/                        casco visual compartilhado entre os dois
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

> `client/src/compartilhado/` guarda o que é reaproveitado pelos DOIS
> bundles (painel e formulários): o hook `useAssistente` e a lógica de
> agrupamento de provas por data. Ver
> docs/superpowers/specs/2026-09-19-formularios-react-f6-incremento-b-design.md.

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

> Reescrito duas vezes: em 18/09/2026 a partir do modelo real (`05-modelo-historico.md`), e de novo para versionamento curricular. **O desenho completo está em [`06-versionamento-curricular.md`](06-versionamento-curricular.md)** — aqui fica só o resumo.

```sql
curso
  id · etapa enum(ei, ef_iniciais, ef_finais, em)
  nome                     -- vai no título: "HISTÓRICO ESCOLAR - ENSINO MÉDIO BILÍNGUE"
  razao_aula_hora numeric  -- 0,75 no EM Bilíngue (aula de 45 min)
  texto_promocao text      -- critério do Regimento, impresso em Observações
  ativo
  -- nomenclatura de série mudou (1º grau → EF 8 séries → EF 9 anos)? é CURSO NOVO.
  -- só os componentes mudaram? é VERSÃO NOVA. Ver 06-versionamento-curricular.md §6.4

serie
  id · curso_id fk · codigo · nome · ordem · ativo

-- ---- estrutura curricular, versionada e imutável em uso ----
versao_curricular   id · curso_id · nome · base_legal · status · ano_inicio · ano_fim · duplicada_de_id
versao_bloco        id · versao_id · nome · ordem
versao_agrupamento  id · versao_bloco_id · nome · ordem
versao_item         id · versao_agrupamento_id · serie_id · componente_id null · nome_impresso · ordem · carga_horaria null
versao_total        versao_id · serie_id · total_aulas_anuais · total_horas_anuais
vigencia_curricular ano_letivo_id · serie_id · versao_id          -- pk (ano_letivo, serie)

componente          id · nome_canonico · sigla · ativo
  -- catálogo de IDENTIDADE entre versões, não de impressão:
  -- liga "Ciências" (2016) e "Ciências da Natureza" (2023) como a mesma coisa

sistema_avaliacao
  id · curso_id fk · tipo enum(nota_0_10, nota_0_100, conceito)
  media_aprovacao numeric · frequencia_minima numeric
  escala_conceitos jsonb · legenda text

estabelecimento_externo
  id · nome · municipio · uf · cnpj · codigo_inep
```

**Três invariantes que sustentam o resto:**

1. **`versao_item` é a linha do histórico**, não a disciplina. No modelo real, "Língua Estrangeira Moderna - Inglês" aparece duas vezes na mesma grade — sob Linguagens e sob Ensino Bilíngue — com notas diferentes. A nota se liga à linha.
2. **Versão em uso é somente leitura**, garantido por constraint no banco. Reforma gera versão nova por duplicação; o passado nunca é reescrito.
3. **`nome_impresso` vive na versão**, `componente` guarda só a identidade. É o que permite reimprimir um histórico de 2019 com os nomes de 2019.

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
  versao_curricular_id fk          -- congelada na criação: o que este aluno cursou
  turma · numero_matricula · data_matricula · data_saida
  estabelecimento_externo_id fk null     -- null = cursado no São Marcos
  situacao_final enum(em_curso, aprovado, aprovado_conselho, reprovado,
                      transferido, evadido)
  carga_horaria_total int
  observacao · origem · sincronizado_em
  unique (aluno_id, ano_letivo_id, serie_id)

nota
  id · matricula_id fk · versao_item_id fk    -- NÃO disciplina: ver §3.2
  valor numeric(5,2) null · conceito text null
  carga_horaria int null · faltas int null
  situacao enum(aprovado, reprovado, dispensado, cursando, sem_registro)
  origem enum(activesoft, manual, importacao_arquivo)
  editado bool default false
  valor_importado jsonb      -- o que veio da origem, preservado
  criado_em · atualizado_em
  unique (matricula_id, versao_item_id)

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
  id · versao_id fk                -- mapeamento é por versão curricular
  tipo enum(disciplina, serie, turma, situacao)
  codigo_origem text · descricao_origem text
  versao_item_id fk null · destino_valor text null
  confirmado bool
  unique (versao_id, tipo, codigo_origem)
  -- duplicar uma versão herda os mapeamentos; ver 06-versionamento-curricular.md §5
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
| `instituicao*`, `curso`, `serie`, `componente`, `versao_*`, `vigencia_curricular` | — | select para todos os papéis; escrita só `admin`, e só em versão `rascunho` |
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
| **F2 — Cadastros base** | Cursos, séries, **versão curricular vigente** (blocos, agrupamentos, itens, totais, vigência), sistema de avaliação, estabelecimentos externos. Versões retroativas entram sob demanda, não aqui | F1 |
| **F3 — Integração** | Adaptador Activesoft, importação com simulação, log e divergências, mapeamento de códigos | F2 + **doc da API** |
| **F4 — Alunos e notas** | Lista, ficha, grade de notas editável, auditoria, anos cursados fora, validações | F3 |
| **F5 — Histórico** | Montagem, pré-visualização, edição, emissão, numeração, PDF, 2ª via | F4 + **modelo validado com a DE de Mogi das Cruzes** + resposta sobre a SED (ver `01-requisitos.md` §5) |
| **F6 — Formulários** | Migração dos wizards e da tela de respostas para React, aposentadoria das views EJS de página | F0 |
| **F7 — Refino** | Geração em lote, importação agendada, QR de verificação, relatórios | F5 |

**Fora deste roadmap:** o acervo anterior ao Activesoft é feature própria, diferida — `07-acervo-antigo-diferido.md`. O schema das fases 1–5 já a acomoda; nada precisará ser refeito.

F1 e F2 podem começar antes de a documentação da API estar disponível — é o motivo de estarem primeiro. F6 é independente de F1–F5 e pode rodar em paralelo.
