/* ==========================================================
   wizard-avaliacao.js
   Lógica do formulário multi-etapas de Requerimento de
   Avaliação Substitutiva — suporta múltiplos alunos e, para
   cada aluno, múltiplas avaliações (provas) perdidas.
   ========================================================== */

(function () {
  const TOTAL_STEPS = 2;
  const ANEXO_TAMANHO_MAX_BYTES = 8 * 1024 * 1024; // 8MB
  const ANEXO_TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

  let currentStep = 1;

  const form = document.getElementById('avaliacao-form');
  if (!form) return; // não é a página do wizard

  const stepLabel = document.getElementById('step-label');
  const stepper = document.getElementById('stepper');
  const backBtn = document.getElementById('back-btn');
  const nextBtn = document.getElementById('next-btn');
  const wizardNav = document.getElementById('wizard-nav');
  const alunosContainer = document.getElementById('alunos-container');
  const alunoTemplate = document.getElementById('aluno-block-template');
  const provaTemplate = document.getElementById('prova-block-template');
  const addAlunoBtn = document.getElementById('add-aluno-btn');
  const submitError = document.getElementById('submit-error');
  const submitErrorMessage = document.getElementById('submit-error-message');
  const consentCheckbox = document.getElementById('consent-checkbox');
  const consentGroup = document.getElementById('consent-group');

  /* ---------- Validadores ---------- */
  function isFullName(value) {
    if (!value) return false;
    const words = value.trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) return false;
    const nameRegex = /^[A-Za-zÀ-ÖØ-öø-ÿ'’-]+$/;
    return words.every(w => w.length >= 2 && nameRegex.test(w));
  }

  function validateAnexoFile(file) {
    if (!file) return 'Anexe o documento antes de continuar.';
    if (!ANEXO_TIPOS_ACEITOS.includes(file.type)) return 'Tipo de arquivo não suportado. Envie uma imagem (JPG/PNG) ou PDF.';
    if (file.size > ANEXO_TAMANHO_MAX_BYTES) return 'Arquivo muito grande (máximo de 8MB).';
    return null;
  }

  /* ---------- Formatação automática ---------- */
  const PARTICLES = new Set(['da', 'das', 'de', 'do', 'dos', 'e', 'a', 'o', 'ao', 'i']);

  function toTitleCase(str) {
    if (!str) return '';
    return str.trim().toLowerCase().split(/\s+/).map((w, i) =>
      w && (i === 0 || !PARTICLES.has(w)) ? w[0].toUpperCase() + w.slice(1) : w
    ).join(' ');
  }

  function capFirst(str) {
    if (!str) return '';
    const s = str.trim();
    return s ? s[0].toUpperCase() + s.slice(1) : s;
  }

  /* ---------- Pré-render local do anexo ---------- */
  function renderAnexoPreview(file, container) {
    if (!file) {
      container.classList.add('hidden');
      container.innerHTML = '';
      return;
    }
    const url = URL.createObjectURL(file);
    let mediaHtml = '';
    if (file.type.startsWith('image/')) {
      mediaHtml = `<img src="${url}" alt="Pré-visualização do anexo">`;
    } else if (file.type === 'application/pdf') {
      mediaHtml = `<iframe src="${url}" title="Pré-visualização do anexo (PDF)"></iframe>`;
    } else {
      mediaHtml = '<p style="font-size:12.5px;color:var(--text-muted);margin:0;">Pré-visualização não disponível para este tipo de arquivo.</p>';
    }
    container.innerHTML = `
      <div class="anexo-preview-name"><i class="fa-solid fa-paperclip"></i> ${SM.escapeHtml(file.name)}</div>
      ${mediaHtml}
    `;
    container.classList.remove('hidden');
  }

  /* ---------- Alunos ---------- */
  function addAlunoBlock() {
    const clone = alunoTemplate.content.cloneNode(true);
    const block = clone.querySelector('.aluno-block');
    alunosContainer.appendChild(clone);
    addProvaBlock(block); // todo aluno começa com uma avaliação pronta pra preencher
    renumberAlunos();
    return block;
  }

  function renumberAlunos() {
    const blocks = alunosContainer.querySelectorAll(':scope > .aluno-block');
    blocks.forEach((block, i) => {
      block.querySelector('.student-block-header span').textContent = 'Aluno ' + (i + 1);
      const removeBtn = block.querySelector('.remove-aluno-btn');
      removeBtn.style.display = blocks.length <= 1 ? 'none' : '';
    });
  }

  /* ---------- Provas (avaliações perdidas) de um aluno ---------- */
  function addProvaBlock(alunoBlock) {
    const clone = provaTemplate.content.cloneNode(true);
    alunoBlock.querySelector('.provas-container').appendChild(clone);
    renumberProvas(alunoBlock);
  }

  function renumberProvas(alunoBlock) {
    const blocks = alunoBlock.querySelectorAll('.prova-block');
    blocks.forEach((block, i) => {
      block.querySelector('.prova-block-header span').textContent = 'Avaliação ' + (i + 1);
      const removeBtn = block.querySelector('.remove-prova-btn');
      removeBtn.style.display = blocks.length <= 1 ? 'none' : '';
    });
  }

  addAlunoBtn.addEventListener('click', () => addAlunoBlock());
  addAlunoBlock(); // primeiro aluno (com sua primeira avaliação) sempre visível

  /* ---------- Delegação de eventos: clique ---------- */
  alunosContainer.addEventListener('click', (e) => {
    const removeAlunoBtn = e.target.closest('.remove-aluno-btn');
    if (removeAlunoBtn) {
      removeAlunoBtn.closest('.aluno-block').remove();
      renumberAlunos();
      return;
    }

    const addProvaBtn = e.target.closest('.add-prova-btn');
    if (addProvaBtn) {
      addProvaBlock(addProvaBtn.closest('.aluno-block'));
      return;
    }

    const removeProvaBtn = e.target.closest('.remove-prova-btn');
    if (removeProvaBtn) {
      const alunoBlock = removeProvaBtn.closest('.aluno-block');
      removeProvaBtn.closest('.prova-block').remove();
      renumberProvas(alunoBlock);
      return;
    }

    const segmentoPill = e.target.closest('.prova-segmento-choice .choice-pill');
    if (segmentoPill) {
      const provaBlock = segmentoPill.closest('.prova-block');
      provaBlock.dataset.segmento = segmentoPill.dataset.value;
      [...segmentoPill.parentElement.children].forEach(p => p.classList.toggle('selected', p === segmentoPill));
      const fieldGroup = segmentoPill.closest('.field-group');
      if (fieldGroup) fieldGroup.classList.remove('invalid');
      return;
    }

    const motivoPill = e.target.closest('.prova-motivo-choice .choice-pill');
    if (motivoPill) {
      const provaBlock = motivoPill.closest('.prova-block');
      provaBlock.dataset.motivo = motivoPill.dataset.value;
      [...motivoPill.parentElement.children].forEach(p => p.classList.toggle('selected', p === motivoPill));

      const medicoGroup = provaBlock.querySelector('.prova-motivo-medico-group');
      const outroGroup = provaBlock.querySelector('.prova-motivo-outro-group');
      medicoGroup.classList.toggle('hidden', provaBlock.dataset.motivo !== 'medico');
      outroGroup.classList.toggle('hidden', provaBlock.dataset.motivo !== 'outro');
      medicoGroup.classList.remove('invalid');
      outroGroup.classList.remove('invalid');

      const fieldGroup = motivoPill.closest('.field-group');
      if (fieldGroup) fieldGroup.classList.remove('invalid');
      return;
    }

    const copyPixBtn = e.target.closest('.copy-pix-btn');
    if (copyPixBtn) {
      const provaBlock = copyPixBtn.closest('.prova-block');
      const keyEl = provaBlock.querySelector('.pix-key-value-copy');
      const key = keyEl ? keyEl.textContent.trim() : '';
      const originalLabel = copyPixBtn.innerHTML;
      navigator.clipboard.writeText(key)
        .then(() => { copyPixBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copiado!'; })
        .catch(() => { copyPixBtn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Copie manualmente'; })
        .finally(() => { setTimeout(() => { copyPixBtn.innerHTML = originalLabel; }, 2200); });
    }
  });

  /* ---------- Delegação de eventos: mudança (arquivo, turma, data) ---------- */
  alunosContainer.addEventListener('change', (e) => {
    if (e.target.matches('.prova-anexo-input')) {
      const input = e.target;
      const group = input.closest('.field-group');
      const preview = group.querySelector('.anexo-preview');
      const errMsgEl = group.querySelector('.anexo-error-message');
      const file = input.files && input.files[0];
      const err = validateAnexoFile(file);
      if (err) {
        if (errMsgEl) errMsgEl.textContent = err;
        group.classList.add('invalid');
        renderAnexoPreview(null, preview);
        input.value = '';
        return;
      }
      group.classList.remove('invalid');
      renderAnexoPreview(file, preview);
      return;
    }

    if (e.target.matches('.aluno-turma, .prova-data')) {
      const group = e.target.closest('.field-group');
      if (group && e.target.value) group.classList.remove('invalid');
    }
  });

  /* ---------- Delegação de eventos: digitação (validação em tempo real) ---------- */
  alunosContainer.addEventListener('input', (e) => {
    if (e.target.matches('.aluno-nome')) {
      const group = e.target.closest('.field-group');
      if (group && isFullName(e.target.value)) group.classList.remove('invalid');
    } else if (e.target.matches('.prova-disciplina')) {
      const group = e.target.closest('.field-group');
      if (group && e.target.value.trim()) group.classList.remove('invalid');
    }
  });

  /* ---------- Delegação de eventos: título automático ao sair do campo ---------- */
  // "focusout" (em vez de "blur") porque precisa borbulhar pra funcionar via delegação.
  alunosContainer.addEventListener('focusout', (e) => {
    if (e.target.matches('.aluno-nome, .prova-disciplina')) {
      if (e.target.value) e.target.value = toTitleCase(e.target.value);
    } else if (e.target.matches('.prova-observacoes')) {
      if (e.target.value) e.target.value = capFirst(e.target.value);
    }
  });

  /* ---------- Consentimento ---------- */
  if (consentCheckbox) {
    consentCheckbox.addEventListener('change', () => {
      if (consentCheckbox.checked) consentGroup.classList.remove('invalid');
    });
  }

  /* ---------- Validação por etapa ---------- */
  function clearErrors(scope) {
    scope.querySelectorAll('.field-group.invalid').forEach(g => g.classList.remove('invalid'));
  }

  function markInvalid(fieldGroup) {
    if (fieldGroup) fieldGroup.classList.add('invalid');
  }

  function validateStep(step) {
    let valid = true;

    if (step === 1) {
      const alunoBlocks = [...alunosContainer.querySelectorAll(':scope > .aluno-block')];

      alunoBlocks.forEach(alunoBlock => {
        clearErrors(alunoBlock);

        const nome = alunoBlock.querySelector('.aluno-nome');
        const turma = alunoBlock.querySelector('.aluno-turma');
        if (!isFullName(nome.value)) { markInvalid(nome.closest('.field-group')); valid = false; }
        if (!turma.value) { markInvalid(turma.closest('.field-group')); valid = false; }

        const provaBlocks = [...alunoBlock.querySelectorAll('.prova-block')];
        provaBlocks.forEach(provaBlock => {
          const disciplina = provaBlock.querySelector('.prova-disciplina');
          const data = provaBlock.querySelector('.prova-data');
          const segmentoChoice = provaBlock.querySelector('.prova-segmento-choice');
          const motivoChoice = provaBlock.querySelector('.prova-motivo-choice');

          if (!disciplina.value.trim()) { markInvalid(disciplina.closest('.field-group')); valid = false; }
          if (!data.value) { markInvalid(data.closest('.field-group')); valid = false; }
          if (!provaBlock.dataset.segmento) { markInvalid(segmentoChoice.closest('.field-group')); valid = false; }

          if (!provaBlock.dataset.motivo) {
            markInvalid(motivoChoice.closest('.field-group'));
            valid = false;
          } else {
            const input = provaBlock.dataset.motivo === 'medico'
              ? provaBlock.querySelector('.prova-anexo-medico-input')
              : provaBlock.querySelector('.prova-anexo-outro-input');
            const file = input && input.files ? input.files[0] : null;
            const err = validateAnexoFile(file);
            if (err) {
              const group = provaBlock.dataset.motivo === 'medico'
                ? provaBlock.querySelector('.prova-motivo-medico-group')
                : provaBlock.querySelector('.prova-motivo-outro-group');
              const errMsgEl = group.querySelector('.anexo-error-message');
              if (errMsgEl) errMsgEl.textContent = err;
              markInvalid(group);
              valid = false;
            }
          }
        });
      });
    }

    return valid;
  }

  /* ---------- Coleta de dados ---------- */
  function collectData() {
    return {
      alunos: [...alunosContainer.querySelectorAll(':scope > .aluno-block')].map(alunoBlock => ({
        nome: alunoBlock.querySelector('.aluno-nome').value.trim(),
        turma: alunoBlock.querySelector('.aluno-turma').value,
        provas: [...alunoBlock.querySelectorAll('.prova-block')].map(provaBlock => {
          const motivoTipo = provaBlock.dataset.motivo || null;
          const anexoInput = motivoTipo === 'medico'
            ? provaBlock.querySelector('.prova-anexo-medico-input')
            : motivoTipo === 'outro'
              ? provaBlock.querySelector('.prova-anexo-outro-input')
              : null;
          return {
            disciplina: provaBlock.querySelector('.prova-disciplina').value.trim(),
            segmento: provaBlock.dataset.segmento || null,
            data: provaBlock.querySelector('.prova-data').value,
            motivo: {
              tipo: motivoTipo,
              observacoes: provaBlock.querySelector('.prova-observacoes').value.trim()
            },
            anexoFile: anexoInput && anexoInput.files ? anexoInput.files[0] : null
          };
        })
      }))
    };
  }

  /* ---------- Revisão ---------- */
  function renderReview() {
    const data = collectData();
    const container = document.getElementById('review-container');

    const alunosForReview = data.alunos.map(aluno => ({
      nome: aluno.nome,
      turma: aluno.turma,
      provas: aluno.provas.map(prova => ({
        disciplina: prova.disciplina,
        segmento: prova.segmento,
        data: prova.data,
        motivo: prova.motivo,
        anexoPreview: prova.anexoFile ? {
          nome: prova.anexoFile.name,
          tipo: prova.anexoFile.type,
          url: URL.createObjectURL(prova.anexoFile)
        } : null
      }))
    }));

    container.innerHTML = SMReview.buildAvaliacaoReviewCards({ alunos: alunosForReview }, true);

    container.querySelectorAll('[data-goto]').forEach(btn => {
      btn.addEventListener('click', () => goToStep(parseInt(btn.dataset.goto, 10)));
    });
  }

  /* ---------- Navegação entre etapas ---------- */
  function updateProgress() {
    const displayStep = Math.min(currentStep, TOTAL_STEPS);
    stepLabel.textContent = `Passo ${displayStep}/${TOTAL_STEPS}`;

    stepper.querySelectorAll('.step-node').forEach(node => {
      const n = parseInt(node.dataset.step, 10);
      node.classList.toggle('completed', n < displayStep);
      node.classList.toggle('active', n === displayStep);
    });

    stepper.querySelectorAll('.step-connector').forEach(connector => {
      const n = parseInt(connector.dataset.connector, 10);
      connector.classList.toggle('filled', displayStep > n);
    });
  }

  function showStep(step) {
    form.querySelectorAll('.wizard-step').forEach(s => s.classList.add('hidden'));
    const target = form.querySelector(`.wizard-step[data-step="${step}"]`);
    if (target) target.classList.remove('hidden');

    backBtn.style.visibility = step === 1 ? 'hidden' : 'visible';
    nextBtn.textContent = step === TOTAL_STEPS ? 'Enviar' : 'Próximo';

    if (step === TOTAL_STEPS) renderReview();
    updateProgress();
  }

  function goToStep(step) {
    currentStep = step;
    showStep(currentStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  backBtn.addEventListener('click', () => {
    if (currentStep > 1) goToStep(currentStep - 1);
  });

  /* ---------- Arquivo -> base64 (só no envio final) ---------- */
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const base64 = result.slice(result.indexOf(',') + 1);
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  nextBtn.addEventListener('click', async () => {
    if (!validateStep(currentStep)) return;

    if (currentStep < TOTAL_STEPS) {
      goToStep(currentStep + 1);
      return;
    }

    // validação do aceite de termos
    if (!consentCheckbox.checked) {
      consentGroup.classList.add('invalid');
      consentGroup.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // envio final
    const data = collectData();
    submitError.classList.add('hidden');
    nextBtn.disabled = true;
    backBtn.disabled = true;
    const originalLabel = nextBtn.textContent;
    nextBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...';

    try {
      const alunosPayload = [];
      for (const aluno of data.alunos) {
        const provasPayload = [];
        for (const prova of aluno.provas) {
          if (!prova.anexoFile) {
            throw new Error('Anexo não encontrado em uma das avaliações. Volte e selecione o documento novamente.');
          }
          const base64 = await fileToBase64(prova.anexoFile);
          provasPayload.push({
            disciplina: prova.disciplina,
            segmento: prova.segmento,
            data: prova.data,
            motivo: { tipo: prova.motivo.tipo, observacoes: prova.motivo.observacoes },
            anexo: { nome: prova.anexoFile.name, tipo: prova.anexoFile.type, base64 }
          });
        }
        alunosPayload.push({ nome: aluno.nome, turma: aluno.turma, provas: provasPayload });
      }

      const apiRes = await fetch('/api/avaliacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alunos: alunosPayload })
      });
      if (!apiRes.ok) {
        const errData = await apiRes.json();
        throw new Error(errData.error || 'Erro ao enviar requerimento.');
      }
      wizardNav.classList.add('hidden');
      form.querySelectorAll('.wizard-step').forEach(s => s.classList.add('hidden'));
      form.querySelector('.wizard-step[data-step="success"]').classList.remove('hidden');
      stepLabel.classList.add('hidden');
      stepper.classList.add('hidden');

      const successBackLink = document.getElementById('success-back-link');
      if (successBackLink) successBackLink.href = window.location.pathname;
    } catch (err) {
      console.error('Erro ao enviar requerimento:', err);
      submitErrorMessage.textContent = err && err.message
        ? `Não foi possível enviar o requerimento: ${err.message}`
        : 'Não foi possível enviar o requerimento. Verifique sua conexão e tente novamente.';
      submitError.classList.remove('hidden');
      nextBtn.disabled = false;
      backBtn.disabled = false;
      nextBtn.textContent = originalLabel;
      submitError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  showStep(currentStep);
})();
