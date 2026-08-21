'use strict';
const express = require('express');
const router = express.Router();
const { resolveSession } = require('../lib/auth');

// '/' e '/respostas' são as duas páginas protegidas pelo gate de login
// (staff_emails). Resolvemos o estado de autenticação aqui, no servidor,
// ANTES de chamar res.render — assim o HTML já sai com o painel certo
// (login, troca de senha, acesso negado ou conteúdo) e o navegador nunca
// chega a pintar a tela de login para quem já está autenticado.
//
// Antes, cada página sempre nascia mostrando o gate por padrão e só trocava
// pro conteúdo depois que o navegador, já carregado, disparava um fetch pra
// /api/auth/session e esperava a volta — daí o "flash". Ver public/js/auth-gate.js
// para como o client usa esse estado inicial em vez de refazer esse fetch.
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
