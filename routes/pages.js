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
