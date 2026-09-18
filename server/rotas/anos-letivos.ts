import { Router } from 'express';
import { exigirPapel, ctx, seguro } from '../lib/autorizacao';
import { validar, z, dataIso, inteiro } from '../lib/validacao';

export const anosLetivosRouter = Router();

const anoSchema = z.object({
  ano: z.coerce.number().int().min(1900).max(2200),
  data_inicio: dataIso,
  data_fim: dataIso,
  dias_letivos: inteiro,
  situacao: z.enum(['aberto', 'encerrado']).optional()
}).refine(v => !(v.data_inicio && v.data_fim) || v.data_fim! >= v.data_inicio!, { message: 'Fim antes do início', path: ['data_fim'] });

anosLetivosRouter.get('/', exigirPapel(), seguro(async (_req, res) => {
  const { client } = ctx(res);
  const { data, error } = await client.from('ano_letivo').select('*').order('ano', { ascending: false });
  if (error) throw error;
  res.json(data);
}));

anosLetivosRouter.post('/', exigirPapel('admin'), seguro(async (req, res) => {
  const body = validar(anoSchema, req, res);
  if (!body) return;
  const { client } = ctx(res);
  const { data, error } = await client.from('ano_letivo').insert(body).select().single();
  if (error) throw error;
  res.status(201).json(data);
}));

anosLetivosRouter.put('/:id', exigirPapel('admin'), seguro(async (req, res) => {
  const body = validar(anoSchema.partial(), req, res);
  if (!body) return;
  const { client } = ctx(res);
  const { data, error } = await client.from('ano_letivo').update(body).eq('id', req.params.id).select().single();
  if (error) throw error;
  res.json(data);
}));
