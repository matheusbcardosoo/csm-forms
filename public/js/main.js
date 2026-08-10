/* ==========================================================
   main.js — utilitarios e lista de formularios (sem Supabase)
   ========================================================== */

const FORMS = [
  {
    id: 'visitas',
    nome: 'Formulário de Visitas',
    descricao: 'Cadastro de visita para famílias interessadas em matrícula.',
    icon: '🏫',
    url: '/form-visitas',
    blankPdfUrl: '/api/blank/visita/pdf'
  },
  {
    id: 'avaliacao-substitutiva',
    nome: 'Requerimento de Avaliação Substitutiva',
    descricao: 'Solicitação de segunda chamada para avaliação perdida, com anexo de atestado ou comprovante.',
    icon: '📝',
    url: '/form-avaliacao-substitutiva',
    blankPdfUrl: '/api/blank/avaliacao/pdf'
  }
];

const SM = {
  FORMS,

  getForm(formId) {
    return FORMS.find(f => f.id === formId);
  },

  formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  },

  formatDateOnly(value) {
    if (!value) return '-';
    const [y, m, d] = value.split('-');
    if (!y || !m || !d) return value;
    return `${d}/${m}/${y}`;
  },

  formatDateExtenso(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  },

  escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }
};

window.SM = SM;

/* ---------- Home: lista de formularios ---------- */
function renderFormList() {
  const container = document.getElementById('form-list');
  if (!container) return;

  container.innerHTML = FORMS.map(form => `
    <div class="form-card">
      <div class="form-card-info">
        <div class="form-card-icon">${form.icon}</div>
        <div>
          <h3>${form.nome}</h3>
          <p>${form.descricao}</p>
        </div>
      </div>
      <div class="form-card-actions">
        <a class="btn btn-ghost" href="/respostas?form=${form.id}">Ver respostas</a>
        <a class="btn btn-primary" href="${form.url}">Preencher</a>
      </div>
    </div>
  `).join('');
}

// Não é mais chamado automaticamente no DOMContentLoaded — a home agora
// fica atrás do gate de login (ver public/js/index.js), que so chama isso
// depois de confirmar sessão autorizada.
SM.renderFormList = renderFormList;
