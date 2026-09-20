'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');
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
router.get('/politica-privacidade', (_req, res) => res.render('politica-privacidade'));

module.exports = router;
