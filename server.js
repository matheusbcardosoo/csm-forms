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

app.use(express.json());
app.use(cookieParser(process.env.COOKIE_SECRET || 'csm-forms-dev-secret'));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', apiRouter);
app.use(pdfRouter);
app.use('/', pagesRouter);

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
