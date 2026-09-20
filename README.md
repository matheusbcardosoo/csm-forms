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
| F5 — Histórico | Montagem, pré-visualização fiel, emissão, PDF, 2ª via | ⏳ |
| F6 — Formulários | Migração dos wizards e das respostas para React | ✅ |

## Estrutura

```text
.
├── client/                 painel React (Vite) — servido em /app
│   └── src/
│       ├── app/            telas por módulo (inicio, alunos, historicos, importacoes, formularios, configuracoes)
│       ├── auth/           login em React
│       ├── componentes/    Shell (sidebar/topbar/drawer), ui (Botao, Card, Tabela responsiva, Modal…), ícones
│       ├── hooks/          sessão, ano letivo global, toasts, carregamento de recursos
│       └── estilos/        tokens e estilos do painel (tema claro/escuro)
├── server/                 servidor TypeScript (tsx)
│   ├── index.ts            entrada — monta rotas antigas (JS) e novas (TS), serve client/dist em /app
│   ├── lib/                autorização por papel (exigirPapel), validação (zod)
│   ├── adapters/activesoft/ contrato do adaptador: mock, arquivo (CSV), cliente (API — stub)
│   ├── servicos/           importacao.ts — pipeline independente do adaptador
│   └── rotas/              painel, usuarios, instituicao, anos-letivos, cadastros, versoes, importacoes, alunos
├── shared/types/           tipos compartilhados cliente ↔ servidor (+ montagem do cabeçalho do documento)
├── lib/, routes/, views/   módulo original (formulários, respostas, PDFs via Puppeteer) — inalterado
├── public/                 estáticos dos formulários públicos
├── supabase/migrations/    001–005, imutáveis, aplicadas em ordem
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

Painel em http://localhost:5173/app/ (o Vite encaminha `/api` para o Express em :3000). Formulários públicos em http://localhost:3000/form-visitas e http://localhost:3000/form-avaliacao-substitutiva.

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
