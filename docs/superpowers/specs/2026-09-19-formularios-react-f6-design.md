# F6 — Formulários em React

**Status:** aprovado para implementação (Incremento A). Incremento B fica registrado aqui para não perder o contexto, mas não é implementado por este ciclo.

## 1. Contexto

`docs/02-arquitetura.md` §5 define a F6 como "migração dos wizards e da tela de respostas para React, aposentadoria das views EJS de página". `docs/04-telas-e-navegacao.md` já reserva `/app/formularios` e `/app/formularios/respostas` no mapa de rotas do painel, e `client/src/app/formularios/Formularios.tsx` já existe como um hub que hoje só abre links externos para as páginas EJS (`/form-visitas`, `/form-avaliacao-substitutiva`, `/respostas`).

Levantamento feito antes desta spec (ver conversa) confirmou uma diferença estrutural importante:

- `/form-visitas` e `/form-avaliacao-substitutiva` (`routes/pages.js`) **não passam por nenhum gate de autenticação** — são preenchidos por gente de fora (pais, visitantes, professor substituto), sem conta no sistema.
- `/` (`views/index.ejs`) e `/respostas` (`views/respostas.ejs`) **exigem login institucional** (`usuario_perfil`, migration 002 — papéis `admin`/`secretaria`/`coordenacao`/`leitura`, todos internos). Não existe tipo de conta para pai ou visitante. Na prática, pais/visitantes chegam direto no link do formulário (compartilhado pela secretaria), sem nunca passar pelo login de `/`.
- `lib/pdf.js` e as views `pdf-*.ejs` são só para a geração de PDF via Puppeteer — nunca vistas por um navegador de usuário, e não fazem parte desta migração.

Essa diferença de audiência (público sem conta vs. equipe interna logada) é o motivo de dividir a F6 em dois incrementos com risco bem diferente.

## 2. Escopo

### Incremento A — esta spec, implementado agora

Tudo o que já vive atrás do login institucional:

- `/app/formularios` (hub, já existe) ganha um link interno de verdade para a tela de respostas, em vez do link externo `target="_blank"` para `/respostas`.
- `/app/formularios/respostas` (nova): lista de respostas + modal de detalhe, com as mesmas ações de hoje (baixar PDF, reenviar por WhatsApp, abrir anexo de prova).
- `/` passa a redirecionar para `/app` (mata o gate de login duplicado em `views/index.ejs` — quem usa formulários já usa `/app/formularios`).
- `/respostas` passa a redirecionar para `/app/formularios/respostas`, preservando `?form=`, para não quebrar links salvos/compartilhados internamente.
- Aposentados nesta rodada: `views/index.ejs`, `views/respostas.ejs`, `public/js/respostas.js`, `public/js/index.js`, o uso de `public/js/auth-gate.js` nessas duas páginas (o gate de sessão do painel já é outro, em React).
- **Nenhuma mudança de backend.** Os mesmos endpoints (`GET /api/responses`, `GET /api/responses/:id/pdf`, `GET /api/responses/:id/anexo/:provaId`, `POST /api/responses/:id/whatsapp`, todos em `routes/api.js`) continuam exatamente como estão.

### Incremento B — não implementado agora, registrado para planejamento futuro

- `/form-visitas` e `/form-avaliacao-substitutiva` viram rotas React num **segundo bundle Vite, público e mais leve**, separado do bundle do painel (`/app`) — visitante externo não deve baixar o JS do painel administrativo inteiro.
- O wizard nasce como componente `Assistente` reaproveitável — `docs/04-telas-e-navegacao.md` §3 já prevê esse componente sendo reaproveitado pelo assistente de geração de histórico (`/app/alunos/:id/historico/novo`).
- Aposenta `views/form-visitas.ejs`, `views/form-avaliacao.ejs`, `public/js/wizard.js`, `public/js/wizard-avaliacao.js`, `public/js/policy-modal.js`.
- `public/js/review-renderer.js` deixa de existir depois do Incremento B (o Incremento A já porta a parte de exibição para React — ver §4; o Incremento B precisaria portar também a parte usada dentro do próprio wizard, na tela de revisão antes do envio).
- Fora de escopo desta spec: desenho de rotas, layout do wizard em React, como duas telas (uma pública, uma autenticada) coexistem no mesmo repositório/build. Isso é matéria para uma spec própria quando o Incremento B for iniciado.

### Sem mudança em nenhum incremento

- `lib/pdf.js`, `views/pdf-visita.ejs`, `views/pdf-visita-blank.ejs`, `views/pdf-avaliacao.ejs`, `views/pdf-avaliacao-blank.ejs` — geração de PDF via Puppeteer, server-side, sem UI.
- `lib/visita.js`, `lib/avaliacao.js`, `lib/n8n.js`, `lib/supabase.js`, `lib/auth.js`.
- `views/politica-privacidade.ejs` (página estática, sem lógica de wizard).
- `routes/api.js`, `routes/pdf.js` (exceto pela adição dos dois redirects em `routes/pages.js`, que é routing, não lógica de negócio).

## 3. Incremento A — design detalhado

### 3.1 Rotas

`client/src/rotas.tsx` ganha uma rota filha sob `formularios` (já protegida por `SoPapel papeis={['admin', 'secretaria', 'coordenacao']}`, mesma visibilidade que a doc de navegação já define):

```
{ path: 'formularios', element: <SoPapel papeis={['admin', 'secretaria', 'coordenacao']} />, children: [
  { index: true, element: <Formularios /> },
  { path: 'respostas', element: <Respostas /> }
] }
```

Do lado do servidor (`routes/pages.js`):

