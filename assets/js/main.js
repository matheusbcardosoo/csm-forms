/* ==========================================================
   main.js
   Registro de formulários disponíveis + utilitários
   compartilhados entre páginas. As respostas são lidas/gravadas
   direto no Postgres via Supabase (assets/js/supabase-client.js).
   ========================================================== */

const FORMS = [
  {
    id: 'visitas',
    nome: 'Formulário de Visitas',
    descricao: 'Cadastro de visita para famílias interessadas em matrícula.',
    icon: '🏫',
    url: 'form-visitas.html'
  }
];

const SM = {
  FORMS,

  getForm(formId) {
    return FORMS.find(f => f.id === formId);
  },

  _requireClient() {
    if (!window.SMClient) {
      throw new Error(
        'Conexão com o banco de dados não configurada. Verifique assets/js/config.js.'
      );
    }
    return window.SMClient;
  },

  /**
   * Busca as respostas de um formulário direto do Supabase.
   * @returns {Promise<Array<{id:string, submittedAt:string, data:object}>>}
   */
  async getResponses(formId) {
    if (formId !== 'visitas') return [];
    const client = SM._requireClient();

    const { data: rows, error } = await client
      .from('visita_respostas')
      .select('*, visita_alunos(*)')
      .order('submitted_at', { ascending: false });

    if (error) throw error;

    return (rows || []).map(r => ({
      id: r.id,
      submittedAt: r.submitted_at,
      data: {
        students: (r.visita_alunos || [])
          .slice()
          .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
          .map(a => ({ nome: a.nome, nascimento: a.nascimento, turma: a.turma })),
        escola: {
          nome: r.escola_nome,
          cidadeEstado: r.escola_cidade_estado
        },
        responsaveis: {
          pai: { nome: r.pai_nome, whatsapp: r.pai_whatsapp, profissao: r.pai_profissao },
          mae: { nome: r.mae_nome, whatsapp: r.mae_whatsapp, profissao: r.mae_profissao }
        },
        extras: {
          motivo: r.motivo,
          indicado: r.indicado,
          indicacaoNome: r.indicacao_nome,
          observacoes: r.observacoes
        }
      }
    }));
  },

  /**
   * Grava uma resposta do formulário de visitas no Supabase
   * (tabelas visita_respostas + visita_alunos).
   * @returns {Promise<{id:string, submittedAt:string, data:object}>}
   */
  async saveResponse(formId, data) {
    if (formId !== 'visitas') {
      throw new Error(`Formulário "${formId}" não é suportado.`);
    }
    const client = SM._requireClient();

    const { data: inserted, error } = await client
      .from('visita_respostas')
      .insert({
        escola_nome: data.escola.nome,
        escola_cidade_estado: data.escola.cidadeEstado,
        pai_nome: data.responsaveis.pai.nome || null,
        pai_whatsapp: data.responsaveis.pai.whatsapp || null,
        pai_profissao: data.responsaveis.pai.profissao || null,
        mae_nome: data.responsaveis.mae.nome || null,
        mae_whatsapp: data.responsaveis.mae.whatsapp || null,
        mae_profissao: data.responsaveis.mae.profissao || null,
        motivo: data.extras.motivo,
        indicado: data.extras.indicado,
        indicacao_nome: data.extras.indicacaoNome || null,
        observacoes: data.extras.observacoes || null
      })
      .select()
      .single();

    if (error) throw error;

    const alunosPayload = (data.students || []).map((s, i) => ({
      visita_id: inserted.id,
      nome: s.nome,
      nascimento: s.nascimento || null,
      turma: s.turma,
      ordem: i
    }));

    if (alunosPayload.length) {
      const { error: alunosError } = await client.from('visita_alunos').insert(alunosPayload);
      if (alunosError) throw alunosError;
    }

    return { id: inserted.id, submittedAt: inserted.submitted_at, data };
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
  },

  /* ---------- Autenticação (magic link) ---------- */

  /**
   * @returns {Promise<import('@supabase/supabase-js').Session | null>}
   */
  async getSession() {
    const client = SM._requireClient();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session;
  },

  /**
   * Envia o link mágico de login para o e-mail informado.
   * Não cria conta com privilégio nenhum: quem recebe acesso de fato
   * às respostas é controlado pela tabela staff_emails (via RLS).
   */
  async signInWithMagicLink(email, redirectTo) {
    const client = SM._requireClient();
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo }
    });
    if (error) throw error;
  },

  async signOut() {
    const client = SM._requireClient();
    const { error } = await client.auth.signOut();
    if (error) throw error;
  },

  /**
   * Confere se o e-mail logado está na lista staff_emails.
   * RLS garante que só é possível enxergar a própria linha.
   */
  async isAuthorizedStaff() {
    const client = SM._requireClient();
    const { data, error } = await client
      .from('staff_emails')
      .select('email')
      .maybeSingle();
    if (error) throw error;
    return !!data;
  },

  onAuthStateChange(callback) {
    const client = SM._requireClient();
    return client.auth.onAuthStateChange(callback);
  }
};

window.SM = SM;

/* ---------- Renderização da home (lista de formulários) ---------- */
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
        <a class="btn btn-ghost" href="respostas.html?form=${form.id}">Ver respostas</a>
        <a class="btn btn-primary" href="${form.url}">Preencher</a>
      </div>
    </div>
  `).join('');
}

document.addEventListener('DOMContentLoaded', renderFormList);
