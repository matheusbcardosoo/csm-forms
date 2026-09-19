# Respostas em React (F6, Incremento A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar `/app/formularios/respostas` para uma tela React de verdade dentro do painel (lista + modal de detalhe com as mesmas ações de hoje), aposentar `views/index.ejs` e `views/respostas.ejs`, e transformar `/` e `/respostas` em redirects para o painel.

**Architecture:** Camada de UI apenas — nenhum endpoint de `routes/api.js` muda. A tela nova busca dados via `GET /api/responses?form=...` (já existente) usando o hook `useRecurso` já usado em outras telas do painel; a formatação de cada resposta (hoje em `public/js/review-renderer.js`, vanilla JS) é portada para dois componentes React que usam só os primitivos do painel (`Card`, `Tag`, um novo `CampoLeitura` somente-leitura) — nada de FontAwesome ou das classes `.review-*` do site público, que não existem no bundle do painel (`client/index.html` não carrega FontAwesome).

**Tech Stack:** React 19 + TypeScript + Vite (cliente, em `client/`), Express 4 + TypeScript/JS misto (servidor). React Router v7 (`react-router-dom`) para as rotas do painel.

**Spec:** `docs/superpowers/specs/2026-09-19-formularios-react-f6-design.md` (Incremento A)

## Global Constraints

- Nenhuma mudança de backend/API. Os quatro endpoints existentes continuam exatamente como estão: `GET /api/responses`, `GET /api/responses/:id/pdf`, `GET /api/responses/:id/anexo/:provaId`, `POST /api/responses/:id/whatsapp` (todos em `routes/api.js`).
- Sem framework de testes automatizados no projeto (nenhuma fase anterior tem — não introduzir um agora). Verificação manual, com passos exatos por tarefa.
- Componentes novos usam só os primitivos já existentes do painel (`client/src/componentes/ui.tsx`, `client/src/componentes/Icones.tsx`) mais o único componente novo desta spec (`CampoLeitura`, somente leitura). Nada de FontAwesome nem das classes `.review-*`/`.wizard-*` do site público — o bundle do painel (`client/index.html`) não carrega o FontAwesome.
- Nomes de função/variável em português, seguindo a convenção do resto do repositório.
- `npm run typecheck` precisa passar limpo ao final de cada tarefa que toca `client/` ou `server/`.

---

### Task 1: Redirects de `/` e `/respostas` (servidor)

**Files:**
- Modify: `routes/pages.js`

**Interfaces:**
- Consumes: nada de novo — usa só `express.Router()` já importado no arquivo.
- Produces: `GET /` responde 302 para `/app`. `GET /respostas` responde 302 para `/app/formularios/respostas`, preservando `?form=` quando presente. Nenhuma outra rota do arquivo muda.

- [ ] **Step 1: Reescrever `routes/pages.js`**

Conteúdo atual (referência, para conferir que nada além do descrito muda):

```js
'use strict';
const express = require('express');
const router = express.Router();
const { resolveSession } = require('../lib/auth');

async function renderGated(view, req, res) {
  const initialAuth = await resolveSession(req, res);
  res.render(view, { initialAuth });
}

router.get('/', (req, res) => renderGated('index', req, res));
router.get('/respostas', (req, res) => renderGated('respostas', req, res));
router.get('/form-visitas', (_req, res) => res.render('form-visitas'));
router.get('/form-avaliacao-substitutiva', (_req, res) => res.render('form-avaliacao'));
router.get('/politica-privacidade', (_req, res) => res.render('politica-privacidade'));

module.exports = router;
```

Substituir pelo conteúdo completo abaixo — `renderGated` e o `require('../lib/auth')` saem porque `/` e `/respostas` não renderizam mais EJS gated (o gate de sessão agora é só o do painel React, em `/app/entrar`); as demais rotas (formulários públicos, política de privacidade) ficam idênticas:

```js
'use strict';
const express = require('express');
const router = express.Router();

// '/' e '/respostas' migraram para o painel React (F6 — ver
// docs/superpowers/specs/2026-09-19-formularios-react-f6-design.md).
// Ficam como redirects pra não quebrar links salvos/compartilhados
// internamente. O login e a lista de respostas agora vivem em /app
// (autenticado via usuario_perfil, mesmo gate do resto do painel).
router.get('/', (_req, res) => res.redirect('/app'));

router.get('/respostas', (req, res) => {
  const form = req.query.form;
  const destino = form ? `/app/formularios/respostas?form=${encodeURIComponent(String(form))}` : '/app/formularios/respostas';
  res.redirect(302, destino);
});

router.get('/form-visitas', (_req, res) => res.render('form-visitas'));
router.get('/form-avaliacao-substitutiva', (_req, res) => res.render('form-avaliacao'));
router.get('/politica-privacidade', (_req, res) => res.render('politica-privacidade'));

module.exports = router;
```

