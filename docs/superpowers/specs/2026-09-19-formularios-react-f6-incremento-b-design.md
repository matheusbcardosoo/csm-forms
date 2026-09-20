# F6 — Formulários em React (Incremento B)

**Status:** aprovado para planejamento (esta spec). Ainda não implementado.

## 1. Contexto

O Incremento A (`docs/superpowers/specs/2026-09-19-formularios-react-f6-design.md`, já implementado e mantido em `feat/secretaria-digital`) migrou a tela de respostas (`/app/formularios/respostas`, atrás de login institucional) para React, dentro do bundle do painel. Ele deixou explicitamente de fora os dois wizards públicos — `/form-visitas` e `/form-avaliacao-substitutiva` — por serem preenchidos por gente sem conta no sistema (pais, visitantes), com um perfil de risco e de audiência bem diferente do painel.

Este Incremento B fecha essa lacuna: migra os dois wizards públicos para React, num **segundo bundle Vite, separado do painel**, e conclui a aposentadoria de `public/js/review-renderer.js` (que o Incremento A só parou de usar em `respostas.ejs`/`index.ejs`, mas manteve vivo dentro dos próprios wizards).

**Conflito de documentação encontrado e resolvido:** `docs/02-arquitetura.md` §2/§2.2 descrevia uma visão anterior de **um único** React Router cobrindo `/app/*` e `/form/*` num bundle só, com as rotas nomeadas `/form/*` (nunca implementadas — as rotas reais sempre foram `/form-visitas` e `/form-avaliacao-substitutiva`). Essa visão é anterior à do documento acima (2026-09-19), que já raciocinou explicitamente sobre a diferença de audiência e decidiu por dois bundles separados. Esta spec trata `02-arquitetura.md` como desatualizado nesse ponto — ver Tarefa de atualização de docs, §3.7.

## 2. Escopo

- Migrar `/form-visitas` (5 passos: aluno(s) → escola → responsáveis → complementares → revisão+envio) e `/form-avaliacao-substitutiva` (2 passos: aluno(s)+provas → revisão+envio) para React, num bundle público novo e independente do painel.
- Portar a lógica de `public/js/wizard.js`, `public/js/wizard-avaliacao.js`, `public/js/policy-modal.js` e a parte de `public/js/review-renderer.js` usada dentro dos próprios wizards (a outra parte, usada por `respostas.ejs`/`index.ejs`, já foi substituída no Incremento A).
- Criar o componente `Assistente` (aqui, o hook `useAssistente`) mencionado em `docs/04-telas-e-navegacao.md` §4 como reaproveitável pelo futuro assistente de emissão de histórico (F5, `/app/alunos/:id/historico/novo`) — **sem implementar esse assistente agora**: F5 hoje é só um placeholder (`client/src/app/historicos/Historicos.tsx`), fora de escopo.
- Retirar, ao final: `views/form-visitas.ejs`, `views/form-avaliacao.ejs`, `public/js/wizard.js`, `public/js/wizard-avaliacao.js`, `public/js/policy-modal.js`, `public/js/review-renderer.js`, `public/js/main.js`.
- Atualizar `docs/02-arquitetura.md` (§2/§2.2) e `README.md` pra refletir a arquitetura real de dois bundles.
- **Nenhuma mudança de backend.** `POST /api/responses`, `POST /api/avaliacoes`, `GET /api/blank/visita/pdf`, `GET /api/blank/avaliacao/pdf` (todos em `routes/api.js`) continuam exatamente como estão — só troca quem monta o payload e faz a chamada.
- **Fora de escopo:** o assistente de emissão de histórico (F5) em si; qualquer mudança visual/de UX nos wizards (a ideia é portar comportamento, não redesenhar); qualquer mudança em `lib/pdf.js` ou nas views `pdf-*.ejs` (Puppeteer, server-side, não afetado).

## 3. Design detalhado

### 3.1 Dois bundles Vite, ambos dentro de `client/`

