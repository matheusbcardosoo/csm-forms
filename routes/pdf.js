'use strict';
const express = require('express');
const { getServiceClient } = require('../lib/supabase');
const { shapeVisitaRow } = require('../lib/visita');

const router = express.Router();

/* ================================================================
   Rota interna, sem UI — usada apenas pelo Puppeteer (lib/pdf.js)
   pra renderizar o HTML que vira PDF. Nunca deve ser chamada pelo
   navegador do usuario: fica protegida por um token compartilhado
   (INTERNAL_PDF_SECRET) que so o proprio servidor conhece.
   ================================================================ */
router.get('/internal/pdf/visita/:id', async (req, res) => {
  const secret = process.env.INTERNAL_PDF_SECRET;
  if (!secret || req.query.token !== secret) {
    return res.status(403).send('Forbidden');
  }

  try {
    const client = getServiceClient();
    const { data: row, error } = await client
      .from('visita_respostas')
      .select('*, visita_alunos(*)')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!row) return res.status(404).send('Visita não encontrada.');

    const visita = shapeVisitaRow(row);
    res.render('pdf-visita', { data: visita.data, submittedAt: visita.submittedAt });
  } catch (err) {
    res.status(500).send('Erro ao renderizar PDF: ' + err.message);
  }
});

module.exports = router;