- [ ] **Step 2: Verificar manualmente**

Suba o servidor (`npm run dev`, ou já deixe rodando) e confira com `curl` (não precisa estar autenticado — é redirect puro, antes de qualquer verificação de sessão):

```bash
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" http://localhost:3000/
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" http://localhost:3000/respostas
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" "http://localhost:3000/respostas?form=avaliacao-substitutiva"
```

Esperado:
```
302 -> /app
302 -> /app/formularios/respostas
302 -> /app/formularios/respostas?form=avaliacao-substitutiva
```

Confirme também que `/form-visitas`, `/form-avaliacao-substitutiva` e `/politica-privacidade` continuam respondendo 200 (não devem ter sido afetadas):

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/form-visitas
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/form-avaliacao-substitutiva
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/politica-privacidade
```

Esperado: `200` nos três.

- [ ] **Step 3: Commit**

```bash
git add routes/pages.js
git commit -m "$(cat <<'EOF'
feat: redirecionar / e /respostas para o painel React

Incremento A da F6 (docs/superpowers/specs/2026-09-19-formularios-react-f6-design.md):
o login e a lista de respostas migram para /app/formularios/respostas,
autenticados pelo mesmo gate do resto do painel. '/' e '/respostas'
viram redirects pra não quebrar links salvos.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Tela `/app/formularios/respostas` em React

**Files:**
- Modify: `client/src/componentes/ui.tsx` — adicionar `CampoLeitura`
- Modify: `client/src/estilos/global.css` — CSS de `CampoLeitura` e `.pilha` (conferir se `.pilha` já existe antes de adicionar)
- Modify: `client/src/api/cliente.ts` — adicionar `baixarArquivo`
- Create: `client/src/app/formularios/RevisaoResposta.tsx`
- Create: `client/src/app/formularios/Respostas.tsx`
- Modify: `client/src/rotas.tsx` — registrar a rota `formularios/respostas`
- Modify: `client/src/app/formularios/Formularios.tsx` — trocar o link externo de respostas por navegação interna

**Interfaces:**
- Consumes: `useRecurso<T>(url)` de `@/hooks/useRecurso` (retorna `{dados, carregando, erro, recarregar, definir}`), `useToast()` de `@/hooks/useToast` (retorna `{avisar, ok, erro}`), `api.get`/`api.post` e `mensagemErro` de `@/api/cliente`, `Botao`/`BotaoLink`/`Cabecalho`/`Card`/`Carregando`/`EstadoVazio`/`Modal`/`Tag`/`fmtData`/`fmtDataHora` de `@/componentes/ui`, `Icone` de `@/componentes/Icones`. Endpoints do servidor (inalterados): `GET /api/responses?form=visitas|avaliacao-substitutiva` → `{id, submittedAt, data}[]`; `GET /api/responses/:id/pdf?form=...` → binário; `GET /api/responses/:id/anexo/:provaId?form=avaliacao-substitutiva` → `{url}`; `POST /api/responses/:id/whatsapp?form=...` → `{success:true}`.
- Produces: `CampoLeitura({rotulo, valor, className?})` exportado de `@/componentes/ui`. `baixarArquivo(url, nomePadrao): Promise<void>` exportado de `@/api/cliente`. `RevisaoVisita({data: DadosVisita})` e `RevisaoAvaliacao({data: DadosAvaliacao, aoAbrirAnexo, carregandoAnexos})` exportados de `./RevisaoResposta`, junto com os tipos `DadosVisita`, `DadosAvaliacao`, `ProvaAvaliacao`. Rota `/app/formularios/respostas` (autenticada, papéis `admin`/`secretaria`/`coordenacao`, herdados do `SoPapel` já existente em `formularios`).

- [ ] **Step 1: Adicionar `CampoLeitura` em `client/src/componentes/ui.tsx`**

Logo depois da função `Carregando` (linha ~92, antes de `export function Aviso`), adicionar:

