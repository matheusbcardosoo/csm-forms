# Formulários Públicos em React (F6, Incremento B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar `/form-visitas` e `/form-avaliacao-substitutiva` (hoje EJS + JS vanilla) para React, num segundo bundle Vite público e leve, totalmente separado do bundle do painel — sem framework de rotas, sem mudança de URL, sem mudança visual — e concluir a aposentadoria de `public/js/review-renderer.js`.

**Architecture:** Dois mini-apps React independentes (`client/formularios/visita.html`, `client/formularios/avaliacao.html`), construídos por um segundo `vite.config` dentro de `client/` (sem `react-router-dom`). Um hook headless (`useAssistente`) e a lógica de agrupamento de provas por data (`avaliacaoRevisao.ts`) ficam em `client/src/compartilhado/`, reaproveitados também pelo painel (retrofit de `RevisaoResposta.tsx`, do Incremento A). CSS e FontAwesome continuam carregados via `<link>` estático, exatamente como hoje — só o comportamento (validação, navegação entre passos, revisão, envio) vira React.

**Tech Stack:** React 19 + TypeScript + Vite (dois bundles independentes dentro de `client/`), Express 4 servindo os dois builds.

**Spec:** `docs/superpowers/specs/2026-09-19-formularios-react-f6-incremento-b-design.md`

## Global Constraints

- Nenhuma mudança de backend/API. `POST /api/responses`, `POST /api/avaliacoes`, `GET /api/blank/visita/pdf`, `GET /api/blank/avaliacao/pdf` (todos em `routes/api.js`) continuam exatamente como estão.
- URLs públicas não mudam: `/form-visitas` e `/form-avaliacao-substitutiva` continuam sendo os endereços finais, servidos pelo Express (`routes/pages.js`).
- Aparência não muda em nenhum pixel: CSS (`/css/styles.css`) e FontAwesome (CDN) continuam carregados via `<link>` estático nos dois HTMLs novos, exatamente como nas `.ejs` atuais. Os componentes React usam as mesmas classes CSS que os elementos originais usavam (`field-group`, `student-block`, `wizard-step`, `choice-pill`, `review-card`, etc.) — nenhuma classe nova, nenhuma classe removida.
- Sem `react-router-dom` nem qualquer outra biblioteca de rotas no bundle público — cada wizard é um mini-app fechado, montado direto no `#root` do seu próprio HTML.
- Sem framework de testes automatizados no projeto (nenhuma fase anterior tem — não introduzir um agora). Verificação manual, com passos exatos por tarefa. Diferente do Incremento A, aqui **não há gate de login** — toda a verificação pode ser feita ponta a ponta, sem credenciais.
- Nomes de função/variável em português, seguindo a convenção do resto do repositório.
- `npm run typecheck` precisa passar limpo ao final de cada tarefa que toca `client/` ou `server/`.
- `npm run build` precisa gerar **os dois** bundles (`client/dist` e `client/dist-formularios`) sem erro a partir da Tarefa 1 em diante.

---

### Task 1: Infraestrutura do segundo bundle (Vite + Express)

**Files:**
- Create: `client/vite.formularios.config.ts`
- Create: `client/formularios/visita.html`
- Create: `client/formularios/visita/main.tsx`
- Create: `client/formularios/avaliacao.html`
- Create: `client/formularios/avaliacao/main.tsx`
- Modify: `server/index.ts`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nada de novo — usa só `vite`, `@vitejs/plugin-react`, `path` (já são dependências do projeto).
- Produces: `client/dist-formularios/visita.html` e `client/dist-formularios/avaliacao.html` (depois do build), cada um com seus próprios assets sob `/assets-formularios/`. Estes dois HTMLs são o que as Tarefas 4-6 vão preencher de verdade — aqui eles só provam que o pipeline de build/serve funciona, com um placeholder. `routes/pages.js` **não muda nesta tarefa** — `/form-visitas` e `/form-avaliacao-substitutiva` continuam sendo as `.ejs` antigas até a Tarefa 6.

- [ ] **Step 1: Criar `client/vite.formularios.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Bundle público dos formulários (F6 incremento B — ver
// docs/superpowers/specs/2026-09-19-formularios-react-f6-incremento-b-design.md).
// Multi-page build nativo do Vite: dois HTMLs de entrada, cada um um
// mini-app fechado, SEM react-router-dom — visitante de /form-visitas
// nunca baixa o código do outro formulário nem do painel administrativo.
// Em dev, base fica em "/" pra servir as páginas em URLs amigáveis
// (http://localhost:5174/visita.html); em build, vai com prefixo próprio
// pra não colidir com /js, /css, /images (estáticos existentes) nem com
// /app/ (base do painel).
export default defineConfig(({ command }) => ({
  root: path.resolve(__dirname, 'formularios'),
  base: command === 'build' ? '/assets-formularios/' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@compartilhado': path.resolve(__dirname, 'src', 'compartilhado')
    }
  },
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: false }
    }
  },
  build: {
    outDir: path.resolve(__dirname, 'dist-formularios'),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        visita: path.resolve(__dirname, 'formularios', 'visita.html'),
        avaliacao: path.resolve(__dirname, 'formularios', 'avaliacao.html')
      }
    }
  }
}));
```

- [ ] **Step 2: Criar `client/formularios/visita.html`**

```html
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Formulário de Visita | Colégio São Marcos</title>
<link rel="icon" type="image/png" href="/images/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<link rel="stylesheet" href="/css/styles.css">
</head>
<body>
<div id="root"></div>
<script type="module" src="./visita/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 3: Criar `client/formularios/visita/main.tsx` (placeholder)**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div style={{ padding: 40 }}>Formulário de visita — em construção (Tarefa 5 deste plano).</div>
  </StrictMode>
);
```

- [ ] **Step 4: Criar `client/formularios/avaliacao.html`**

```html
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Avaliação Substitutiva | Colégio São Marcos</title>
<link rel="icon" type="image/png" href="/images/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<link rel="stylesheet" href="/css/styles.css">
</head>
<body>
<div id="root"></div>
<script type="module" src="./avaliacao/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 5: Criar `client/formularios/avaliacao/main.tsx` (placeholder)**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div style={{ padding: 40 }}>Avaliação substitutiva — em construção (Tarefa 4 deste plano).</div>
  </StrictMode>
);
```

- [ ] **Step 6: Servir o bundle em `server/index.ts`**

Logo depois do bloco `/* ---------- Painel React (client/dist) ---------- */` (antes de `app.use('/', pagesRouter);`), adicionar:

```ts
/* ---------- Formulários públicos em React (client/dist-formularios) ---------- */
// Segundo bundle, independente do painel (F6 incremento B). As duas
// páginas (visita.html, avaliacao.html) são servidas por routes/pages.js
// a partir da Tarefa 6 deste plano — aqui só o middleware de estáticos.
const DIST_FORMULARIOS = path.join(RAIZ, 'client', 'dist-formularios');
if (fs.existsSync(DIST_FORMULARIOS)) {
  app.use('/assets-formularios', express.static(path.join(DIST_FORMULARIOS, 'assets'), { maxAge: '1y', immutable: true }));
}
```

Isso só monta os estáticos com hash (JS/CSS) — as próprias páginas HTML ainda não são servidas por aqui (isso é `routes/pages.js`, mudado só na Tarefa 6). Como o bundle multi-page do Vite escreve os HTMLs na raiz de `dist-formularios/` e os assets com hash dentro de `dist-formularios/assets/`, o `express.static` aponta direto pra essa subpasta.

- [ ] **Step 7: Scripts em `package.json`**

No bloco `"scripts"`, adicionar `dev:client:formularios` e atualizar `build` pra rodar os dois builds:

```json
"dev:client:formularios": "vite --config client/vite.formularios.config.ts",
"build": "vite build --config client/vite.config.ts && vite build --config client/vite.formularios.config.ts",
```

(A entrada `"build": "vite build --config client/vite.config.ts"` existente vira a primeira metade do `&&` acima — confirme que o `--config` já era assim antes de editar; se o script atual for só `"vite build"` sem `--config`, ajuste mantendo o comportamento atual do painel e só acrescentando o segundo build.)

- [ ] **Step 8: `.gitignore`**

Ao lado da linha `client/dist/`, adicionar:

```
client/dist-formularios/
```

- [ ] **Step 9: Verificar build e dev**

```bash
npm run build
```

Esperado: sem erro, e depois `ls client/dist-formularios/` mostra `visita.html`, `avaliacao.html` e uma pasta `assets/` com arquivos JS com hash.

```bash
npm run dev:client:formularios
```

Esperado: servidor Vite sobe em `http://localhost:5174`. Acesse `http://localhost:5174/visita.html` e `http://localhost:5174/avaliacao.html` — cada um deve mostrar o texto placeholder correspondente, com a fonte Inter e o CSS de `/css/styles.css` carregados (confirma que o proxy do Express em `:3000` está servindo `/css/styles.css`, `/images/*`; se `npm run dev` não estiver rodando, suba-o também pra esse teste). Pare o servidor de dev (`Ctrl+C`) ao final.

Suba `npm run dev` (servidor Express) e confirme que ele ainda inicia normalmente com o bloco novo do Step 6 (antes do build, `fs.existsSync` é falso e o bloco não monta nada — sem erro). Depois rode `npm run build` de novo e suba `npm start` — confirme no log do servidor que ele sobe sem erro (o bloco novo agora monta `/assets-formularios`, mas nada ainda aponta pra lá em produção, então isso é só uma checagem de que não quebra o boot).

- [ ] **Step 10: `npm run typecheck`**

```bash
npm run typecheck
```

Esperado: sem erros.

- [ ] **Step 11: Commit**

```bash
git add client/vite.formularios.config.ts client/formularios/visita.html client/formularios/visita/main.tsx client/formularios/avaliacao.html client/formularios/avaliacao/main.tsx server/index.ts package.json .gitignore
git commit -m "$(cat <<'EOF'
feat: infraestrutura do bundle público dos formulários (F6 incremento B)

Segundo build Vite, dentro de client/, sem react-router-dom: dois
mini-apps independentes (visita.html, avaliacao.html), servidos pelo
Express em /assets-formularios (assets com hash). routes/pages.js
ainda não muda — /form-visitas e /form-avaliacao-substitutiva
continuam nas .ejs antigas até a retirada final deste plano.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `useAssistente` + validadores compartilhados

**Files:**
- Create: `client/src/compartilhado/useAssistente.ts`
- Create: `client/formularios/comum/validadores.ts`
- Modify: `client/vite.config.ts` (adicionar o mesmo alias `@compartilhado`, pro painel também poder importar)

**Interfaces:**
- Consumes: nada de novo.
- Produces: `useAssistente(totalPassos: number)` retornando `{passo, totalPassos, podeVoltar, podeAvancar, voltar(), avancar(), irPara(n)}`, exportado de `@compartilhado/useAssistente`. `isFullName(valor: string): boolean`, `isValidPhone(valor: string): boolean`, `maskPhoneBR(digitos: string): string`, `maskPhoneIntl(digitos: string): string`, `toTitleCase(str: string): string`, `capFirst(str: string): string`, `toWordTitleCase(str: string): string`, `toCityState(str: string): string`, todos exportados de `client/formularios/comum/validadores.ts` — usados pelas Tarefas 4 e 5.

- [ ] **Step 1: Criar `client/src/compartilhado/useAssistente.ts`**

```ts
import { useState, useCallback } from 'react';

/**
 * Hook de navegação por passos, deliberadamente sem noção de validação de
 * negócio — cada wizard decide quando chamar avancar(), depois de validar
 * o passo atual por conta própria. Reaproveitado pelos dois formulários
 * públicos (visita, avaliação substitutiva) e pensado para também servir
 * o futuro assistente de emissão de histórico (F5,
 * docs/04-telas-e-navegacao.md §3.4), cujo domínio não tem nada em comum
 * com "aluno"/"prova" — por isso o hook não sabe nada sobre isso.
 */
export function useAssistente(totalPassos: number) {
  const [passo, setPasso] = useState(1);

  const podeVoltar = passo > 1;
  const podeAvancar = passo < totalPassos;

  const voltar = useCallback(() => {
    setPasso(p => Math.max(1, p - 1));
  }, []);

  const avancar = useCallback(() => {
    setPasso(p => Math.min(totalPassos, p + 1));
  }, [totalPassos]);

  const irPara = useCallback((novoPasso: number) => {
    setPasso(Math.min(totalPassos, Math.max(1, novoPasso)));
  }, [totalPassos]);

  return { passo, totalPassos, podeVoltar, podeAvancar, voltar, avancar, irPara };
}
```

- [ ] **Step 2: Criar `client/formularios/comum/validadores.ts`**

Porta literal de `public/js/wizard.js` (funções `isFullName`, `isValidPhone`, `maskPhoneBR`, `maskPhoneIntl`, `toTitleCase`, `capFirst`, `toWordTitleCase`, `toCityState`) — mesma lógica, mesmos regexes, só tipado:

```ts
// Portado de public/js/wizard.js (validadores e formatação usados pelos
// dois wizards públicos). Mesma lógica, mesmos regexes — só tipado.

