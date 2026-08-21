'use strict';
const { getAuthenticatedClient } = require('./supabase');

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

function setAuthCookies(res, session) {
  res.cookie('sb_at', session.access_token, COOKIE_OPTS);
  res.cookie('sb_rt', session.refresh_token, COOKIE_OPTS);
}

function clearAuthCookies(res) {
  res.clearCookie('sb_at');
  res.clearCookie('sb_rt');
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

// Resolve o estado de autenticação (loggedIn / mustChangePassword / authorized)
// a partir dos cookies da requisição. Não envia resposta — só consulta o
// Supabase e aplica efeitos colaterais nos cookies (renovação/limpeza).
//
// Usado tanto por GET /api/auth/session (chamada via fetch, ex.: depois de
// trocar senha) quanto pelas rotas de página em routes/pages.js, para que o
// servidor já saiba o estado ANTES de renderizar o HTML. É isso que elimina
// o "flash" da tela de login: antes, toda página protegida sempre nascia
// mostrando o gate e só trocava pro conteúdo depois que o navegador,
// já carregado, disparava esse mesmo fetch e esperava a volta.
async function resolveSession(req, res) {
  const { at, rt } = getTokens(req);
  if (!at || !rt) return { loggedIn: false };

  try {
    const { client, newSession } = await getAuthenticatedClient(at, rt);
    if (newSession) setAuthCookies(res, newSession);

    const { data, error } = await client.auth.getUser();
    if (error || !data.user) {
      clearAuthCookies(res);
      return { loggedIn: false };
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

    return { loggedIn: true, mustChangePassword, authorized };
  } catch (_) {
    clearAuthCookies(res);
    return { loggedIn: false };
  }
}

module.exports = { getTokens, setAuthCookies, clearAuthCookies, requireAuth, resolveSession };