```tsx
/* ---------- Campo somente leitura (revisão de dados já salvos) ---------- */
export function CampoLeitura({ rotulo, valor, className = '' }: { rotulo: ReactNode; valor?: ReactNode; className?: string }) {
  const vazio = valor === undefined || valor === null || valor === '';
  return (
    <div className={`campo ${className}`}>
      <label>{rotulo}</label>
      <div className={`campo-leitura ${vazio ? 'vazio' : ''}`}>{vazio ? '—' : valor}</div>
    </div>
  );
}
```

- [ ] **Step 2: CSS de `CampoLeitura` em `client/src/estilos/global.css`**

Logo depois da regra `.campo .dica { ... }` (linha 249), adicionar:

```css
.campo-leitura { font-size: 13.5px; padding: 8px 10px; border-radius: var(--r-sm); border: 1px solid var(--linha); background: var(--superficie-2); color: var(--texto); min-height: 38px; display: flex; align-items: center; }
.campo-leitura.vazio { color: var(--texto-3); font-style: italic; }
```

Antes de prosseguir, rode `grep -n "\.pilha " client/src/estilos/global.css` — a regra `.pilha { display: flex; flex-direction: column; gap: 14px; }` já existe na linha 168; não é preciso adicioná-la, só reaproveitar a classe no Step 4.

- [ ] **Step 3: Adicionar `baixarArquivo` em `client/src/api/cliente.ts`**

No final do arquivo (depois de `mensagemErro`), adicionar:

```ts
/**
 * Baixa um arquivo binário (ex.: PDF) preservando o nome sugerido pelo
 * servidor via Content-Disposition. Diferente de `api.get`, que sempre
 * espera JSON — aqui a resposta é um blob.
 */
export async function baixarArquivo(url: string, nomePadrao: string): Promise<void> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (res.status === 401) window.dispatchEvent(new CustomEvent('sessao:expirou'));
  if (!res.ok) {
    const texto = await res.text().catch(() => '');
    let mensagem = `Erro ${res.status}`;
    try {
      const d = JSON.parse(texto) as { error?: string };
      if (d.error) mensagem = d.error;
    } catch { /* corpo não é JSON */ }
    throw new ErroApi(res.status, mensagem);
  }
  const blob = await res.blob();
  const disposicao = res.headers.get('Content-Disposition') || '';
  const combinado = disposicao.match(/filename="?([^";]+)"?/);
  const nome = combinado ? combinado[1] : nomePadrao;
  const urlObjeto = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = urlObjeto;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(urlObjeto);
}
```

- [ ] **Step 4: Criar `client/src/app/formularios/RevisaoResposta.tsx`**

