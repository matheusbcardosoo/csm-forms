// Equipe e papéis (/app/config/usuarios) — admin e secretaria.
//
// Cadastrar alguém aqui cria também a conta de login no Supabase Auth, com
// uma senha provisória aleatória e must_change_password=true (a troca é
// obrigatória no primeiro acesso, ver client/src/auth/Login.tsx). A senha
// provisória volta UMA vez na resposta, para a cartilha de primeiro acesso;
// não é guardada em lugar nenhum além do próprio Auth.
//
// As escritas usam o client service_role: a policy de usuario_perfil só
// deixa admin escrever, e a conta de login exige a API admin do Auth. A
// barreira é esta rota — exigirPapel() + as guardas de `podeMexer`:
// secretaria cadastra e edita a equipe, mas não toca em administrador
// nem promove ninguém a administrador.
import { Router, type Response } from 'express';
import { randomInt } from 'node:crypto';
import type { User } from '@supabase/supabase-js';
import { exigirPapel, ctx, seguro } from '../lib/autorizacao';
import { validar, z, texto } from '../lib/validacao';
import { getServiceClient } from '../../lib/supabase';
import { PAPEIS, type Papel, type Perfil, type PerfilEquipe, type AcessoCriado } from '../../shared/types/usuario';

export const usuariosRouter = Router();

const perfilSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  nome: texto,
  papel: z.enum(PAPEIS as [string, ...string[]]),
  ativo: z.boolean().optional().default(true)
});

// Sem 0/O, 1/l/I: a senha vai ser lida num papel ou numa tela de celular.
const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789';
/** Senha provisória legível, ex.: "kq7m-x4tz-9hrc" (≈ 59 bits). */
export function gerarSenhaProvisoria(): string {
  const bloco = () => Array.from({ length: 4 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
  return `${bloco()}-${bloco()}-${bloco()}`;
}

/** Todas as contas do Auth, por e-mail. A equipe é pequena: poucas páginas. */
async function contasPorEmail(): Promise<Map<string, User>> {
  const svc = getServiceClient();
  const mapa = new Map<string, User>();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) if (u.email) mapa.set(u.email.toLowerCase(), u);
    if (data.users.length < 1000) break;
  }
  return mapa;
}

/**
 * Cria a conta de login ou, se já existir, troca a senha por uma nova
 * provisória. Devolve a senha e o id da conta (para a auditoria).
 */
async function definirSenhaProvisoria(email: string, existente: User | undefined): Promise<{ senha: string; id: string; criada: boolean }> {
  const svc = getServiceClient();
  const senha = gerarSenhaProvisoria();
  if (existente) {
    const { error } = await svc.auth.admin.updateUserById(existente.id, {
      password: senha,
      user_metadata: { ...existente.user_metadata, must_change_password: true }
    });
    if (error) throw error;
    return { senha, id: existente.id, criada: false };
  }
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { must_change_password: true }
  });
  if (error) throw error;
  return { senha, id: data.user.id, criada: true };
}

/**
 * Secretaria administra a equipe, menos administradores: não edita quem é
 * admin nem dá o papel de admin a ninguém. Responde 403 e devolve false.
 */
function podeMexer(res: Response, alvoPapel: Papel | undefined, novoPapel: string | undefined): boolean {
  const { perfil } = ctx(res);
  if (perfil.papel === 'admin') return true;
  if (alvoPapel === 'admin' || novoPapel === 'admin') {
    res.status(403).json({ error: 'Só um administrador pode cadastrar ou alterar administradores.' });
    return false;
  }
  return true;
}

async function auditar(perfil: Perfil, entidadeId: string | null, acao: 'criar' | 'editar', campo: string | null, anterior: unknown, novo: unknown) {
  // Falha de auditoria não desfaz o cadastro — fica no log do servidor.
  const { error } = await getServiceClient().from('auditoria').insert({
    entidade: 'usuario', entidade_id: entidadeId, acao, campo,
    valor_anterior: anterior ?? null, valor_novo: novo ?? null, usuario_email: perfil.email
  });
  if (error) console.error('[usuarios] auditoria:', error.message);
}

async function buscarPerfil(email: string): Promise<Perfil | null> {
  const { data, error } = await getServiceClient().from('usuario_perfil').select('*').eq('email', email).maybeSingle();
  if (error) throw error;
  return data;
}

