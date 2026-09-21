# Secretaria Digital — Colégio São Marcos

Sistema de gestão da secretaria do colégio: painel administrativo (React) sobre a central de formulários existente (visitas e avaliação substitutiva), com servidor Node.js/Express e Supabase.

Planejamento completo em [docs/](docs/README.md). Estado das fases:

| Fase | Entrega | Estado |
|---|---|---|
| F0 — Fundação | Vite + React + TS, migrations, papéis (`usuario_perfil`), login em React, shell do painel | ✅ |
| F1 — Instituição | Cadastro da instituição, atos legais, signatários, anos letivos, pré-visualização do cabeçalho | ✅ |
| F2 — Cadastros base | Cursos, séries, componentes, versões curriculares (blocos → agrupamentos → itens, totais, vigência, duplicar/publicar), sistema de avaliação, estabelecimentos externos | ✅ |
| F3 — Integração | Contrato canônico, pipeline de importação (simulação · efetiva · idempotente · divergências RF-INT-06 · pendências de mapeamento com sugestão), adaptadores `mock`, `arquivo` (CSV) e `activesoft` (API real), tela de mapeamentos | ✅ |
| F4 — Alunos e notas | Lista com filtros, ficha (dados · trajetória · notas), cadastro manual, ano cursado em outra escola, grade de notas editável com motivo e auditoria, validação RF-ALU-08 | ✅ |
| F5 — Histórico | Assistente de geração, montagem da grade cruzando versões curriculares, pré-visualização fiel (mesmo CSS do PDF), edição, conferência, emissão com numeração e snapshot, PDF, 2ª via, cancelamento, textos-padrão de observação | ✅ |
| F6 — Formulários | Migração dos wizards e das respostas para React | ✅ |

## Estrutura

```text
.
├── client/                 dois bundles Vite independentes
│   ├── src/                painel React — servido em /app
│   │   ├── app/            telas por módulo (inicio, alunos, historicos, importacoes, formularios, configuracoes)
│   │   ├── auth/           login em React
│   │   ├── componentes/    Shell (sidebar/topbar/drawer), ui (Botao, Card, Tabela responsiva, Modal…), ícones
│   │   ├── hooks/          sessão, ano letivo global, toasts, carregamento de recursos
│   │   ├── compartilhado/  useAssistente, agruparPorData — reaproveitado pelos formulários públicos
│   │   └── estilos/        tokens e estilos do painel (tema claro/escuro)
│   ├── formularios/        2º bundle Vite (client/vite.formularios.config.ts) — os dois wizards
│   │   │                   públicos, sem router, servidos em /form-visitas e
│   │   │                   /form-avaliacao-substitutiva
│   │   ├── visita.html / avaliacao.html   entradas independentes
│   │   ├── visita/, avaliacao/            um wizard cada
│   │   └── comum/                         casco visual compartilhado entre os dois
├── server/                 servidor TypeScript (tsx)
│   ├── index.ts            entrada — monta rotas antigas (JS) e novas (TS), serve client/dist em /app
│   ├── lib/                autorização por papel (exigirPapel), validação (zod)
│   ├── adapters/activesoft/ contrato do adaptador: mock, arquivo (CSV), cliente (API — stub)
│   ├── servicos/           importacao.ts — pipeline independente do adaptador
│   │                       historico/montar.ts — monta o HistoricoDocumento (fonte única da
│   │                       pré-visualização e do PDF); historico/pdf.ts — Puppeteer + Storage
│   └── rotas/              painel, usuarios, instituicao, anos-letivos, cadastros, versoes,
│                           importacoes, alunos, historicos, pdf-interno (rota do Puppeteer)
├── shared/types/           tipos compartilhados cliente ↔ servidor (+ montagem do cabeçalho do documento)
├── shared/historico-documento.css   CSS do documento — importado pela tela E embutido no PDF (RNF-04)
├── lib/, routes/, views/   módulo original (auth, respostas, PDFs via Puppeteer, n8n). `routes/pages.js`
│                           foi reescrito no F6 incremento B: `/`, `/respostas`, `/form-visitas` e
│                           `/form-avaliacao-substitutiva` agora servem/redirecionam para os bundles
│                           React (`client/dist` e `client/dist-formularios`); `views/index.ejs` e
│                           `views/respostas.ejs` foram removidas. `views/pdf-*.ejs` (Puppeteer) e
│                           `public/js/main.js`/`review-renderer.js`, que os alimentam, continuam
│                           inalterados. `views/pdf-historico.ejs` (F5) é o par do componente
│                           `PreviaDocumento.tsx`: mesmo objeto, mesmo CSS — mexeu num, mexa no outro
├── public/                 estáticos legados (css/js usados só pelos templates de PDF, ver 02-arquitetura.md) e imagens
├── supabase/migrations/    001–006, imutáveis, aplicadas em ordem
├── scripts/ambiente-local/ Supabase local (Postgres + PostgREST + GoTrue falso) para desenvolver sem tocar produção
├── scripts/                provisionamento de contas
└── docs/                   requisitos, arquitetura, modelo do histórico, mockup
```