```tsx
// Revisão somente-leitura de uma resposta já enviada — porta a formatação
// de public/js/review-renderer.js (usada no modal "Ver detalhes" de
// /app/formularios/respostas) para React, com os primitivos do próprio
// painel (Card, CampoLeitura, Tag) em vez das classes .review-* do site
// público, que não existem no bundle do painel.
import { Botao, Card, CampoLeitura, Tag, fmtData } from '@/componentes/ui';

export interface DadosVisita {
  students?: { nome?: string; nascimento?: string; turma?: string }[];
  escola?: { nome?: string; cidadeEstado?: string };
  responsaveis?: {
    pai?: { nome?: string; whatsapp?: string; profissao?: string };
    mae?: { nome?: string; whatsapp?: string; profissao?: string };
  };
  extras?: { bairro?: string; motivo?: string; indicado?: 'sim' | 'nao' | null; indicacaoNome?: string; observacoes?: string };
}

export interface ProvaAvaliacao {
  id: string;
  disciplina?: string;
  segmento?: string;
  data?: string;
  motivo?: { tipo?: string; observacoes?: string };
  anexo?: { path?: string; nome?: string; tipo?: string };
}

export interface DadosAvaliacao {
  alunos?: { id?: string; nome?: string; turma?: string; provas?: ProvaAvaliacao[] }[];
}

const SEGMENTO_LABELS: Record<string, string> = { lingua_materna: 'Língua materna', lingua_inglesa: 'Língua inglesa' };
const MOTIVO_LABELS: Record<string, string> = { medico: 'Atestado médico', outro: 'Outro motivo (pagamento de taxa)' };

export function RevisaoVisita({ data }: { data: DadosVisita }) {
  const escola = data.escola || {};
  const pai = data.responsaveis?.pai || {};
  const mae = data.responsaveis?.mae || {};
  const extras = data.extras || {};

  return (
    <div className="pilha">
      <Card titulo="Aluno(s)">
        {(data.students || []).map((s, i) => (
          <div key={i} className="form-sec">
            <h3>Aluno {i + 1}</h3>
            <div className="form-grade g3">
              <CampoLeitura rotulo="Nome completo" valor={s.nome} />
              <CampoLeitura rotulo="Data de nascimento" valor={s.nascimento ? fmtData(s.nascimento) : undefined} />
              <CampoLeitura rotulo="Turma desejada" valor={s.turma} />
            </div>
          </div>
        ))}
      </Card>

      <Card titulo="Escola de origem">
        <div className="form-grade g3">
          <CampoLeitura rotulo="Nome da escola" valor={escola.nome} />
          <CampoLeitura rotulo="Cidade/Estado" valor={escola.cidadeEstado} />
        </div>
      </Card>

      <Card titulo="Responsáveis">
        <div className="form-sec">
          <h3>Responsável 1</h3>
          <div className="form-grade g3">
            <CampoLeitura rotulo="Nome completo" valor={pai.nome} />
            <CampoLeitura rotulo="WhatsApp" valor={pai.whatsapp} />
            <CampoLeitura rotulo="Profissão" valor={pai.profissao} />
          </div>
        </div>
        <div className="form-sec">
          <h3>Responsável 2</h3>
          <div className="form-grade g3">
            <CampoLeitura rotulo="Nome completo" valor={mae.nome} />
            <CampoLeitura rotulo="WhatsApp" valor={mae.whatsapp} />
            <CampoLeitura rotulo="Profissão" valor={mae.profissao} />
          </div>
        </div>
      </Card>

      <Card titulo="Informações complementares">
        <div className="form-grade g3">
          <CampoLeitura rotulo="Bairro onde reside" valor={extras.bairro} />
          <div className="campo">
            <label>Indicado por alguém</label>
            <div>
              {extras.indicado === 'sim' ? <Tag tipo="ok" ponto>Sim</Tag>
                : extras.indicado === 'nao' ? <Tag tipo="neutro" ponto>Não</Tag>
                : <span className="campo-leitura vazio">—</span>}
            </div>
          </div>
          {extras.indicado === 'sim' ? <CampoLeitura rotulo="Nome da indicação" valor={extras.indicacaoNome} /> : null}
        </div>
        <div className="form-sec"><CampoLeitura rotulo="Motivo da visita" valor={extras.motivo} /></div>
        <div className="form-sec"><CampoLeitura rotulo="Observações" valor={extras.observacoes} /></div>
      </Card>
    </div>
  );
}

export function RevisaoAvaliacao({ data, aoAbrirAnexo, carregandoAnexos }: {
  data: DadosAvaliacao;
  aoAbrirAnexo: (provaId: string) => void;
  carregandoAnexos: Set<string>;
}) {
  return (
    <div className="pilha">
      {(data.alunos || []).map((aluno, alunoIdx) => {
        const provas = aluno.provas || [];
        const grupos: { data?: string; provas: ProvaAvaliacao[] }[] = [];
        const porData = new Map<string, { data?: string; provas: ProvaAvaliacao[] }>();
        provas.forEach(prova => {
          const chave = prova.data || `_sem-data-${grupos.length}`;
          let grupo = porData.get(chave);
          if (!grupo) { grupo = { data: prova.data, provas: [] }; porData.set(chave, grupo); grupos.push(grupo); }
          grupo.provas.push(prova);
        });

        let contador = 0;

        return (
          <Card key={aluno.id || alunoIdx} titulo={`Aluno ${alunoIdx + 1}${aluno.nome ? ' — ' + aluno.nome : ''}`}>
            <div className="form-grade g3">
              <CampoLeitura rotulo="Nome completo" valor={aluno.nome} />
              <CampoLeitura rotulo="Turma" valor={aluno.turma} />
            </div>

            {grupos.map((grupo, gi) => {
              const anexosUnicos: { nome?: string; provaId: string }[] = [];
              const vistos = new Set<string>();
              grupo.provas.forEach(prova => {
                if (!prova.anexo?.nome) return;
                const chave = `${prova.anexo.nome}|${prova.anexo.tipo}`;
                if (vistos.has(chave)) return;
                vistos.add(chave);
                anexosUnicos.push({ nome: prova.anexo.nome, provaId: prova.id });
              });
              const disciplinasGrupo = grupo.provas.map(p => p.disciplina).filter(Boolean).join(', ');
              const sufixo = (grupo.data ? ` — ${fmtData(grupo.data)}` : '') + (disciplinasGrupo ? ` (${disciplinasGrupo})` : '');

              return (
                <div key={gi} className="form-sec">
                  {grupo.provas.map(prova => {
                    contador += 1;
                    return (
                      <div key={prova.id} style={{ marginBottom: 10 }}>
                        <h3>Avaliação {contador}</h3>
                        <div className="form-grade g3">
                          <CampoLeitura rotulo="Disciplina" valor={prova.disciplina} />
                          <CampoLeitura rotulo="Segmento" valor={prova.segmento ? (SEGMENTO_LABELS[prova.segmento] || prova.segmento) : undefined} />
                          <CampoLeitura rotulo="Data da avaliação perdida" valor={prova.data ? fmtData(prova.data) : undefined} />
                          <CampoLeitura rotulo="Motivo" valor={prova.motivo?.tipo ? (MOTIVO_LABELS[prova.motivo.tipo] || prova.motivo.tipo) : undefined} />
                          <CampoLeitura rotulo="Observações" valor={prova.motivo?.observacoes} />
                        </div>
                      </div>
                    );
                  })}
                  <div className="campo">
                    <label>Documento anexado{sufixo}</label>
                    {anexosUnicos.length
                      ? anexosUnicos.map(anexo => (
                          <div key={anexo.provaId} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span className="campo-leitura" style={{ flex: 1 }}>{anexo.nome}</span>
                            <Botao pequeno icone="olho" carregando={carregandoAnexos.has(anexo.provaId)} onClick={() => aoAbrirAnexo(anexo.provaId)}>Ver anexo</Botao>
                          </div>
                        ))
                      : <div className="campo-leitura vazio">Nenhum documento anexado.</div>}
                  </div>
                </div>
              );
            })}
          </Card>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Criar `client/src/app/formularios/Respostas.tsx`**

```tsx
// /app/formularios/respostas — lista e detalhe das respostas enviadas
// pelos formulários públicos (F6, Incremento A). Substitui
// views/respostas.ejs + public/js/respostas.js; os endpoints
// (/api/responses*) não mudam.
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, baixarArquivo, mensagemErro } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { useToast } from '@/hooks/useToast';
import { Botao, Cabecalho, Card, Carregando, EstadoVazio, Modal, fmtDataHora } from '@/componentes/ui';
import { RevisaoAvaliacao, RevisaoVisita, type DadosAvaliacao, type DadosVisita } from './RevisaoResposta';

