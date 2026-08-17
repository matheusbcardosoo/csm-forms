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
  const MAX_PROVAS_POR_ALUNO = 3;

  // Compressão de anexos que são foto (atestado/comprovante fotografado
  // pelo celular costuma vir em 3-8MB): reduz antes de converter pra base64
  // e enviar, já que o requerimento pode carregar vários anexos na mesma
  // requisição. PDF e HEIC não são recomprimidos aqui (canvas não decodifica
  // HEIC de forma confiável em todos os navegadores, e recomprimir PDF client-side
  // não é viável) — nesses casos o arquivo original segue como está.
  const ANEXO_COMPRESSAO_LIMIAR_BYTES = 1.2 * 1024 * 1024; // só comprime acima disso
  const ANEXO_COMPRESSAO_MAX_DIMENSAO = 1600; // px no maior lado
  const ANEXO_COMPRESSAO_QUALIDADE = 0.75;

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
  const anexoGroupTemplate = document.getElementById('anexo-group-template');
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

  // `required` = false pros documentos opcionais (2º+ grupo de data em
  // diante, ver renderAnexoGroups()) — sem arquivo não é erro nesse caso.
  function validateAnexoFile(file, required = true) {
    if (!file) return required ? 'Anexe o documento antes de continuar.' : null;
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

  /* ---------- Compressão de anexo-foto antes do envio ---------- */
  function withJpegExtension(name) {
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    return base + '.jpg';
  }

  function compressImageFile(file) {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/') || file.type === 'image/heic') {
        resolve(file);
        return;
      }
      if (file.size <= ANEXO_COMPRESSAO_LIMIAR_BYTES) {
        resolve(file);
        return;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        const maiorLado = Math.max(width, height);
        if (maiorLado > ANEXO_COMPRESSAO_MAX_DIMENSAO) {
          const escala = ANEXO_COMPRESSAO_MAX_DIMENSAO / maiorLado;
          width = Math.round(width * escala);
          height = Math.round(height * escala);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob || blob.size >= file.size) {
            resolve(file); // compressão não ajudou (ex: já era pequena/simples) — mantém original
            return;
          }
          resolve(new File([blob], withJpegExtension(file.name), { type: 'image/jpeg' }));
        }, 'image/jpeg', ANEXO_COMPRESSAO_QUALIDADE);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file); // não conseguiu decodificar — segue com o original
      };
      img.src = url;
    });
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

  /* ---------- Documentos anexados: agrupados por data, não por prova ----------
     O atestado/comprovante costuma valer pra todas as avaliações perdidas
     no mesmo dia, então em vez de um campo de anexo por avaliação, cada
     ALUNO tem um campo de anexo por DATA distinta entre suas avaliações. O
     grupo da data mais antiga é obrigatório; grupos de datas adicionais são
     opcionais (o requerente pode não ter/não achar necessário anexar um
     segundo documento). */
  function computeDateGroups(alunoBlock) {
    const provaBlocks = [...alunoBlock.querySelectorAll('.prova-block')];
    const map = new Map();
    provaBlocks.forEach(provaBlock => {
      const dataInput = provaBlock.querySelector('.prova-data');
      const date = dataInput && dataInput.value;
      if (!date) return;
      if (!map.has(date)) map.set(date, { data: date, provaBlocks: [] });
      map.get(date).provaBlocks.push(provaBlock);
    });
    // Data mais antiga primeiro — é o documento "principal" (obrigatório).
    return [...map.values()].sort((a, b) => a.data.localeCompare(b.data));
  }

  function renderAnexoGroups(alunoBlock) {
    const container = alunoBlock.querySelector('.anexo-groups-container');
    if (!container || !anexoGroupTemplate) return;

    const groups = computeDateGroups(alunoBlock);

    // Preserva o arquivo já selecionado de cada data antes de recriar o
    // HTML (a lista de grupos pode mudar de tamanho/ordem quando o usuário
    // edita uma data).
    const preservedByDate = new Map();
    container.querySelectorAll('.anexo-group').forEach(groupEl => {
      const date = groupEl.dataset.groupDate;
      const input = groupEl.querySelector('.anexo-group-input');
      const file = input && input.files && input.files[0];
      if (date && file) preservedByDate.set(date, { file, prepared: input.__preparedFile || file });
    });

    container.innerHTML = '';

    if (!groups.length) {
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.innerHTML = '<i class="fa-solid fa-circle-info"></i> Preencha a data de cada avaliação acima para liberar o envio do(s) documento(s).';
      container.appendChild(hint);
      return;
    }

    groups.forEach((group, i) => {
      const isRequired = i === 0;
      const clone = anexoGroupTemplate.content.cloneNode(true);
      const groupEl = clone.querySelector('.anexo-group');
      groupEl.dataset.groupDate = group.data;
      groupEl.dataset.required = isRequired ? 'true' : 'false';

      const disciplinas = group.provaBlocks
        .map(pb => pb.querySelector('.prova-disciplina').value.trim())
        .filter(Boolean);
      const labelEl = groupEl.querySelector('.anexo-group-label');
      labelEl.textContent = `Documento ${i + 1} — ${SM.formatDateOnly(group.data)}` +
        (disciplinas.length ? ` (${disciplinas.join(', ')})` : '') +
        (isRequired ? '' : ' — opcional');

      const hintEl = groupEl.querySelector('.anexo-group-hint');
      hintEl.innerHTML = isRequired
        ? '<i class="fa-solid fa-circle-info"></i> Anexe o atestado médico ou o comprovante de pagamento referente às avaliações desta data.'
        : '<i class="fa-solid fa-circle-info"></i> Opcional — só é necessário se você também tiver um documento específico pra esta data.';

      const errMsgEl = groupEl.querySelector('.anexo-error-message');
      if (errMsgEl) {
        errMsgEl.textContent = isRequired
          ? 'Anexe o documento desta data (imagem ou PDF, até 8MB).'
          : 'Tipo de arquivo não suportado ou arquivo muito grande (máximo de 8MB).';
      }

      const input = groupEl.querySelector('.anexo-group-input');
      const preview = groupEl.querySelector('.anexo-preview');
      const preserved = preservedByDate.get(group.data);
      if (preserved) {
        const dt = new DataTransfer();
        dt.items.add(preserved.file);
        input.files = dt.files;
        input.__preparedFile = preserved.prepared;
        renderAnexoPreview(preserved.prepared, preview);
      }

      container.appendChild(clone);
    });
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
    const currentCount = alunoBlock.querySelectorAll('.prova-block').length;
    if (currentCount >= MAX_PROVAS_POR_ALUNO) {
      renumberProvas(alunoBlock); // garante que o botão fique escondido e o aviso visível
      return;
    }
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

    // Máximo de avaliações por aluno: esconde o botão de adicionar e mostra
    // o aviso pra procurar um requerimento separado quando atinge o limite.
    const atLimit = blocks.length >= MAX_PROVAS_POR_ALUNO;
    const addProvaBtn = alunoBlock.querySelector('.add-prova-btn');
    const limitMessage = alunoBlock.querySelector('.prova-limit-message');
    if (addProvaBtn) addProvaBtn.classList.toggle('hidden', atLimit);
    if (limitMessage) limitMessage.classList.toggle('hidden', !atLimit);

    // Adicionar/remover avaliação muda quantas datas distintas o aluno tem
    // — recalcula os campos de documento (um por data, ver renderAnexoGroups()).
    renderAnexoGroups(alunoBlock);
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
    if (e.target.matches('.anexo-group-input')) {
      const input = e.target;
      const groupEl = input.closest('.anexo-group');
      const preview = groupEl.querySelector('.anexo-preview');
      const errMsgEl = groupEl.querySelector('.anexo-error-message');
      const required = groupEl.dataset.required === 'true';
      const file = input.files && input.files[0];
      const err = validateAnexoFile(file, required);
      if (err) {
        if (errMsgEl) errMsgEl.textContent = err;
        groupEl.classList.add('invalid');
        renderAnexoPreview(null, preview);
        input.__preparedFile = null;
        input.value = '';
        return;
      }
      groupEl.classList.remove('invalid');
      renderAnexoPreview(file || null, preview); // preview imediato com o arquivo original
      input.__preparedFile = file || null; // valor provisório até a compressão terminar
      if (file) {
        compressImageFile(file).then((preparedFile) => {
          input.__preparedFile = preparedFile;
        });
      }
      return;
    }

    if (e.target.matches('.aluno-turma')) {
      const group = e.target.closest('.field-group');
      if (group && e.target.value) group.classList.remove('invalid');
      return;
    }

    if (e.target.matches('.prova-data')) {
      const group = e.target.closest('.field-group');
      if (group && e.target.value) group.classList.remove('invalid');
      const alunoBlock = e.target.closest('.aluno-block');
      if (alunoBlock) renderAnexoGroups(alunoBlock);
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
      if (e.target.matches('.prova-disciplina')) {
        const alunoBlock = e.target.closest('.aluno-block');
        if (alunoBlock) renderAnexoGroups(alunoBlock); // atualiza o rótulo do documento (lista de disciplinas)
      }
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
          if (!provaBlock.dataset.motivo) { markInvalid(motivoChoice.closest('.field-group')); valid = false; }
        });

        // Documentos: validados por grupo de data (um por dia distinto),
        // não por prova — ver renderAnexoGroups(). Recalcula antes de
        // validar pra garantir que reflete as datas atuais.
        renderAnexoGroups(alunoBlock);
        [...alunoBlock.querySelectorAll('.anexo-group')].forEach(groupEl => {
          const required = groupEl.dataset.required === 'true';
          const input = groupEl.querySelector('.anexo-group-input');
          const file = input && input.files ? input.files[0] : null;
          const err = validateAnexoFile(file, required);
          if (err) {
            const errMsgEl = groupEl.querySelector('.anexo-error-message');
            if (errMsgEl) errMsgEl.textContent = err;
            markInvalid(groupEl);
            valid = false;
          }
        });
      });
    }

    return valid;
  }

  /* ---------- Coleta de dados ---------- */
  function collectData() {
    return {
      alunos: [...alunosContainer.querySelectorAll(':scope > .aluno-block')].map(alunoBlock => {
        // Mapa data -> arquivo escolhido no grupo de documento daquela data
        // (ver renderAnexoGroups()); toda prova daquela data herda o mesmo
        // anexo, já que é solicitado uma vez por dia, não por prova.
        const anexoFileByDate = new Map();
        alunoBlock.querySelectorAll('.anexo-group').forEach(groupEl => {
          const input = groupEl.querySelector('.anexo-group-input');
          const file = input ? (input.__preparedFile || (input.files && input.files[0]) || null) : null;
          anexoFileByDate.set(groupEl.dataset.groupDate, file);
        });

        return {
          nome: alunoBlock.querySelector('.aluno-nome').value.trim(),
          turma: alunoBlock.querySelector('.aluno-turma').value,
          provas: [...alunoBlock.querySelectorAll('.prova-block')].map(provaBlock => {
            const dataValue = provaBlock.querySelector('.prova-data').value;
            return {
              disciplina: provaBlock.querySelector('.prova-disciplina').value.trim(),
              segmento: provaBlock.dataset.segmento || null,
              data: dataValue,
              motivo: {
                tipo: provaBlock.dataset.motivo || null,
                observacoes: provaBlock.querySelector('.prova-observacoes').value.trim()
              },
              anexoFile: anexoFileByDate.get(dataValue) || null
            };
          })
        };
      })
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
          // anexoFile pode ser null numa prova cujo grupo de data é o
          // documento opcional (2º+) e o requerente não anexou nada —
          // válido, ver renderAnexoGroups()/validateStep().
          let anexo = null;
          if (prova.anexoFile) {
            const base64 = await fileToBase64(prova.anexoFile);
            anexo = { nome: prova.anexoFile.name, tipo: prova.anexoFile.type, base64 };
          }
          provasPayload.push({
            disciplina: prova.disciplina,
            segmento: prova.segmento,
            data: prova.data,
            motivo: { tipo: prova.motivo.tipo, observacoes: prova.motivo.observacoes },
            anexo
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
