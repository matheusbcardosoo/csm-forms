// Supabase "de mentira" para desenvolvimento local: encaminha /rest/v1/*
// para o PostgREST, imita o GoTrue em /auth/v1/* e
// um Storage mínimo em /storage/v1/object/* (arquivos em disco, na pasta
// temporária do sistema). O Storage NÃO aplica as políticas de RLS dos
// buckets — a restrição por papel de lá só se testa no Supabase de verdade.
// Auth: e-mail sem conta criada aqui entra com qualquer senha (admin@local
// etc.); conta criada pela API admin (/auth/v1/admin/users, usada pela tela
// de Usuários) guarda senha e user_metadata em memória e passa a conferi-los.
// Reiniciar o fake esquece essas contas.
// Uso: node fake-supabase.mjs   (porta 54321; PostgREST em :3001)
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PASTA_STORAGE = path.join(os.tmpdir(), 'csm-fake-storage');

const PORTA = 54321;
const REST = 'http://localhost:3001';
const SEGREDO = 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
export function jwt(claims) {
  const cab = b64({ alg: 'HS256', typ: 'JWT' });
  const corpo = b64({ iss: 'fake', aud: 'authenticated', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, ...claims });
  const sig = crypto.createHmac('sha256', SEGREDO).update(`${cab}.${corpo}`).digest('base64url');
  return `${cab}.${corpo}.${sig}`;
}
function decodificar(token) {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()); } catch { return null; }
}
/** Contas criadas pela API admin: e-mail → { senha, user_metadata, criado }. */
const CONTAS = new Map();
function usuario(email) {
  const conta = CONTAS.get(email.toLowerCase());
  return { id: crypto.createHash('md5').update(email.toLowerCase()).digest('hex').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5'), aud: 'authenticated', role: 'authenticated', email, email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email' }, user_metadata: conta ? conta.user_metadata : {}, created_at: conta ? conta.criado : new Date().toISOString() };
}
function contaPorId(id) {
  for (const email of CONTAS.keys()) if (usuario(email).id === id) return email;
  return null;
}
function adminUsuarios(req, res, url, corpo, bearer) {
  if (decodificar(bearer)?.role !== 'service_role') return json(res, 403, { code: 403, error_code: 'not_admin', msg: 'User not allowed' });
  const id = url.pathname.replace(/^\/auth\/v1\/admin\/users\/?/, '');
  const dados = corpo ? JSON.parse(corpo) : {};
  if (!id && req.method === 'GET') return json(res, 200, { users: [...CONTAS.keys()].map(usuario), aud: 'authenticated' });
  if (!id && req.method === 'POST') {
    const email = String(dados.email || '').toLowerCase();
    if (CONTAS.has(email)) return json(res, 422, { code: 422, error_code: 'email_exists', msg: 'A user with this email address has already been registered' });
    CONTAS.set(email, { senha: dados.password, user_metadata: dados.user_metadata || {}, criado: new Date().toISOString() });
    return json(res, 200, usuario(email));
  }
  const email = contaPorId(id);
  if (!email) return json(res, 404, { code: 404, error_code: 'user_not_found', msg: 'User not found' });
  if (req.method === 'PUT') {
    const conta = CONTAS.get(email);
    if (dados.password) conta.senha = dados.password;
    if (dados.user_metadata) conta.user_metadata = dados.user_metadata;
    return json(res, 200, usuario(email));
  }
  if (req.method === 'DELETE') { CONTAS.delete(email); return json(res, 200, {}); }
  return json(res, 200, usuario(email));
}
function sessao(email) {
  const u = usuario(email);
  return { access_token: jwt({ sub: u.id, email, role: 'authenticated' }), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'rt-' + crypto.randomBytes(8).toString('hex'), user: u };
}
const json = (res, status, corpo) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(corpo)); };

/** bucket/caminho → arquivo em disco (+ .tipo com o Content-Type). Sem `..`. */
function arquivoStorage(chave) {
  const limpa = decodeURIComponent(chave).replace(/\\/g, '/');
  if (limpa.split('/').some(p => p === '..' || p === '')) return null;
  return path.join(PASTA_STORAGE, ...limpa.split('/'));
}

