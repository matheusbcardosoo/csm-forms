'use strict';
const { renderVisitaPdf } = require('./pdf');
const { getServiceClient } = require('./supabase');
const { shapeVisitaRow, driveFileName, visitaYear } = require('./visita');

// Gera o PDF da visita e envia pro Webhook do n8n como multipart/form-data,
// ja com o nome de arquivo, o ano e os alunos prontos — o workflow no n8n
// so consome o que chega, sem recalcular nome/ano nem buscar alunos de novo
// no Supabase (a API e a unica fonte de verdade pra essas regras).
//
// Campos enviados:
//   visitaId      - id da visita (texto)
//   driveFileName - "Nome do Aluno - dd-mm-yyyy.pdf", pronto pro Drive
//   visitaYear    - "2026", pra achar/criar a pasta do ano no Drive
//   escolaNome    - nome da escola de origem
//   alunos        - JSON com [{ nome, nascimento, turma }, ...]
//   file          - binario do PDF
//
// Se N8N_WEBHOOK_URL nao estiver configurada, a integracao fica desligada
// silenciosamente (nao quebra o cadastro da visita). Qualquer erro aqui
// deve ser tratado pelo chamador com .catch() — nunca deve derrubar a
// resposta ao visitante que preencheu o formulario.
async function notifyN8n(visitaId) {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (!webhookUrl) return;

  const baseUrl = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

  const client = getServiceClient();
  const { data: row, error } = await client
    .from('visita_respostas')
    .select('*, visita_alunos(*)')
    .eq('id', visitaId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error(`Visita ${visitaId} não encontrada para notificar o n8n`);

  const visita = shapeVisitaRow(row);
  const fileName = driveFileName(visita);

  const pdfBuffer = await renderVisitaPdf({
    baseUrl,
    visitaId,
    internalToken: process.env.INTERNAL_PDF_SECRET
  });

  const form = new FormData();
  form.append('visitaId', visita.id);
  form.append('driveFileName', fileName);
  form.append('visitaYear', visitaYear(visita));
  form.append('escolaNome', visita.data.escola.nome || '');
  form.append('alunos', JSON.stringify(visita.data.students));
  form.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), fileName);

  const res = await fetch(webhookUrl, { method: 'POST', body: form });
  if (!res.ok) {
    throw new Error(`Webhook do n8n respondeu ${res.status} ${res.statusText}`);
  }
}

module.exports = { notifyN8n };
