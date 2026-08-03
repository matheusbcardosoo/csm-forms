/* ==========================================================
   respostas.js
   Gate de login (magic link) + listagem e detalhe das respostas
   já enviadas, lidas direto do Postgres via Supabase.
   ========================================================== */

(function () {
  const params = new URLSearchParams(window.location.search);
  const formId = params.get('form') || 'visitas';

  const form = SM.getForm(formId);
  const titleEl = document.getElementById('responses-title');
  const listEl = document.getElementById('responses-list');
  const overlay = document.getElementById('modal-overlay');
  const modalBox = document.getElementById('modal-box');

  const authGate = document.getElementById('auth-gate');
  const accessDenied = document.getElementById('access-denied');
  const responsesContent = document.getElementById('responses-content');
  const loginEmailInput = document.getElementById('login-email');
  const loginEmailGroup = document.getElementById('login-email-group');
  const loginErrorMessage = document.getElementById('login-error-message');
  const loginBtn = document.getElementById('login-btn');
  const loginSentMessage = document.getElementById('login-sent-message');
  const logoutBtn = document.getElementById('logout-btn');
  const deniedLogoutBtn = document.getElementById('denied-logout-btn');

  let responses = [];

  if (form) {
    titleEl.textContent = `Respostas: ${form.nome}`;
  }

  /* ---------- Estados de tela ---------- */
  function showOnly(el) {
    [authGate, accessDenied, responsesContent].forEach(section => {
      section.classList.toggle('hidden', section !== el);
    });
  }

  function showGate() {
    showOnly(authGate);
  }

  async function handleAuthenticated() {
    let authorized = false;
    try {
      authorized = await SM.isAuthorizedStaff();
    } catch (err) {
      console.error('Erro ao checar autorização:', err);
    }

    if (!authorized) {
      showOnly(accessDenied);
      return;
    }

    showOnly(responsesContent);
    loadResponses();
  }

  async function init() {
    try {
      const session = await SM.getSession();
      if (session) {
        await handleAuthenticated();
      } else {
        showGate();
      }
    } catch (err) {
      console.error('Erro ao verificar sessão:', err);
      showGate();
    }

    SM.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') handleAuthenticated();
      if (event === 'SIGNED_OUT') showGate();
    });
  }

  /* ---------- Envio do magic link ---------- */
  loginBtn.addEventListener('click', async () => {
    const email = loginEmailInput.value.trim();
    loginEmailGroup.classList.remove('invalid');
    loginSentMessage.classList.add('hidden');

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      loginErrorMessage.textContent = 'Informe um e-mail válido.';
      loginEmailGroup.classList.add('invalid');
      return;
    }

    loginBtn.disabled = true;
    const originalLabel = loginBtn.innerHTML;
    loginBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...';

    try {
      const redirectTo = window.location.origin + window.location.pathname + window.location.search;
      await SM.signInWithMagicLink(email, redirectTo);
      loginSentMessage.innerHTML = `<i class="fa-solid fa-envelope-circle-check"></i> Link enviado! Confira a caixa de entrada de ${SM.escapeHtml(email)}.`;
      loginSentMessage.classList.remove('hidden');
    } catch (err) {
      console.error('Erro ao enviar magic link:', err);
      loginErrorMessage.textContent = err && err.message
        ? err.message
        : 'Não foi possível enviar o link. Tente novamente.';
      loginEmailGroup.classList.add('invalid');
    } finally {
      loginBtn.disabled = false;
      loginBtn.innerHTML = originalLabel;
    }
  });

  /* ---------- Logout ---------- */
  async function doLogout() {
    try {
      await SM.signOut();
    } catch (err) {
      console.error('Erro ao sair:', err);
    }
    responses = [];
    loginEmailInput.value = '';
    loginSentMessage.classList.add('hidden');
    showGate();
  }

  logoutBtn.addEventListener('click', doLogout);
  deniedLogoutBtn.addEventListener('click', doLogout);

  init();

  function renderList() {
    if (responses.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <p>Nenhuma resposta enviada ainda para este formulário.</p>
        </div>`;
      return;
    }

    listEl.innerHTML = responses.map(r => {
      const primeiroAluno = (r.data.students && r.data.students[0]) ? r.data.students[0].nome : 'Sem nome';
      const totalAlunos = r.data.students ? r.data.students.length : 1;
      const extra = totalAlunos > 1 ? ` (+${totalAlunos - 1})` : '';
      return `
        <div class="response-item" data-id="${r.id}">
          <div class="meta">
            <h4>${primeiroAluno}${extra}</h4>
            <p>Enviado em ${SM.formatDate(r.submittedAt)}</p>
          </div>
          <button class="btn btn-ghost btn-sm view-btn" data-id="${r.id}">Ver detalhes</button>
        </div>`;
    }).join('');
  }

  async function loadResponses() {
    listEl.innerHTML = `
      <div class="empty-state">
        <p><i class="fa-solid fa-spinner fa-spin"></i> Carregando respostas...</p>
      </div>`;

    try {
      responses = await SM.getResponses(formId);
      renderList();
    } catch (err) {
      console.error('Erro ao carregar respostas:', err);
      listEl.innerHTML = `
        <div class="empty-state">
          <p><i class="fa-solid fa-triangle-exclamation"></i> Não foi possível carregar as respostas.</p>
          <p style="font-size:13px;">${SM.escapeHtml(err && err.message ? err.message : 'Verifique a conexão com o banco de dados.')}</p>
        </div>`;
    }
  }

  listEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.view-btn');
    if (!btn) return;
    const record = responses.find(r => r.id === btn.dataset.id);
    if (record) openModal(record);
  });

  function openModal(record) {
    let html = `<div class="modal-header">
      <h2>Detalhes da resposta</h2>
      <p class="modal-subtitle">Enviado em ${SM.formatDate(record.submittedAt)}</p>
    </div>`;

    html += `<div class="modal-review">${SMReview.buildReviewCards(record.data, false)}</div>`;

    html += `<div class="modal-footer">
      <button class="btn btn-secondary" id="close-modal-btn">Fechar</button>
      <button class="btn btn-primary" id="print-modal-btn"><i class="fa-solid fa-print"></i> Imprimir para assinatura</button>
    </div>`;

    modalBox.innerHTML = html;
    overlay.classList.remove('hidden');
    document.getElementById('close-modal-btn').addEventListener('click', closeModal);
    document.getElementById('print-modal-btn').addEventListener('click', () => printForSignature(record));
  }

  function closeModal() {
    overlay.classList.add('hidden');
    modalBox.innerHTML = '';
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  /* ---------- Impressão para assinatura ---------- */
  function getOrCreatePrintDocument() {
    let el = document.getElementById('print-document');
    if (!el) {
      el = document.createElement('div');
      el.id = 'print-document';
      el.className = 'print-document';
      document.body.appendChild(el);
    }
    return el;
  }

  function printForSignature(record) {
    const data = record.data || {};
    const pai = (data.responsaveis && data.responsaveis.pai) || {};
    const mae = (data.responsaveis && data.responsaveis.mae) || {};

    const printEl = getOrCreatePrintDocument();

    printEl.innerHTML = `
      <div class="print-header">
        <img src="assets/images/logo.jpg" alt="Colégio São Marcos" class="print-logo">
      </div>

      <h1 class="print-title">Ficha de Registro de Visita</h1>
      <p class="print-subtitle">Enviado em ${SM.formatDate(record.submittedAt)}</p>

      <div class="print-body">
        ${SMReview.buildReviewCards(data, false)}
      </div>

      <div class="print-footer">
        <p class="print-location">Mogi das Cruzes, ${SM.formatDateExtenso(record.submittedAt)}.</p>
        <div class="print-signatures">
          <div class="signature-block">
            <div class="signature-line"></div>
            <p>Assinatura do Pai${pai.nome ? '<br>' + SM.escapeHtml(pai.nome) : ''}</p>
          </div>
          <div class="signature-block">
            <div class="signature-line"></div>
            <p>Assinatura da Mãe${mae.nome ? '<br>' + SM.escapeHtml(mae.nome) : ''}</p>
          </div>
        </div>
      </div>
    `;

    window.print();
  }
})();
