'use strict';
require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const pagesRouter = require('./routes/pages');
const apiRouter = require('./routes/api');
const pdfRouter = require('./routes/pdf');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Limite maior que o default (100kb) por causa do formulário de avaliação
// substitutiva, que envia os anexos (atestado/comprovante) em base64 dentro
// do próprio JSON — ver POST /api/avaliacoes em routes/api.js. Desde que o
// formulário passou a aceitar múltiplos alunos e até 3 avaliações por aluno,
// um requerimento pode carregar vários anexos de até 8MB cada na mesma
// requisição (8MB em base64 ≈ 11MB) — 12mb ficou curto e passou a estourar
// o limite, derrubando a conexão em vez de dar um erro claro.
app.use(express.json({ limit: '40mb' }));
app.use(cookieParser(process.env.COOKIE_SECRET || 'csm-forms-dev-secret'));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', apiRouter);
app.use(pdfRouter);
app.use('/', pagesRouter);

// Erro do body-parser (ex: JSON acima do limite configurado) — sem isso,
// o Express derruba a conexão sem resposta e o navegador só mostra
// "Failed to fetch"/conexão resetada, sem explicar o motivo real.
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Os anexos deste requerimento são grandes demais para serem enviados de uma vez. Tente reduzir o tamanho dos arquivos (fotos em vez de scans em alta resolução, por exemplo) ou envie menos avaliações por vez.'
    });
  }
  next(err);
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