// Exige nome + sobrenome (ao menos 2 palavras com 2+ letras cada, sem números/símbolos).
export function isFullName(value: string): boolean {
  if (!value) return false;
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  const nameRegex = /^[A-Za-zÀ-ÖØ-öø-ÿ'’-]+$/;
  return words.every(w => w.length >= 2 && nameRegex.test(w));
}

// Aceita telefone nacional (DDD + 8 ou 9 dígitos) ou internacional (+ até 15 dígitos).
export function isValidPhone(value: string): boolean {
  if (!value) return false;
  const digits = value.replace(/\D/g, '');
  if (value.trim().startsWith('+')) {
    return digits.length >= 8 && digits.length <= 15;
  }
  return digits.length === 10 || digits.length === 11;
}

export function maskPhoneBR(digitsInput: string): string {
  const digits = digitsInput.slice(0, 11);
  if (!digits.length) return '';
  let out = '(' + digits.slice(0, 2);
  if (digits.length > 2) {
    out += ') ';
    const rest = digits.slice(2);
    if (digits.length > 10) {
      out += rest.slice(0, 5) + (rest.length > 5 ? '-' + rest.slice(5, 9) : '');
    } else {
      out += rest.slice(0, 4) + (rest.length > 4 ? '-' + rest.slice(4, 8) : '');
    }
  }
  return out;
}

export function maskPhoneIntl(digitsInput: string): string {
  const digits = digitsInput.slice(0, 15);
  let out = '+';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && i % 3 === 0) out += ' ';
    out += digits[i];
  }
  return out;
}

// Aplica a máscara nacional ou internacional conforme o valor já digitado
// comece com "+" — usada no onChange dos campos de WhatsApp.
export function maskPhoneAuto(valorAtual: string): string {
  const isIntl = valorAtual.trim().startsWith('+');
  const digits = valorAtual.replace(/\D/g, '');
  return isIntl ? maskPhoneIntl(digits) : maskPhoneBR(digits);
}

const PARTICLES = new Set(['da', 'das', 'de', 'do', 'dos', 'e', 'a', 'o', 'ao', 'i']);

export function toTitleCase(str: string): string {
  if (!str) return '';
  return str.trim().toLowerCase().split(/\s+/).map((w, i) =>
    w && (i === 0 || !PARTICLES.has(w)) ? w[0].toUpperCase() + w.slice(1) : w
  ).join(' ');
}

