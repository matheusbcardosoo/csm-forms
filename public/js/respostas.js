/* ==========================================================
   respostas.js — gate de login + listagem de respostas
   Toda comunicacao com Supabase passa pelo servidor /api/*
   ========================================================== */

(function () {
  const params = new URLSearchParams(window.location.search);
  const formId = params.get('form') || 'visitas';
  const form = SM.getForm(formId);

  const titleEl        = document.getElementById('responses-title');
  const listEl         = document.getElementById('responses-list');
  const overlay        = document.getElementById('modal-overlay');
  const modalBox       = document.getElementById('modal-box');
  const responsesCont  = document.getElementById('responses-content');

  let responses = [];

  if (form) {
    titleEl.textContent = 'Respostas: ' + form.nome;
    const blankPdfLink = document.getElementById('blank-pdf-link');
    if (blankPdfLink) {
      if (form.blankPdfUrl) {
        blankPdfLink.href = form.blankPdfUrl;
      } else {
        blankPdfLink.classList.add('hidden');
      }
    }
  }

  // Login/senha/acesso-negado ficam em public/js/auth-gate.js (mesmo gate
  // usado na home) — aqui só reagimos a autenticado/deslogado.
  const gate = SMAuthGate.mount({
    contentEl: responsesCont,
    onAuthorized: loadResponses,
    onLoggedOut: () => { responses = []; }
  });

  /* ---------- Lista de respostas ---------- */
  function renderList() {
    if (responses.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><p>Nenhuma resposta enviada ainda para este formulario.</p></div>';
      return;
    }
    listEl.innerHTML = responses.map(r => {
      let titulo, subtitulo;
      if (formId === 'avaliacao-substitutiva') {
        const alunos = r.data.alunos || [];
        const primeiroAluno = alunos[0] ? alunos[0].nome : 'Sem nome';
        const extraAlunos = alunos.length > 1 ? ' (+' + (alunos.length - 1) + ')' : '';
        const totalProvas = alunos.reduce((sum, a) => sum + (a.provas ? a.provas.length : 0), 0);
        titulo = SM.escapeHtml(primeiroAluno) + extraAlunos;
        subtitulo = totalProvas + (totalProvas === 1 ? ' avaliação solicitada' : ' avaliações solicitadas');
      } else {
        const primeiroAluno = r.data.students && r.data.students[0] ? r.data.students[0].nome : 'Sem nome';
        const totalAlunos   = r.data.students ? r.data.students.length : 1;
        const extra         = totalAlunos > 1 ? ' (+' + (totalAlunos - 1) + ')' : '';
        titulo = SM.escapeHtml(primeiroAluno) + extra;
        subtitulo = '';
      }
      return '<div class="response-item" data-id="' + r.id + '">' +
        '<div class="meta">' +
          '<h4>' + titulo + '</h4>' +
          '<p>' + (subtitulo ? SM.escapeHtml(subtitulo) + ' · ' : '') + 'Enviado em ' + SM.formatDate(r.submittedAt) + '</p>' +
        '</div>' +
        '<button class="btn btn-ghost btn-sm view-btn" data-id="' + r.id + '">Ver detalhes</button>' +
    '</div>';
    }).join('');
  }

  async function loadResponses() {
    listEl.innerHTML = '<div class="empty-state"><p><i class="fa-solid fa-spinner fa-spin"></i> Carregando respostas...</p></div>';
    try {
      const res = await fetch('/api/responses?form=' + formId);
      if (res.status === 401) { gate.logout(); return; }
      if (!res.ok) throw new Error((await res.json()).error);
      responses = await res.json();
      renderList();
    } catch (err) {
      console.error('Erro ao carregar respostas:', err);
      listEl.innerHTML =
        '<div class="empty-state">' +
          '<p><i class="fa-solid fa-triangle-exclamation"></i> Nao foi possivel carregar as respostas.</p>' +
          '<p style="font-size:13px;">' + SM.escapeHtml(err && err.message ? err.message : 'Verifique a conexao.') + '</p>' +
        '</div>';
    }
  }

  listEl.addEventListener('click', e => {
    const btn = e.target.closest('.view-btn');
    if (!btn) return;
    const record = responses.find(r => r.id === btn.dataset.id);
    if (record) openModal(record);
  });

  function openModal(record) {
    const isAvaliacao = formId === 'avaliacao-substitutiva';
    const reviewHtml = isAvaliacao
      ? SMReview.buildAvaliacaoReviewCards({
          alunos: (record.data.alunos || []).map(aluno => ({
            nome: aluno.nome,
            turma: aluno.turma,
            provas: (aluno.provas || []).map(prova => ({
              disciplina: prova.disciplina,
              segmento: prova.segmento,
              data: prova.data,
              motivo: prova.motivo,
              anexoPreview: prova.anexo && prova.anexo.nome
                ? { nome: prova.anexo.nome, tipo: prova.anexo.tipo, provaId: prova.id }
                : null
            }))
          }))
        }, false)
      : SMReview.buildReviewCards(record.data, false);

    modalBox.innerHTML =
      '<div class="modal-header">' +
        '<h2>Detalhes da resposta</h2>' +
        '<p class="modal-subtitle">Enviado em ' + SM.formatDate(record.submittedAt) + '</p>' +
      '</div>' +
      '<div class="modal-review">' + reviewHtml + '</div>' +
      '<div class="modal-footer">' +
        '<button class="btn btn-secondary" id="close-modal-btn">Fechar</button>' +
        '<button class="btn btn-secondary" id="whatsapp-modal-btn"><i class="fa-brands fa-whatsapp"></i> Enviar por WhatsApp</button>' +
        '<button class="btn btn-primary" id="print-modal-btn"><i class="fa-solid fa-file-pdf"></i> Baixar PDF</button>' +
      '</div>';
    overlay.classList.remove('hidden');
    document.getElementById('close-modal-btn').addEventListener('click', closeModal);
    document.getElementById('print-modal-btn').addEventListener('click', () => downloadPdf(record));
    document.getElementById('whatsapp-modal-btn').addEventListener('click', () => sendWhatsapp(record));

    // Botões "Ver anexo" por prova (avaliação substitutiva) são gerados
    // dinamicamente dentro dos cards de revisão — delegação de evento aqui
    // porque são um por prova, e o número de provas varia por resposta.
    if (isAvaliacao) {
      modalBox.querySelectorAll('.review-anexo-btn').forEach(btn => {
        btn.addEventListener('click', () => openAnexo(record, btn.dataset.provaId, btn));
      });
    }
  }

  /* ---------- Anexo (avaliação substitutiva): abre via URL assinada, uma prova por vez ---------- */
  async function openAnexo(record, provaId, btn) {
    const origLabel = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Abrindo...';
    try {
      const res = await fetch('/api/responses/' + record.id + '/anexo/' + provaId + '?form=' + formId);
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'Falha ao abrir o anexo.');
      window.open(result.url, '_blank', 'noopener');
    } catch (err) {
      console.error('Erro ao abrir anexo:', err);
      alert(err.message || 'Não foi possível abrir o anexo.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = origLabel;
    }
  }

  function closeModal() {
    overlay.classList.add('hidden');
    modalBox.innerHTML = '';
  }

  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

  /* ---------- PDF (gerado no servidor via Puppeteer) ----------
     A geracao em si (layout, estilizacao) agora vive so no servidor
     (views/pdf-visita.ejs + lib/pdf.js), reaproveitando a mesma
     SMReview.buildReviewCards() que ja era usada aqui. Isso garante que
     o PDF baixado por este botao seja sempre identico ao que e enviado
     automaticamente pro n8n a cada nova visita. */
  async function downloadPdf(record) {
    const pdfBtn = document.getElementById('print-modal-btn');
    const pdfBtnLabel = pdfBtn ? pdfBtn.innerHTML : '';
    if (pdfBtn) {
      pdfBtn.disabled = true;
      pdfBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gerando PDF...';
    }

    try {
      const res = await fetch('/api/responses/' + record.id + '/pdf?form=' + formId);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || 'Falha ao gerar PDF.');
      }

      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^";]+)"?/);
      const filename = match ? match[1] : 'visita.pdf';

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      alert('Nao foi possivel gerar o PDF. Tente novamente.');
    } finally {
      if (pdfBtn) { pdfBtn.disabled = false; pdfBtn.innerHTML = pdfBtnLabel; }
    }
  }

  /* ---------- Envio manual por WhatsApp (via workflow n8n) ---------- */
  async function sendWhatsapp(record) {
    const btn = document.getElementById('whatsapp-modal-btn');
    const origLabel = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...';
    }

    try {
      const res = await fetch('/api/responses/' + record.id + '/whatsapp?form=' + formId, { method: 'POST' });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'Falha ao enviar pelo WhatsApp.');

      if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Enviado!';
        setTimeout(() => { btn.innerHTML = origLabel; }, 2500);
      }
    } catch (err) {
      console.error('Erro ao enviar pelo WhatsApp:', err);
      alert(err.message || 'Não foi possível enviar pelo WhatsApp. Tente novamente.');
      if (btn) btn.innerHTML = origLabel;
    } finally {
      if (btn) btn.disabled = false;
    }
  }
})();