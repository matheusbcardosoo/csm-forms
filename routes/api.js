'use strict';
const express = require('express');
const { randomUUID } = require('crypto');
const { getAnonClient, getAuthenticatedClient } = require('../lib/supabase');
const { shapeVisitaRow, pdfFilename } = require('../lib/visita');
const { renderVisitaPdf } = require('../lib/pdf');
const { notifyN8n } = require('../lib/n8n');

const router = express.Router();

const COOKIE_OPTS = {
  httpOnly: true,
  signed: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000
};

function getTokens(req) {
  return { at: req.signedCookies.sb_at, rt: req.signedCookies.sb_rt };
}

function clearAuthCookies(res) {
  res.clearCookie('sb_at');
  res.clearCookie('sb_rt');
}

function setAuthCookies(res, session) {
  res.cookie('sb_at', session.access_token, COOKIE_OPTS);
  res.cookie('sb_rt', session.refresh_token, COOKIE_OPTS);
}

// Obtém cliente autenticado e renova cookies se os tokens foram rotacionados.
async function requireAuth(req, res) {
  const { at, rt } = getTokens(req);
  if (!at || !rt) {
    res.status(401).json({ error: 'Não autenticado.' });
    return null;
  }
  try {
    const { client, newSession } = await getAuthenticatedClient(at, rt);
    if (newSession) setAuthCookies(res, newSession);
    return client;
  } catch (_) {
    clearAuthCookies(res);
    res.status(401).json({ error: 'Sessão inválida. Faça login novamente.' });
    return null;
  }
}

/* ================================================================
   AUTH
   ================================================================ */

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const client = getAnonClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: error.message });

    const { session, user } = data;

    // session e null quando o e-mail nao foi confirmado (email_confirm: false na criacao)
    if (!session || !user) {
      return res.status(401).json({
        error: 'E-mail nao confirmado ou credenciais invalidas. Use o script de provisionamento para criar contas.'
      });
    }

    setAuthCookies(res, session);

    const mustChangePassword = !!(
      user.user_metadata && user.user_metadata.must_change_password
    );

    let authorized = false;
    if (!mustChangePassword) {
      const { client: authClient } = await getAuthenticatedClient(
        session.access_token,
        session.refresh_token
      );
      const { data: staffData } = await authClient
        .from('staff_emails')
        .select('email')
        .maybeSingle();
      authorized = !!staffData;
    }

    res.json({ success: true, mustChangePassword, authorized });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/auth/logout', async (req, res) => {
  const { at, rt } = getTokens(req);
  if (at && rt) {
    try {
      const { client } = await getAuthenticatedClient(at, rt);
      await client.auth.signOut();
    } catch (_) {}
  }
  clearAuthCookies(res);
  res.json({ success: true });
});

