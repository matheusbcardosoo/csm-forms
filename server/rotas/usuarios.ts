// Equipe e papéis (/app/config/usuarios) — só admin.
// Criar a conta de login (Supabase Auth) continua no script
// scripts/provision-staff-users.mjs; aqui se gerencia o PERFIL.
import { Router } from 'express';
import { exigirPapel, ctx, seguro } from '../lib/autorizacao';
import { validar, z, texto } from '../lib/validacao';
import { PAPEIS } from '../../shared/types/usuario';

export const usuariosRouter = Router();

const perfilSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  nome: texto,
  papel: z.enum(PAPEIS as [string, ...string[]]),
  ativo: z.boolean().optional().default(true)
});

usuariosRouter.get('/', exigirPapel('admin'), seguro(async (_req, res) => {
  const { client } = ctx(res);
  const { data, error } = await client.from('usuario_perfil').select('*').order('nome', { ascending: true, nullsFirst: false });
  if (error) throw error;
  res.json(data);
}));

usuariosRouter.post('/', exigirPapel('admin'), seguro(async (req, res) => {
  const body = validar(perfilSchema, req, res);
  if (!body) return;
  const { client } = ctx(res);
  const { data, error } = await client.from('usuario_perfil').insert(body).select().single();
  if (error) throw error;
  res.status(201).json(data);
}));

usuariosRouter.put('/:email', exigirPapel('admin'), seguro(async (req, res) => {
  const body = validar(perfilSchema.partial().omit({ email: true }), req, res);
  if (!body) return;
  const { client, perfil } = ctx(res);
  const email = String(req.params.email).toLowerCase();
  // Guarda contra se trancar para fora: admin não rebaixa nem desativa a si mesmo.
  if (email === perfil.email && (body.papel && body.papel !== 'admin' || body.ativo === false)) {
    return res.status(422).json({ error: 'Você não pode remover o próprio acesso de administrador.' });
  }
  const { data, error } = await client.from('usuario_perfil').update(body).eq('email', email).select().single();
  if (error) throw error;
  res.json(data);
}));
