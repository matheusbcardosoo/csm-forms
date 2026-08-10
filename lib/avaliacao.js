'use strict';

// Molda uma linha de avaliacao_substitutiva_respostas (+ alunos + provas
// aninhados) no formato { id, submittedAt, data: { alunos: [...] } } usado
// pelo front (GET /api/responses), pela renderizacao do PDF (routes/pdf.js)
// e pelo envio ao n8n (lib/n8n.js). Um requerimento pode ter mais de um
// aluno (ex.: irmãos) e cada aluno pode ter mais de uma prova perdida —
// é a prova (não o aluno nem o requerimento) que carrega disciplina,
// segmento, motivo e anexo, porque cada uma pode ter uma justificativa e
// um segmento diferente.
function shapeAvaliacaoRow(row) {
  const alunos = (row.avaliacao_substitutiva_alunos || [])
    .slice()
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
    .map(aluno => ({
      id: aluno.id,
      nome: aluno.nome,
      turma: aluno.turma,
      provas: (aluno.avaliacao_substitutiva_provas || [])
        .slice()
        .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
        .map(prova => ({
          id: prova.id,
          disciplina: prova.disciplina,
          segmento: prova.segmento,
          data: prova.data_avaliacao,
          motivo: {
            tipo: prova.motivo_tipo,
            observacoes: prova.observacoes
          },
          anexo: {
            path: prova.anexo_path,
            nome: prova.anexo_nome,
            tipo: prova.anexo_tipo
          }
        }))
    }));

  return {
    id: row.id,
    submittedAt: row.submitted_at,
    data: { alunos }
  };
}

// Mesma logica de slug usada em lib/visita.js.
function slugify(str) {
  return String(str || 'avaliacao')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Rótulo com o(s) nome(s) do(s) aluno(s) do requerimento, usado nos nomes
// de arquivo. Com mais de 2 alunos, encurta pra "Nome1 e outros" — nomes de
// arquivo muito longos causam problema em alguns sistemas de arquivos.
function alunosLabel(avaliacao) {
  const nomes = (avaliacao.data.alunos || []).map(a => a.nome).filter(Boolean);
  if (nomes.length === 0) return 'Aluno';
  if (nomes.length === 1) return nomes[0];
  if (nomes.length === 2) return nomes.join(' e ');
  return `${nomes[0]} e outros`;
}

function dateParts(avaliacao) {
  const d = new Date(avaliacao.submittedAt);
  return {
    dd: String(d.getDate()).padStart(2, '0'),
    mm: String(d.getMonth() + 1).padStart(2, '0'),
    yyyy: String(d.getFullYear())
  };
}

// Nome do arquivo do PDF completo (todos os alunos/provas do requerimento)
// pro download via botao "Baixar PDF".
function pdfFilename(avaliacao) {
  const { dd, mm, yyyy } = dateParts(avaliacao);
  return `${slugify(alunosLabel(avaliacao))}-avaliacao-substitutiva-${dd}-${mm}-${yyyy}.pdf`;
}

// Nome do arquivo do PDF completo pro Google Drive (via n8n) — legivel,
// mantem capitalizacao.
function driveFileName(avaliacao) {
  const { dd, mm, yyyy } = dateParts(avaliacao);
  return `${alunosLabel(avaliacao)} - Avaliação Substitutiva - ${dd}-${mm}-${yyyy}.pdf`;
}

// Nome do arquivo do anexo de UMA prova especifica pro Drive — inclui aluno
// e disciplina pra ficar identificavel mesmo fora do contexto do PDF
// completo (cada coordenacao so recebe os anexos das provas do seu
// segmento, nunca o PDF inteiro).
function provaAnexoDriveFileName(avaliacao, alunoNome, prova) {
  const { dd, mm, yyyy } = dateParts(avaliacao);
  const ext = (prova.anexo && prova.anexo.nome || '').split('.').pop();
  const label = prova.motivo.tipo === 'medico' ? 'Atestado' : 'Comprovante';
  return `${alunoNome} - ${prova.disciplina} - ${label} - ${dd}-${mm}-${yyyy}${ext ? '.' + ext : ''}`;
}

// Ano do requerimento (baseado em submittedAt) — usado pelo n8n pra decidir
// / criar a pasta do ano no Drive.
function avaliacaoYear(avaliacao) {
  return dateParts(avaliacao).yyyy;
}

module.exports = {
  shapeAvaliacaoRow,
  alunosLabel,
  pdfFilename,
  driveFileName,
  provaAnexoDriveFileName,
  avaliacaoYear
};