router.post('/auth/change-password', async (req, res) => {
  const client = await requireAuth(req, res);
  if (!client) return;

  try {
    const { password } = req.body;

    // Obtem e-mail antes de alterar (necessario para re-login em seguida)
    const { data: userData } = await client.auth.getUser();
    const email = userData?.user?.email;

    const { error } = await client.auth.updateUser({
      password,
      data: { must_change_password: false }
    });
    if (error) return res.status(400).json({ error: error.message });

    // Re-login com a nova senha: garante JWT fresco com must_change_password: false.
    // Mais confiavel do que refreshSession() para propagar metadados atualizados.
    if (email) {
      const freshClient = getAnonClient();
      const { data: newData, error: loginErr } = await freshClient.auth.signInWithPassword({
        email,
        password
      });
      if (!loginErr && newData.session) {
        setAuthCookies(res, newData.session);
        return res.json({ success: true });
      }
    }

    // Fallback: tenta refreshSession caso o re-login nao seja possivel
    const { data: refreshData, error: refreshErr } = await client.auth.refreshSession();
    if (!refreshErr && refreshData.session) {
      setAuthCookies(res, refreshData.session);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/auth/session', async (req, res) => {
  const { at, rt } = getTokens(req);
  if (!at || !rt) return res.json({ loggedIn: false });

  try {
    const { client, newSession } = await getAuthenticatedClient(at, rt);
    if (newSession) setAuthCookies(res, newSession);

    const { data, error } = await client.auth.getUser();
    if (error || !data.user) {
      clearAuthCookies(res);
      return res.json({ loggedIn: false });
    }

    const mustChangePassword = !!(
      data.user.user_metadata && data.user.user_metadata.must_change_password
    );

    let authorized = false;
    if (!mustChangePassword) {
      const { data: staffData } = await client
        .from('staff_emails')
        .select('email')
        .maybeSingle();
      authorized = !!staffData;
    }

    res.json({ loggedIn: true, mustChangePassword, authorized });
  } catch (_) {
    clearAuthCookies(res);
    res.json({ loggedIn: false });
  }
});

/* ================================================================
   RESPOSTAS
   ================================================================ */

router.get('/responses', async (req, res) => {
  const client = await requireAuth(req, res);
  if (!client) return;

  try {
    const { data: staffData } = await client
      .from('staff_emails')
      .select('email')
      .maybeSingle();
    if (!staffData) return res.status(403).json({ error: 'Não autorizado.' });

    const { data: rows, error } = await client
      .from('visita_respostas')
      .select('*, visita_alunos(*)')
      .order('submitted_at', { ascending: false });

    if (error) throw error;

    res.json((rows || []).map(shapeVisitaRow));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PDF de uma resposta — usada pelo botao "Baixar PDF" na tela de respostas.
// Reaproveita a mesma renderVisitaPdf() (Puppeteer) usada no envio
// automatico ao n8n, entao o arquivo baixado aqui e sempre identico ao
// que o workflow recebe.
router.get('/responses/:id/pdf', async (req, res) => {
  const client = await requireAuth(req, res);
  if (!client) return;

  try {
    const { data: staffData } = await client
      .from('staff_emails')
      .select('email')
      .maybeSingle();
    if (!staffData) return res.status(403).json({ error: 'Não autorizado.' });

    const { data: row, error } = await client
      .from('visita_respostas')
      .select('*, visita_alunos(*)')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!row) return res.status(404).json({ error: 'Resposta não encontrada.' });

    const visita = shapeVisitaRow(row);
    const pdfBuffer = await renderVisitaPdf({
      baseUrl: process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
      visitaId: visita.id,
      internalToken: process.env.INTERNAL_PDF_SECRET
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${pdfFilename(visita)}"`
    });
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Envio manual pelo botao "Enviar por WhatsApp" na tela de respostas.
// Reaproveita o mesmo notifyN8n() usado no envio automatico logo apos o
// cadastro (routes/api.js POST /responses) — mesma geracao de PDF, mesmo
// payload pro webhook do n8n. Diferente do automatico, aqui o erro deve
// voltar pro botao (nao e so log de servidor), entao aguardamos e
// respondemos o resultado.
router.post('/responses/:id/whatsapp', async (req, res) => {
  const client = await requireAuth(req, res);
  if (!client) return;

  try {
    const { data: staffData } = await client
      .from('staff_emails')
      .select('email')
      .maybeSingle();
    if (!staffData) return res.status(403).json({ error: 'Não autorizado.' });

    const { data: row, error } = await client
      .from('visita_respostas')
      .select('id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!row) return res.status(404).json({ error: 'Resposta não encontrada.' });

    if (!process.env.N8N_WEBHOOK_URL) {
      return res.status(503).json({ error: 'Integração com WhatsApp não está configurada (N8N_WEBHOOK_URL vazio).' });
    }

    await notifyN8n(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================================================================
   HELPERS DE SANITIZACAO — aplicados antes de gravar no banco
   ================================================================ */

// Title Case com respeito a particulas preposicionais do portugues
function toTitleCase(str) {
  if (!str) return str;
  const particles = new Set(['da', 'das', 'de', 'do', 'dos', 'e', 'a', 'o', 'ao', 'i']);
  return String(str).trim().toLowerCase().split(/\s+/).map((w, i) =>
    w && (i === 0 || !particles.has(w)) ? w[0].toUpperCase() + w.slice(1) : w
  ).join(' ') || null;
}

// Primeira letra maiuscula (paragrafos)
function capFirst(str) {
  if (!str) return str;
  const s = String(str).trim();
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// Title Case "cru" (sem excecao de particulas) - usado pra nome de cidade,
// onde "Das", "Do" etc. devem ficar maiusculos mesmo no meio da frase.
function toWordTitleCase(str) {
  if (!str) return str;
  return String(str).trim().toLowerCase().split(/\s+/).map(w =>
    w ? w[0].toUpperCase() + w.slice(1) : w
  ).join(' ');
}

// "Cidade/Estado": aceita "-" ou "/" como separador, remove os espacos ao
// redor dele (evita desvio de padrao tipo "Mogi das Cruzes / SP" vs
// "Mogi das Cruzes/SP") e deixa a sigla do estado em maiusculo.
function toCityState(str) {
  if (!str) return str;
  const s = String(str).trim();
  if (!s) return null;
  const parts = s.split(/\s*[\/-]\s*/);
  const cidade = toWordTitleCase(parts[0]);
  const estado = parts[1] ? parts[1].trim().toUpperCase() : '';
  return estado ? `${cidade}/${estado}` : cidade;
}

router.post('/responses', async (req, res) => {
  try {
    const data = req.body;
    const client = getAnonClient();
    const visitaId = randomUUID();
    const submittedAt = new Date().toISOString();

    const { error } = await client.from('visita_respostas').insert({
      id: visitaId,
      escola_nome:          toTitleCase(data.escola.nome),
      escola_cidade_estado: toCityState(data.escola.cidadeEstado),
      pai_nome:             toTitleCase(data.responsaveis.pai.nome) || null,
      pai_whatsapp:         data.responsaveis.pai.whatsapp || null,
      pai_profissao:        toTitleCase(data.responsaveis.pai.profissao) || null,
      mae_nome:             toTitleCase(data.responsaveis.mae.nome) || null,
      mae_whatsapp:         data.responsaveis.mae.whatsapp || null,
      mae_profissao:        toTitleCase(data.responsaveis.mae.profissao) || null,
      motivo:               capFirst(data.extras.motivo),
      indicado:             data.extras.indicado,
      indicacao_nome:       toTitleCase(data.extras.indicacaoNome) || null,
      observacoes:          capFirst(data.extras.observacoes) || null
    });
    if (error) throw error;

    const alunosPayload = (data.students || []).map((s, i) => ({
      visita_id: visitaId,
      nome: toTitleCase(s.nome),
      nascimento: s.nascimento || null,
      turma: s.turma,
      ordem: i
    }));

    if (alunosPayload.length) {
      const { error: alunosError } = await client
        .from('visita_alunos')
        .insert(alunosPayload);
      if (alunosError) throw alunosError;
    }

    res.status(201).json({ id: visitaId, submittedAt });

    // Dispara depois de responder ao visitante — geracao de PDF + envio ao
    // n8n nao pode atrasar nem quebrar a confirmacao do cadastro. Erros
    // aqui so vao pro log do servidor.
    notifyN8n(visitaId).catch(err => {
      console.error(`[n8n] Falha ao notificar workflow para visita ${visitaId}:`, err.message);
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