type FormId = 'visitas' | 'avaliacao-substitutiva';
interface Resposta { id: string; submittedAt: string; data: DadosVisita | DadosAvaliacao }

const FORMULARIOS: { id: FormId; nome: string }[] = [
  { id: 'visitas', nome: 'Cadastro de visitas' },
  { id: 'avaliacao-substitutiva', nome: 'Avaliação substitutiva' }
];

function resumoResposta(formId: FormId, data: DadosVisita | DadosAvaliacao): { titulo: string; subtitulo: string } {
  if (formId === 'avaliacao-substitutiva') {
    const alunos = (data as DadosAvaliacao).alunos || [];
    const primeiro = alunos[0]?.nome || 'Sem nome';
    const extra = alunos.length > 1 ? ` (+${alunos.length - 1})` : '';
    const totalProvas = alunos.reduce((soma, a) => soma + (a.provas?.length || 0), 0);
    return { titulo: primeiro + extra, subtitulo: `${totalProvas} ${totalProvas === 1 ? 'avaliação solicitada' : 'avaliações solicitadas'}` };
  }
  const students = (data as DadosVisita).students || [];
  const primeiro = students[0]?.nome || 'Sem nome';
  const extra = students.length > 1 ? ` (+${students.length - 1})` : '';
  return { titulo: primeiro + extra, subtitulo: '' };
}