- `client/vite.config.ts` (existente, painel, `/app/*`, saída `client/dist`) — **sem mudança**.
- `client/vite.formularios.config.ts` (novo) — usa o suporte nativo do Vite a **multi-page build** (dois `input` HTML, sem `react-router-dom` nem nenhuma outra biblioteca de rotas): `client/formularios/visita.html` e `client/formularios/avaliacao.html`, cada um montando sua própria raiz React independente. `base: '/assets-formularios/'` (não colide com `/js`, `/css`, `/images` de `public/`, nem com `/app/` do painel). Saída em `client/dist-formularios/` (entra no `.gitignore`, ao lado de `client/dist/`).

Cada página é um mini-app fechado: quem abre `/form-visitas` nunca baixa código do wizard de avaliação nem do painel administrativo — esse era o motivo original (spec do Incremento A, §2) pra separar os bundles.

**CSS e ícones não migram.** Os dois HTMLs novos carregam `/css/styles.css` (arquivo estático existente, sem mudança) e o FontAwesome via `<link>` de CDN — exatamente como as `.ejs` atuais. Isso reduz bastante o escopo: só o *comportamento* (wizard, validação, revisão, envio) vira React; a aparência não muda em nada, e não há trabalho de portar CSS pro bundle.

### 3.2 Como o Express serve os dois bundles

- `server/index.ts` ganha um bloco análogo ao do painel: `express.static('client/dist-formularios', {index:false, maxAge:'1y', immutable:true})` montado em `/assets-formularios`, mais uma resposta de "ainda não compilado" equivalente à do painel se o build não existir.
- Em `routes/pages.js`, as rotas que hoje fazem `res.render('form-visitas')` / `res.render('form-avaliacao')` passam a fazer `res.sendFile(.../visita.html)` / `res.sendFile(.../avaliacao.html)`, com `Cache-Control: no-cache` no HTML (igual ao `index.html` do painel). **As URLs continuam exatamente `/form-visitas` e `/form-avaliacao-substitutiva`** — não mudam, por serem compartilhadas externamente (WhatsApp, materiais impressos).
- Em desenvolvimento, mesmo padrão que o painel já usa: um novo script `dev:client:formularios` sobe o Vite dev server desse config numa porta própria (ex.: 5174), com proxy pra `/api`; o desenvolvedor acessa `http://localhost:5174/visita.html` direto, sem passar pelo Express. `npm run build` passa a rodar os dois builds (painel + formulários) em sequência.

### 3.3 `useAssistente` — hook compartilhado, deliberadamente burro

```ts
// client/src/compartilhado/useAssistente.ts
function useAssistente(totalPassos: number) {
  // passo, totalPassos, podeVoltar, podeAvancar (limite estrutural 1..totalPassos,
  // não validação de negócio), voltar(), avancar(), irPara(n)
}
```

A validação de cada passo (nomes, telefones, alunos dinâmicos, provas por data) é específica demais pra generalizar — e nem deveria: o futuro assistente de histórico (F5) terá passos de domínio completamente diferente. Por isso o hook só guarda "em que passo estou" e os limites estruturais; cada wizard decide quando chamar `avancar()`, só depois de validar o passo atual localmente. Isso o mantém genuinamente reaproveitável pelo F5 sem acoplar nada de "aluno"/"prova" a ele.

**Duas pastas de código compartilhado, sem forçar reuso onde não existe:**

- **`client/src/compartilhado/`** — usado pelos **dois bundles** (painel e formulários), porque os dois precisam hoje: `useAssistente.ts` e `avaliacaoRevisao.ts` (função pura de agrupar provas por data + dedup de anexo — ver §3.5).
- **`client/formularios/comum/`** — usado só entre os **dois mini-apps públicos**, porque só eles precisam: validadores (`isFullName`, `isValidPhone`, `maskPhoneBR`, portados de `wizard.js`), `fileToBase64` (portado de `wizard-avaliacao.js`), `PoliticaModal.tsx` (porta de `policy-modal.js`), `CascoWizard.tsx` (o casco visual do wizard — stepper com FontAwesome, botões voltar/próximo — que usa `useAssistente` por baixo) e `TelaSucesso.tsx`.

Ambos os `vite.config.ts` (painel e formulários) apontam um alias `@compartilhado` pra `client/src/compartilhado/`.

### 3.4 Mapeamento dos wizards

