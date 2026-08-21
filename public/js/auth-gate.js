/* ==========================================================
   auth-gate.js — gate de login/senha compartilhado
   Usado tanto pela central de formulários (index.ejs) quanto pela
   tela de respostas (respostas.ejs) — as duas exigem a mesma equipe
   autenticada e autorizada (staff_emails). O link público de
   preenchimento de um formulário (ex.: /form-visitas) NUNCA usa este
   gate, pra continuar acessível a qualquer pessoa com o link.

   Espera o markup padrao em cada pagina:
     #auth-gate, #change-password-gate, #access-denied
     (ids de campo: login-email, login-password, login-btn,
      new-password, confirm-password, change-password-btn,
      logout-btn, denied-logout-btn)

   Uso:
     const gate = SMAuthGate.mount({
       contentEl: document.getElementById('minha-area-logada'),
       onAuthorized: () => { ... mostra o conteudo ... },
       onLoggedOut: () => { ... limpa estado local, se precisar ... }
     });
     // gate.logout() — forca logout (ex.: apos um 401 de alguma API)
   ========================================================== */
(function () {
  const DEFAULT_PASSWORD = 'SaoMarcos';

  function mount({ contentEl, onAuthorized, onLoggedOut }) {
    const authGate      = document.getElementById('auth-gate');
    const changePwGate  = document.getElementById('change-password-gate');
    const accessDenied  = document.getElementById('access-denied');
    if (!authGate || !changePwGate || !accessDenied || !contentEl) return null;

    const loginEmailInput      = document.getElementById('login-email');
    const loginEmailGroup      = document.getElementById('login-email-group');
    const loginEmailErrMsg     = document.getElementById('login-email-error-message');
    const loginPasswordInput   = document.getElementById('login-password');
    const loginPasswordGroup   = document.getElementById('login-password-group');
    const loginPasswordErrMsg  = document.getElementById('login-password-error-message');
    const loginBtn             = document.getElementById('login-btn');

    const newPasswordInput     = document.getElementById('new-password');
    const newPasswordGroup     = document.getElementById('new-password-group');
    const newPasswordErrMsg    = document.getElementById('new-password-error-message');
    const confirmPasswordInput = document.getElementById('confirm-password');
    const confirmPasswordGroup = document.getElementById('confirm-password-group');
    const changePasswordBtn    = document.getElementById('change-password-btn');

    const logoutBtn       = document.getElementById('logout-btn');
    const deniedLogoutBtn = document.getElementById('denied-logout-btn');

    /* ---------- Visibilidade de telas ---------- */
    function showOnly(el) {
      [authGate, changePwGate, accessDenied, contentEl].forEach(s => {
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

    function showAuthorized() {
      showOnly(contentEl);
      if (onAuthorized) onAuthorized();
    }

    /* ---------- Init ---------- */
    function applyState(session) {
      if (!session.loggedIn) return showGate();
      if (session.mustChangePassword) return showChangePassword();
      if (!session.authorized) return showOnly(accessDenied);
      showAuthorized();
    }

    async function init() {
      // A página já foi renderizada pelo servidor sabendo o estado de login
      // (routes/pages.js embute isso em window.__INITIAL_AUTH__) — então o
      // painel certo já nasceu visível e não precisamos refazer esse fetch
      // aqui, só reaplicar o mesmo estado pra disparar onAuthorized() e
      // carregar os dados da tela. Isso é o que elimina o flash da tela de
      // login: antes, toda página sempre começava mostrando o gate e só
      // trocava depois que esse fetch voltava.
      if (window.__INITIAL_AUTH__) {
        return applyState(window.__INITIAL_AUTH__);
      }
      // Fallback (ex.: página ainda não atualizada pra embutir o estado
      // inicial, ou carregada fora do fluxo normal de render do servidor).
      try {
        const res = await fetch('/api/auth/session');
        const session = await res.json();
        applyState(session);
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
        showAuthorized();
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
        showAuthorized();
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
      loginEmailInput.value = '';
      if (onLoggedOut) onLoggedOut();
      showGate();
    }

    if (logoutBtn) logoutBtn.addEventListener('click', doLogout);
    if (deniedLogoutBtn) deniedLogoutBtn.addEventListener('click', doLogout);

    init();

    return { logout: doLogout, refresh: init };
  }

  window.SMAuthGate = { mount };
})();
