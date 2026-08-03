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
  function buildReviewCards(data, editable) {
    let html = '';

    /* ---- Aluno(s) ---- */
    html += `<div class="review-card">
      ${cardHeader('fa-user-graduate', 'Aluno(s)', 1, editable)}
      <div class="review-card-body">`;
    (data.students || []).forEach((s, i) => {
      html += `<div class="review-student">
        <div class="review-student-header"><i class="fa-solid fa-child-reaching"></i> Aluno ${i + 1}</div>
        <div class="review-grid">
          ${item('Nome completo', s.nome, true)}
          ${item('Data de nascimento', s.nascimento ? SM.formatDateOnly(s.nascimento) : '')}
          ${item('Turma desejada', s.turma)}
        </div>
      </div>`;
    });
    html += `</div></div>`;

    /* ---- Escola de origem ---- */
    const escola = data.escola || {};
    html += `<div class="review-card">
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
    html += `<div class="review-card">
      ${cardHeader('fa-people-roof', 'Responsáveis', 3, editable)}
      <div class="review-card-body">
        <div class="review-student">
          <div class="review-student-header"><i class="fa-solid fa-mars"></i> Pai</div>
          <div class="review-grid">
            ${item('Nome completo', pai.nome, true)}
            ${item('WhatsApp', pai.whatsapp)}
            ${item('Profissão', pai.profissao)}
          </div>
        </div>
        <div class="review-student">
          <div class="review-student-header"><i class="fa-solid fa-venus"></i> Mãe</div>
          <div class="review-grid">
            ${item('Nome completo', mae.nome, true)}
            ${item('WhatsApp', mae.whatsapp)}
            ${item('Profissão', mae.profissao)}
          </div>
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

    html += `<div class="review-card">
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

  window.SMReview = { buildReviewCards };
})();
