'use strict';
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('SUPABASE_URL e SUPABASE_ANON_KEY devem estar definidas no .env');
}

function getAnonClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

// Cria cliente autenticado com os tokens do usuário.
// Se o access_token estiver expirado, o Supabase usará o refresh_token automaticamente.
// Retorna { client, newSession } onde newSession !== null quando houve renovação de tokens.
async function getAuthenticatedClient(accessToken, refreshToken) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await client.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken
  });
  if (error) throw error;
  const newSession = data.session && data.session.access_token !== accessToken
    ? data.session
    : null;
  return { client, newSession };
}

module.exports = { getAnonClient, getAuthenticatedClient };