export function Respostas() {
  const [params, setParams] = useSearchParams();
  const formId: FormId = params.get('form') === 'avaliacao-substitutiva' ? 'avaliacao-substitutiva' : 'visitas';
  const toast = useToast();

  const url = useMemo(() => `/api/responses?form=${formId}`, [formId]);
  const { dados, carregando, erro } = useRecurso<Resposta[]>(url);

  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [baixandoPdf, setBaixandoPdf] = useState(false);
  const [enviandoWhatsapp, setEnviandoWhatsapp] = useState(false);
  const [anexosCarregando, setAnexosCarregando] = useState<Set<string>>(new Set());

  const respostaAberta = dados?.find(r => r.id === abertoId) || null;

  function trocarFormulario(novo: FormId) {
    const p = new URLSearchParams(params);
    p.set('form', novo);
    setParams(p);
    setAbertoId(null);
  }

  async function baixarPdf(resposta: Resposta) {
    setBaixandoPdf(true);
    try {
      await baixarArquivo(`/api/responses/${resposta.id}/pdf?form=${formId}`, `${formId}.pdf`);
    } catch (err) {
      toast.erro(mensagemErro(err, 'Não foi possível gerar o PDF.'));
    } finally {
      setBaixandoPdf(false);
    }
  }

  async function enviarWhatsapp(resposta: Resposta) {
    setEnviandoWhatsapp(true);
    try {
      await api.post(`/api/responses/${resposta.id}/whatsapp?form=${formId}`);
      toast.ok('Enviado por WhatsApp.');
    } catch (err) {
      toast.erro(mensagemErro(err, 'Não foi possível enviar pelo WhatsApp.'));
    } finally {
      setEnviandoWhatsapp(false);
    }
  }

  async function abrirAnexo(resposta: Resposta, provaId: string) {
    setAnexosCarregando(s => new Set(s).add(provaId));
    try {
      const r = await api.get<{ url: string }>(`/api/responses/${resposta.id}/anexo/${provaId}?form=avaliacao-substitutiva`);
      window.open(r.url, '_blank', 'noopener');
    } catch (err) {
      toast.erro(mensagemErro(err, 'Não foi possível abrir o anexo.'));
    } finally {
      setAnexosCarregando(s => { const n = new Set(s); n.delete(provaId); return n; });
    }
  }

  return (
    <div className="wrap">
      <Cabecalho titulo="Respostas" descricao="Formulários enviados pelo site público" />

      <div className="acoes" style={{ marginBottom: 16 }}>
        {FORMULARIOS.map(f => (
          <Botao key={f.id} variante={formId === f.id ? 'primario' : 'padrao'} onClick={() => trocarFormulario(f.id)}>{f.nome}</Botao>
        ))}
      </div>

      {carregando ? <Carregando texto="Carregando respostas…" /> : erro ? (
        <EstadoVazio icone="alerta" titulo="Não foi possível carregar as respostas" descricao={erro} />
      ) : !dados || dados.length === 0 ? (
        <EstadoVazio icone="documento" titulo="Nenhuma resposta enviada ainda" descricao="Assim que alguém enviar este formulário, a resposta aparece aqui." />
      ) : (
        <div className="grade g2">
          {dados.map(r => {
            const { titulo, subtitulo } = resumoResposta(formId, r.data);
            return (
              <Card key={r.id} titulo={titulo}
                descricao={subtitulo ? `${subtitulo} · Enviado em ${fmtDataHora(r.submittedAt)}` : `Enviado em ${fmtDataHora(r.submittedAt)}`}
                acoes={<Botao pequeno onClick={() => setAbertoId(r.id)}>Ver detalhes</Botao>} />
            );
          })}
        </div>
      )}

      <Modal aberto={!!respostaAberta} titulo="Detalhes da resposta"
        descricao={respostaAberta ? `Enviado em ${fmtDataHora(respostaAberta.submittedAt)}` : undefined}
        aoFechar={() => setAbertoId(null)} tamanho="lg"
        rodape={respostaAberta ? <>
          <Botao onClick={() => setAbertoId(null)}>Fechar</Botao>
          <Botao carregando={enviandoWhatsapp} onClick={() => enviarWhatsapp(respostaAberta)}>Enviar por WhatsApp</Botao>
          <Botao variante="primario" icone="documento" carregando={baixandoPdf} onClick={() => baixarPdf(respostaAberta)}>Baixar PDF</Botao>
        </> : null}>
        {respostaAberta ? (
          formId === 'avaliacao-substitutiva'
            ? <RevisaoAvaliacao data={respostaAberta.data as DadosAvaliacao} aoAbrirAnexo={provaId => abrirAnexo(respostaAberta, provaId)} carregandoAnexos={anexosCarregando} />
            : <RevisaoVisita data={respostaAberta.data as DadosVisita} />
        ) : null}
      </Modal>
    </div>
  );
}
```

- [ ] **Step 6: Registrar a rota em `client/src/rotas.tsx`**

Adicionar o import (junto aos outros de `@/app/formularios`):

```tsx
import { Formularios } from '@/app/formularios/Formularios';
import { Respostas } from '@/app/formularios/Respostas';
```

E trocar a entrada de `formularios` (hoje `{ path: 'formularios', element: <SoPapel papeis={['admin', 'secretaria', 'coordenacao']} />, children: [{ index: true, element: <Formularios /> }] }`) por:

```tsx
{ path: 'formularios', element: <SoPapel papeis={['admin', 'secretaria', 'coordenacao']} />, children: [
  { index: true, element: <Formularios /> },
  { path: 'respostas', element: <Respostas /> }
] },
```

- [ ] **Step 7: Atualizar `client/src/app/formularios/Formularios.tsx`**

Substituir o arquivo inteiro por:

```tsx
// /app/formularios — os formulários atuais, preservados (RF-FORM), agora
// acessíveis pelo painel. Wizards continuam em EJS até o Incremento B da
// F6; a tela de respostas já é React (Incremento A).
import { BotaoLink, Cabecalho, Card, Tag } from '@/componentes/ui';
import { Icone } from '@/componentes/Icones';