- `GET /` → `res.redirect('/app')` (era `renderGated('index', ...)`).
- `GET /respostas` → `res.redirect(302, '/app/formularios/respostas' + (req.query.form ? '?form=' + encodeURIComponent(req.query.form) : ''))` (era `renderGated('respostas', ...)`).
- `GET /form-visitas` e `GET /form-avaliacao-substitutiva` **não mudam nesta rodada** (Incremento B).

### 3.2 Componentes novos

- `client/src/app/formularios/Respostas.tsx` — página principal. Lê `form` da query string (`useSearchParams`, default `'visitas'`), com abas ou seletor para as duas origens. Busca via `GET /api/responses?form=...` e mostra a lista de cards (nome do(s) aluno(s), contagem quando há mais de um, data de envio, botão "Ver detalhes") — mesmo formato de hoje, sem virar uma tabela densa, porque o conteúdo por resposta é irregular (visitas tem uma lista de alunos; avaliação substitutiva tem alunos × provas).
- `client/src/app/formularios/RevisaoResposta.tsx` — porta a lógica de apresentação de `public/js/review-renderer.js` (`SMReview.buildReviewCards` e `buildAvaliacaoReviewCards`) para React puro: recebe o `data` já salvo de uma resposta e renderiza os cards de revisão, incluindo os botões "Ver anexo" por prova (avaliação substitutiva). Fica isolado num arquivo próprio porque também vai servir de base para o Incremento B (a tela de revisão dentro do próprio wizard usa a mesma formatação).
- Modal de detalhe reaproveita o componente `Modal` já existente em `@/componentes/ui` (mesmo usado em outras telas do painel), com rodapé: Fechar · Enviar por WhatsApp · Baixar PDF.

### 3.3 Ações e chamadas de API (inalteradas, só a camada de UI muda)

| Ação | Endpoint | Observação |
|---|---|---|
| Listar respostas | `GET /api/responses?form=visitas\|avaliacao-substitutiva` | Retorna array de `{ id, submittedAt, data }` |
| Baixar PDF | `GET /api/responses/:id/pdf?form=...` | Resposta binária (blob) — mesmo padrão de download por `<a>` temporário que já existe |
| Abrir anexo de prova | `GET /api/responses/:id/anexo/:provaId?form=avaliacao-substitutiva` | Retorna `{ url }` (assinada) — abre em nova aba |
| Reenviar por WhatsApp | `POST /api/responses/:id/whatsapp?form=...` | Sem corpo; erro vem como `{ error }` |

Nenhum desses contratos muda — o trabalho é só trocar `fetch` + manipulação de DOM por `fetch` + estado React, com toasts (`useToasts`, já usado em outras telas) no lugar de `alert()`.

### 3.4 Componentes existentes reaproveitados

`Cabecalho`, `Card`, `Tag`, `Modal`, `EstadoVazio`, `Carregando`, `Botao`/`BotaoLink`, `Icone`, hook de toasts — todos já usados em outras telas do painel (`Alunos.tsx`, `Importacoes.tsx`), sem necessidade de criar nada novo de UI genérica.

## 4. Tratamento de erro

Mesmo padrão do resto do painel:

- Carregamento: `Carregando`.
- Lista vazia: `EstadoVazio` ("Nenhuma resposta enviada ainda para este formulário").
- Falha ao carregar lista: `EstadoVazio` com o texto do erro (hoje é uma mensagem solta no `respostas.js`; migra para o mesmo padrão visual das outras telas).
- Falha em ação pontual (PDF, WhatsApp, anexo): toast de erro, sem travar a tela — mesmo comportamento de hoje (o botão volta ao estado normal depois da falha).
- `401` da API: o `useSessao`/roteamento do painel já trata sessão expirada globalmente (redireciona para `/app/entrar`) — não precisa de tratamento especial nesta tela, diferente do `respostas.js` antigo que tinha sua própria lógica de gate.

## 5. Verificação

Sem framework de testes automatizados no projeto (nenhuma fase anterior tem). Verificação manual via o skill `run`, comparando com o comportamento atual antes de apagar os arquivos antigos:

1. `/app/formularios` → link "Respostas" abre `/app/formularios/respostas` dentro do painel (sem `target="_blank"`).
2. Lista carrega para os dois formulários (`?form=visitas` e `?form=avaliacao-substitutiva`), com pelo menos uma resposta real ou de teste em cada.
3. Modal de detalhe mostra os cards de revisão com os mesmos campos de hoje.
4. Baixar PDF, abrir anexo de prova e reenviar por WhatsApp funcionam e correspondem byte a byte / mensagem a mensagem ao que a versão EJS produzia (mesmos endpoints, então deve ser idêntico).
5. `/` redireciona para `/app`. `/respostas?form=avaliacao-substitutiva` redireciona para `/app/formularios/respostas?form=avaliacao-substitutiva`.
6. `npm run typecheck` limpo.

## 6. Riscos e decisões em aberto

- **Sem teste automatizado hoje** — risco aceito, consistente com o resto do projeto.
- **`review-renderer.js` fica parcialmente vivo até o Incremento B** (ainda usado dentro do próprio wizard, em `views/form-visitas.ejs`/`form-avaliacao.ejs`). O Incremento A não apaga o arquivo, só para de referenciá-lo em `respostas.ejs`/`index.ejs` — a remoção completa acontece só quando o Incremento B portar o wizard inteiro.
- **Incremento B não tem desenho de rotas/build ainda** — decisão de "bundle separado e leve" já foi tomada, mas o *como* (segundo `vite.config`, como o Express serve os dois bundles, como o `Assistente` é compartilhado entre um bundle público e o bundle do painel) fica para quando essa etapa for brainstormada.
