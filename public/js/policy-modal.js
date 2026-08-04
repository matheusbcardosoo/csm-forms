/* ==========================================================
   policy-modal.js — Gerencia modal da política de privacidade
   ========================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('policy-modal');
  const openLink = document.getElementById('open-policy-link');
  const closeBtn = document.getElementById('close-policy-modal');
  const closeFooterBtn = document.getElementById('close-policy-btn');
  const backdrop = document.querySelector('.modal-backdrop');

  if (!modal || !openLink) return;

  // Abrir modal
  openLink.addEventListener('click', (e) => {
    e.preventDefault();
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  });

  // Fechar modal
  const closeModal = () => {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  };

  if (closeBtn) {
    closeBtn.addEventListener('click', closeModal);
  }

  if (closeFooterBtn) {
    closeFooterBtn.addEventListener('click', closeModal);
  }

  if (backdrop) {
    backdrop.addEventListener('click', closeModal);
  }

  // Fechar com ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      closeModal();
    }
  });
});