export function capFirst(str: string): string {
  if (!str) return '';
  const s = str.trim();
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// Title Case "cru" (sem exceção de partículas) — usado pra nome de cidade.
export function toWordTitleCase(str: string): string {
  if (!str) return '';
  return str.trim().toLowerCase().split(/\s+/).map(w =>
    w ? w[0].toUpperCase() + w.slice(1) : w
  ).join(' ');
}

// "Cidade/Estado": aceita "-" ou "/" como separador, remove espaços ao
// redor dele e deixa a sigla do estado em maiúsculo.
export function toCityState(str: string): string {
  if (!str) return '';
  const parts = str.trim().split(/\s*[\/-]\s*/);
  const cidade = toWordTitleCase(parts[0]);
  const estado = parts[1] ? parts[1].trim().toUpperCase() : '';
  return estado ? cidade + '/' + estado : cidade;
}
```

- [ ] **Step 3: Adicionar o alias `@compartilhado` também em `client/vite.config.ts`**

No bloco `resolve.alias` (já existem `@` e `@shared`), adicionar:

```ts
'@compartilhado': path.resolve(__dirname, 'src', 'compartilhado')
```

- [ ] **Step 4: Verificação manual dos validadores (sem framework de testes)**

Rode (a partir da raiz do projeto):

```bash
npx tsx -e "
import { isFullName, isValidPhone, maskPhoneBR, maskPhoneIntl, toCityState, toTitleCase } from './client/formularios/comum/validadores';
console.log('isFullName joão silva:', isFullName('joão silva'));
console.log('isFullName joão:', isFullName('joão'));
console.log('isValidPhone (11) 91234-5678:', isValidPhone('(11) 91234-5678'));
console.log('isValidPhone 123:', isValidPhone('123'));
console.log('maskPhoneBR 11912345678:', maskPhoneBR('11912345678'));
console.log('maskPhoneIntl 12345678900:', maskPhoneIntl('12345678900'));
console.log('toCityState mogi das cruzes - sp:', toCityState('mogi das cruzes - sp'));
console.log('toTitleCase joão da silva:', toTitleCase('joão da silva'));
"
```

Esperado (na ordem):
```
isFullName joão silva: true
isFullName joão: false
isValidPhone (11) 91234-5678: true
isValidPhone 123: false
maskPhoneBR 11912345678: (11) 91234-5678
maskPhoneIntl 12345678900: +123 456 789 00
toCityState mogi das cruzes - sp: Mogi Das Cruzes/SP
toTitleCase joão da silva: João da Silva
```

- [ ] **Step 5: `npm run typecheck`**

```bash
npm run typecheck
```

Esperado: sem erros.

- [ ] **Step 6: Commit**

```bash
git add client/src/compartilhado/useAssistente.ts client/formularios/comum/validadores.ts client/vite.config.ts
git commit -m "$(cat <<'EOF'
feat: hook useAssistente e validadores compartilhados dos formulários

useAssistente (client/src/compartilhado) é deliberadamente burro —
só guarda o passo atual e os limites estruturais — pra também servir
o futuro assistente de histórico (F5) sem acoplar nada de domínio.
validadores.ts porta isFullName/isValidPhone/máscaras/title-case de
public/js/wizard.js, mesma lógica, agora tipada.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Extrair `avaliacaoRevisao.ts` e fazer o retrofit de `RevisaoResposta.tsx`

**Files:**
- Create: `client/src/compartilhado/avaliacaoRevisao.ts`
- Modify: `client/src/app/formularios/RevisaoResposta.tsx:312-388` (função `RevisaoAvaliacao`, entregue no Incremento A)

**Interfaces:**
- Consumes: nada de novo.
- Produces: `agruparPorData<T extends {data?: string}>(provas: T[]): {data?: string; provas: T[]}[]` e `anexosUnicosDoGrupo<T>(provas: T[], extrairAnexo: (prova: T) => {nome?: string; tipo?: string} | null | undefined): {nome?: string; tipo?: string; provaOrigem: T}[]`, ambas exportadas de `@compartilhado/avaliacaoRevisao` — usadas por `RevisaoResposta.tsx` (painel, já existente) e pela Tarefa 4 (revisão do wizard público de avaliação).

Essas duas funções resolvem o risco descrito na spec (§3.5/§6): o painel usa o anexo já salvo (`{path, nome, tipo}`), o wizard público vai usar o anexo local ainda não enviado (`{nome, tipo, url}` — ver Tarefa 4). Por isso `anexosUnicosDoGrupo` recebe um extrator (`extrairAnexo`) em vez de assumir o formato do campo `anexo`, e devolve `provaOrigem` (a prova original) pra quem chamou poder pegar o que mais precisar dali (o painel precisa do `id` da prova pro botão "Ver anexo"; o wizard público vai precisar da própria `url` do objeto local).

- [ ] **Step 1: Criar `client/src/compartilhado/avaliacaoRevisao.ts`**

```ts
/**
 * Agrupamento e dedup de anexos usados na revisão de avaliação
 * substitutiva — extraído de client/src/app/formularios/RevisaoResposta.tsx
 * (Incremento A) pra ser reaproveitado também pelo wizard público de
 * avaliação substitutiva (Incremento B), que revisa dados ainda não
 * enviados (anexo = arquivo local), não o formato já salvo no banco.
 */

export interface GrupoPorData<T> {
  data?: string;
  provas: T[];
}

// Agrupa um array de "provas" (ou qualquer coisa com campo `data`) pela
// data — mesma chave de fallback do código original (`_sem-data-N`) pra
// provas sem data preenchida, preservando a ordem de primeira aparição.
export function agruparPorData<T extends { data?: string }>(provas: T[]): GrupoPorData<T>[] {
  const grupos: GrupoPorData<T>[] = [];
  const porData = new Map<string, GrupoPorData<T>>();
  provas.forEach(prova => {
    const chave = prova.data || `_sem-data-${grupos.length}`;
    let grupo = porData.get(chave);
    if (!grupo) {
      grupo = { data: prova.data, provas: [] };
      porData.set(chave, grupo);
      grupos.push(grupo);
    }
    grupo.provas.push(prova);
  });
  return grupos;
}

export interface AnexoUnico<T> {
  nome?: string;
  tipo?: string;
  provaOrigem: T;
}

// Deduplica anexos dentro de um grupo (provas do mesmo dia normalmente
// compartilham o mesmo documento) por nome+tipo. `extrairAnexo` isola o
// formato do anexo, que difere entre o painel (já salvo) e o wizard
// público (arquivo local, antes do envio).
export function anexosUnicosDoGrupo<T>(
  provas: T[],
  extrairAnexo: (prova: T) => { nome?: string; tipo?: string } | null | undefined
): AnexoUnico<T>[] {
  const vistos = new Set<string>();
  const resultado: AnexoUnico<T>[] = [];
  provas.forEach(prova => {
    const anexo = extrairAnexo(prova);
    if (!anexo?.nome) return;
    const chave = `${anexo.nome}|${anexo.tipo}`;
    if (vistos.has(chave)) return;
    vistos.add(chave);
    resultado.push({ nome: anexo.nome, tipo: anexo.tipo, provaOrigem: prova });
  });
  return resultado;
}
```

- [ ] **Step 2: Retrofit de `RevisaoAvaliacao` em `client/src/app/formularios/RevisaoResposta.tsx`**

Adicionar o import no topo do arquivo (junto aos outros de `@/componentes/ui`):

```tsx
import { agruparPorData, anexosUnicosDoGrupo } from '@compartilhado/avaliacaoRevisao';
```

Dentro de `RevisaoAvaliacao`, substituir o bloco de agrupamento manual:

```tsx
const provas = aluno.provas || [];
const grupos: { data?: string; provas: ProvaAvaliacao[] }[] = [];
const porData = new Map<string, { data?: string; provas: ProvaAvaliacao[] }>();
provas.forEach(prova => {
  const chave = prova.data || `_sem-data-${grupos.length}`;
  let grupo = porData.get(chave);
  if (!grupo) { grupo = { data: prova.data, provas: [] }; porData.set(chave, grupo); grupos.push(grupo); }
  grupo.provas.push(prova);
});
```

por:

```tsx
const provas = aluno.provas || [];
const grupos = agruparPorData(provas);
```

E substituir o bloco de dedup de anexos:

```tsx
const anexosUnicos: { nome?: string; provaId: string }[] = [];
const vistos = new Set<string>();
grupo.provas.forEach(prova => {
  if (!prova.anexo?.nome) return;
  const chave = `${prova.anexo.nome}|${prova.anexo.tipo}`;
  if (vistos.has(chave)) return;
  vistos.add(chave);
  anexosUnicos.push({ nome: prova.anexo.nome, provaId: prova.id });
});
```

por:

```tsx
const anexosUnicos = anexosUnicosDoGrupo(grupo.provas, p => p.anexo)
  .map(a => ({ nome: a.nome, provaId: a.provaOrigem.id }));
```

Nada mais muda nesse componente — é um refactor puro de extração, o restante do JSX (uso de `anexosUnicos`, `grupos`, `contador`, etc.) continua igual.

- [ ] **Step 3: `npm run typecheck`**

```bash
npm run typecheck
```

Esperado: sem erros — em particular, confirme que `grupos` (agora do tipo `GrupoPorData<ProvaAvaliacao>[]`) continua compatível com todo uso posterior de `grupo.data`/`grupo.provas` no restante da função.

- [ ] **Step 4: Verificação de equivalência (sem framework de testes)**

Como este é um refactor puro (mesma lógica, só relocada), a verificação é uma comparação de código, não uma execução: releia o `RevisaoAvaliacao` depois da mudança e confirme, item por item, que:
1. `agruparPorData` produz exatamente os mesmos grupos que o `Map` manual produzia (mesma chave de fallback, mesma ordem).
2. `anexosUnicosDoGrupo(grupo.provas, p => p.anexo)` itera as mesmas provas, usa a mesma chave de dedup (`nome+tipo`) e o `.map` final reconstrói o mesmo formato `{nome, provaId}` que o código original produzia.

Se o projeto estiver rodando (`npm run dev` + `npm run dev:client`), e você tiver como logar como `admin`/`secretaria`/`coordenacao`, abra `/app/formularios/respostas?form=avaliacao-substitutiva` e confira uma resposta com múltiplas provas/anexos — deve renderizar exatamente igual a antes desta tarefa. Se não houver credenciais disponíveis (mesma limitação já registrada no Incremento A), a comparação de código do item acima é a verificação válida para esta tarefa.

- [ ] **Step 5: Commit**

```bash
git add client/src/compartilhado/avaliacaoRevisao.ts client/src/app/formularios/RevisaoResposta.tsx
git commit -m "$(cat <<'EOF'
refactor: extrair agrupamento de provas por data pra compartilhado/

agruparPorData e anexosUnicosDoGrupo saem de RevisaoResposta.tsx
(Incremento A) para client/src/compartilhado/avaliacaoRevisao.ts,
genéricas sobre o formato do anexo (extrator injetado) — o painel usa
o anexo já salvo, o futuro wizard público (próxima tarefa) vai usar o
arquivo local ainda não enviado. Refactor puro, sem mudança de
comportamento no painel.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Wizard de Avaliação Substitutiva completo (+ casco visual compartilhado)

**Files:**
- Create: `client/formularios/comum/StepperPublico.tsx`
- Create: `client/formularios/comum/NavegacaoWizard.tsx`
- Create: `client/formularios/comum/TelaSucesso.tsx`
- Create: `client/formularios/comum/PoliticaModal.tsx`
- Create: `client/formularios/avaliacao/tipos.ts`
- Create: `client/formularios/avaliacao/arquivo.ts`
- Create: `client/formularios/avaliacao/PoliticaAvaliacao.tsx`
- Create: `client/formularios/avaliacao/PassoAlunosEProvas.tsx`
- Create: `client/formularios/avaliacao/RevisaoAvaliacaoPublica.tsx`
- Create: `client/formularios/avaliacao/AssistenteAvaliacao.tsx`
- Modify: `client/formularios/avaliacao/main.tsx` (troca o placeholder da Tarefa 1 pelo app de verdade)

**Interfaces:**
- Consumes: `useAssistente` de `@compartilhado/useAssistente` (Tarefa 2); `isFullName`, `toTitleCase`, `capFirst` de `../comum/validadores` (Tarefa 2); `agruparPorData`, `anexosUnicosDoGrupo` de `@compartilhado/avaliacaoRevisao` (Tarefa 3). Endpoint do servidor (inalterado): `POST /api/avaliacoes` com corpo `{alunos: [{nome, turma, provas: [{disciplina, segmento, data, motivo: {tipo, observacoes}, anexo: {nome, tipo, base64} | null}]}]}`, retorna `201` ou `{error}`.
- Produces: `StepperPublico({passos: {icone: string; nome: string}[]; passoAtual: number; mostrarLabelPasso?: boolean})`, `NavegacaoWizard({podeVoltar, aoVoltar, rotuloProximo, carregando, aoProximo}: {...})`, `TelaSucesso({titulo, descricao}: {titulo: string; descricao: string})`, `PoliticaModal({aberto, aoFechar, titulo, children}: {...})` — todos exportados de `client/formularios/comum/`, reaproveitados pela Tarefa 5.

- [ ] **Step 1: `client/formularios/comum/StepperPublico.tsx`**

Porta o HTML do `<div class="stepper">`/`updateProgress()` de `wizard.js`/`wizard-avaliacao.js`. `mostrarLabelPasso` cobre a diferença visual real entre os dois wizards de hoje: a `.ejs` de avaliação tem um `<div class="wizard-step-label">Passo X/Y</div>` extra que a de visita não tem.

```tsx
export interface PassoStepper { icone: string; nome: string }

export function StepperPublico({ passos, passoAtual, mostrarLabelPasso }: {
  passos: PassoStepper[];
  passoAtual: number;
  mostrarLabelPasso?: boolean;
}) {
  const totalPassos = passos.length;
  return (
    <>
      <div className="stepper" id="stepper" role="list" aria-label="Progresso do formulário">
        {passos.map((p, i) => {
          const n = i + 1;
          return (
            <div key={p.nome} style={{ display: 'contents' }}>
              <div className={`step-node${n < passoAtual ? ' completed' : ''}${n === passoAtual ? ' active' : ''}`} data-step={n} role="listitem">
                <div className="step-circle"><i className={`fa-solid ${p.icone}`}></i></div>
                <span className="step-name">{p.nome}</span>
              </div>
              {n < totalPassos && (
                <div className={`step-connector${passoAtual > n ? ' filled' : ''}`} data-connector={n}>
                  <span className="step-connector-fill"></span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {mostrarLabelPasso && <div className="wizard-step-label">Passo {Math.min(passoAtual, totalPassos)}/{totalPassos}</div>}
    </>
  );
}
```

- [ ] **Step 2: `client/formularios/comum/NavegacaoWizard.tsx`**

Porta o `<div class="wizard-nav">` + o botão "Próximo"/"Enviar" com spinner de `nextBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...'`.

```tsx
export function NavegacaoWizard({ podeVoltar, aoVoltar, rotuloProximo, carregando, aoProximo }: {
  podeVoltar: boolean;
  aoVoltar: () => void;
  rotuloProximo: string;
  carregando: boolean;
  aoProximo: () => void;
}) {
  return (
    <div className="wizard-nav" id="wizard-nav">
      <button type="button" className="btn btn-secondary" id="back-btn" style={{ visibility: podeVoltar ? 'visible' : 'hidden' }} onClick={aoVoltar} disabled={carregando}>
        Voltar
      </button>
      <button type="button" className="btn btn-primary" id="next-btn" onClick={aoProximo} disabled={carregando}>
        {carregando ? <><i className="fa-solid fa-spinner fa-spin"></i> Enviando...</> : rotuloProximo}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: `client/formularios/comum/TelaSucesso.tsx`**

Porta o `<section data-step="success">`. O link "Voltar ao início" recarrega a própria página (`window.location.pathname`), nunca navega pra outro lugar — mesmo comportamento de hoje.

```tsx
export function TelaSucesso({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div className="success-box">
      <div className="success-icon">✓</div>
      <h2 className="wizard-title">{titulo}</h2>
      <p className="wizard-desc">{descricao}</p>
      <a href={window.location.pathname} className="btn btn-primary">Voltar ao início</a>
    </div>
  );
}
```

- [ ] **Step 4: `client/formularios/comum/PoliticaModal.tsx`**

Porta o `#policy-modal` + `public/js/policy-modal.js` (abrir, fechar por X/botão/backdrop/ESC). O texto legal em si (diferente por formulário) vem via `children` — ver Step 5.

```tsx
import { useEffect, type ReactNode } from 'react';

export function PoliticaModal({ aberto, aoFechar, titulo, children }: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar(); };
    document.addEventListener('keydown', aoTeclar);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = '';
    };
  }, [aberto, aoFechar]);

  return (
    <div id="policy-modal" className={`modal${aberto ? '' : ' hidden'}`}>
      <div className="modal-backdrop" onClick={aoFechar}></div>
      <div className="modal-content">
        <div className="modal-header">
          <h2>{titulo}</h2>
          <button type="button" className="modal-close" aria-label="Fechar" onClick={aoFechar}>
            <i className="fa-solid fa-times"></i>
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={aoFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: `client/formularios/avaliacao/PoliticaAvaliacao.tsx`**

Este componente é o texto legal específico do formulário de avaliação substitutiva, envolto no `PoliticaModal` do Step 4. Copie o conteúdo de `views/form-avaliacao.ejs`, linhas 116-201 (de `<p style="font-size: 13px;...` até o fechamento de `</section>` da seção 9 — as 9 `<section class="policy-section">`), convertendo mecanicamente HTML→JSX: `class` → `className`, atributos de estilo inline (`style="..."`) → objetos JS (`style={{fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px'}}`), e fechando tags void se houver. Nenhum texto muda — é transcrição, não reescrita.

```tsx
import { PoliticaModal } from '../comum/PoliticaModal';

export function PoliticaAvaliacao({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  return (
    <PoliticaModal aberto={aberto} aoFechar={aoFechar} titulo="Política de Privacidade e Tratamento de Dados">
      {/* Conteúdo copiado de views/form-avaliacao.ejs:116-201 (9 seções
          policy-section) — ver instrução acima. */}
    </PoliticaModal>
  );
}
```

- [ ] **Step 6: `client/formularios/avaliacao/tipos.ts`**

```ts
export interface ProvaForm {
  id: string;
  disciplina: string;
  data: string;
  segmento: 'lingua_materna' | 'lingua_inglesa' | null;
  motivo: 'medico' | 'outro' | null;
  observacoes: string;
}

export interface AlunoForm {
  id: string;
  nome: string;
  turma: string;
  provas: ProvaForm[];
}

// Um arquivo por DATA distinta entre as provas do aluno (não um por
// prova) — ver renderAnexoGroups() no wizard.js original.
export interface AnexoPorData {
  data: string;
  arquivoOriginal: File | null;
  arquivoPreparado: File | null; // depois da compressão (Step 7); igual ao original se não for imagem grande
}
```

- [ ] **Step 7: `client/formularios/avaliacao/arquivo.ts`**

Porta `fileToBase64` e `compressImageFile` de `public/js/wizard-avaliacao.js` (linhas 78-125 e 594-606) — específico deste wizard, não compartilhado, já que só ele lida com upload de arquivo.

```ts
const ANEXO_COMPRESSAO_LIMIAR_BYTES = 1.2 * 1024 * 1024;
const ANEXO_COMPRESSAO_MAX_DIMENSAO = 1600;
const ANEXO_COMPRESSAO_QUALIDADE = 0.75;

function withJpegExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  return base + '.jpg';
}

// Comprime anexos-foto grandes (atestado fotografado pelo celular costuma
// vir em 3-8MB) antes de converter pra base64. PDF e HEIC seguem sem
// recompressão (canvas não decodifica HEIC de forma confiável, e
// recomprimir PDF client-side não é viável).
export function compressImageFile(file: File): Promise<File> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/') || file.type === 'image/heic') {
      resolve(file);
      return;
    }
    if (file.size <= ANEXO_COMPRESSAO_LIMIAR_BYTES) {
      resolve(file);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const maiorLado = Math.max(width, height);
      if (maiorLado > ANEXO_COMPRESSAO_MAX_DIMENSAO) {
        const escala = ANEXO_COMPRESSAO_MAX_DIMENSAO / maiorLado;
        width = Math.round(width * escala);
        height = Math.round(height * escala);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob || blob.size >= file.size) {
          resolve(file);
          return;
        }
        resolve(new File([blob], withJpegExtension(file.name), { type: 'image/jpeg' }));
      }, 'image/jpeg', ANEXO_COMPRESSAO_QUALIDADE);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const ANEXO_TAMANHO_MAX_BYTES = 8 * 1024 * 1024;
export const ANEXO_TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

export function validarAnexoArquivo(file: File | null, obrigatorio: boolean): string | null {
  if (!file) return obrigatorio ? 'Anexe o documento antes de continuar.' : null;
  if (!ANEXO_TIPOS_ACEITOS.includes(file.type)) return 'Tipo de arquivo não suportado. Envie uma imagem (JPG/PNG) ou PDF.';
  if (file.size > ANEXO_TAMANHO_MAX_BYTES) return 'Arquivo muito grande (máximo de 8MB).';
  return null;
}
```

- [ ] **Step 8: `client/formularios/avaliacao/RevisaoAvaliacaoPublica.tsx`**

Porta `buildAvaliacaoReviewCards` de `public/js/review-renderer.js` (linhas 228-312), usando `agruparPorData`/`anexosUnicosDoGrupo` (Tarefa 3) em vez da lógica de agrupamento inline do original. O anexo aqui é local (arquivo ainda não enviado): `{nome, tipo, url}` com `url = URL.createObjectURL(...)`.

```tsx
import { agruparPorData, anexosUnicosDoGrupo } from '@compartilhado/avaliacaoRevisao';
import type { AlunoForm, ProvaForm } from './tipos';
import type { AnexoPorData } from './tipos';

const SEGMENTO_LABELS: Record<string, string> = { lingua_materna: 'Língua materna', lingua_inglesa: 'Língua inglesa' };
const MOTIVO_LABELS: Record<string, string> = { medico: 'Atestado médico', outro: 'Outro motivo (pagamento de taxa)' };

function fmtDataOnly(value: string): string {
  if (!value) return '-';
  const [y, m, d] = value.split('-');
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

function AnexoPreview({ arquivo }: { arquivo: File | null }) {
  if (!arquivo) return <span className="review-item-value muted">Nenhum documento anexado.</span>;
  const url = URL.createObjectURL(arquivo);
  return (
    <>
      <div className="review-item-full">
        <span className="review-item-label">Arquivo enviado</span>
        <span className="review-item-value">{arquivo.name}</span>
      </div>
      {arquivo.type.startsWith('image/')
        ? <img src={url} alt="Documento anexado" style={{ display: 'block', maxWidth: '100%', maxHeight: 320, borderRadius: 8, margin: '10px auto 0' }} />
        : arquivo.type === 'application/pdf'
          ? <iframe src={url} title="Documento anexado (PDF)" style={{ width: '100%', height: 340, border: '1px solid var(--border-color, #e4e8ee)', borderRadius: 8, marginTop: 10 }} />
          : null}
    </>
  );
}

export function RevisaoAvaliacaoPublica({ alunos, anexosPorAlunoEData }: {
  alunos: AlunoForm[];
  anexosPorAlunoEData: Map<string, AnexoPorData[]>; // chave: aluno.id
}) {
  return (
    <>
      {alunos.map((aluno, alunoIdx) => {
        const grupos = agruparPorData(aluno.provas);
        const anexosDoAluno = anexosPorAlunoEData.get(aluno.id) || [];
        let contador = 0;

        return (
          <div key={aluno.id} className="review-card">
            <div className="review-card-header">
              <div className="review-card-icon"><i className="fa-solid fa-user-graduate"></i></div>
              <h3>Aluno {alunoIdx + 1}{aluno.nome ? ` — ${aluno.nome}` : ''}</h3>
              <button type="button" className="review-edit-btn" data-goto="1"><i className="fa-solid fa-pen"></i> Editar</button>
            </div>
            <div className="review-card-body">
              <div className="review-grid">
                <div className="review-item review-item-full"><span className="review-item-label">Nome completo</span><span className="review-item-value">{aluno.nome || '-'}</span></div>
                <div className="review-item"><span className="review-item-label">Turma</span><span className="review-item-value">{aluno.turma || '-'}</span></div>
              </div>

              {grupos.map((grupo, gi) => {
                const anexoDoGrupo = anexosDoAluno.find(a => a.data === grupo.data);
                const anexosUnicos = anexosUnicosDoGrupo<ProvaForm>(grupo.provas, () =>
                  anexoDoGrupo?.arquivoPreparado ? { nome: anexoDoGrupo.arquivoPreparado.name, tipo: anexoDoGrupo.arquivoPreparado.type } : null
                );
                const disciplinasGrupo = grupo.provas.map(p => p.disciplina).filter(Boolean).join(', ');
                const sufixo = (grupo.data ? ` — ${fmtDataOnly(grupo.data)}` : '') + (disciplinasGrupo ? ` (${disciplinasGrupo})` : '');

                return (
                  <div key={gi}>
                    {grupo.provas.map(prova => {
                      contador += 1;
                      return (
                        <div key={prova.id} className="review-student">
                          <div className="review-student-header"><i className="fa-solid fa-file-pen"></i> Avaliação {contador}</div>
                          <div className="review-grid">
                            <div className="review-item review-item-full"><span className="review-item-label">Disciplina</span><span className="review-item-value">{prova.disciplina || '-'}</span></div>
                            <div className="review-item"><span className="review-item-label">Segmento</span><span className="review-item-value">{prova.segmento ? SEGMENTO_LABELS[prova.segmento] : '-'}</span></div>
                            <div className="review-item"><span className="review-item-label">Data da avaliação perdida</span><span className="review-item-value">{prova.data ? fmtDataOnly(prova.data) : '-'}</span></div>
                            <div className="review-item"><span className="review-item-label">Motivo</span><span className="review-item-value">{prova.motivo ? MOTIVO_LABELS[prova.motivo] : '-'}</span></div>
                            <div className="review-item review-item-full"><span className="review-item-label">Observações</span><span className="review-item-value">{prova.observacoes || '-'}</span></div>
                          </div>
                        </div>
                      );
                    })}
                    <div className="review-item-full" style={{ marginTop: 8 }}>
                      <span className="review-item-label">Documento anexado{sufixo}</span>
                      {anexosUnicos.length
                        ? <AnexoPreview arquivo={anexoDoGrupo?.arquivoPreparado ?? null} />
                        : <AnexoPreview arquivo={null} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}
```

- [ ] **Step 9: `client/formularios/avaliacao/PassoAlunosEProvas.tsx`**

Este é o passo mais complexo — porta `wizard-avaliacao.js` inteiro (alunos dinâmicos, provas dinâmicas por aluno com limite de 3, pills de segmento/motivo, box do PIX, upload de anexo por grupo de data com preview e compressão). Estado 100% controlado, levantado pro `AssistenteAvaliacao` (Step 10).

```tsx
import { useRef } from 'react';
import { isFullName, toTitleCase, capFirst } from '../comum/validadores';
import { compressImageFile, validarAnexoArquivo, ANEXO_TIPOS_ACEITOS } from './arquivo';
import type { AlunoForm, ProvaForm, AnexoPorData } from './tipos';

const MAX_PROVAS_POR_ALUNO = 3;
const TURMAS = [
  'Educação Infantil - Maternal', 'Educação Infantil - Jardim I', 'Educação Infantil - Jardim II',
  'Fundamental I - 1º ano', 'Fundamental I - 2º ano', 'Fundamental I - 3º ano', 'Fundamental I - 4º ano', 'Fundamental I - 5º ano',
  'Fundamental II - 6º ano', 'Fundamental II - 7º ano', 'Fundamental II - 8º ano', 'Fundamental II - 9º ano',
  'Ensino Médio - 1ª série', 'Ensino Médio - 2ª série', 'Ensino Médio - 3ª série'
];

export interface ErrosPassoAlunos {
  // chave: `${alunoId}:nome` | `${alunoId}:turma` | `${provaId}:disciplina` |
  // `${provaId}:data` | `${provaId}:segmento` | `${provaId}:motivo` |
  // `${alunoId}:anexo:${data}`
  chaves: Set<string>;
}

function novoId(): string {
  return crypto.randomUUID();
}

function gruposPorData(provas: ProvaForm[]): string[] {
  const datas = new Set<string>();
  provas.forEach(p => { if (p.data) datas.add(p.data); });
  return [...datas].sort();
}

export function novoAluno(): AlunoForm {
  return { id: novoId(), nome: '', turma: '', provas: [{ id: novoId(), disciplina: '', data: '', segmento: null, motivo: null, observacoes: '' }] };
}

export function validarPassoAlunos(alunos: AlunoForm[], anexos: Map<string, AnexoPorData[]>): Set<string> {
  const chaves = new Set<string>();
  alunos.forEach(aluno => {
    if (!isFullName(aluno.nome)) chaves.add(`${aluno.id}:nome`);
    if (!aluno.turma) chaves.add(`${aluno.id}:turma`);
    aluno.provas.forEach(prova => {
      if (!prova.disciplina.trim()) chaves.add(`${prova.id}:disciplina`);
      if (!prova.data) chaves.add(`${prova.id}:data`);
      if (!prova.segmento) chaves.add(`${prova.id}:segmento`);
      if (!prova.motivo) chaves.add(`${prova.id}:motivo`);
    });
    const datas = gruposPorData(aluno.provas);
    const anexosDoAluno = anexos.get(aluno.id) || [];
    datas.forEach((data, i) => {
      const obrigatorio = i === 0;
      const anexo = anexosDoAluno.find(a => a.data === data);
      const erro = validarAnexoArquivo(anexo?.arquivoOriginal ?? null, obrigatorio);
      if (erro) chaves.add(`${aluno.id}:anexo:${data}`);
    });
  });
  return chaves;
}

export function PassoAlunosEProvas({ alunos, setAlunos, anexos, setAnexos, erros }: {
  alunos: AlunoForm[];
  setAlunos: (fn: (atual: AlunoForm[]) => AlunoForm[]) => void;
  anexos: Map<string, AnexoPorData[]>;
  setAnexos: (fn: (atual: Map<string, AnexoPorData[]>) => Map<string, AnexoPorData[]>) => void;
  erros: Set<string>;
}) {
  const pixCopiadoRef = useRef<{ [key: string]: boolean }>({});

  function atualizarAluno(id: string, mudar: (a: AlunoForm) => AlunoForm) {
    setAlunos(atual => atual.map(a => a.id === id ? mudar(a) : a));
  }

  function atualizarProva(alunoId: string, provaId: string, mudar: (p: ProvaForm) => ProvaForm) {
    atualizarAluno(alunoId, a => ({ ...a, provas: a.provas.map(p => p.id === provaId ? mudar(p) : p) }));
  }

  function removerAnexosOrfaos(alunoId: string, provasAtuais: ProvaForm[]) {
    const datasValidas = new Set(gruposPorData(provasAtuais));
    setAnexos(atual => {
      const copia = new Map(atual);
      const lista = (copia.get(alunoId) || []).filter(a => datasValidas.has(a.data));
      copia.set(alunoId, lista);
      return copia;
    });
  }

  async function selecionarAnexo(alunoId: string, data: string, file: File | null) {
    if (!file) {
      setAnexos(atual => {
        const copia = new Map(atual);
        copia.set(alunoId, (copia.get(alunoId) || []).filter(a => a.data !== data));
        return copia;
      });
      return;
    }
    setAnexos(atual => {
      const copia = new Map(atual);
      const lista = (copia.get(alunoId) || []).filter(a => a.data !== data);
      lista.push({ data, arquivoOriginal: file, arquivoPreparado: file });
      copia.set(alunoId, lista);
      return copia;
    });
    const preparado = await compressImageFile(file);
    setAnexos(atual => {
      const copia = new Map(atual);
      const lista = (copia.get(alunoId) || []).map(a => a.data === data ? { ...a, arquivoPreparado: preparado } : a);
      copia.set(alunoId, lista);
      return copia;
    });
  }

  return (
    <>
      {alunos.map((aluno, alunoIdx) => {
        const datas = gruposPorData(aluno.provas);
        const anexosDoAluno = anexos.get(aluno.id) || [];
        return (
          <div key={aluno.id} className="student-block aluno-block">
            <div className="student-block-header">
              <span>Aluno {alunoIdx + 1}</span>
              {alunos.length > 1 && (
                <button type="button" className="remove-student-btn remove-aluno-btn" onClick={() => setAlunos(atual => atual.filter(a => a.id !== aluno.id))}>
                  <i className="fa-solid fa-circle-minus"></i> Remover aluno
                </button>
              )}
            </div>

            <div className={`field-group${erros.has(`${aluno.id}:nome`) ? ' invalid' : ''}`}>
              <label>Nome completo do aluno</label>
              <input type="text" value={aluno.nome} placeholder="Nome completo do aluno"
                onChange={e => atualizarAluno(aluno.id, a => ({ ...a, nome: e.target.value }))}
                onBlur={e => atualizarAluno(aluno.id, a => ({ ...a, nome: toTitleCase(e.target.value) }))} />
              <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> Informe o nome completo (nome e sobrenome).</div>
            </div>

            <div className={`field-group${erros.has(`${aluno.id}:turma`) ? ' invalid' : ''}`}>
              <label>Turma</label>
              <select value={aluno.turma} onChange={e => atualizarAluno(aluno.id, a => ({ ...a, turma: e.target.value }))}>
                <option value="">Selecione</option>
                {TURMAS.map(t => <option key={t}>{t}</option>)}
              </select>
              <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> Selecione a turma do aluno.</div>
            </div>

            <div className="provas-container">
              {aluno.provas.map((prova, provaIdx) => (
                <div key={prova.id} className="prova-block">
                  <div className="prova-block-header">
                    <span>Avaliação {provaIdx + 1}</span>
                    {aluno.provas.length > 1 && (
                      <button type="button" className="remove-prova-btn" onClick={() => {
                        const provasNovas = aluno.provas.filter(p => p.id !== prova.id);
                        atualizarAluno(aluno.id, a => ({ ...a, provas: provasNovas }));
                        removerAnexosOrfaos(aluno.id, provasNovas);
                      }}>
                        <i className="fa-solid fa-circle-minus"></i> Remover
                      </button>
                    )}
                  </div>

                  <div className="field-row">
                    <div className={`field-group${erros.has(`${prova.id}:disciplina`) ? ' invalid' : ''}`}>
                      <label>Disciplina</label>
                      <input type="text" value={prova.disciplina} placeholder="Ex: Matemática"
                        onChange={e => atualizarProva(aluno.id, prova.id, p => ({ ...p, disciplina: e.target.value }))}
                        onBlur={e => atualizarProva(aluno.id, prova.id, p => ({ ...p, disciplina: toTitleCase(e.target.value) }))} />
                      <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> Informe a disciplina da avaliação.</div>
                    </div>
                    <div className={`field-group${erros.has(`${prova.id}:data`) ? ' invalid' : ''}`}>
                      <label>Data da avaliação perdida</label>
                      <input type="date" value={prova.data} onChange={e => {
                        const provasNovas = aluno.provas.map(p => p.id === prova.id ? { ...p, data: e.target.value } : p);
                        atualizarAluno(aluno.id, a => ({ ...a, provas: provasNovas }));
                        removerAnexosOrfaos(aluno.id, provasNovas);
                      }} />
                      <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> Informe a data da avaliação perdida.</div>
                    </div>
                  </div>

                  <div className={`field-group${erros.has(`${prova.id}:segmento`) ? ' invalid' : ''}`}>
                    <span className="field-legend">Segmento</span>
                    <div className="choice-group prova-segmento-choice">
                      {(['lingua_materna', 'lingua_inglesa'] as const).map(v => (
                        <button key={v} type="button" className={`choice-pill${prova.segmento === v ? ' selected' : ''}`}
                          onClick={() => atualizarProva(aluno.id, prova.id, p => ({ ...p, segmento: v }))}>
                          <span className="check">✓</span> {v === 'lingua_materna' ? 'Língua materna' : 'Língua inglesa'}
                        </button>
                      ))}
                    </div>
                    <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> Selecione o segmento desta avaliação.</div>
                  </div>

                  <div className={`field-group${erros.has(`${prova.id}:motivo`) ? ' invalid' : ''}`}>
                    <span className="field-legend">Motivo da ausência</span>
                    <div className="choice-group prova-motivo-choice">
                      {(['medico', 'outro'] as const).map(v => (
                        <button key={v} type="button" className={`choice-pill${prova.motivo === v ? ' selected' : ''}`}
                          onClick={() => atualizarProva(aluno.id, prova.id, p => ({ ...p, motivo: v }))}>
                          <span className="check">✓</span> {v === 'medico' ? 'Atestado médico' : 'Outro motivo'}
                        </button>
                      ))}
                    </div>
                    <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> Selecione o motivo da ausência.</div>
                  </div>

                  {prova.motivo === 'medico' && (
                    <div className="field-group">
                      <div className="hint">
                        <i className="fa-solid fa-circle-info"></i> O atestado médico referente a esta data é enviado uma vez só, na seção "Documentos anexados" no fim do bloco deste aluno — mesmo que haja mais de uma avaliação no mesmo dia.
                      </div>
                    </div>
                  )}

                  {prova.motivo === 'outro' && (
                    <div className="field-group">
                      <div className="pix-box">
                        <h4><i className="fa-solid fa-circle-info"></i> Taxa de aplicação da avaliação substitutiva</h4>
                        <p>Para avaliações perdidas por motivos não médicos, é cobrada uma taxa de <strong>R$ 50,00 por prova</strong>. Esse valor cobre o custo de disponibilizar um professor especificamente para elaborar e aplicar a avaliação substitutiva em um novo horário, fora da grade regular de aulas — um trabalho extra que garante que o aluno não perca o conteúdo avaliado. O pagamento é feito por prova, e a aplicação só é agendada após a confirmação do comprovante.</p>
                        <div className="pix-key-row">
                          <div>
                            <span className="pix-key-label">Chave PIX (aleatória)</span>
                            <span className="pix-key-value pix-key-value-copy">681b6f31-5916-4a70-be2c-a7b3f932e453</span>
                          </div>
                          <button type="button" className="btn btn-secondary btn-sm copy-pix-btn" onClick={(e) => {
                            const btn = e.currentTarget;
                            const original = btn.innerHTML;
                            navigator.clipboard.writeText('681b6f31-5916-4a70-be2c-a7b3f932e453')
                              .then(() => { btn.innerHTML = '<i class="fa-solid fa-check"></i> Copiado!'; })
                              .catch(() => { btn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Copie manualmente'; })
                              .finally(() => { setTimeout(() => { btn.innerHTML = original; }, 2200); });
                          }}>
                            <i className="fa-regular fa-copy"></i> Copiar chave
                          </button>
                        </div>
                      </div>
                      <div className="hint" style={{ marginTop: 14 }}>
                        <i className="fa-solid fa-circle-info"></i> O comprovante de pagamento referente a esta data é enviado uma vez só, na seção "Documentos anexados" no fim do bloco deste aluno — mesmo que haja mais de uma avaliação no mesmo dia.
                      </div>
                    </div>
                  )}

                  <div className="field-group">
                    <label>Observações <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(opcional)</span></label>
                    <textarea value={prova.observacoes} placeholder="Se quiser, deixe alguma observação adicional sobre esta avaliação"
                      onChange={e => atualizarProva(aluno.id, prova.id, p => ({ ...p, observacoes: e.target.value }))}
                      onBlur={e => atualizarProva(aluno.id, prova.id, p => ({ ...p, observacoes: capFirst(e.target.value) }))} />
                  </div>
                </div>
              ))}
            </div>

            {aluno.provas.length < MAX_PROVAS_POR_ALUNO ? (
              <button type="button" className="add-student-btn add-prova-btn"
                onClick={() => atualizarAluno(aluno.id, a => ({ ...a, provas: [...a.provas, { id: novoId(), disciplina: '', data: '', segmento: null, motivo: null, observacoes: '' }] }))}>
                + Adicionar avaliação perdida deste aluno
              </button>
            ) : (
              <div className="hint">
                <i className="fa-solid fa-circle-info"></i> Máximo de 3 avaliações por aluno neste requerimento. Se este aluno perdeu mais de 3 avaliações, envie um requerimento separado para as demais.
              </div>
            )}

            <div className="student-block-header" style={{ marginTop: 20 }}><span>Documentos anexados</span></div>
            <div className="anexo-groups-container">
              {datas.length === 0 ? (
                <div className="hint"><i className="fa-solid fa-circle-info"></i> Preencha a data de cada avaliação acima para liberar o envio do(s) documento(s).</div>
              ) : datas.map((data, i) => {
                const obrigatorio = i === 0;
                const anexo = anexosDoAluno.find(a => a.data === data);
                const disciplinas = aluno.provas.filter(p => p.data === data).map(p => p.disciplina).filter(Boolean).join(', ');
                return (
                  <div key={data} className={`field-group anexo-group${erros.has(`${aluno.id}:anexo:${data}`) ? ' invalid' : ''}`}>
                    <label className="anexo-group-label">Documento {i + 1} — {new Date(data + 'T00:00:00').toLocaleDateString('pt-BR')}{disciplinas ? ` (${disciplinas})` : ''}{obrigatorio ? '' : ' — opcional'}</label>
                    <div className="hint anexo-group-hint" style={{ marginBottom: 10 }}>
                      {obrigatorio
                        ? <><i className="fa-solid fa-circle-info"></i> Anexe o atestado médico ou o comprovante de pagamento referente às avaliações desta data.</>
                        : <><i className="fa-solid fa-circle-info"></i> Opcional — só é necessário se você também tiver um documento específico pra esta data.</>}
                    </div>
                    <input type="file" className="anexo-group-input" accept="image/*,application/pdf"
                      onChange={e => selecionarAnexo(aluno.id, data, e.target.files?.[0] ?? null)} />
                    <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> <span>{obrigatorio ? 'Anexe o documento desta data (imagem ou PDF, até 8MB).' : 'Tipo de arquivo não suportado ou arquivo muito grande (máximo de 8MB).'}</span></div>
                    {anexo?.arquivoOriginal && (
                      <div className="anexo-preview">
                        <div className="anexo-preview-name"><i className="fa-solid fa-paperclip"></i> {anexo.arquivoOriginal.name}</div>
                        {anexo.arquivoOriginal.type.startsWith('image/')
                          ? <img src={URL.createObjectURL(anexo.arquivoOriginal)} alt="Pré-visualização do anexo" />
                          : anexo.arquivoOriginal.type === 'application/pdf'
                            ? <iframe src={URL.createObjectURL(anexo.arquivoOriginal)} title="Pré-visualização do anexo (PDF)" />
                            : <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>Pré-visualização não disponível para este tipo de arquivo.</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <button type="button" className="add-student-btn" onClick={() => setAlunos(atual => [...atual, novoAluno()])}>
        + Adicionar mais um aluno
      </button>
    </>
  );
}
```

- [ ] **Step 10: `client/formularios/avaliacao/AssistenteAvaliacao.tsx`**

Orquestra os 2 passos, usando `useAssistente(2)`. Monta o payload final (com `fileToBase64`) e envia pra `POST /api/avaliacoes` — porta `collectData()` + o `nextBtn` handler de `wizard-avaliacao.js` (linhas 493-686).

```tsx
import { useState } from 'react';
import { useAssistente } from '@compartilhado/useAssistente';
import { StepperPublico } from '../comum/StepperPublico';
import { NavegacaoWizard } from '../comum/NavegacaoWizard';
import { TelaSucesso } from '../comum/TelaSucesso';
import { PoliticaAvaliacao } from './PoliticaAvaliacao';
import { PassoAlunosEProvas, novoAluno, validarPassoAlunos } from './PassoAlunosEProvas';
import { RevisaoAvaliacaoPublica } from './RevisaoAvaliacaoPublica';
import { fileToBase64 } from './arquivo';
import type { AlunoForm, AnexoPorData } from './tipos';

const PASSOS = [
  { icone: 'fa-user-graduate', nome: 'Alunos e Provas' },
  { icone: 'fa-clipboard-check', nome: 'Revisão' }
];

export function AssistenteAvaliacao() {
  const assistente = useAssistente(2);
  const [alunos, setAlunos] = useState<AlunoForm[]>([novoAluno()]);
  const [anexos, setAnexos] = useState<Map<string, AnexoPorData[]>>(new Map());
  const [erros, setErros] = useState<Set<string>>(new Set());
  const [consentimento, setConsentimento] = useState(false);
  const [consentInvalido, setConsentInvalido] = useState(false);
  const [politicaAberta, setPoliticaAberta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  async function aoClicarProximo() {
    if (assistente.passo === 1) {
      const errosPasso = validarPassoAlunos(alunos, anexos);
      setErros(errosPasso);
      if (errosPasso.size > 0) return;
      assistente.avancar();
      return;
    }

    if (!consentimento) {
      setConsentInvalido(true);
      return;
    }

    setEnviando(true);
    setErroEnvio(null);
    try {
      const alunosPayload = [];
      for (const aluno of alunos) {
        const provasPayload = [];
        for (const prova of aluno.provas) {
          const anexoDoDia = (anexos.get(aluno.id) || []).find(a => a.data === prova.data);
          const arquivo = anexoDoDia?.arquivoPreparado ?? null;
          const anexo = arquivo ? { nome: arquivo.name, tipo: arquivo.type, base64: await fileToBase64(arquivo) } : null;
          provasPayload.push({
            disciplina: prova.disciplina,
            segmento: prova.segmento,
            data: prova.data,
            motivo: { tipo: prova.motivo, observacoes: prova.observacoes },
            anexo
          });
        }
        alunosPayload.push({ nome: aluno.nome, turma: aluno.turma, provas: provasPayload });
      }

      const apiRes = await fetch('/api/avaliacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alunos: alunosPayload })
      });
      if (!apiRes.ok) {
        const errData = await apiRes.json();
        throw new Error(errData.error || 'Erro ao enviar requerimento.');
      }
      setEnviado(true);
    } catch (err) {
      setErroEnvio(err instanceof Error ? err.message : 'Não foi possível enviar o requerimento. Verifique sua conexão e tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <main className="page">
        <div className="wizard-card">
          <Cabecalho />
          <TelaSucesso titulo="Requerimento enviado!" descricao="Recebemos seu requerimento de avaliação substitutiva. As coordenações responsáveis foram notificadas e entrarão em contato se necessário." />
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="wizard-card">
        <Cabecalho />
        <StepperPublico passos={PASSOS} passoAtual={assistente.passo} mostrarLabelPasso />

        <form noValidate onSubmit={e => e.preventDefault()}>
          {assistente.passo === 1 && (
            <section className="wizard-step" data-step="1">
              <h2 className="wizard-title">Alunos e avaliações perdidas</h2>
              <p className="wizard-desc">Informe os dados de cada aluno e, para cada um, adicione as avaliações que ele perdeu — com a disciplina, o segmento, a data e o motivo de cada uma. Se mais de um filho precisa de avaliação substitutiva, adicione quantos alunos forem necessários.</p>
              <PassoAlunosEProvas alunos={alunos} setAlunos={setAlunos} anexos={anexos} setAnexos={setAnexos} erros={erros} />
            </section>
          )}

          {assistente.passo === 2 && (
            <section className="wizard-step" data-step="2">
              <h2 className="wizard-title">Revise seu requerimento</h2>
              <p className="wizard-desc">Confira se está tudo certo, incluindo os documentos anexados, antes de enviar.</p>
              <RevisaoAvaliacaoPublica alunos={alunos} anexosPorAlunoEData={anexos} />

              <div className={`field-group consent-group${consentInvalido ? ' invalid' : ''}`}>
                <label className="consent-label">
                  <input type="checkbox" checked={consentimento} onChange={e => { setConsentimento(e.target.checked); if (e.target.checked) setConsentInvalido(false); }} />
                  <span>
                    Li e concordo com a <a href="#" className="policy-link" onClick={e => { e.preventDefault(); setPoliticaAberta(true); }}>Política de Privacidade</a> do
                    Colégio São Marcos, autorizo o uso dos meus dados pessoais exclusivamente para o processamento deste requerimento, e declaro que as informações
                    prestadas e os documentos anexados (atestados médicos e/ou comprovantes de pagamento) são verdadeiros, estando ciente de que a veracidade poderá
                    ser verificada pelas coordenações.
                  </span>
                </label>
                <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> É necessário aceitar os termos para enviar o requerimento.</div>
              </div>

              {erroEnvio && (
                <div className="error-banner">
                  <i className="fa-solid fa-triangle-exclamation"></i>
                  <span>Não foi possível enviar o requerimento: {erroEnvio}</span>
                </div>
              )}
            </section>
          )}

          <NavegacaoWizard
            podeVoltar={assistente.podeVoltar}
            aoVoltar={assistente.voltar}
            rotuloProximo={assistente.passo === 2 ? 'Enviar' : 'Próximo'}
            carregando={enviando}
            aoProximo={aoClicarProximo}
          />
        </form>
      </div>

      <PoliticaAvaliacao aberto={politicaAberta} aoFechar={() => setPoliticaAberta(false)} />
    </main>
  );
}

function Cabecalho() {
  return (
    <div style={{ textAlign: 'center', marginBottom: 20, alignItems: 'center', display: 'flex', justifyContent: 'center' }}>
      <img src="/images/logo.jpg" alt="Logotipo do Colégio São Marcos" className="header-logo" />
    </div>
  );
}
```

- [ ] **Step 11: Atualizar `client/formularios/avaliacao/main.tsx`**

Substituir o placeholder da Tarefa 1 por:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AssistenteAvaliacao } from './AssistenteAvaliacao';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AssistenteAvaliacao />
  </StrictMode>
);
```

- [ ] **Step 12: `npm run typecheck`**

```bash
npm run typecheck
```

Esperado: sem erros. Preste atenção especial a `client/tsconfig.json` incluir `client/formularios/**` (se o tsconfig do cliente usa `include` explícito em vez de pegar tudo sob `client/`, adicione o caminho novo antes de rodar).

- [ ] **Step 13: Verificação manual completa (sem gate de login — pode ser feita ponta a ponta)**

Suba `npm run dev` (servidor) e `npm run dev:client:formularios` (bundle novo). Acesse `http://localhost:5174/avaliacao.html`:

1. Aparência idêntica à de `http://localhost:3000/form-avaliacao-substitutiva` (compare lado a lado): mesmo CSS, ícones FontAwesome, layout do stepper com "Passo 1/2".
2. Passo 1: adicione um segundo aluno, adicione uma segunda avaliação pro primeiro aluno (até o limite de 3 — confirme que o botão some e o aviso aparece no 3º). Preencha disciplina, data, segmento, motivo ("Outro motivo" deve mostrar a caixa do PIX com a chave e o botão "Copiar chave" funcionando).
3. Adicione duas avaliações do mesmo aluno na mesma data — confirme que só aparece **um** campo de documento pra aquela data (não um por avaliação), e que ele é obrigatório só se for a data mais antiga do aluno.
4. Anexe um arquivo de imagem — confirme a pré-visualização aparecer; anexe um PDF — confirme o preview em iframe.
5. Tente avançar sem preencher algo obrigatório — confirme que o campo fica marcado como inválido (borda vermelha via classe `invalid`) e o avanço é bloqueado.
6. Passo 2 (Revisão): confirme que os dados aparecem corretamente, agrupados por data, com o(s) anexo(s) certos.
7. Tente enviar sem marcar o consentimento — bloqueado com mensagem. Marque e envie — confirme que o `POST /api/avaliacoes` (aba Network do navegador) é chamado com o payload esperado (`anexo.base64` presente) e retorna sucesso; a tela troca pra "Requerimento enviado!".
8. Clique "Voltar ao início" — deve recarregar a própria página (`/avaliacao.html`), começando um novo requerimento do zero.
9. Force um erro (pare o servidor Express e tente enviar) — confirme que a mensagem de erro aparece sem travar a tela, e os botões voltam ao normal.
10. Abra "Política de Privacidade" — modal abre com o texto certo (9 seções, específicas de avaliação substitutiva) e fecha por X, botão, clique fora e ESC.

- [ ] **Step 14: Commit**

```bash
git add client/formularios/comum/StepperPublico.tsx client/formularios/comum/NavegacaoWizard.tsx client/formularios/comum/TelaSucesso.tsx client/formularios/comum/PoliticaModal.tsx client/formularios/avaliacao/tipos.ts client/formularios/avaliacao/arquivo.ts client/formularios/avaliacao/PoliticaAvaliacao.tsx client/formularios/avaliacao/PassoAlunosEProvas.tsx client/formularios/avaliacao/RevisaoAvaliacaoPublica.tsx client/formularios/avaliacao/AssistenteAvaliacao.tsx client/formularios/avaliacao/main.tsx
git commit -m "$(cat <<'EOF'
feat: wizard de avaliação substitutiva em React (F6 incremento B)

Porta public/js/wizard-avaliacao.js e a parte de
public/js/review-renderer.js usada na revisão pré-envio, inteiros,
para o novo bundle público (client/formularios/avaliacao/). Cria
também o casco visual compartilhado (StepperPublico, NavegacaoWizard,
TelaSucesso, PoliticaModal) que a próxima tarefa (wizard de visita)
reaproveita. POST /api/avaliacoes não muda.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Wizard de Visita completo

**Files:**
- Create: `client/formularios/visita/tipos.ts`
- Create: `client/formularios/visita/PoliticaVisita.tsx`
- Create: `client/formularios/visita/PassoAluno.tsx`
- Create: `client/formularios/visita/PassoEscola.tsx`
- Create: `client/formularios/visita/PassoResponsaveis.tsx`
- Create: `client/formularios/visita/PassoComplementares.tsx`
- Create: `client/formularios/visita/RevisaoVisitaPublica.tsx`
- Create: `client/formularios/visita/AssistenteVisita.tsx`
- Modify: `client/formularios/visita/main.tsx`

**Interfaces:**
- Consumes: `useAssistente` (Tarefa 2); `isFullName`, `isValidPhone`, `maskPhoneAuto`, `toTitleCase`, `toCityState`, `capFirst` de `../comum/validadores` (Tarefa 2); `StepperPublico`, `NavegacaoWizard`, `TelaSucesso`, `PoliticaModal` de `../comum/` (Tarefa 4). Endpoint do servidor (inalterado): `POST /api/responses` com corpo `{students, escola, responsaveis: {pai, mae}, extras}`, retorna `201` ou `{error}`.
- Produces: nada consumido por tarefa futura desta migração — a Tarefa 6 só troca `routes/pages.js`, não importa nada destes arquivos.

- [ ] **Step 1: `client/formularios/visita/tipos.ts`**

```ts
export interface AlunoVisitaForm {
  id: string;
  nome: string;
  nascimento: string;
  turma: string;
}
```

- [ ] **Step 2: `client/formularios/visita/PoliticaVisita.tsx`**

Mesmo padrão da Tarefa 4/Step 5: copie o conteúdo de `views/form-visitas.ejs`, linhas 233-329 (9 `<section class="policy-section">`, texto específico de visitas), convertendo `class`→`className` e estilos inline pra objeto JS.

```tsx
import { PoliticaModal } from '../comum/PoliticaModal';

export function PoliticaVisita({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  return (
    <PoliticaModal aberto={aberto} aoFechar={aoFechar} titulo="Política de Privacidade e Tratamento de Dados">
      {/* Conteúdo copiado de views/form-visitas.ejs:233-329 (9 seções
          policy-section) — ver instrução acima. */}
    </PoliticaModal>
  );
}
```

- [ ] **Step 3: `client/formularios/visita/PassoAluno.tsx`**

Porta o `#students-container` + `<template id="student-block-template">` de `wizard.js` (linhas 158-194) — alunos dinâmicos.

```tsx
import { isFullName, toTitleCase } from '../comum/validadores';
import type { AlunoVisitaForm } from './tipos';

const TURMAS = [
  'Infantil I', 'Infantil II', 'Infantil III', 'Infantil IV',
  'Fundamental I - 1º ano', 'Fundamental I - 2º ano', 'Fundamental I - 3º ano', 'Fundamental I - 4º ano', 'Fundamental I - 5º ano',
  'Fundamental II - 6º ano', 'Fundamental II - 7º ano', 'Fundamental II - 8º ano', 'Fundamental II - 9º ano',
  'Ensino Médio - 1ª série', 'Ensino Médio - 2ª série', 'Ensino Médio - 3ª série'
];

export function novoAlunoVisita(): AlunoVisitaForm {
  return { id: crypto.randomUUID(), nome: '', nascimento: '', turma: '' };
}

export function validarPassoAluno(alunos: AlunoVisitaForm[]): Set<string> {
  const chaves = new Set<string>();
  alunos.forEach(a => {
    if (!isFullName(a.nome)) chaves.add(`${a.id}:nome`);
    if (!a.nascimento) chaves.add(`${a.id}:nascimento`);
    if (!a.turma) chaves.add(`${a.id}:turma`);
  });
  return chaves;
}

export function PassoAluno({ alunos, setAlunos, erros }: {
  alunos: AlunoVisitaForm[];
  setAlunos: (fn: (atual: AlunoVisitaForm[]) => AlunoVisitaForm[]) => void;
  erros: Set<string>;
}) {
  function atualizar(id: string, mudar: (a: AlunoVisitaForm) => AlunoVisitaForm) {
    setAlunos(atual => atual.map(a => a.id === id ? mudar(a) : a));
  }

  return (
    <>
      {alunos.map((aluno, i) => (
        <div key={aluno.id} className="student-block">
          <div className="student-block-header">
            <span>Aluno {i + 1}</span>
            {alunos.length > 1 && (
              <button type="button" className="remove-student-btn" onClick={() => setAlunos(atual => atual.filter(a => a.id !== aluno.id))}>
                <i className="fa-solid fa-circle-minus"></i> Remover
              </button>
            )}
          </div>
          <div className={`field-group${erros.has(`${aluno.id}:nome`) ? ' invalid' : ''}`}>
            <label>Nome completo</label>
            <input type="text" value={aluno.nome} placeholder="Nome completo do aluno"
              onChange={e => atualizar(aluno.id, a => ({ ...a, nome: e.target.value }))}
              onBlur={e => atualizar(aluno.id, a => ({ ...a, nome: toTitleCase(e.target.value) }))} />
            <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> Informe o nome completo (nome e sobrenome).</div>
          </div>
          <div className="field-row">
            <div className={`field-group${erros.has(`${aluno.id}:nascimento`) ? ' invalid' : ''}`}>
              <label>Data de nascimento</label>
              <input type="date" value={aluno.nascimento} onChange={e => atualizar(aluno.id, a => ({ ...a, nascimento: e.target.value }))} />
              <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> Informe a data de nascimento.</div>
            </div>
            <div className={`field-group${erros.has(`${aluno.id}:turma`) ? ' invalid' : ''}`}>
              <label>Turma desejada</label>
              <select value={aluno.turma} onChange={e => atualizar(aluno.id, a => ({ ...a, turma: e.target.value }))}>
                <option value="">Selecione</option>
                {TURMAS.map(t => <option key={t}>{t}</option>)}
              </select>
              <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> Selecione a turma desejada.</div>
            </div>
          </div>
        </div>
      ))}
      <button type="button" className="add-student-btn" onClick={() => setAlunos(atual => [...atual, novoAlunoVisita()])}>
        + Adicionar mais um aluno
      </button>
    </>
  );
}
```

- [ ] **Step 4: `client/formularios/visita/PassoEscola.tsx`**

```tsx
import { toTitleCase, toCityState } from '../comum/validadores';

export function PassoEscola({ nome, setNome, cidade, setCidade, erros }: {
  nome: string; setNome: (v: string) => void;
  cidade: string; setCidade: (v: string) => void;
  erros: Set<string>;
}) {
  return (
    <>
      <div className={`field-group${erros.has('escola-nome') ? ' invalid' : ''}`}>
        <label>Nome da escola</label>
        <input type="text" value={nome} placeholder="Ex: Colégio Exemplo" onChange={e => setNome(e.target.value)}
          onBlur={e => setNome(e.target.value.trim() ? toTitleCase(e.target.value) : e.target.value)} />
        <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> Informe o nome da escola.</div>
      </div>
      <div className={`field-group${erros.has('escola-cidade') ? ' invalid' : ''}`}>
        <label>Cidade / Estado</label>
        <input type="text" value={cidade} placeholder="Ex: São Paulo / SP" onChange={e => setCidade(e.target.value)}
          onBlur={e => setCidade(toCityState(e.target.value))} />
        <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> Informe a cidade e o estado.</div>
      </div>
    </>
  );
}
```

- [ ] **Step 5: `client/formularios/visita/PassoResponsaveis.tsx`**

Porta o passo 3 de `wizard.js` (linhas 209-227, 282-306) — dois blocos de responsável, com a regra "preencha ao menos um por completo".

```tsx
import { isFullName, isValidPhone, maskPhoneAuto, toTitleCase } from '../comum/validadores';

export interface ResponsavelForm { nome: string; whatsapp: string; profissao: string }

export function validarPassoResponsaveis(pai: ResponsavelForm, mae: ResponsavelForm): { chaves: Set<string>; nenhumPreenchido: boolean } {
  const chaves = new Set<string>();
  const paiPreenchido = !!(pai.nome.trim() || pai.whatsapp.trim() || pai.profissao.trim());
  const maePreenchido = !!(mae.nome.trim() || mae.whatsapp.trim() || mae.profissao.trim());

  if (!paiPreenchido && !maePreenchido) {
    return { chaves, nenhumPreenchido: true };
  }

  if (paiPreenchido) {
    if (!isFullName(pai.nome)) chaves.add('pai-nome');
    if (!isValidPhone(pai.whatsapp)) chaves.add('pai-whatsapp');
    if (!pai.profissao.trim()) chaves.add('pai-profissao');
  }
  if (maePreenchido) {
    if (!isFullName(mae.nome)) chaves.add('mae-nome');
    if (!isValidPhone(mae.whatsapp)) chaves.add('mae-whatsapp');
    if (!mae.profissao.trim()) chaves.add('mae-profissao');
  }
  return { chaves, nenhumPreenchido: false };
}

function BlocoResponsavel({ titulo, prefixo, valor, setValor, erros }: {
  titulo: string; prefixo: 'pai' | 'mae';
  valor: ResponsavelForm; setValor: (v: ResponsavelForm) => void;
  erros: Set<string>;
}) {
  return (
    <div className="student-block">
      <div className="student-block-header"><span>{titulo}</span></div>
      <div className={`field-group${erros.has(`${prefixo}-nome`) ? ' invalid' : ''}`}>
        <label>Nome completo</label>
        <input type="text" value={valor.nome} placeholder={`Nome completo do ${titulo.toLowerCase()}`}
          onChange={e => setValor({ ...valor, nome: e.target.value })}
          onBlur={e => setValor({ ...valor, nome: toTitleCase(e.target.value) })} />
        <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> Informe o nome completo (nome e sobrenome).</div>
      </div>
      <div className="field-row">
        <div className={`field-group${erros.has(`${prefixo}-whatsapp`) ? ' invalid' : ''}`}>
          <label>WhatsApp</label>
          <input type="tel" inputMode="tel" value={valor.whatsapp} placeholder="(11) 91234-5678 ou +1 234 567 8900"
            onChange={e => setValor({ ...valor, whatsapp: maskPhoneAuto(e.target.value) })} />
          <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> Informe um telefone válido (nacional ou internacional).</div>
        </div>
        <div className={`field-group${erros.has(`${prefixo}-profissao`) ? ' invalid' : ''}`}>
          <label>Profissão</label>
          <input type="text" value={valor.profissao} placeholder="Ex: Engenheiro" onChange={e => setValor({ ...valor, profissao: e.target.value })} />
          <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> Informe a profissão.</div>
        </div>
      </div>
    </div>
  );
}

export function PassoResponsaveis({ pai, setPai, mae, setMae, erros, nenhumPreenchido }: {
  pai: ResponsavelForm; setPai: (v: ResponsavelForm) => void;
  mae: ResponsavelForm; setMae: (v: ResponsavelForm) => void;
  erros: Set<string>; nenhumPreenchido: boolean;
}) {
  return (
    <>
      <BlocoResponsavel titulo="Responsável 1" prefixo="pai" valor={pai} setValor={setPai} erros={erros} />
      <BlocoResponsavel titulo="Responsável 2" prefixo="mae" valor={mae} setValor={setMae} erros={erros} />
      <div className="hint">Preencha ao menos um dos responsáveis com todos os dados solicitados.</div>
      {nenhumPreenchido && (
        <div className="error-banner">
          <i className="fa-solid fa-circle-exclamation"></i>
          Preencha ao menos os dados de um responsável (Responsável 1 ou Responsável 2).
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 6: `client/formularios/visita/PassoComplementares.tsx`**

Porta o passo 4 de `wizard.js` (linhas 152-171 do HTML original + validação do `step === 4`).

```tsx
import { isFullName, toTitleCase, capFirst } from '../comum/validadores';

export interface ExtrasForm {
  bairro: string; motivo: string;
  indicado: 'sim' | 'nao' | null; indicacaoNome: string; observacoes: string;
}

export function validarPassoComplementares(extras: ExtrasForm): Set<string> {
  const chaves = new Set<string>();
  if (!extras.indicado) chaves.add('indicado');
  if (extras.indicado === 'sim' && !isFullName(extras.indicacaoNome)) chaves.add('indicacao-nome');
  return chaves;
}

export function PassoComplementares({ extras, setExtras, erros }: {
  extras: ExtrasForm; setExtras: (v: ExtrasForm) => void; erros: Set<string>;
}) {
  return (
    <>
      <div className="field-group">
        <label>Bairro onde reside <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(opcional)</span></label>
        <input type="text" value={extras.bairro} placeholder="Ex: Centro, Jardim Universo..."
          onChange={e => setExtras({ ...extras, bairro: e.target.value })}
          onBlur={e => setExtras({ ...extras, bairro: toTitleCase(e.target.value) })} />
      </div>

      <div className="field-group">
        <label>Qual o principal motivo que o trouxe até o Colégio São Marcos? <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(opcional)</span></label>
        <textarea value={extras.motivo} placeholder="Conte um pouco sobre o que motivou a busca pelo colégio"
          onChange={e => setExtras({ ...extras, motivo: e.target.value })}
          onBlur={e => setExtras({ ...extras, motivo: capFirst(e.target.value) })} />
      </div>

      <div className={`field-group${erros.has('indicado') ? ' invalid' : ''}`}>
        <span className="field-legend">Foi indicado por alguém?</span>
        <div className="choice-group">
          {(['sim', 'nao'] as const).map(v => (
            <button key={v} type="button" className={`choice-pill${extras.indicado === v ? ' selected' : ''}`}
              onClick={() => setExtras({ ...extras, indicado: v, indicacaoNome: v === 'sim' ? extras.indicacaoNome : '' })}>
              <span className="check">✓</span> {v === 'sim' ? 'Sim' : 'Não'}
            </button>
          ))}
        </div>
        <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> Selecione uma opção.</div>
      </div>

      {extras.indicado === 'sim' && (
        <div className={`field-group${erros.has('indicacao-nome') ? ' invalid' : ''}`}>
          <label>Nome de quem indicou</label>
          <input type="text" value={extras.indicacaoNome} placeholder="Nome completo da pessoa que indicou"
            onChange={e => setExtras({ ...extras, indicacaoNome: e.target.value })}
            onBlur={e => setExtras({ ...extras, indicacaoNome: toTitleCase(e.target.value) })} />
          <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> Informe o nome completo (nome e sobrenome).</div>
        </div>
      )}

      <div className="field-group">
        <label>Observações <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(opcional)</span></label>
        <textarea value={extras.observacoes} placeholder="Se quiser, deixe alguma observação adicional"
          onChange={e => setExtras({ ...extras, observacoes: e.target.value })}
          onBlur={e => setExtras({ ...extras, observacoes: capFirst(e.target.value) })} />
      </div>
    </>
  );
}
```

- [ ] **Step 7: `client/formularios/visita/RevisaoVisitaPublica.tsx`**

Porta `buildReviewCards` de `public/js/review-renderer.js` (linhas 64-167). Sem lógica de agrupamento aqui (diferente da avaliação) — é direto.

```tsx
import type { AlunoVisitaForm } from './tipos';
import type { ResponsavelForm } from './PassoResponsaveis';
import type { ExtrasForm } from './PassoComplementares';

function fmtDataOnly(value: string): string {
  if (!value) return '-';
  const [y, m, d] = value.split('-');
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

function Item({ label, value, full }: { label: string; value?: string; full?: boolean }) {
  const temValor = value && value.trim();
  return (
    <div className={`review-item${full ? ' review-item-full' : ''}`}>
      <span className="review-item-label">{label}</span>
      <span className={`review-item-value${temValor ? '' : ' muted'}`}>{temValor ? value : '-'}</span>
    </div>
  );
}

export function RevisaoVisitaPublica({ alunos, escolaNome, escolaCidade, pai, mae, extras }: {
  alunos: AlunoVisitaForm[];
  escolaNome: string; escolaCidade: string;
  pai: ResponsavelForm; mae: ResponsavelForm;
  extras: ExtrasForm;
}) {
  return (
    <>
      <div className="review-card">
        <div className="review-card-header">
          <div className="review-card-icon"><i className="fa-solid fa-user-graduate"></i></div>
          <h3>Aluno(s)</h3>
          <button type="button" className="review-edit-btn" data-goto="1"><i className="fa-solid fa-pen"></i> Editar</button>
        </div>
        <div className="review-card-body">
          {alunos.map((s, i) => (
            <div key={s.id} className="review-student">
              <div className="review-student-header"><i className="fa-solid fa-child-reaching"></i> Aluno {i + 1}</div>
              <div className="review-grid">
                <Item label="Nome completo" value={s.nome} full />
                <Item label="Data de nascimento" value={s.nascimento ? fmtDataOnly(s.nascimento) : ''} />
                <Item label="Turma desejada" value={s.turma} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="review-card">
        <div className="review-card-header">
          <div className="review-card-icon"><i className="fa-solid fa-school"></i></div>
          <h3>Escola de origem</h3>
          <button type="button" className="review-edit-btn" data-goto="2"><i className="fa-solid fa-pen"></i> Editar</button>
        </div>
        <div className="review-card-body">
          <div className="review-grid">
            <Item label="Nome da escola" value={escolaNome} />
            <Item label="Cidade/Estado" value={escolaCidade} />
          </div>
        </div>
      </div>

      <div className="review-card">
        <div className="review-card-header">
          <div className="review-card-icon"><i className="fa-solid fa-people-roof"></i></div>
          <h3>Responsáveis</h3>
          <button type="button" className="review-edit-btn" data-goto="3"><i className="fa-solid fa-pen"></i> Editar</button>
        </div>
        <div className="review-card-body">
          <div className="review-student">
            <div className="review-student-header"><i className="fa-solid fa-user"></i> Responsável 1</div>
            <div className="review-grid">
              <Item label="Nome completo" value={pai.nome} full />
              <Item label="WhatsApp" value={pai.whatsapp} />
              <Item label="Profissão" value={pai.profissao} />
            </div>
          </div>
          <div className="review-student">
            <div className="review-student-header"><i className="fa-solid fa-user"></i> Responsável 2</div>
            <div className="review-grid">
              <Item label="Nome completo" value={mae.nome} full />
              <Item label="WhatsApp" value={mae.whatsapp} />
              <Item label="Profissão" value={mae.profissao} />
            </div>
          </div>
        </div>
      </div>

      <div className="review-card">
        <div className="review-card-header">
          <div className="review-card-icon"><i className="fa-solid fa-comment-dots"></i></div>
          <h3>Informações complementares</h3>
          <button type="button" className="review-edit-btn" data-goto="4"><i className="fa-solid fa-pen"></i> Editar</button>
        </div>
        <div className="review-card-body">
          <div className="review-grid">
            <Item label="Bairro onde reside" value={extras.bairro} full />
            <Item label="Motivo da visita" value={extras.motivo} full />
            <div className="review-item">
              <span className="review-item-label">Indicado por alguém</span>
              {extras.indicado === 'sim'
                ? <span className="review-badge yes"><i className="fa-solid fa-check"></i> Sim</span>
                : extras.indicado === 'nao'
                  ? <span className="review-badge no"><i className="fa-solid fa-xmark"></i> Não</span>
                  : <span className="review-item-value muted">-</span>}
            </div>
            {extras.indicado === 'sim' && <Item label="Nome da indicação" value={extras.indicacaoNome} />}
            <Item label="Observações" value={extras.observacoes} full />
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 8: `client/formularios/visita/AssistenteVisita.tsx`**

Orquestra os 5 passos, usando `useAssistente(5)`. Porta `collectData()` + o `nextBtn` handler de `wizard.js` (linhas 328-468).

```tsx
import { useState } from 'react';
import { useAssistente } from '@compartilhado/useAssistente';
import { StepperPublico } from '../comum/StepperPublico';
import { NavegacaoWizard } from '../comum/NavegacaoWizard';
import { TelaSucesso } from '../comum/TelaSucesso';
import { PoliticaVisita } from './PoliticaVisita';
import { PassoAluno, novoAlunoVisita, validarPassoAluno } from './PassoAluno';
import { PassoEscola } from './PassoEscola';
import { PassoResponsaveis, validarPassoResponsaveis, type ResponsavelForm } from './PassoResponsaveis';
import { PassoComplementares, validarPassoComplementares, type ExtrasForm } from './PassoComplementares';
import { RevisaoVisitaPublica } from './RevisaoVisitaPublica';
import type { AlunoVisitaForm } from './tipos';

const PASSOS = [
  { icone: 'fa-user-graduate', nome: 'Aluno' },
  { icone: 'fa-school', nome: 'Escola' },
  { icone: 'fa-people-roof', nome: 'Responsáveis' },
  { icone: 'fa-comment-dots', nome: 'Extras' },
  { icone: 'fa-clipboard-check', nome: 'Revisão' }
];

const RESPONSAVEL_VAZIO: ResponsavelForm = { nome: '', whatsapp: '', profissao: '' };
const EXTRAS_VAZIO: ExtrasForm = { bairro: '', motivo: '', indicado: null, indicacaoNome: '', observacoes: '' };

export function AssistenteVisita() {
  const assistente = useAssistente(5);
  const [alunos, setAlunos] = useState<AlunoVisitaForm[]>([novoAlunoVisita()]);
  const [escolaNome, setEscolaNome] = useState('');
  const [escolaCidade, setEscolaCidade] = useState('');
  const [pai, setPai] = useState<ResponsavelForm>(RESPONSAVEL_VAZIO);
  const [mae, setMae] = useState<ResponsavelForm>(RESPONSAVEL_VAZIO);
  const [extras, setExtras] = useState<ExtrasForm>(EXTRAS_VAZIO);
  const [erros, setErros] = useState<Set<string>>(new Set());
  const [nenhumResponsavel, setNenhumResponsavel] = useState(false);
  const [consentimento, setConsentimento] = useState(false);
  const [consentInvalido, setConsentInvalido] = useState(false);
  const [politicaAberta, setPoliticaAberta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  function validarPassoAtual(): boolean {
    if (assistente.passo === 1) {
      const e = validarPassoAluno(alunos);
      setErros(e);
      return e.size === 0;
    }
    if (assistente.passo === 2) {
      const e = new Set<string>();
      if (!escolaNome.trim()) e.add('escola-nome');
      if (!escolaCidade.trim()) e.add('escola-cidade');
      setErros(e);
      return e.size === 0;
    }
    if (assistente.passo === 3) {
      const { chaves, nenhumPreenchido } = validarPassoResponsaveis(pai, mae);
      setErros(chaves);
      setNenhumResponsavel(nenhumPreenchido);
      return chaves.size === 0 && !nenhumPreenchido;
    }
    if (assistente.passo === 4) {
      const e = validarPassoComplementares(extras);
      setErros(e);
      return e.size === 0;
    }
    return true;
  }

  async function aoClicarProximo() {
    if (assistente.passo < 5) {
      if (!validarPassoAtual()) return;
      assistente.avancar();
      return;
    }

    if (!consentimento) {
      setConsentInvalido(true);
      return;
    }

    setEnviando(true);
    setErroEnvio(null);
    try {
      const payload = {
        students: alunos.map(a => ({ nome: a.nome, nascimento: a.nascimento, turma: a.turma })),
        escola: { nome: escolaNome, cidadeEstado: escolaCidade },
        responsaveis: { pai, mae },
        extras: {
          bairro: extras.bairro, motivo: extras.motivo, indicado: extras.indicado,
          indicacaoNome: extras.indicado === 'sim' ? extras.indicacaoNome : '',
          observacoes: extras.observacoes
        }
      };
      const apiRes = await fetch('/api/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!apiRes.ok) {
        const errData = await apiRes.json();
        throw new Error(errData.error || 'Erro ao enviar formulario.');
      }
      setEnviado(true);
    } catch (err) {
      setErroEnvio(err instanceof Error ? err.message : 'Não foi possível enviar o formulário. Verifique sua conexão e tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <main className="page">
        <div className="wizard-card">
          <Cabecalho />
          <TelaSucesso titulo="Formulário enviado!" descricao="Recebemos os dados da visita com sucesso. Em breve nossa equipe entrará em contato." />
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="wizard-card">
        <Cabecalho />
        <StepperPublico passos={PASSOS} passoAtual={assistente.passo} />

        <form noValidate onSubmit={e => e.preventDefault()}>
          {assistente.passo === 1 && (
            <section className="wizard-step" data-step="1">
              <h2 className="wizard-title">Dados do aluno</h2>
              <p className="wizard-desc">Informe os dados do aluno interessado na vaga. Você pode adicionar mais de um aluno, se necessário.</p>
              <PassoAluno alunos={alunos} setAlunos={setAlunos} erros={erros} />
            </section>
          )}

          {assistente.passo === 2 && (
            <section className="wizard-step" data-step="2">
              <h2 className="wizard-title">Escola de origem</h2>
              <p className="wizard-desc">Dados da escola em que o aluno está matriculado atualmente.</p>
              <PassoEscola nome={escolaNome} setNome={setEscolaNome} cidade={escolaCidade} setCidade={setEscolaCidade} erros={erros} />
            </section>
          )}

          {assistente.passo === 3 && (
            <section className="wizard-step" data-step="3">
              <h2 className="wizard-title">Dados dos responsáveis</h2>
              <p className="wizard-desc">Informe os dados de contato dos responsáveis.</p>
              <PassoResponsaveis pai={pai} setPai={setPai} mae={mae} setMae={setMae} erros={erros} nenhumPreenchido={nenhumResponsavel} />
            </section>
          )}

          {assistente.passo === 4 && (
            <section className="wizard-step" data-step="4">
              <h2 className="wizard-title">Informações complementares</h2>
              <p className="wizard-desc">Nos ajude a entender melhor o seu contexto.</p>
              <PassoComplementares extras={extras} setExtras={setExtras} erros={erros} />
            </section>
          )}

          {assistente.passo === 5 && (
            <section className="wizard-step" data-step="5">
              <h2 className="wizard-title">Revise suas respostas</h2>
              <p className="wizard-desc">Confira se está tudo certo antes de enviar.</p>
              <RevisaoVisitaPublica alunos={alunos} escolaNome={escolaNome} escolaCidade={escolaCidade} pai={pai} mae={mae} extras={extras} />

              <div className={`field-group consent-group${consentInvalido ? ' invalid' : ''}`}>
                <label className="consent-label">
                  <input type="checkbox" checked={consentimento} onChange={e => { setConsentimento(e.target.checked); if (e.target.checked) setConsentInvalido(false); }} />
                  <span>
                    Li e concordo com a <a href="#" className="policy-link" onClick={e => { e.preventDefault(); setPoliticaAberta(true); }}>Política de Privacidade</a> do
                    Colégio São Marcos e autorizo o uso dos meus dados pessoais exclusivamente para fins administrativos internos da instituição, como elaboração de
                    relatórios, solicitações de vaga e documentos institucionais.
                  </span>
                </label>
                <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> É necessário aceitar a política de privacidade para enviar o formulário.</div>
              </div>

              {erroEnvio && (
                <div className="error-banner">
                  <i className="fa-solid fa-triangle-exclamation"></i>
                  <span>Não foi possível enviar o formulário: {erroEnvio}</span>
                </div>
              )}
            </section>
          )}

          <NavegacaoWizard
            podeVoltar={assistente.podeVoltar}
            aoVoltar={assistente.voltar}
            rotuloProximo={assistente.passo === 5 ? 'Enviar' : 'Próximo'}
            carregando={enviando}
            aoProximo={aoClicarProximo}
          />
        </form>
      </div>

      <PoliticaVisita aberto={politicaAberta} aoFechar={() => setPoliticaAberta(false)} />
    </main>
  );
}

function Cabecalho() {
  return (
    <div style={{ textAlign: 'center', marginBottom: 20, alignItems: 'center', display: 'flex', justifyContent: 'center' }}>
      <img src="/images/logo.jpg" alt="Logotipo do Colégio São Marcos" className="header-logo" />
    </div>
  );
}
```

- [ ] **Step 9: Atualizar `client/formularios/visita/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AssistenteVisita } from './AssistenteVisita';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AssistenteVisita />
  </StrictMode>
);
```

- [ ] **Step 10: `npm run typecheck`**

```bash
npm run typecheck
```

Esperado: sem erros.

- [ ] **Step 11: Verificação manual completa**

Com `npm run dev` + `npm run dev:client:formularios` rodando, acesse `http://localhost:5174/visita.html`:

1. Aparência idêntica à de `http://localhost:3000/form-visitas` (compare lado a lado): mesmo CSS, ícones, stepper com 5 passos (sem o "Passo X/Y" que a avaliação tem — confirme essa diferença específica se manteve).
2. Adicione um segundo aluno no passo 1, preencha e avance — repita a validação bloqueando avanço com campo vazio.
3. Passo 3: preencha só o Responsável 1 e avance (deve funcionar); volte, apague tudo e tente avançar (deve bloquear com o banner "Preencha ao menos os dados de um responsável"). Confirme a máscara de WhatsApp aplicando automaticamente ao digitar (nacional `(11) 91234-5678` e internacional `+123 456 789 00`).
4. Passo 4: selecione "Sim" em "Foi indicado por alguém?" — campo de nome da indicação aparece e vira obrigatório; selecione "Não" — campo some.
5. Passo 5 (Revisão): confirme todos os dados aparecendo certos, incluindo o badge Sim/Não de "Indicado por alguém".
6. Envie sem marcar consentimento — bloqueado. Marque e envie — confirme `POST /api/responses` no Network, sucesso, tela "Formulário enviado!".
7. Verifique no log do servidor que `notifyN8n` foi disparado depois do envio (mesmo tratamento do Incremento A: se o webhook não estiver configurado localmente, confirme que o erro fica só no log, sem quebrar a resposta ao visitante).
8. Clique "Voltar ao início" — recarrega `/visita.html` do zero.
9. Force um erro (pare o Express) e tente enviar — mensagem de erro aparece sem travar, botões voltam ao normal.
10. Abra a Política de Privacidade — texto específico de visitas (9 seções, diferente do de avaliação), fecha nos 4 jeitos (X, botão, clique fora, ESC).

- [ ] **Step 12: Commit**

```bash
git add client/formularios/visita/tipos.ts client/formularios/visita/PoliticaVisita.tsx client/formularios/visita/PassoAluno.tsx client/formularios/visita/PassoEscola.tsx client/formularios/visita/PassoResponsaveis.tsx client/formularios/visita/PassoComplementares.tsx client/formularios/visita/RevisaoVisitaPublica.tsx client/formularios/visita/AssistenteVisita.tsx client/formularios/visita/main.tsx
git commit -m "$(cat <<'EOF'
feat: wizard de visitas em React (F6 incremento B)

Porta public/js/wizard.js e a parte de public/js/review-renderer.js
usada na revisão pré-envio, inteiros, para o novo bundle público
(client/formularios/visita/), reaproveitando o casco visual da
tarefa anterior (StepperPublico, NavegacaoWizard, TelaSucesso,
PoliticaModal). POST /api/responses não muda.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Cutover em produção e retirada dos arquivos antigos

**Files:**
- Modify: `routes/pages.js`
- Delete: `views/form-visitas.ejs`
- Delete: `views/form-avaliacao.ejs`
- Delete: `public/js/wizard.js`
- Delete: `public/js/wizard-avaliacao.js`
- Delete: `public/js/policy-modal.js`
- Delete: `public/js/review-renderer.js`
- Delete: `public/js/main.js`
- Modify: `server/index.ts` (cache-control do HTML, análogo ao do painel)

**Interfaces:**
- Consumes: `client/dist-formularios/visita.html`, `client/dist-formularios/avaliacao.html` (Tarefas 1, 4, 5).
- Produces: nada consumido por tarefa futura — fim da migração.

- [ ] **Step 1: Cache-Control do HTML em `server/index.ts`**

No bloco criado na Tarefa 1/Step 6, adicionar duas rotas explícitas antes de `app.use('/', pagesRouter);` (sendFile com `Cache-Control: no-cache`, mesmo padrão do `index.html` do painel):

```ts
if (fs.existsSync(DIST_FORMULARIOS)) {
  app.use('/assets-formularios', express.static(path.join(DIST_FORMULARIOS, 'assets'), { maxAge: '1y', immutable: true }));
}
```

(bloco já existente — sem mudança aqui; o `sendFile` de cada página fica em `routes/pages.js`, no Step 2, que já seta o header por resposta.)

- [ ] **Step 2: Reescrever as rotas dos formulários em `routes/pages.js`**

Trocar:

```js
router.get('/form-visitas', (_req, res) => res.render('form-visitas'));
router.get('/form-avaliacao-substitutiva', (_req, res) => res.render('form-avaliacao'));
```

por:

```js
const path = require('path');
const fs = require('fs');

const DIST_FORMULARIOS = path.join(__dirname, '..', 'client', 'dist-formularios');

// '/form-visitas' e '/form-avaliacao-substitutiva' migraram para React
// (F6 incremento B — ver
// docs/superpowers/specs/2026-09-19-formularios-react-f6-incremento-b-design.md).
// Bundle público separado do painel, sem gate de login (nunca teve).
function servirFormulario(arquivoHtml) {
  return (_req, res) => {
    const caminho = path.join(DIST_FORMULARIOS, arquivoHtml);
    if (!fs.existsSync(caminho)) {
      return res.status(503).type('html').send(
        '<!doctype html><meta charset="utf-8"><title>Formulário não compilado</title>' +
        '<body style="font-family:Inter,system-ui,sans-serif;padding:40px;max-width:640px;line-height:1.6">' +
        '<h1 style="font-size:20px">Formulário ainda não foi compilado</h1>' +
        '<p>Rode <code>npm run build</code> para gerar <code>client/dist-formularios</code>.</p></body>'
      );
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(caminho);
  };
}

router.get('/form-visitas', servirFormulario('visita.html'));
router.get('/form-avaliacao-substitutiva', servirFormulario('avaliacao.html'));
```

Adicione o `require('path')`/`require('fs')` no topo do arquivo, junto aos já existentes (`express`), se ainda não estiverem lá.

- [ ] **Step 3: `npm run build` (produção completa) e verificação manual**

```bash
npm run build
npm start
```

Repita **todos** os passos de verificação manual das Tarefas 4 e 5 (checklist completo), agora contra as URLs de produção reais:
- `http://localhost:3000/form-visitas`
- `http://localhost:3000/form-avaliacao-substitutiva`

Confirme adicionalmente:
- `GET /` continua 302 para `/app` (Task 1 do Incremento A, sem regressão).
- `GET /respostas` continua 302 para `/app/formularios/respostas` (Incremento A, sem regressão).
- O painel (`/app/formularios/respostas`) continua mostrando as respostas normalmente, incluindo as que tiverem sido enviadas de teste por estes wizards novos (confirma que `RevisaoResposta.tsx`, depois do retrofit da Tarefa 3, ainda renderiza tudo certo).
- `GET /api/blank/visita/pdf` e `GET /api/blank/avaliacao/pdf` continuam gerando PDF em branco normalmente (fora de escopo, não deveriam ter sido afetados).

- [ ] **Step 4: Confirmar que nada mais referencia os arquivos antes de apagar**

```bash
grep -rn "wizard\.js\|wizard-avaliacao\.js\|policy-modal\.js\|review-renderer\.js\|main\.js" views/*.ejs routes/*.js server/*.ts
```

Esperado: **nenhum resultado** — depois dos Steps 1-2, nenhuma `.ejs` nem rota carrega mais esses scripts (as duas únicas `.ejs` que carregavam `wizard.js`/`wizard-avaliacao.js`/`policy-modal.js`/`review-renderer.js`/`main.js` são exatamente as duas que vão ser apagadas no próximo step).

- [ ] **Step 5: Apagar os arquivos**

```bash
git rm views/form-visitas.ejs views/form-avaliacao.ejs public/js/wizard.js public/js/wizard-avaliacao.js public/js/policy-modal.js public/js/review-renderer.js public/js/main.js
```

- [ ] **Step 6: `npm run typecheck` e verificação final**

```bash
npm run typecheck
```

Esperado: sem erros. Repita rapidamente os itens do Step 3 (build + start + os dois formulários abrindo e enviando) pra confirmar que apagar os arquivos não quebrou nada — eles já não eram mais referenciados.

- [ ] **Step 7: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: servir os formulários em React e aposentar EJS/JS antigos

/form-visitas e /form-avaliacao-substitutiva passam a servir o bundle
React (client/dist-formularios), fechando o F6 incremento B. Apaga
views/form-visitas.ejs, views/form-avaliacao.ejs e os cinco arquivos
public/js/* que só eram usados por elas (wizard.js, wizard-avaliacao.js,
policy-modal.js, review-renderer.js, main.js) — nenhum tem mais
referência depois da troca de rota. POST /api/responses e
POST /api/avaliacoes não mudam.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Atualizar documentação

**Files:**
- Modify: `docs/02-arquitetura.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: nada — só reflete o que as Tarefas 1-6 já implementaram.
- Produces: nada consumido por tarefa futura.

- [ ] **Step 1: `docs/02-arquitetura.md` §2 (diagrama)**

Trocar:

```
┌── Cliente ────────────────────────────────────────────┐
│  React 19 + Vite + TypeScript + React Router          │
│  ├── /app/*      painel da secretaria (autenticado)   │
│  └── /form/*     formulários públicos                 │
└───────────────────────────────────────────────────────┘
```

por:

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
```

- [ ] **Step 2: `docs/02-arquitetura.md` §2.2 (estrutura de diretórios)**

Trocar a linha:

```
│   │   ├── form/                   formulários públicos (wizards migrados)
```

por:

```
│   formularios/                    2º bundle Vite (public/, sem router):
│   │   ├── visita.html / avaliacao.html  entradas independentes
│   │   ├── visita/, avaliacao/           um wizard cada
│   │   └── comum/                        casco visual compartilhado entre os dois
```

E adicionar, logo depois do bloco de `client/src/`, uma nota:

```
> `client/src/compartilhado/` guarda o que é reaproveitado pelos DOIS
> bundles (painel e formulários): o hook `useAssistente` e a lógica de
> agrupamento de provas por data. Ver
> docs/superpowers/specs/2026-09-19-formularios-react-f6-incremento-b-design.md.
```

- [ ] **Step 3: `README.md`**

Trocar a linha do status da F6:

```
| F6 — Formulários | Migração dos wizards e das respostas para React | 🟡 (respostas em React; wizards ainda em EJS — ver Incremento B) |
```

por:

```
| F6 — Formulários | Migração dos wizards e das respostas para React | ✅ |
```

- [ ] **Step 4: Commit**

```bash
git add docs/02-arquitetura.md README.md
git commit -m "$(cat <<'EOF'
docs: atualizar arquitetura e README após F6 incremento B

docs/02-arquitetura.md §2/§2.2 refletem os dois bundles Vite reais
(painel e formulários, sem router no segundo) em vez da visão antiga
de bundle único com rotas /form/*, que nunca foi implementada.
README marca F6 como concluída.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review (checked while writing this plan)

**Cobertura da spec:** dois bundles + Express (§3.1/§3.2 → Task 1), `useAssistente` + validadores (§3.3 → Task 2), extração de `avaliacaoRevisao.ts` + retrofit (§3.5 → Task 3), mapeamento completo dos dois wizards com casco visual compartilhado (§3.4 → Tasks 4-5), retirada final (§3.6 → Task 6), atualização de docs (§3.7 → Task 7), verificação (§5 → checklists manuais em cada task que toca UI). Todo item do Incremento B tem tarefa.

**Consistência de tipos:** `AlunoForm`/`ProvaForm`/`AnexoPorData` (avaliação) e `AlunoVisitaForm`/`ResponsavelForm`/`ExtrasForm` (visita) definidos uma vez cada, em `tipos.ts` ou junto ao componente que os introduz, e só importados nos demais arquivos da mesma tarefa. `agruparPorData`/`anexosUnicosDoGrupo` têm assinatura genérica única (Task 3), usada igual pelo painel (retrofit) e pelo wizard público (Task 4) com extratores de anexo diferentes, como o risco da spec previa. `useAssistente` tem uma única assinatura, consumida identicamente pelos dois wizards.

**Placeholders:** os únicos dois pontos que não têm o texto final embutido literalmente no plano são os corpos das duas Políticas de Privacidade (Task 4/Step 5, Task 5/Step 2) — texto legal longo e estático, sem nenhuma lógica; a instrução aponta o arquivo e as linhas exatas de origem e o tipo de conversão mecânica (`class`→`className`), o que não deixa ambiguidade sobre o que escrever. Todo o restante — toda validação, toda regra de negócio, todo estado dinâmico — tem código completo.
