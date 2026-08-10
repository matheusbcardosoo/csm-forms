'use strict';
const express = require('express');
const { getServiceClient } = require('../lib/supabase');
const { shapeVisitaRow } = require('../lib/visita');
const { shapeAvaliacaoRow } = require('../lib/avaliacao');

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

/* ================================================================
   Rota interna do modelo de ficha EM BRANCO — mesma logica de acesso
   da rota acima (token compartilhado, nunca chamada pelo navegador do
   usuario), so que sem consulta ao banco: e um HTML estatico.
   ================================================================ */
router.get('/internal/pdf/visita-blank', (req, res) => {
  const secret = process.env.INTERNAL_PDF_SECRET;
  if (!secret || req.query.token !== secret) {
    return res.status(403).send('Forbidden');
  }
  res.render('pdf-visita-blank');
});

/* ================================================================
   Mesma logica das rotas acima, so que pro requerimento de avaliacao
   substitutiva — agora com varios alunos, cada um com varias provas. Pra
   cada prova cujo anexo (atestado/comprovante) e uma imagem, ela e baixada
   do Storage e embutida como data URL — assim o PDF final ja mostra uma
   previa do documento anexado, sem precisar de outra requisicao. Anexos em
   PDF nao sao reincorporados aqui (embutir um PDF dentro de outro via HTML
   nao e viavel); a prova so referencia o nome do arquivo nesse caso.
   ================================================================ */
router.get('/internal/pdf/avaliacao/:id', async (req, res) => {
  const secret = process.env.INTERNAL_PDF_SECRET;
  if (!secret || req.query.token !== secret) {
    return res.status(403).send('Forbidden');
  }

  try {
    const client = getServiceClient();
    const { data: row, error } = await client
      .from('avaliacao_substitutiva_respostas')
      .select('*, avaliacao_substitutiva_alunos(*, avaliacao_substitutiva_provas(*))')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!row) return res.status(404).send('Requerimento não encontrado.');

    const avaliacao = shapeAvaliacaoRow(row);

    // Baixa e embute (data URL) só as provas com anexo de imagem, mapeadas
    // por provaId pra view achar cada uma na hora de montar os cards.
    const anexoDataUrls = {};
    for (const aluno of avaliacao.data.alunos) {
      for (const prova of aluno.provas) {
        if (!prova.anexo.tipo || !prova.anexo.tipo.startsWith('image/')) continue;
        const { data: blob, error: downloadError } = await client.storage
          .from('avaliacao-anexos')
          .download(prova.anexo.path);
        if (!downloadError && blob) {
          const buffer = Buffer.from(await blob.arrayBuffer());
          anexoDataUrls[prova.id] = `data:${prova.anexo.tipo};base64,${buffer.toString('base64')}`;
        }
      }
    }

    res.render('pdf-avaliacao', {
      data: avaliacao.data,
      submittedAt: avaliacao.submittedAt,
      anexoDataUrls
    });
  } catch (err) {
    res.status(500).send('Erro ao renderizar PDF: ' + err.message);
  }
});

router.get('/internal/pdf/avaliacao-blank', (req, res) => {
  const secret = process.env.INTERNAL_PDF_SECRET;
  if (!secret || req.query.token !== secret) {
    return res.status(403).send('Forbidden');
  }
  res.render('pdf-avaliacao-blank');
});

module.exports = router;
