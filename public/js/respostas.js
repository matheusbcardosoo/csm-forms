/* ==========================================================
   respostas.js — gate de login + listagem de respostas
   Toda comunicacao com Supabase passa pelo servidor /api/*
   ========================================================== */

(function () {
  const DEFAULT_PASSWORD = 'SaoMarcos';

  const params = new URLSearchParams(window.location.search);
  const formId = params.get('form') || 'visitas';
  const form = SM.getForm(formId);

  const titleEl        = document.getElementById('responses-title');
  const listEl         = document.getElementById('responses-list');
  const overlay        = document.getElementById('modal-overlay');
  const modalBox       = document.getElementById('modal-box');
  const authGate       = document.getElementById('auth-gate');
  const changePwGate   = document.getElementById('change-password-gate');
  const accessDenied   = document.getElementById('access-denied');
  const responsesCont  = document.getElementById('responses-content');

  const loginEmailInput        = document.getElementById('login-email');
  const loginEmailGroup        = document.getElementById('login-email-group');
  const loginEmailErrMsg       = document.getElementById('login-email-error-message');
  const loginPasswordInput     = document.getElementById('login-password');
  const loginPasswordGroup     = document.getElementById('login-password-group');
  const loginPasswordErrMsg    = document.getElementById('login-password-error-message');
  const loginBtn               = document.getElementById('login-btn');

  const newPasswordInput    = document.getElementById('new-password');
  const newPasswordGroup    = document.getElementById('new-password-group');
  const newPasswordErrMsg   = document.getElementById('new-password-error-message');
  const confirmPasswordInput = document.getElementById('confirm-password');
  const confirmPasswordGroup = document.getElementById('confirm-password-group');
  const changePasswordBtn   = document.getElementById('change-password-btn');

  const logoutBtn      = document.getElementById('logout-btn');
  const deniedLogoutBtn = document.getElementById('denied-logout-btn');

  let responses = [];

  if (form) titleEl.textContent = 'Respostas: ' + form.nome;

  /* ---------- Visibilidade de telas ---------- */
  function showOnly(el) {
    [authGate, changePwGate, accessDenied, responsesCont].forEach(s => {
      s.classList.toggle('hidden', s !== el);
    });
  }

  function showGate() {
    loginPasswordInput.value = '';
    showOnly(authGate);
  }

  function showChangePassword() {
    newPasswordInput.value = '';
    confirmPasswordInput.value = '';
    showOnly(changePwGate);
  }

  /* ---------- Init ---------- */
  async function init() {
    try {
      const res = await fetch('/api/auth/session');
      const session = await res.json();
      if (!session.loggedIn) return showGate();
      if (session.mustChangePassword) return showChangePassword();
      if (!session.authorized) return showOnly(accessDenied);
      showOnly(responsesCont);
      loadResponses();
    } catch (err) {
      console.error('Erro ao verificar sessao:', err);
      showGate();
    }
  }

  /* ---------- Login ---------- */
  loginBtn.addEventListener('click', async () => {
    const email    = loginEmailInput.value.trim();
    const password = loginPasswordInput.value;
    loginEmailGroup.classList.remove('invalid');
    loginPasswordGroup.classList.remove('invalid');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      loginEmailErrMsg.textContent = 'Informe um e-mail válido.';
      loginEmailGroup.classList.add('invalid');
      return;
    }
    if (!password) {
      loginPasswordErrMsg.textContent = 'Informe sua senha.';
      loginPasswordGroup.classList.add('invalid');
      return;
    }

    loginBtn.disabled = true;
    const origLabel = loginBtn.innerHTML;
    loginBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Entrando...';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const result = await res.json();

      if (!res.ok) {
        loginPasswordErrMsg.textContent = result.error || 'E-mail ou senha incorretos.';
        loginPasswordGroup.classList.add('invalid');
        return;
      }
      if (result.mustChangePassword) return showChangePassword();
      if (!result.authorized) return showOnly(accessDenied);
      showOnly(responsesCont);
      loadResponses();
    } catch (err) {
      console.error('Erro ao entrar:', err);
      loginPasswordErrMsg.textContent = 'Erro de conexao. Tente novamente.';
      loginPasswordGroup.classList.add('invalid');
    } finally {
      loginBtn.disabled = false;
      loginBtn.innerHTML = origLabel;
    }
  });

  [loginEmailInput, loginPasswordInput].forEach(el => {
    el.addEventListener('keydown', e => { if (e.key === 'Enter') loginBtn.click(); });
  });

  /* ---------- Troca de senha ---------- */
  changePasswordBtn.addEventListener('click', async () => {
    const newPw  = newPasswordInput.value;
    const confPw = confirmPasswordInput.value;
    newPasswordGroup.classList.remove('invalid');
    confirmPasswordGroup.classList.remove('invalid');

    if (newPw.length < 8 || newPw === DEFAULT_PASSWORD) {
      newPasswordErrMsg.textContent = newPw === DEFAULT_PASSWORD
        ? 'Escolha uma senha diferente da padrao.'
        : 'A senha precisa ter ao menos 8 caracteres.';
      newPasswordGroup.classList.add('invalid');
      return;
    }
    if (newPw !== confPw) {
      confirmPasswordGroup.classList.add('invalid');
      return;
    }

    changePasswordBtn.disabled = true;
    const origLabel = changePasswordBtn.innerHTML;
    changePasswordBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPw })
      });
      const result = await res.json();

      if (!res.ok) {
        newPasswordErrMsg.textContent = result.error || 'Nao foi possivel salvar a nova senha.';
        newPasswordGroup.classList.add('invalid');
        return;
      }

      const sessionRes = await fetch('/api/auth/session');
      const session = await sessionRes.json();
      if (!session.loggedIn || !session.authorized) return showOnly(accessDenied);
      showOnly(responsesCont);
      loadResponses();
    } catch (err) {
      console.error('Erro ao trocar senha:', err);
      newPasswordErrMsg.textContent = 'Erro de conexao. Tente novamente.';
      newPasswordGroup.classList.add('invalid');
    } finally {
      changePasswordBtn.disabled = false;
      changePasswordBtn.innerHTML = origLabel;
    }
  });

  /* ---------- Logout ---------- */
  async function doLogout() {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (_) {}
    responses = [];
    loginEmailInput.value = '';
    showGate();
  }

  logoutBtn.addEventListener('click', doLogout);
  deniedLogoutBtn.addEventListener('click', doLogout);

  init();

  /* ---------- Lista de respostas ---------- */
  function renderList() {
    if (responses.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><p>Nenhuma resposta enviada ainda para este formulario.</p></div>';
      return;
    }
    listEl.innerHTML = responses.map(r => {
      const primeiroAluno = r.data.students && r.data.students[0] ? r.data.students[0].nome : 'Sem nome';
      const totalAlunos   = r.data.students ? r.data.students.length : 1;
      const extra         = totalAlunos > 1 ? ' (+' + (totalAlunos - 1) + ')' : '';
      return '<div class="response-item" data-id="' + r.id + '">' +
        '<div class="meta">' +
          '<h4>' + primeiroAluno + extra + '</h4>' +
          '<p>Enviado em ' + SM.formatDate(r.submittedAt) + '</p>' +
        '</div>' +
        '<button class="btn btn-ghost btn-sm view-btn" data-id="' + r.id + '">Ver detalhes</button>' +
    '</div>';
    }).join('');
  }

  async function loadResponses() {
    listEl.innerHTML = '<div class="empty-state"><p><i class="fa-solid fa-spinner fa-spin"></i> Carregando respostas...</p></div>';
    try {
      const res = await fetch('/api/responses?form=' + formId);
      if (res.status === 401) { doLogout(); return; }
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
    modalBox.innerHTML =
      '<div class="modal-header">' +
        '<h2>Detalhes da resposta</h2>' +
        '<p class="modal-subtitle">Enviado em ' + SM.formatDate(record.submittedAt) + '</p>' +
      '</div>' +
      '<div class="modal-review">' + SMReview.buildReviewCards(record.data, false) + '</div>' +
      '<div class="modal-footer">' +
        '<button class="btn btn-secondary" id="close-modal-btn">Fechar</button>' +
        '<button class="btn btn-secondary" id="whatsapp-modal-btn"><i class="fa-brands fa-whatsapp"></i> Enviar por WhatsApp</button>' +
        '<button class="btn btn-primary" id="print-modal-btn"><i class="fa-solid fa-file-pdf"></i> Baixar PDF</button>' +
      '</div>';
    overlay.classList.remove('hidden');
    document.getElementById('close-modal-btn').addEventListener('click', closeModal);
    document.getElementById('print-modal-btn').addEventListener('click', () => downloadPdf(record));
    document.getElementById('whatsapp-modal-btn').addEventListener('click', () => sendWhatsapp(record));
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
      const res = await fetch('/api/responses/' + record.id + '/pdf');
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
      const res = await fetch('/api/responses/' + record.id + '/whatsapp', { method: 'POST' });
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