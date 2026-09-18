// Entrada do servidor (substitui server.js). Express 4 mantido (D5);
// TypeScript com migração incremental — routes/*.js e lib/*.js antigos
// continuam em JS e são importados daqui (allowJs).
import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';

import pagesRouter from '../routes/pages';
import apiRouter from '../routes/api';
import pdfRouter from '../routes/pdf';

import { painelRouter } from './rotas/painel';
import { usuariosRouter } from './rotas/usuarios';
import { instituicaoRouter } from './rotas/instituicao';
import { anosLetivosRouter } from './rotas/anos-letivos';
import { cadastrosRouter } from './rotas/cadastros';
import { versoesRouter } from './rotas/versoes';
import { importacoesRouter } from './rotas/importacoes';
import { alunosRouter } from './rotas/alunos';

const RAIZ = path.resolve(__dirname, '..');
const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(RAIZ, 'views'));
app.disable('x-powered-by');

// Limite maior que o default (100kb) por causa do formulário de avaliação
// substitutiva, que envia os anexos em base64 dentro do próprio JSON —
// ver POST /api/avaliacoes em routes/api.js.
app.use(express.json({ limit: '40mb' }));
app.use(cookieParser(process.env.COOKIE_SECRET || 'csm-forms-dev-secret'));
app.use(express.static(path.join(RAIZ, 'public')));

/* ---------- API ---------- */
// Módulos novos do painel (TypeScript, autorização por papel)
app.use('/api/painel', painelRouter);
app.use('/api/usuarios', usuariosRouter);
app.use('/api/instituicao', instituicaoRouter);
app.use('/api/anos-letivos', anosLetivosRouter);
app.use('/api/cadastros', cadastrosRouter);
app.use('/api/versoes', versoesRouter);
app.use('/api/importacoes', importacoesRouter);
app.use('/api/alunos', alunosRouter);
// Módulo original (auth, formulários, respostas, PDFs)
app.use('/api', apiRouter);
app.use(pdfRouter);

/* ---------- Painel React (client/dist) ---------- */
// Em produção o Vite gera client/dist; o Express serve os estáticos em
// /app e devolve index.html para qualquer rota do SPA (React Router).
// Em desenvolvimento use `npm run dev:client` (Vite em :5173 com proxy).
const DIST = path.join(RAIZ, 'client', 'dist');
const distExiste = fs.existsSync(path.join(DIST, 'index.html'));
if (distExiste) {
  app.use('/app', express.static(DIST, { index: false, maxAge: '1y', immutable: true, setHeaders(res, file) {
    if (file.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
  } }));
  app.get(['/app', '/app/*'], (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(DIST, 'index.html'));
  });
} else {
  app.get(['/app', '/app/*'], (_req, res) => {
    res.status(503).type('html').send(
      '<!doctype html><meta charset="utf-8"><title>Painel não compilado</title>' +
      '<body style="font-family:Inter,system-ui,sans-serif;padding:40px;max-width:640px;line-height:1.6">' +
      '<h1 style="font-size:20px">Painel ainda não foi compilado</h1>' +
      '<p>Rode <code>npm run build</code> para gerar <code>client/dist</code>, ou em desenvolvimento ' +
      'rode <code>npm run dev:client</code> e acesse <a href="http://localhost:5173/app/">http://localhost:5173/app/</a>.</p></body>'
    );
  });
}

app.use('/', pagesRouter);

// Erro do body-parser (ex: JSON acima do limite configurado).
app.use((err: { type?: string }, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Os anexos deste requerimento são grandes demais para serem enviados de uma vez. Tente reduzir o tamanho dos arquivos (fotos em vez de scans em alta resolução, por exemplo) ou envie menos avaliações por vez.'
    });
  }
  next(err);
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}` + (distExiste ? ' · painel em /app' : ' · painel não compilado (npm run build)'));
});