usuariosRouter.get('/', exigirPapel('admin', 'secretaria'), seguro(async (_req, res) => {
  const [perfis, contas] = await Promise.all([
    getServiceClient().from('usuario_perfil').select('*').order('nome', { ascending: true, nullsFirst: false }),
    contasPorEmail()
  ]);
  if (perfis.error) throw perfis.error;
  const lista: PerfilEquipe[] = (perfis.data as Perfil[]).map(p => {
    const conta = contas.get(p.email);
    return { ...p, tem_login: !!conta, primeiro_acesso_pendente: !!conta?.user_metadata?.must_change_password };
  });
  res.json(lista);
}));

usuariosRouter.post('/', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const body = validar(perfilSchema, req, res);
  if (!body) return;
  if (!podeMexer(res, undefined, body.papel)) return;
  const { perfil: autor } = ctx(res);
  if (await buscarPerfil(body.email)) {
    return res.status(409).json({ error: 'Essa pessoa já está cadastrada. Use "Editar" na lista.' });
  }

  // Conta de login primeiro: se o perfil falhar depois, a conta recém-criada
  // é desfeita. Conta que já existia (ex.: criada pelo script antigo) não é
  // apagada — só ganha senha provisória nova.
  const contas = await contasPorEmail();
  const acesso = await definirSenhaProvisoria(body.email, contas.get(body.email));
  const { data, error } = await getServiceClient().from('usuario_perfil').insert(body).select().single();
  if (error) {
    if (acesso.criada) await getServiceClient().auth.admin.deleteUser(acesso.id).catch(() => undefined);
    throw error;
  }
  await auditar(autor, acesso.id, 'criar', null, null, { email: body.email, nome: body.nome, papel: body.papel, ativo: body.ativo });
  const resposta: AcessoCriado = { perfil: data, senha_provisoria: acesso.senha };
  res.status(201).json(resposta);
}));

usuariosRouter.put('/:email', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const body = validar(perfilSchema.partial().omit({ email: true }), req, res);
  if (!body) return;
  const { perfil: autor } = ctx(res);
  const email = String(req.params.email).toLowerCase();
  const atual = await buscarPerfil(email);
  if (!atual) return res.status(404).json({ error: 'Pessoa não encontrada.' });
  if (!podeMexer(res, atual.papel, body.papel)) return;
  // Guarda contra se trancar para fora: ninguém rebaixa nem desativa a si mesmo.
  if (email === autor.email && ((body.papel && body.papel !== atual.papel) || body.ativo === false)) {
    return res.status(422).json({ error: 'Você não pode mudar o próprio papel nem desativar o próprio acesso.' });
  }
  const { data, error } = await getServiceClient().from('usuario_perfil').update(body).eq('email', email).select().single();
  if (error) throw error;
  const mudou = (Object.keys(body) as (keyof typeof body)[]).filter(k => body[k] !== atual[k]);
  if (mudou.length) {
    const contas = await contasPorEmail();
    await auditar(autor, contas.get(email)?.id ?? null, 'editar', mudou.join(','),
      Object.fromEntries(mudou.map(k => [k, atual[k]])), Object.fromEntries(mudou.map(k => [k, body[k]])));
  }
  res.json(data);
}));

// Nova senha provisória (+ cartilha): para quem esqueceu a senha, perdeu a
// cartilha, ou foi cadastrado antes de o painel criar o login sozinho.
usuariosRouter.post('/:email/senha-provisoria', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const { perfil: autor } = ctx(res);
  const email = String(req.params.email).toLowerCase();
  const alvo = await buscarPerfil(email);
  if (!alvo) return res.status(404).json({ error: 'Pessoa não encontrada.' });
  if (!podeMexer(res, alvo.papel, undefined)) return;
  if (email === autor.email) return res.status(422).json({ error: 'Para trocar a sua própria senha, use "Trocar senha" no menu do seu usuário.' });
  if (!alvo.ativo) return res.status(422).json({ error: 'Reative o acesso da pessoa antes de gerar uma senha provisória.' });

  const contas = await contasPorEmail();
  const acesso = await definirSenhaProvisoria(email, contas.get(email));
  // Nunca a senha em si na auditoria — só o fato.
  await auditar(autor, acesso.id, acesso.criada ? 'criar' : 'editar', 'senha_provisoria', null, { conta_criada: acesso.criada });
  const resposta: AcessoCriado = { perfil: alvo, senha_provisoria: acesso.senha };
  res.json(resposta);
}));
