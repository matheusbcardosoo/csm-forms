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
// substitutiva, que envia o anexo (atestado/comprovante) em base64 dentro
// do próprio JSON — ver POST /api/avaliacoes em routes/api.js.
app.use(express.json({ limit: '12mb' }));
app.use(cookieParser(process.env.COOKIE_SECRET || 'csm-forms-dev-secret'));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', apiRouter);
app.use(pdfRouter);
app.use('/', pagesRouter);

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
