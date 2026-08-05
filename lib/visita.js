'use strict';

// Molda uma linha de visita_respostas (+ visita_alunos aninhado) no formato
// { id, submittedAt, data } usado tanto pelo front (GET /api/responses)
// quanto pela renderizacao do PDF (routes/pdf.js). Fica num lugar so pra
// nao correr o risco das duas rotas divergirem no shape dos dados.
function shapeVisitaRow(row) {
  return {
    id: row.id,
    submittedAt: row.submitted_at,
    data: {
      students: (row.visita_alunos || [])
        .slice()
        .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
        .map(a => ({ nome: a.nome, nascimento: a.nascimento, turma: a.turma })),
      escola: {
        nome: row.escola_nome,
        cidadeEstado: row.escola_cidade_estado
      },
      responsaveis: {
        pai: { nome: row.pai_nome, whatsapp: row.pai_whatsapp, profissao: row.pai_profissao },
        mae: { nome: row.mae_nome, whatsapp: row.mae_whatsapp, profissao: row.mae_profissao }
      },
      extras: {
        motivo: row.motivo,
        indicado: row.indicado,
        indicacaoNome: row.indicacao_nome,
        observacoes: row.observacoes
      }
    }
  };
}

// Mesma logica de slug que existia em generatePdfFilename() no client
// (public/js/respostas.js), agora reaproveitada no servidor.
function slugify(str) {
  return String(str || 'visita')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function firstStudentName(visita) {
  return visita.data.students && visita.data.students[0]
    ? visita.data.students[0].nome
    : 'Visita';
}

function dateParts(visita) {
  const d = new Date(visita.submittedAt);
  return {
    dd: String(d.getDate()).padStart(2, '0'),
    mm: String(d.getMonth() + 1).padStart(2, '0'),
    yyyy: String(d.getFullYear())
  };
}

// Nome do arquivo pro download via botao "Baixar PDF" (Content-Disposition) —
// estilo slug, seguro pra usar em qualquer lugar (URL, header HTTP etc.).
function pdfFilename(visita) {
  const { dd, mm, yyyy } = dateParts(visita);
  return `${slugify(firstStudentName(visita))}-${dd}-${mm}-${yyyy}.pdf`;
}

// Nome do arquivo pro Google Drive (via n8n) — mantem capitalizacao e espacos
// pra ficar legivel navegando nas pastas. Nomes de alunos ja chegam em Title
// Case do banco (toTitleCase() em routes/api.js), entao usamos como estao.
function driveFileName(visita) {
  const { dd, mm, yyyy } = dateParts(visita);
  return `${firstStudentName(visita)} - ${dd}-${mm}-${yyyy}.pdf`;
}

// Ano da visita (baseado em submittedAt) — usado pelo n8n pra decidir/criar
// a pasta do ano no Drive, sem precisar recalcular nada por la.
function visitaYear(visita) {
  return dateParts(visita).yyyy;
}

module.exports = { shapeVisitaRow, pdfFilename, driveFileName, visitaYear };