## Pré-requisitos

- Node.js 20+
- Projeto Supabase (URL, chave anônima, service role)

## Configuração

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Copie `.env.example` para `.env` e preencha (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `COOKIE_SECRET`, `INTERNAL_PDF_SECRET`, `APP_BASE_URL`).

3. **Aplique as migrations** no SQL Editor do Supabase, em ordem: `supabase/migrations/001_base.sql` → `002` → `003` → `004` → `005`. Detalhes e pós-migração em [supabase/migrations/README.md](supabase/migrations/README.md).

   > A `002` substitui `staff_emails` por `usuario_perfil` (quem já tinha acesso vira `secretaria`). Depois dela, **promova ao menos uma pessoa a `admin`**, senão ninguém configura a instituição:
   >
   > ```sql
   > update usuario_perfil set papel = 'admin' where email = 'voce@saomarcos.g12.br';
   > ```

4. Provisione contas de login para quem está em `usuario_perfil`:

   ```bash
   node scripts/provision-staff-users.mjs
   ```

   Senha padrão `SaoMarcos`, troca obrigatória no primeiro acesso.

## Executando

Desenvolvimento (dois processos — API e Vite com hot reload):

```bash
npm run dev
```

```bash
npm run dev:client
```

Painel em http://localhost:5173/app/ (o Vite encaminha `/api` para o Express em :3000).

Para desenvolver os dois formulários públicos com hot reload (bundle Vite separado, `client/vite.formularios.config.ts`), rode em paralelo:

```bash
npm run dev:client:formularios
```

Formulários em http://localhost:5174/visita.html e http://localhost:5174/avaliacao.html (proxy de `/api`, `/css` e `/images` para o Express em :3000). Sem esse comando rodando, os formulários públicos servidos pelo Express em http://localhost:3000/form-visitas e http://localhost:3000/form-avaliacao-substitutiva usam o build estático de `client/dist-formularios` (rode `npm run build` para gerá-lo).

Produção (compila o painel e sobe o servidor):

```bash
npm run build && npm start
```

Painel em http://localhost:3000/app · formulários em http://localhost:3000/form-visitas e http://localhost:3000/form-avaliacao-substitutiva.

Checagem de tipos (cliente e servidor):

```bash
npm run typecheck
```

## Importação

`IMPORTACAO_ADAPTADOR=mock` (padrão) usa dados de exemplo; a tela de importação também aceita **arquivos CSV** com as colunas do contrato canônico (modelos em `/api/importacoes/csv-modelo/{alunos|matriculas|notas}`).

Para importar da API real do Activesoft, defina `IMPORTACAO_ADAPTADOR=activesoft`, `ACTIVESOFT_BASE_URL` (o host do SIGA da escola, ex. `https://siga03.activesoft.com.br`) e `ACTIVESOFT_API_KEY` (token Bearer gerado no painel do Activesoft para esta instituição). `ACTIVESOFT_CLIENT_ID`/`ACTIVESOFT_CLIENT_SECRET`/`ACTIVESOFT_TENANT` não são usados por esta versão da API. Limitações conhecidas da API (documentadas em `docs/03-integracao-activesoft.md` §8): sem filtro de período documentado (só o "ano atual" do SIGA), sem nota final anual (o adaptador traz a média das fases lançadas como rascunho) e documentos do aluno exigem o escopo `dados_complementares` no token.

## Ambiente local sem Supabase

`scripts/ambiente-local/` sobe Postgres + PostgREST no Docker e um GoTrue falso em Node, aplica as migrations e semeia um curso com versão curricular. Serve para desenvolver e testar importação, notas e auditoria sem encostar no projeto Supabase de produção. Instruções em [scripts/ambiente-local/README.md](scripts/ambiente-local/README.md).

## Papéis

| Papel | Vê | Escreve |
|---|---|---|
| `admin` | tudo | tudo (instituição, atos, signatários, cursos, currículos, usuários) |
| `secretaria` | tudo menos Usuários | importação, mapeamentos, alunos, matrículas, notas (com motivo), outras escolas |
| `coordenacao` | alunos, históricos, formulários | — |
| `leitura` | alunos, históricos | — |

A regra é aplicada no servidor (`exigirPapel`) e repetida no banco (RLS com `tem_papel()`).

## Implantação

O `Dockerfile` tem duas etapas: compila o painel (`vite build`) e monta a imagem de runtime com o Chromium do sistema para o Puppeteer. No EasyPanel, modo "Dockerfile". Defina as variáveis do `.env.example` no hosting; `PUPPETEER_*` já vêm fixadas na imagem.

Sem Docker:

```bash
npm ci && npm run build && npm start
```

## Licença

[MIT](LICENSE).