const FORMULARIOS = [
  {
    id: 'visitas' as const, nome: 'Cadastro de visitas', descricao: 'Wizard público · PDF automático · envio ao n8n',
    abrir: '/form-visitas', modelo: '/api/blank/visita/pdf'
  },
  {
    id: 'avaliacao-substitutiva' as const, nome: 'Avaliação substitutiva', descricao: 'Múltiplos alunos e provas · anexos até 8 MB',
    abrir: '/form-avaliacao-substitutiva', modelo: '/api/blank/avaliacao/pdf'
  }
];

export function Formularios() {
  return (
    <div className="wrap">
      <Cabecalho titulo="Formulários" descricao="Os formulários atuais continuam como estão — agora dentro do painel"
        acoes={<BotaoLink to="/app/formularios/respostas" icone="documento">Ver respostas</BotaoLink>} />
      <div className="grade g2">
        {FORMULARIOS.map(f => (
          <Card key={f.id} titulo={f.nome} descricao={f.descricao} acoes={<Tag tipo="ok" ponto>Ativo</Tag>}>
            <div className="acoes">
              <a className="btn btn-sm" href={f.abrir} target="_blank" rel="noopener"><Icone nome="externo" />Abrir formulário</a>
              <a className="btn btn-sm" href={f.modelo}><Icone nome="documento" />Modelo em branco (PDF)</a>
              <BotaoLink to={`/app/formularios/respostas?form=${f.id}`} variante="primario" pequeno>Respostas</BotaoLink>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: `npm run typecheck`**

Rode:

```bash
npm run typecheck
```

Esperado: sem erros (servidor e cliente).

- [ ] **Step 9: Verificação manual (use o skill `run` para subir a aplicação se ainda não estiver rodando)**

Com `npm run dev` e `npm run dev:client` rodando (ou `npm run build && npm start`), logado no painel como um usuário `admin` ou `secretaria`:

1. Abra `/app/formularios` — o botão "Ver respostas" no topo e o botão "Respostas" de cada card devem navegar **dentro do painel** (sem abrir nova aba) para `/app/formularios/respostas` (com `?form=` correto no caso dos cards).
2. Em `/app/formularios/respostas`, alterne entre os botões "Cadastro de visitas" e "Avaliação substitutiva" — a lista recarrega e a URL reflete `?form=`.
3. Se não houver nenhuma resposta real ainda para um dos formulários, envie uma de teste pelo próprio formulário público (`/form-visitas` ou `/form-avaliacao-substitutiva`) para ter pelo menos um registro em cada.
4. Clique em "Ver detalhes" numa resposta de **visita** — confira que todos os campos (aluno, escola, responsáveis, informações complementares) aparecem preenchidos corretamente, incluindo o badge Sim/Não de "Indicado por alguém".
5. Clique em "Ver detalhes" numa resposta de **avaliação substitutiva** — confira aluno(s), provas agrupadas por data, e que "Ver anexo" abre o arquivo numa nova aba (se a resposta de teste tiver anexo).
6. No modal, clique "Baixar PDF" — o download deve começar e o arquivo deve abrir normalmente.
7. No modal, clique "Enviar por WhatsApp" — deve aparecer um toast de sucesso (ou o erro esperado, se `N8N_WEBHOOK_URL`/`N8N_AVALIACAO_WEBHOOK_URL` não estiverem configurados no ambiente local — nesse caso confira que o toast de erro aparece com a mensagem do servidor, sem travar a tela).
8. Confirme que um papel `leitura` **não** vê `/app/formularios` no menu e recebe a tela de "Sem permissão" ao acessar a URL direto (mesmo comportamento de antes — `SoPapel` não mudou).

- [ ] **Step 10: Commit**

```bash
git add client/src/componentes/ui.tsx client/src/estilos/global.css client/src/api/cliente.ts client/src/app/formularios/RevisaoResposta.tsx client/src/app/formularios/Respostas.tsx client/src/rotas.tsx client/src/app/formularios/Formularios.tsx
git commit -m "$(cat <<'EOF'
feat: tela de respostas em React (/app/formularios/respostas)

Incremento A da F6: lista + modal de detalhe (PDF, WhatsApp, anexo de
prova) dentro do painel, reaproveitando os endpoints /api/responses*
sem nenhuma mudança de backend. A formatação de public/js/review-renderer.js
é portada para RevisaoResposta.tsx usando só os primitivos do painel
(Card, CampoLeitura, Tag) — sem depender de FontAwesome nem das classes
.review-* do site público.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Aposentar as páginas EJS antigas

**Files:**
- Delete: `views/index.ejs`
- Delete: `views/respostas.ejs`
- Delete: `public/js/respostas.js`
- Delete: `public/js/index.js`
- Delete: `public/js/auth-gate.js`

**Interfaces:**
- Consumes: nada — esta tarefa só remove arquivos que, depois das Tasks 1 e 2, não são mais referenciados por nenhuma rota (`routes/pages.js`) nem por nenhum outro `.ejs` (`views/form-visitas.ejs`, `views/form-avaliacao.ejs`, `views/pdf-*.ejs` usam `public/js/main.js` e `public/js/review-renderer.js`, não os quatro arquivos acima).
- Produces: nada consumido por tarefa futura — fim da migração desta fatia.

- [ ] **Step 1: Confirmar que nada mais referencia os arquivos antes de apagar**

```bash
grep -rn "index\.js\|respostas\.js\|auth-gate\.js" views/*.ejs
```

Esperado: **nenhum resultado** (depois da Task 2, `routes/pages.js` não usa mais `views/index.ejs` nem `views/respostas.ejs`, e são essas duas views as únicas que carregavam esses três scripts).

- [ ] **Step 2: Apagar os arquivos**

```bash
git rm views/index.ejs views/respostas.ejs public/js/respostas.js public/js/index.js public/js/auth-gate.js
```

- [ ] **Step 3: `npm run typecheck` e verificação manual completa**

```bash
npm run typecheck
```

Esperado: sem erros.

Suba a aplicação de novo (`npm run dev` + `npm run dev:client`, ou `npm run build && npm start`) e repita os passos 1–8 da verificação manual da Task 2 — nada deve ter mudado de comportamento, já que os arquivos apagados não eram mais referenciados. Confirme adicionalmente:

- `GET /` retorna 302 para `/app` (Task 1, sem regressão).
- `GET /respostas` e `GET /respostas?form=avaliacao-substitutiva` retornam 302 para `/app/formularios/respostas` (com/sem `?form=`).
- `GET /form-visitas` e `GET /form-avaliacao-substitutiva` continuam servindo os wizards normalmente (`200`, formulário abre e envia).

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
chore: aposentar views/index.ejs e views/respostas.ejs

Fecha o Incremento A da F6: as duas páginas EJS que só serviam pra o
gate de login + formulários/respostas fora do painel não são mais
referenciadas por nenhuma rota depois do redirect (Task 1) e da nova
tela React (Task 2). public/js/auth-gate.js, index.js e respostas.js
eram usados só por elas.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review (checked while writing this plan)

**Cobertura da spec:** rotas/redirects (§3.1 → Task 1), componentes novos e ações (§3.2/§3.3 → Task 2), tratamento de erro (§4 → toasts/EstadoVazio em Task 2), verificação (§5 → passos manuais em cada task), aposentadoria de arquivos (§2 → Task 3). Nenhum item do Incremento A ficou sem tarefa.

**Consistência de tipos:** `DadosVisita`/`DadosAvaliacao`/`ProvaAvaliacao` definidos uma vez em `RevisaoResposta.tsx` e importados (não redefinidos) em `Respostas.tsx`. `CampoLeitura` e `baixarArquivo` têm assinatura única, usada igual nos dois arquivos que os consomem. `FormId` só existe em `Respostas.tsx` (não precisa ser compartilhado — `Formularios.tsx` usa os literais `'visitas'`/`'avaliacao-substitutiva'` diretamente, como já fazia antes).

**Placeholders:** nenhum — todo step tem código completo, comandos exatos e resultado esperado por extenso.
