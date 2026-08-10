/* ==========================================================
   review-renderer.js
   Gera o HTML dos cards de revisão (usado tanto no passo de
   revisão do wizard quanto no modal de respostas anteriores).
   ========================================================== */

(function () {
  function esc(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function item(label, value, full) {
    const hasValue = value && String(value).trim();
    const valueHtml = hasValue
      ? `<span class="review-item-value">${esc(value)}</span>`
      : `<span class="review-item-value muted">-</span>`;
    return `<div class="review-item${full ? ' review-item-full' : ''}">
      <span class="review-item-label">${esc(label)}</span>
      ${valueHtml}
    </div>`;
  }

  // Grid de 3 colunas numa linha só, usado no modo compact (PDF) para
  // agrupar nome/data/turma (ou nome/whatsapp/profissao) sem quebrar linha.
  function gridRow3(...items) {
    return `<div class="review-grid" style="grid-template-columns:repeat(3,1fr);">
      ${items.join('')}
    </div>`;
  }

  function cardHeader(icon, title, gotoStep, editable) {
    const editBtn = editable
      ? `<button type="button" class="review-edit-btn" data-goto="${gotoStep}"><i class="fa-solid fa-pen"></i> Editar</button>`
      : '';
    return `<div class="review-card-header">
      <div class="review-card-icon"><i class="fa-solid ${icon}"></i></div>
      <h3>${esc(title)}</h3>
      ${editBtn}
    </div>`;
  }

  /**
   * Constrói o HTML dos cards de revisão a partir dos dados coletados
   * do formulário de visitas.
   * @param {object} data - dados no formato retornado por collectData()
   * @param {boolean} editable - se true, inclui botões "Editar" com data-goto
   */
  function buildReviewCards(data, editable, compact) {
    let html = '';

    /* ---- Aluno(s) ---- */
    html += `<div class="review-card"${compact ? ' style="margin-bottom:10px;"' : ''}>
      ${cardHeader('fa-user-graduate', 'Aluno(s)', 1, editable)}
      <div class="review-card-body">`;
    (data.students || []).forEach((s, i) => {
      const nascimento = s.nascimento ? SM.formatDateOnly(s.nascimento) : '';
      html += `<div class="review-student">
        <div class="review-student-header"><i class="fa-solid fa-child-reaching"></i> Aluno ${i + 1}</div>
        ${compact
          ? gridRow3(
              item('Nome completo', s.nome),
              item('Data de nascimento', nascimento),
              item('Turma desejada', s.turma)
            )
          : `<div class="review-grid">
              ${item('Nome completo', s.nome, true)}
              ${item('Data de nascimento', nascimento)}
              ${item('Turma desejada', s.turma)}
            </div>`
        }
      </div>`;
    });
    html += `</div></div>`;

    /* ---- Escola de origem ---- */
    const escola = data.escola || {};
    html += `<div class="review-card"${compact ? ' style="margin-bottom:10px;"' : ''}>
      ${cardHeader('fa-school', 'Escola de origem', 2, editable)}
      <div class="review-card-body">
        <div class="review-grid">
          ${item('Nome da escola', escola.nome)}
          ${item('Cidade/Estado', escola.cidadeEstado)}
        </div>
      </div>
    </div>`;

    /* ---- Responsáveis ---- */
    const pai = (data.responsaveis && data.responsaveis.pai) || {};
    const mae = (data.responsaveis && data.responsaveis.mae) || {};
    html += `<div class="review-card"${compact ? ' style="margin-bottom:10px;"' : ''}>
      ${cardHeader('fa-people-roof', 'Responsáveis', 3, editable)}
      <div class="review-card-body">
        <div class="review-student">
          <div class="review-student-header"><i class="fa-solid fa-mars"></i> Pai</div>
          ${compact
            ? gridRow3(
                item('Nome completo', pai.nome),
                item('WhatsApp', pai.whatsapp),
                item('Profissão', pai.profissao)
              )
            : `<div class="review-grid">
                ${item('Nome completo', pai.nome, true)}
                ${item('WhatsApp', pai.whatsapp)}
                ${item('Profissão', pai.profissao)}
              </div>`
          }
        </div>
        <div class="review-student">
          <div class="review-student-header"><i class="fa-solid fa-venus"></i> Mãe</div>
          ${compact
            ? gridRow3(
                item('Nome completo', mae.nome),
                item('WhatsApp', mae.whatsapp),
                item('Profissão', mae.profissao)
              )
            : `<div class="review-grid">
                ${item('Nome completo', mae.nome, true)}
                ${item('WhatsApp', mae.whatsapp)}
                ${item('Profissão', mae.profissao)}
              </div>`
          }
        </div>
      </div>
    </div>`;

    /* ---- Informações complementares ---- */
    const extras = data.extras || {};
    const indicadoBadge = extras.indicado === 'sim'
      ? '<span class="review-badge yes"><i class="fa-solid fa-check"></i> Sim</span>'
      : extras.indicado === 'nao'
        ? '<span class="review-badge no"><i class="fa-solid fa-xmark"></i> Não</span>'
        : '<span class="review-item-value muted">-</span>';

    html += `<div class="review-card"${compact ? ' style="margin-bottom:10px;"' : ''}>
      ${cardHeader('fa-comment-dots', 'Informações complementares', 4, editable)}
      <div class="review-card-body">
        <div class="review-grid">
          ${item('Motivo da visita', extras.motivo, true)}
          <div class="review-item">
            <span class="review-item-label">Indicado por alguém</span>
            ${indicadoBadge}
          </div>
          ${extras.indicado === 'sim' ? item('Nome da indicação', extras.indicacaoNome) : ''}
          ${item('Observações', extras.observacoes, true)}
        </div>
      </div>
    </div>`;

    return html;
  }

  const SEGMENTO_LABELS = {
    lingua_materna: 'Língua materna',
    lingua_inglesa: 'Língua inglesa'
  };

  const MOTIVO_LABELS = {
    medico: 'Atestado médico',
    outro: 'Outro motivo (pagamento de taxa)'
  };

  // Pré-visualização (local ou remota) de um único anexo de prova.
  // anexoPreview: { nome, tipo, url } (wizard, url local) OU { nome, tipo, provaId } (modal admin, botão "Ver anexo").
  function anexoPreviewHtml(anexoPreview) {
    if (!anexoPreview || !anexoPreview.nome) {
      return `<span class="review-item-value muted">Nenhum documento anexado.</span>`;
    }

    let mediaHtml = '';
    if (anexoPreview.url && (anexoPreview.tipo || '').startsWith('image/')) {
      mediaHtml = `<img src="${anexoPreview.url}" alt="Documento anexado" style="display:block;max-width:100%;max-height:320px;border-radius:8px;margin:10px auto 0;">`;
    } else if (anexoPreview.url && anexoPreview.tipo === 'application/pdf') {
      mediaHtml = `<iframe src="${anexoPreview.url}" title="Documento anexado (PDF)" style="width:100%;height:340px;border:1px solid var(--border-color, #e4e8ee);border-radius:8px;margin-top:10px;"></iframe>`;
    } else if (!anexoPreview.url && anexoPreview.provaId) {
      mediaHtml = `<button type="button" class="btn-secondary review-anexo-btn" data-prova-id="${esc(anexoPreview.provaId)}" style="margin-top:8px;"><i class="fa-solid fa-eye"></i> Ver anexo</button>`;
    }

    return `
      <div class="review-item-full">
        <span class="review-item-label">Arquivo enviado</span>
        <span class="review-item-value">${esc(anexoPreview.nome)}</span>
      </div>
      ${mediaHtml}
    `;
  }

  /**
   * Constrói o HTML dos cards de revisão a partir dos dados coletados do
   * formulário de avaliação substitutiva — um ou mais alunos, cada um com
   * uma ou mais avaliações (provas) perdidas.
   * @param {object} data - { alunos: [{ nome, turma, provas: [{ disciplina,
   *   segmento, data, motivo: {tipo, observacoes}, anexoPreview }] }] }
   *   anexoPreview (opcional por prova): { nome, tipo, url } no wizard
   *   (url local/object URL), ou { nome, tipo, provaId } no modal admin
   *   (sem preview local, mostra botão "Ver anexo").
   * @param {boolean} editable - se true, inclui botões "Editar" com data-goto
   */
  function buildAvaliacaoReviewCards(data, editable) {
    let html = '';
    const alunos = data.alunos || [];

    alunos.forEach((aluno, alunoIdx) => {
      const provas = aluno.provas || [];

      let provasHtml = '';
      provas.forEach((prova, provaIdx) => {
        const motivo = prova.motivo || {};
        provasHtml += `<div class="review-student">
          <div class="review-student-header"><i class="fa-solid fa-file-pen"></i> Avaliação ${provaIdx + 1}</div>
          <div class="review-grid">
            ${item('Disciplina', prova.disciplina, true)}
            ${item('Segmento', SEGMENTO_LABELS[prova.segmento] || prova.segmento)}
            ${item('Data da avaliação perdida', prova.data ? SM.formatDateOnly(prova.data) : '')}
            ${item('Motivo', MOTIVO_LABELS[motivo.tipo] || motivo.tipo)}
            ${item('Observações', motivo.observacoes, true)}
          </div>
          <div class="review-item-full" style="margin-top:8px;">
            <span class="review-item-label">Documento anexado</span>
            ${anexoPreviewHtml(prova.anexoPreview)}
          </div>
        </div>`;
      });

      html += `<div class="review-card">
        ${cardHeader('fa-user-graduate', `Aluno ${alunoIdx + 1}${aluno.nome ? ' — ' + aluno.nome : ''}`, 1, editable)}
        <div class="review-card-body">
          <div class="review-grid">
            ${item('Nome completo', aluno.nome, true)}
            ${item('Turma', aluno.turma)}
          </div>
          ${provasHtml}
        </div>
      </div>`;
    });

    return html;
  }

  window.SMReview = { buildReviewCards, buildAvaliacaoReviewCards };
})();
