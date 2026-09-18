#!/usr/bin/env node
/**
 * ==========================================================
 * provision-staff-users.mjs
 *
 * Cria contas de login (Supabase Auth) pra todo mundo que estiver
 * na tabela usuario_perfil (ativo = true), com a senha padrão
 * "SaoMarcos" e a flag must_change_password=true (isso força a troca
 * de senha no primeiro acesso — veja public/js/auth-gate.js e o
 * painel em client/src/auth/Login.tsx).
 *
 * IMPORTANTE: rode isso só localmente, na sua máquina. NUNCA coloque
 * a service_role key em config.js, no navegador ou em qualquer
 * arquivo commitado — ela ignora todo o RLS do banco.
 *
 * Uso:
 *   1. No .env da raiz (veja .env.example), adicione:
 *        SUPABASE_URL=...
 *        SUPABASE_SERVICE_ROLE_KEY=...  (Project Settings > API > service_role)
 *   2. Rode:  node scripts/provision-staff-users.mjs
 *
 * Pode rodar de novo sempre que adicionar alguém em usuario_perfil —
 * quem já tem conta é pulado (não mexe na senha de quem já trocou).
 * ==========================================================
 */

import { readFileSync, existsSync } from 'node:fs';

const DEFAULT_PASSWORD = 'SaoMarcos';

function loadEnv() {
  if (!existsSync('.env')) return;
  const content = readFileSync('.env', 'utf8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  });
}

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (no .env da raiz ou como variáveis de ambiente).');
  process.exit(1);
}

const headers = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json'
};

async function getStaffEmails() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/usuario_perfil?select=email,nome,papel&ativo=eq.true`, { headers });
  if (!res.ok) {
    throw new Error(`Falha ao ler usuario_perfil (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

async function createUser(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email,
      password: DEFAULT_PASSWORD,
      email_confirm: true,
      user_metadata: { must_change_password: true }
    })
  });

  if (res.ok) {
    console.log(`OK   ${email} — conta criada com a senha padrão (${DEFAULT_PASSWORD}).`);
    return;
  }

  const body = await res.json().catch(() => ({}));
  const msg = body.msg || body.message || body.error_description || '';

  if (res.status === 422 || /already.*registered|already exists/i.test(msg)) {
    console.log(`--   ${email} já tem conta, pulando.`);
    return;
  }

  console.error(`ERRO ${email} (${res.status}): ${msg || JSON.stringify(body)}`);
}

async function main() {
  console.log('Lendo usuario_perfil...');
  const staff = await getStaffEmails();

  if (!staff.length) {
    console.log('Nenhum e-mail cadastrado em usuario_perfil ainda. Adicione com:');
    console.log("  insert into usuario_perfil (email, nome, papel) values ('fulano@saomarcos.com.br', 'Fulano', 'secretaria');");
    return;
  }

  console.log(`${staff.length} e-mail(s) encontrado(s). Provisionando contas...\n`);

  for (const { email, papel } of staff) {
    process.stdout.write(`[${papel}] `);
    await createUser(email);
  }

  console.log('\nPronto. Quem tiver conta nova precisa trocar a senha no primeiro login.');
}

main().catch(err => {
  console.error('Erro:', err.message || err);
  process.exit(1);
});
