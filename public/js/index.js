/* ==========================================================
   index.js — gate de login da central de formularios (home)
   Mesma regra de acesso da tela de respostas: só quem estiver
   autenticado e autorizado (staff_emails) vê a listagem. O link
   público de preenchimento de cada formulário (ex.: /form-visitas)
   não passa por aqui — continua acessível a qualquer pessoa.
   ========================================================== */
(function () {
  const homeContent = document.getElementById('home-content');
  if (!homeContent) return; // não é a home

  SMAuthGate.mount({
    contentEl: homeContent,
    onAuthorized: () => SM.renderFormList()
  });
})();
