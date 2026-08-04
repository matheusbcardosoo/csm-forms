/* ==========================================================
   wizard.js
   Lógica do formulário multi-etapas de Visitas.
   ========================================================== */

(function () {
  const FORM_ID = 'visitas';
  const TOTAL_STEPS = 5;

  let currentStep = 1;
  let studentCount = 0;
  let indicacaoValue = null; // 'sim' | 'nao' | null

  const form = document.getElementById('visita-form');
  if (!form) return; // não é a página do wizard

  const stepLabel = document.getElementById('step-label');
  const stepper = document.getElementById('stepper');
  const backBtn = document.getElementById('back-btn');
  const nextBtn = document.getElementById('next-btn');
  const wizardNav = document.getElementById('wizard-nav');
  const studentsContainer = document.getElementById('students-container');
  const studentTemplate = document.getElementById('student-block-template');
  const addStudentBtn = document.getElementById('add-student-btn');
  const indicacaoChoice = document.getElementById('indicacao-choice');
  const indicacaoNomeGroup = document.getElementById('indicacao-nome-group');
  const responsaveisError = document.getElementById('responsaveis-error');
  const submitError = document.getElementById('submit-error');
  const submitErrorMessage = document.getElementById('submit-error-message');
  const consentCheckbox = document.getElementById('consent-checkbox');
  const consentGroup    = document.getElementById('consent-group');

  /* ---------- Validadores ---------- */
  // Exige nome + sobrenome (ao menos 2 palavras com 2+ letras cada, sem números/símbolos).
  function isFullName(value) {
    if (!value) return false;
    const words = value.trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) return false;
    const nameRegex = /^[A-Za-zÀ-ÖØ-öø-ÿ'’-]+$/;
    return words.every(w => w.length >= 2 && nameRegex.test(w));
  }

  // Aceita telefone nacional (DDD + 8 ou 9 dígitos) ou internacional (+ até 15 dígitos).
  function isValidPhone(value) {
    if (!value) return false;
    const digits = value.replace(/\D/g, '');
    if (value.trim().startsWith('+')) {
      return digits.length >= 8 && digits.length <= 15;
    }
    return digits.length === 10 || digits.length === 11;
  }

  function maskPhoneBR(digits) {
    digits = digits.slice(0, 11);
    if (!digits.length) return '';
    let out = '(' + digits.slice(0, 2);
    if (digits.length > 2) {
      out += ') ';
      const rest = digits.slice(2);
      if (digits.length > 10) {
        out += rest.slice(0, 5) + (rest.length > 5 ? '-' + rest.slice(5, 9) : '');
      } else {
        out += rest.slice(0, 4) + (rest.length > 4 ? '-' + rest.slice(4, 8) : '');
      }
    }
    return out;
  }

  function maskPhoneIntl(digits) {
    digits = digits.slice(0, 15);
    let out = '+';
    for (let i = 0; i < digits.length; i++) {
      if (i > 0 && i % 3 === 0) out += ' ';
      out += digits[i];
    }
    return out;
  }

  // Aplica máscara (nacional ou internacional, conforme o "+" inicial) e bloqueia
  // qualquer caractere que não seja dígito ou o "+" de abertura.
  function bindPhoneMask(el) {
    if (!el) return;
    el.addEventListener('input', () => {
      const isIntl = el.value.trim().startsWith('+');
      const digits = el.value.replace(/\D/g, '');
      el.value = isIntl ? maskPhoneIntl(digits) : maskPhoneBR(digits);

      const group = el.closest('.field-group');
      if (group && isValidPhone(el.value)) group.classList.remove('invalid');
    });
  }

  /* ---------- Validação em tempo real ---------- */
  // Remove o estado de erro do campo assim que o usuário o corrige,
  // sem esperar por um novo clique em "Próximo".
  function bindLiveValidation(el, validator) {
    if (!el) return;
    const isValid = validator || (value => !!(value && String(value).trim()));
    const evt = (el.tagName === 'SELECT' || el.type === 'date') ? 'change' : 'input';
    el.addEventListener(evt, () => {
      const group = el.closest('.field-group');
      if (group && isValid(el.value)) {
        group.classList.remove('invalid');
      }
    });
  }

  /* ---------- Formatacao automatica ---------- */
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

  // Title Case "cru" (sem excecao de particulas) - usado pra nome de cidade,
  // onde "Das", "Do" etc. devem ficar maiusculos mesmo no meio da frase.
  function toWordTitleCase(str) {
    if (!str) return '';
    return str.trim().toLowerCase().split(/\s+/).map(w =>
      w ? w[0].toUpperCase() + w.slice(1) : w
    ).join(' ');
  }

  // "Cidade/Estado": aceita "-" ou "/" como separador, remove os espacos
  // ao redor dele (evita "Mogi das Cruzes / SP" x "Mogi das Cruzes/SP")
  // e deixa a sigla do estado em maiusculo.
  function toCityState(str) {
    if (!str) return '';
    const parts = str.trim().split(/\s*[\/-]\s*/);
    const cidade = toWordTitleCase(parts[0]);
    const estado = parts[1] ? parts[1].trim().toUpperCase() : '';
    return estado ? cidade + '/' + estado : cidade;
  }

  function bindTitleCase(el) {
    if (!el) return;
    el.addEventListener('blur', () => { if (el.value) el.value = toTitleCase(el.value); });
  }

  function bindCapFirst(el) {
    if (!el) return;
    el.addEventListener('blur', () => { if (el.value) el.value = capFirst(el.value); });
  }

  function bindCityState(el) {
    if (!el) return;
    el.addEventListener('blur', () => { if (el.value) el.value = toCityState(el.value); });
  }

  /* ---------- Alunos ---------- */
  function addStudentBlock() {
    studentCount++;
    const clone = studentTemplate.content.cloneNode(true);
    const block = clone.querySelector('.student-block');
    block.dataset.studentIndex = studentCount;
    block.querySelector('.student-block-header span').textContent = 'Aluno ' + studentCount;

    const removeBtn = block.querySelector('.remove-student-btn');
    if (studentCount === 1) {
      removeBtn.style.display = 'none';
    } else {
      removeBtn.addEventListener('click', () => {
        block.remove();
        renumberStudents();
      });
    }

    bindLiveValidation(block.querySelector('.student-nome'), isFullName);
    bindTitleCase(block.querySelector('.student-nome'));
    bindLiveValidation(block.querySelector('.student-nascimento'));
    bindLiveValidation(block.querySelector('.student-turma'));

    studentsContainer.appendChild(clone);
  }

  function renumberStudents() {
    const blocks = studentsContainer.querySelectorAll('.student-block');
    blocks.forEach((block, i) => {
      block.querySelector('.student-block-header span').textContent = 'Aluno ' + (i + 1);
      const removeBtn = block.querySelector('.remove-student-btn');
      removeBtn.style.display = i === 0 ? 'none' : '';
    });
  }

  addStudentBtn.addEventListener('click', addStudentBlock);
  addStudentBlock(); // primeiro aluno sempre visível

  /* ---------- Indicação (sim/não) ---------- */
  indicacaoChoice.addEventListener('click', (e) => {
    const pill = e.target.closest('.choice-pill');
    if (!pill) return;
    indicacaoValue = pill.dataset.value;
    [...indicacaoChoice.children].forEach(p => p.classList.toggle('selected', p === pill));
    indicacaoNomeGroup.classList.toggle('hidden', indicacaoValue !== 'sim');
    indicacaoNomeGroup.classList.remove('invalid');

    const indicacaoFieldGroup = indicacaoChoice.closest('.field-group');
    if (indicacaoFieldGroup) indicacaoFieldGroup.classList.remove('invalid');
  });

  /* ---------- Responsáveis: campos com validação em tempo real ---------- */
  ['pai-nome', 'mae-nome'].forEach(id => {
    bindLiveValidation(document.getElementById(id), isFullName);
    bindTitleCase(document.getElementById(id));
  });
  ['pai-profissao', 'mae-profissao'].forEach(id => {
    bindLiveValidation(document.getElementById(id));
  });
  bindPhoneMask(document.getElementById('pai-whatsapp'));
  bindPhoneMask(document.getElementById('mae-whatsapp'));

  // Some o aviso de "nenhum responsável preenchido" assim que um nome for digitado.
  ['pai-nome', 'mae-nome'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      const paiNome = document.getElementById('pai-nome').value.trim();
      const maeNome = document.getElementById('mae-nome').value.trim();
      if (paiNome || maeNome) responsaveisError.classList.add('hidden');
    });
  });

  /* ---------- Consentimento LGPD ---------- */
  if (consentCheckbox) {
    consentCheckbox.addEventListener('change', () => {
      if (consentCheckbox.checked) consentGroup.classList.remove('invalid');
    });
  }

  /* ---------- Demais campos com validação em tempo real ---------- */
  ['escola-nome', 'escola-cidade', 'motivo'].forEach(id => {
    bindLiveValidation(document.getElementById(id));
  });
  bindLiveValidation(document.getElementById('indicacao-nome'), isFullName);
  bindTitleCase(document.getElementById('escola-nome'));
  bindCityState(document.getElementById('escola-cidade'));
  bindTitleCase(document.getElementById('indicacao-nome'));
  bindCapFirst(document.getElementById('motivo'));
  bindCapFirst(document.getElementById('observacoes'));

  /* ---------- Validação por etapa ---------- */
  function clearErrors(scope) {
    scope.querySelectorAll('.field-group.invalid').forEach(g => g.classList.remove('invalid'));
  }

  function markInvalid(fieldGroup) {
    fieldGroup.classList.add('invalid');
  }

  function validateStep(step) {
    let valid = true;

    if (step === 1) {
      const blocks = studentsContainer.querySelectorAll('.student-block');
      blocks.forEach(block => {
        clearErrors(block);
        const nome = block.querySelector('.student-nome');
        const nascimento = block.querySelector('.student-nascimento');
        const turma = block.querySelector('.student-turma');

        if (!isFullName(nome.value)) { markInvalid(nome.closest('.field-group')); valid = false; }
        if (!nascimento.value) { markInvalid(nascimento.closest('.field-group')); valid = false; }
        if (!turma.value) { markInvalid(turma.closest('.field-group')); valid = false; }
      });
    }

    if (step === 2) {
      const nome = document.getElementById('escola-nome');
      const cidade = document.getElementById('escola-cidade');
      clearErrors(document.querySelector('[data-step="2"]'));
      if (!nome.value.trim()) { markInvalid(nome.closest('.field-group')); valid = false; }
      if (!cidade.value.trim()) { markInvalid(cidade.closest('.field-group')); valid = false; }
    }

    if (step === 3) {
      clearErrors(document.querySelector('[data-step="3"]'));
      responsaveisError.classList.add('hidden');

      const responsavelBlocks = ['pai', 'mae'].map(prefix => {
        const nome = document.getElementById(prefix + '-nome');
        const whatsapp = document.getElementById(prefix + '-whatsapp');
        const profissao = document.getElementById(prefix + '-profissao');
        const anyFilled = !!(nome.value.trim() || whatsapp.value.trim() || profissao.value.trim());
        return { nome, whatsapp, profissao, anyFilled };
      });

      const someoneFilled = responsavelBlocks.some(b => b.anyFilled);

      if (!someoneFilled) {
        responsaveisError.classList.remove('hidden');
        valid = false;
      } else {
        responsavelBlocks.forEach(b => {
          if (!b.anyFilled) return; // bloco vazio é permitido se o outro estiver completo
          if (!isFullName(b.nome.value)) { markInvalid(b.nome.closest('.field-group')); valid = false; }
          if (!isValidPhone(b.whatsapp.value)) { markInvalid(b.whatsapp.closest('.field-group')); valid = false; }
          if (!b.profissao.value.trim()) { markInvalid(b.profissao.closest('.field-group')); valid = false; }
        });
      }
    }

    if (step === 4) {
      const motivo = document.getElementById('motivo');
      clearErrors(document.querySelector('[data-step="4"]'));
      if (!motivo.value.trim()) { markInvalid(motivo.closest('.field-group')); valid = false; }

      if (!indicacaoValue) {
        markInvalid(indicacaoChoice.closest('.field-group'));
        valid = false;
      }

      if (indicacaoValue === 'sim' && !isFullName(document.getElementById('indicacao-nome').value)) {
        valid = false;
        indicacaoNomeGroup.classList.add('invalid');
      } else {
        indicacaoNomeGroup.classList.remove('invalid');
      }
    }

    return valid;
  }

  /* ---------- Coleta de dados ---------- */
  function collectData() {
    const students = [...studentsContainer.querySelectorAll('.student-block')].map(block => ({
      nome: block.querySelector('.student-nome').value.trim(),
      nascimento: block.querySelector('.student-nascimento').value,
      turma: block.querySelector('.student-turma').value
    }));

    return {
      students,
      escola: {
        nome: document.getElementById('escola-nome').value.trim(),
        cidadeEstado: document.getElementById('escola-cidade').value.trim()
      },
      responsaveis: {
        pai: {
          nome: document.getElementById('pai-nome').value.trim(),
          whatsapp: document.getElementById('pai-whatsapp').value.trim(),
          profissao: document.getElementById('pai-profissao').value.trim()
        },
        mae: {
          nome: document.getElementById('mae-nome').value.trim(),
          whatsapp: document.getElementById('mae-whatsapp').value.trim(),
          profissao: document.getElementById('mae-profissao').value.trim()
        }
      },
      extras: {
        motivo: document.getElementById('motivo').value.trim(),
        indicado: indicacaoValue,
        indicacaoNome: indicacaoValue === 'sim' ? document.getElementById('indicacao-nome').value.trim() : '',
        observacoes: document.getElementById('observacoes').value.trim()
      }
    };
  }

  /* ---------- Revisão ---------- */
  function renderReview() {
    const data = collectData();
    const container = document.getElementById('review-container');

    container.innerHTML = SMReview.buildReviewCards(data, true);

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

  nextBtn.addEventListener('click', async () => {
    if (!validateStep(currentStep)) return;

    if (currentStep < TOTAL_STEPS) {
      goToStep(currentStep + 1);
      return;
    }

    // validacao do consentimento LGPD
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
      const apiRes = await fetch('/api/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!apiRes.ok) {
        const errData = await apiRes.json();
        throw new Error(errData.error || 'Erro ao enviar formulario.');
      }
      wizardNav.classList.add('hidden');
      form.querySelectorAll('.wizard-step').forEach(s => s.classList.add('hidden'));
      form.querySelector('.wizard-step[data-step="success"]').classList.remove('hidden');
      stepLabel.classList.add('hidden');
      stepper.classList.add('hidden');
    } catch (err) {
      console.error('Erro ao enviar formulário:', err);
      submitErrorMessage.textContent = err && err.message
        ? `Não foi possível enviar o formulário: ${err.message}`
        : 'Não foi possível enviar o formulário. Verifique sua conexão e tente novamente.';
      submitError.classList.remove('hidden');
      nextBtn.disabled = false;
      backBtn.disabled = false;
      nextBtn.textContent = originalLabel;
      submitError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  showStep(currentStep);
})();
