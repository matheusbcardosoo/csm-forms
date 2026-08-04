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
        '<button class="btn btn-primary" id="print-modal-btn"><i class="fa-solid fa-file-pdf"></i> Baixar PDF</button>' +
      '</div>';
    overlay.classList.remove('hidden');
    document.getElementById('close-modal-btn').addEventListener('click', closeModal);
    document.getElementById('print-modal-btn').addEventListener('click', () => printForSignature(record));
  }

  function closeModal() {
    overlay.classList.add('hidden');
    modalBox.innerHTML = '';
  }

  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

  /* ---------- PDF (html2pdf.js) ---------- */
  function generatePdfFilename(record) {
    const firstStudent =
      record.data.students && record.data.students[0]
        ? record.data.students[0].nome
        : 'visita';
    const d = new Date(record.submittedAt);
    const dd   = String(d.getDate()).padStart(2, '0');
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const slug = firstStudent
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return slug + '-' + dd + '-' + mm + '-' + yyyy + '.pdf';
  }

  function printForSignature(record) {
    const data = record.data || {};
    const pai  = (data.responsaveis && data.responsaveis.pai) || {};
    const mae  = (data.responsaveis && data.responsaveis.mae) || {};

    // Feedback de carregamento no botao
    const pdfBtn = document.getElementById('print-modal-btn');
    const pdfBtnLabel = pdfBtn ? pdfBtn.innerHTML : '';
    if (pdfBtn) {
      pdfBtn.disabled = true;
      pdfBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gerando PDF...';
    }

    // Sem position:fixed/absolute nem z-index negativo: o modal (que
    // fica aberto o tempo todo aqui) ja cobre a viewport inteira com
    // um overlay, entao um elemento em fluxo normal no fim do <body>
    // ja fica visualmente escondido atras dele — sem precisar de
    // nenhum truque de coordenada que confunda o html2canvas.
    const el = document.createElement('div');
    const cs = el.style;
    cs.width      = '794px';
    cs.background = '#ffffff';
    cs.padding    = '20px 28px';
    cs.boxSizing  = 'border-box';
    cs.fontFamily = 'Inter, Segoe UI, Arial, sans-serif';
    cs.fontSize   = '13px';
    cs.color      = '#1a2530';

    const paiSig = pai.nome
      ? 'Assinatura do Pai<br><strong>' + SM.escapeHtml(pai.nome) + '</strong>'
      : 'Assinatura do Pai';
    const maeSig = mae.nome
      ? 'Assinatura da Mae<br><strong>' + SM.escapeHtml(mae.nome) + '</strong>'
      : 'Assinatura da Mae';

    el.innerHTML = [
      '<div style="display:flex;align-items:center;justify-content:space-between;',
          'gap:20px;margin-bottom:16px;padding-bottom:12px;',
          'border-bottom:1px solid #e2e8f0;">',
        '<img src="/images/logo.jpg" alt="Colegio Sao Marcos"',
        '     style="max-height:60px;display:block;">',
        '<h1 style="text-align:right;font-size:15px;font-weight:700;',
            'color:#0F385A;margin:0;">Ficha de Registro de Visita</h1>',
      '</div>',
      '<div>', SMReview.buildReviewCards(data, false, true), '</div>',
      '<div style="margin-top:44px;">',
        '<p style="font-size:11px;margin:0 0 50px;">',
          'Mogi das Cruzes, ', SM.formatDateExtenso(record.submittedAt), '.',
        '</p>',
        '<div style="display:flex;justify-content:space-between;gap:40px;">',
          '<div style="flex:1;text-align:center;">',
            '<div style="border-top:1px solid #1a2530;margin-bottom:6px;"></div>',
            '<p style="font-size:11px;color:#7a8794;margin:0;">', paiSig, '</p>',
          '</div>',
          '<div style="flex:1;text-align:center;">',
            '<div style="border-top:1px solid #1a2530;margin-bottom:6px;"></div>',
            '<p style="font-size:11px;color:#7a8794;margin:0;">', maeSig, '</p>',
          '</div>',
        '</div>',
      '</div>'
    ].join('');

    document.body.appendChild(el);

    const cleanup = () => {
      document.body.removeChild(el);
      if (pdfBtn) { pdfBtn.disabled = false; pdfBtn.innerHTML = pdfBtnLabel; }
    };

    // html2canvas captura a logo antes dela terminar de carregar se a
    // gente nao esperar — o img pode ainda estar em branco no instante
    // do .from(el). Espera todas as imagens do bloco carregarem (ou
    // falharem) antes de gerar o PDF.
    const waitForImages = () => {
      const imgs = el.querySelectorAll('img');
      return Promise.all(Array.from(imgs).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        });
      }));
    };

    waitForImages()
      .then(() => {
        // Sem windowWidth: o elemento ja tem largura fixa propria (794px),
        // simular outra largura de "janela" so bagunca o layout do clone
        // e desalinha a captura em relacao ao elemento real.
        const worker = html2pdf().set({
          image:       { type: 'jpeg', quality: 0.97 },
          html2canvas: { scale: 2, useCORS: true, allowTaint: false, logging: false }
        }).from(el);

        // worker.toCanvas() nao resolve com o canvas em si (o passo interno
        // do html2pdf.js 0.10.2 nao retorna valor) - precisa buscar via
        // .get('canvas'), senao "canvas" chega undefined aqui.
        return worker.toCanvas().then(() => worker.get('canvas')).then(canvas => {
          // O bundle do html2pdf.js nao expoe um global limpo pra classe
          // jsPDF (window.jspdf/window.jsPDF nao existem nessa versao), entao
          // pegamos a classe a partir de uma instancia que o proprio worker
          // ja sabe criar, reaproveitando o canvas que acabamos de capturar.
          return worker.toPdf().get('pdf').then(pdf => {
            // Monta o PDF na mao em vez de confiar no auto-fit do html2pdf.js:
            // ele pagina automaticamente quando o conteudo "acha" que nao
            // cabe, e foi isso que cortava o texto e gerava 2 paginas.
            // O objeto "pdf" aqui ja e uma instancia jsPDF valida (o bundle
            // do html2pdf.js nao expoe a classe como global, entao a gente
            // reaproveita essa instancia em vez de tentar construir uma nova).
            // Apaga qualquer pagina extra que o auto-fit tenha criado.
            while (pdf.internal.getNumberOfPages() > 1) {
              pdf.deletePage(pdf.internal.getNumberOfPages());
            }

            const pageW   = pdf.internal.pageSize.getWidth();
            const pageH   = pdf.internal.pageSize.getHeight();
            const marginX = 10;
            const marginY = 6;
            const maxW    = pageW - marginX * 2;
            const maxH    = pageH - marginY * 2;

            // px -> mm a 96dpi, desfazendo o scale:2 do html2canvas
            const scale     = 2;
            const contentWMM = (canvas.width  / scale) / 96 * 25.4;
            const contentHMM = (canvas.height / scale) / 96 * 25.4;

            const fit = Math.min(maxW / contentWMM, maxH / contentHMM, 1);
            const drawW = contentWMM * fit;
            const drawH = contentHMM * fit;
            const x = (pageW - drawW) / 2;
            // Ancora no topo (y = marginY) em vez de centralizar verticalmente:
            // como o conteudo normalmente e mais curto que a pagina inteira,
            // centralizar deixava uma faixa enorme de espaco em branco em
            // cima E embaixo (as duas metades do sobra). Ancorando no topo
            // com uma margem estreita, o documento comeca logo no topo da
            // pagina como um documento normal.
            const y = marginY;

            // Cobre a pagina 1 de branco pra apagar o que o auto-fit ja
            // tinha desenhado nela antes da gente redesenhar por cima,
            // corretamente encaixado e centralizado.
            pdf.setPage(1);
            pdf.setFillColor(255, 255, 255);
            pdf.rect(0, 0, pageW, pageH, 'F');

            const imgData = canvas.toDataURL('image/jpeg', 0.97);
            pdf.addImage(imgData, 'JPEG', x, y, drawW, drawH);
            pdf.save(generatePdfFilename(record));
          });
        });
      })
      .then(cleanup)
      .catch(err => { console.error('Erro ao gerar PDF:', err); cleanup(); });
  }
})();