```
client/formularios/
├── visita.html
├── visita/
│   ├── main.tsx                    monta a raiz React
│   ├── AssistenteVisita.tsx        usa useAssistente(5); orquestra os 5 passos + submit
│   ├── PassoAluno.tsx
│   ├── PassoEscola.tsx
│   ├── PassoResponsaveis.tsx
│   ├── PassoComplementares.tsx     um componente por passo, validação local
│   └── RevisaoVisitaPublica.tsx    apresentação da revisão (.review-*/FontAwesome)
├── avaliacao.html
├── avaliacao/
│   ├── main.tsx
│   ├── AssistenteAvaliacao.tsx     usa useAssistente(2)
│   ├── PassoAlunosEProvas.tsx      alunos dinâmicos + provas por data + upload de anexo
│   └── RevisaoAvaliacaoPublica.tsx usa @compartilhado/avaliacaoRevisao
└── comum/
    ├── validadores.ts
    ├── arquivo.ts
    ├── PoliticaModal.tsx
    ├── CascoWizard.tsx
    └── TelaSucesso.tsx             link "voltar ao início" recarrega a própria página
                                      (mesmo comportamento de hoje — nunca navega pra
                                      fora do formulário)
```

`POST /api/responses` e `POST /api/avaliacoes` continuam idênticos — só troca quem monta o payload e faz o `fetch`.

### 3.5 Etapa de revisão pré-envio: extração da lógica compartilhada

`public/js/review-renderer.js` deixa de existir por completo (o Incremento A só tinha parado de usá-lo em `respostas.ejs`/`index.ejs`; a parte usada dentro dos próprios wizards, antes do envio, precisa ser portada agora — não tem como ficar "meio viva" depois que `wizard.js`/`wizard-avaliacao.js` forem apagados, já que são eles que a chamam).

A lógica de agrupar provas de avaliação substitutiva por data e deduplicar anexos já foi portada **uma vez** no Incremento A, dentro de `RevisaoResposta.tsx` (painel). Em vez de portá-la de novo (duplicando uma lógica não-trivial) ou deixá-la só no painel (o wizard público também precisa dela), ela é **extraída** para `client/src/compartilhado/avaliacaoRevisao.ts` como função pura, e `RevisaoResposta.tsx` passa a importar dali — retrofit puro de extração, sem mudar comportamento do que já está em produção.

**Risco a resolver no plano de implementação (não nesta spec):** a revisão do painel opera sobre o formato já salvo no banco (`anexo: {path, nome, tipo}`, vindo de `lib/avaliacao.js`), enquanto a revisão pública opera sobre o estado local do formulário *antes* do envio (`anexo` pode ser um `File` do navegador, ainda não convertido pra base64). A função extraída precisa ser genérica o bastante pra funcionar nos dois formatos — por exemplo, recebendo uma função pequena que extrai `{nome, tipo}` de qualquer que seja a forma do anexo, em vez de assumir os nomes de campo do formato salvo. Deixar essa interface exata pro plano de implementação decidir.

### 3.6 Retirada final

Depois de tudo migrado e verificado (checklist em §5): apagar `views/form-visitas.ejs`, `views/form-avaliacao.ejs`, `public/js/wizard.js`, `public/js/wizard-avaliacao.js`, `public/js/policy-modal.js`, `public/js/review-renderer.js`, `public/js/main.js`. Este último pode ser apagado por inteiro: depois desta migração, nenhuma das suas funções (`formatDate*`, `escapeHtml`, `FORMS`, `getForm`, `renderFormList`) tem mais chamador — a revisão final do Incremento A já tinha marcado esse arquivo como tendo código morto por essa razão exata (`renderFormList`/`getForm` só eram chamados pelos arquivos que o Incremento A já apagou).

### 3.7 Atualização de documentação

- `docs/02-arquitetura.md` §2 (diagrama) e §2.2 (estrutura de diretórios): trocar a visão de bundle único/`react-router` cobrindo `/form/*` pela arquitetura real de dois bundles Vite independentes descrita aqui, com os nomes de rota reais (`/form-visitas`, `/form-avaliacao-substitutiva`).
- `README.md`: status da fase F6 passa a refletir wizards também migrados (a linha já foi ajustada uma vez, no Incremento A, pra "🟡 respostas em React; wizards ainda em EJS" — volta a ser revisada quando este incremento for implementado).

## 4. Tratamento de erro

Mesmo padrão de hoje, portado como está — sem introduzir nada novo:

- Validação por passo: mensagens inline nos campos, exatamente como em `wizard.js`/`wizard-avaliacao.js` hoje (não há padrão de toast aqui — os formulários públicos não têm o `useToast` do painel, e não faz sentido importar essa dependência só pra isso).
- Falha no envio (`POST /api/responses` ou `/api/avaliacoes`): mensagem de erro visível, sem travar a tela, botões voltam ao estado normal — mesmo comportamento de hoje.
- Sucesso: troca a tela inteira pela tela de sucesso, sem navegar pra outra URL.
- Sem sessão/autenticação envolvida — estes formulários nunca tiveram gate de login, e isso não muda.

## 5. Verificação

Sem framework de testes automatizados (nenhuma fase do projeto tem). Diferente do Incremento A, aqui **não há obstáculo de credenciais de login** — os formulários são públicos, então a verificação abaixo pode ser feita ponta a ponta:

1. `/form-visitas` e `/form-avaliacao-substitutiva` abrem com aparência **idêntica** à de hoje (mesmo CSS, ícones, layout).
2. Navegação entre passos: avançar bloqueado por campo inválido, voltar sempre livre, stepper atualiza corretamente nos dois wizards.
3. Alunos dinâmicos (visita) e provas dinâmicas por data com anexo (avaliação) — adicionar/remover funciona; só a data mais antiga de cada aluno exige anexo (as demais ficam opcionais).
4. Upload de anexo converte pra base64 e chega certo no payload (conferir no Network do navegador).
5. Tela de revisão final mostra os mesmos dados/formatação de hoje nos dois wizards.
6. Checkbox de consentimento LGPD bloqueia o envio até ser marcado.
7. Envio: sucesso troca pra tela de sucesso; erro mostra mensagem sem travar a tela.
8. Depois de um envio de visita bem-sucedido, conferir no log do servidor que `notifyN8n` foi disparado (mesmo tratamento do Incremento A pro WhatsApp: se o webhook não estiver configurado localmente, só confirmar que o erro fica só no log).
9. Modal de política de privacidade abre e fecha (X, botão, clique fora, ESC).
10. `/api/blank/visita/pdf` e `/api/blank/avaliacao/pdf` (fora de escopo) continuam funcionando sem mudança.
11. O painel (`/app/*`) continua idêntico — nenhuma regressão por causa do novo bundle ou do retrofit em `RevisaoResposta.tsx`.
12. `npm run typecheck` limpo; `npm run build` gera **os dois** bundles (`client/dist` e `client/dist-formularios`) sem erro.
13. Depois de apagar os arquivos antigos: grep confirmando que nada mais referencia `wizard.js`, `wizard-avaliacao.js`, `policy-modal.js`, `review-renderer.js`, `main.js`.
14. Inspecionar os arquivos gerados em `client/dist-formularios/assets/` — nenhum deve conter código do painel (confirma que os bundles são de fato independentes).
15. `docs/02-arquitetura.md` e `README.md` batendo com a implementação real.

## 6. Riscos e decisões em aberto

- **Interface exata de `avaliacaoRevisao.ts`** (§3.5) — a função extraída precisa abstrair a diferença entre o formato salvo (`anexo: {path,nome,tipo}`) e o formato local pré-envio (`anexo` pode ser um `File`). Decisão de design (ex.: parâmetro extrator, ou dois tipos com um adaptador) fica para o plano de implementação.
- **Sem teste automatizado** — risco aceito, consistente com o resto do projeto.
- **`docs/02-arquitetura.md` estava desatualizado** neste ponto específico (bundle único vs. dois bundles, `/form/*` vs. rotas reais) — corrigido como parte desta spec (§3.7). Vale conferir se há outras seções desse documento com o mesmo tipo de deriva, mas isso é fora do escopo desta spec.
- **`useAssistente` não é validado contra um segundo caso de uso real ainda** — o design foi pensado pra ser genérico o bastante pro futuro assistente de histórico (F5), mas F5 não existe ainda, então essa reusabilidade é uma aposta informada (baseada em `docs/04-telas-e-navegacao.md` §3.4), não uma certeza testada. Se quando F5 for construído o hook precisar de ajustes, isso é esperado e não invalida o design de hoje.