function storage(req, res, url, corpo) {
  const resto = url.pathname.replace(/^\/storage\/v1\/object\//, '');
  // URL assinada: POST /object/sign/{bucket}/{path} → GET /object/sign/{bucket}/{path}?token=…
  if (resto.startsWith('sign/')) {
    const chave = resto.slice(5);
    if (req.method === 'POST') return json(res, 200, { signedURL: `/object/sign/${chave}?token=fake` });
    return servir(res, chave);
  }
  if (req.method === 'DELETE') {
    const { prefixes = [] } = corpo.length ? JSON.parse(corpo.toString()) : {};
    for (const p of prefixes) {
      const f = arquivoStorage(`${resto}/${p}`);
      if (f) { fs.rmSync(f, { force: true }); fs.rmSync(f + '.tipo', { force: true }); }
    }
    return json(res, 200, prefixes.map(name => ({ name })));
  }
  const chave = resto.replace(/^authenticated\//, '');
  if (req.method === 'POST' || req.method === 'PUT') {
    const f = arquivoStorage(chave);
    if (!f) return json(res, 400, { statusCode: '400', error: 'InvalidKey', message: 'Caminho inválido' });
    if (req.method === 'POST' && req.headers['x-upsert'] !== 'true' && fs.existsSync(f)) return json(res, 400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, corpo);
    fs.writeFileSync(f + '.tipo', req.headers['content-type'] || 'application/octet-stream');
    return json(res, 200, { Key: chave, Id: crypto.randomUUID() });
  }
  if (req.method === 'GET' || req.method === 'HEAD') return servir(res, chave);
  json(res, 405, { message: 'método não imitado' });
}

function servir(res, chave) {
  const f = arquivoStorage(chave);
  if (!f || !fs.existsSync(f)) return json(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
  const tipo = fs.existsSync(f + '.tipo') ? fs.readFileSync(f + '.tipo', 'utf8') : 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': tipo });
  res.end(fs.readFileSync(f));
}

if (process.argv[1] && process.argv[1].endsWith('fake-supabase.mjs')) {
  console.log('anon    =', jwt({ role: 'anon' }));
  console.log('service =', jwt({ role: 'service_role' }));
  console.log('storage =', PASTA_STORAGE);
  http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const pedacos = [];
    req.on('data', c => { pedacos.push(c); });
    req.on('end', () => {
      const bruto = Buffer.concat(pedacos);
      if (url.pathname.startsWith('/storage/v1/object/')) return storage(req, res, url, bruto);
      const corpo = bruto.toString();
      if (url.pathname.startsWith('/auth/v1/')) {
        const bearer = (req.headers.authorization || '').replace(/^Bearer /, '');
        if (url.pathname === '/auth/v1/token') {
          const dados = corpo ? JSON.parse(corpo) : {};
          if (url.searchParams.get('grant_type') === 'password') {
            const conta = CONTAS.get(String(dados.email || '').toLowerCase());
            if (!dados.email || !dados.password || (conta && conta.senha !== dados.password)) return json(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
            return json(res, 200, sessao(dados.email));
          }
          const c = decodificar(bearer) || {};
          return json(res, 200, sessao(c.email || 'anon@x.br'));
        }
        if (url.pathname === '/auth/v1/user') {
          const c = decodificar(bearer);
          if (!c?.email) return json(res, 401, { message: 'invalid token' });
          if (req.method === 'PUT') {
            const dados = corpo ? JSON.parse(corpo) : {};
            const email = c.email.toLowerCase();
            const conta = CONTAS.get(email) || { senha: null, user_metadata: {}, criado: new Date().toISOString() };
            if (dados.password) conta.senha = dados.password;
            if (dados.data) conta.user_metadata = { ...conta.user_metadata, ...dados.data };
            // Conta "qualquer senha" que troca a senha passa a ser conferida.
            if (conta.senha) CONTAS.set(email, conta);
            return json(res, 200, usuario(c.email));
          }
          return json(res, 200, usuario(c.email));
        }
        if (url.pathname.startsWith('/auth/v1/admin/users')) return adminUsuarios(req, res, url, corpo, bearer);
        if (url.pathname === '/auth/v1/logout') { res.writeHead(204); return res.end(); }
        return json(res, 404, { message: 'not found: ' + url.pathname });
      }
      if (url.pathname.startsWith('/rest/v1/')) {
        const alvo = new URL(REST + url.pathname.replace('/rest/v1', '') + url.search);
        const cab = { ...req.headers, host: alvo.host };
        delete cab['content-length'];
        const p = http.request(alvo, { method: req.method, headers: { ...cab, 'content-length': Buffer.byteLength(corpo) } }, r => {
          res.writeHead(r.statusCode, r.headers);
          r.pipe(res);
        });
        p.on('error', e => json(res, 502, { message: e.message }));
        p.end(corpo);
        return;
      }
      json(res, 404, { message: 'not found' });
    });
  }).listen(PORTA, () => console.log(`fake supabase em http://localhost:${PORTA} → PostgREST ${REST}`));
}
