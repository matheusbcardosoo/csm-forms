'use strict';
const { renderVisitaPdf, renderAvaliacaoPdf } = require('./pdf');
const { getServiceClient } = require('./supabase');
const { shapeVisitaRow, driveFileName, visitaYear } = require('./visita');
const {
  shapeAvaliacaoRow,
  driveFileName: avaliacaoDriveFileName,
  provaAnexoDriveFileName,
  avaliacaoYear
} = require('./avaliacao');

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

// Mesma ideia de notifyN8n() acima, so que pro requerimento de avaliacao
// substitutiva — que agora pode ter mais de um aluno e, pra cada aluno,
// mais de uma prova perdida. Gera o PDF completo do requerimento (todos os
// alunos/provas — o unico arquivo que vai fisicamente pro Drive, como
// registro institucional). Os anexos (atestado/comprovante) NAO sao
// reenviados nem reupados pro n8n: eles já ficam no Storage do Supabase
// desde o envio do formulário (e o PDF completo já traz uma prévia de cada
// anexo que é imagem — ver views/pdf-avaliacao.ejs), então basta gerar uma
// URL assinada temporária por prova e deixar o proprio n8n/WAHA buscar o
// arquivo direto de lá. O workflow no n8n é quem agrupa as provas por
// segmento e decide o que mandar pra cada coordenação — cada uma só recebe
// o que é dela.
//
// Campos enviados (multipart/form-data):
//   avaliacaoId    - id do requerimento (texto)
//   driveFileName  - "Aluno(s) - Avaliação Substitutiva - dd-mm-yyyy.pdf"
//   avaliacaoYear  - "2026", pra achar/criar a pasta do ano no Drive
//   provas         - JSON com uma entrada por prova (de todos os alunos):
//                    [{ alunoNome, alunoTurma, disciplina, segmento, data,
//                       motivoTipo, observacoes, anexoFileName, anexoUrl }, ...]
//                    anexoUrl é uma URL assinada do Storage, válida por 1h.
//   file           - binario do PDF completo do requerimento (único binário)
//
// Se N8N_AVALIACAO_WEBHOOK_URL nao estiver configurada, a integracao fica
// desligada silenciosamente — mesmo comportamento de notifyN8n().
async function notifyN8nAvaliacao(avaliacaoId) {
  const webhookUrl = process.env.N8N_AVALIACAO_WEBHOOK_URL;
  if (!webhookUrl) return;

  const baseUrl = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

  const client = getServiceClient();
  const { data: row, error } = await client
    .from('avaliacao_substitutiva_respostas')
    .select('*, avaliacao_substitutiva_alunos(*, avaliacao_substitutiva_provas(*))')
    .eq('id', avaliacaoId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error(`Requerimento ${avaliacaoId} não encontrado para notificar o n8n`);

  const avaliacao = shapeAvaliacaoRow(row);
  const fileName = avaliacaoDriveFileName(avaliacao);

  const pdfBuffer = await renderAvaliacaoPdf({
    baseUrl,
    avaliacaoId,
    internalToken: process.env.INTERNAL_PDF_SECRET
  });

  const form = new FormData();
  form.append('avaliacaoId', avaliacao.id);
  form.append('driveFileName', fileName);
  form.append('avaliacaoYear', avaliacaoYear(avaliacao));
  form.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), fileName);

  // Achata alunos[].provas[] numa lista única — cada prova é uma unidade
  // independente pro n8n (é ela quem carrega o segmento).
  //
  // O anexo agora é por DATA, não por prova (ver public/js/wizard-avaliacao.js):
  // apenas o documento da data mais antiga de cada aluno é obrigatório, os
  // demais são opcionais. Por isso prova.anexo.path pode vir null aqui — só
  // gera URL assinada quando existe, senão o n8n recebe anexoUrl: null.
  const provasPayload = [];
  for (const aluno of avaliacao.data.alunos) {
    for (const prova of aluno.provas) {
      let anexoFileName = null;
      let anexoUrl = null;
      if (prova.anexo && prova.anexo.path) {
        anexoFileName = provaAnexoDriveFileName(avaliacao, aluno.nome, prova);
        const { data: signedData, error: signError } = await client.storage
          .from('avaliacao-anexos')
          .createSignedUrl(prova.anexo.path, 3600);
        if (signError) throw signError;
        anexoUrl = signedData.signedUrl;
      }

      provasPayload.push({
        alunoNome: aluno.nome,
        alunoTurma: aluno.turma,
        disciplina: prova.disciplina,
        segmento: prova.segmento,
        data: prova.data,
        motivoTipo: prova.motivo.tipo,
        observacoes: prova.motivo.observacoes || '',
        anexoFileName,
        anexoUrl
      });
    }
  }

  form.append('provas', JSON.stringify(provasPayload));

  const res = await fetch(webhookUrl, { method: 'POST', body: form });
  if (!res.ok) {
    throw new Error(`Webhook do n8n (avaliação substitutiva) respondeu ${res.status} ${res.statusText}`);
  }
}

module.exports = { notifyN8n, notifyN8nAvaliacao };
