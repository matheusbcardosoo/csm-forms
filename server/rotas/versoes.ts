// Versões curriculares (F2 · 06-versionamento-curricular.md).
// Estrutura: versão → blocos → agrupamentos → itens (por série) + totais.
// Edição só em rascunho — o banco rejeita o resto (trigger), aqui só se
// devolve a mensagem certa.
import { Router } from 'express';
import { exigirPapel, ctx, seguro } from '../lib/autorizacao';
import { validar, z, texto, textoObrigatorio, inteiro, uuid } from '../lib/validacao';
import type { VersaoBloco, VersaoAgrupamento, VersaoItem } from '../../shared/types/curriculo';

export const versoesRouter = Router();

/* ---------- lista ---------- */
versoesRouter.get('/', exigirPapel(), seguro(async (req, res) => {
  const { client } = ctx(res);
  let q = client.from('versao_curricular').select('*').order('ano_inicio', { ascending: false, nullsFirst: true }).order('criado_em', { ascending: false });
  if (req.query.curso) q = q.eq('curso_id', String(req.query.curso));
  const { data: versoes, error } = await q;
  if (error) throw error;

  // Contagem de itens por versão. Uma contagem exata por versão, e não
  // uma varredura de `versao_item` agregada em memória: a varredura não
  // filtrava por versão nenhuma e batia no teto de linhas do PostgREST
  // (1000 por padrão), passando a devolver total MENOR que o real sem
  // erro nenhum — a tela dizia que uma grade publicada estava incompleta.
  const ids = (versoes || []).map(v => v.id);
  const contagens = await Promise.all(ids.map(async id => {
    const { count, error } = await client.from('versao_item')
      .select('id, versao_agrupamento!inner(versao_bloco!inner(versao_id))', { count: 'exact', head: true })
      .eq('versao_agrupamento.versao_bloco.versao_id', id);
    if (error) throw error;
    return [id, count || 0] as const;
  }));
  const contagem = new Map(contagens);
  res.json((versoes || []).map(v => ({ ...v, total_itens: contagem.get(v.id) || 0 })));
}));

/* ---------- detalhe ---------- */
async function carregarDetalhe(client: ReturnType<typeof ctx>['client'], id: string) {
  const { data: versao, error } = await client.from('versao_curricular').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!versao) return null;

  const [curso, series, blocos, agrups, itens, totais, origem] = await Promise.all([
    client.from('curso').select('*').eq('id', versao.curso_id).single(),
    client.from('serie').select('*').eq('curso_id', versao.curso_id).order('ordem').order('codigo'),
    client.from('versao_bloco').select('*').eq('versao_id', id).order('ordem'),
    client.from('versao_agrupamento').select('*, versao_bloco!inner(versao_id)').eq('versao_bloco.versao_id', id).order('ordem'),
    client.from('versao_item').select('*, versao_agrupamento!inner(versao_bloco!inner(versao_id))').eq('versao_agrupamento.versao_bloco.versao_id', id).order('ordem'),
    client.from('versao_total').select('*').eq('versao_id', id),
    versao.duplicada_de_id
      ? client.from('versao_curricular').select('id, nome').eq('id', versao.duplicada_de_id).maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);
  for (const r of [curso, series, blocos, agrups, itens, totais, origem]) if (r.error) throw r.error;

  const agrupPorBloco = new Map<string, VersaoAgrupamento[]>();
  for (const a of (agrups.data || []) as (VersaoAgrupamento & { versao_bloco?: unknown })[]) {
    const { versao_bloco: _vb, ...limpo } = a;
    const lista = agrupPorBloco.get(limpo.versao_bloco_id) || [];
    lista.push({ ...limpo, itens: [] });
    agrupPorBloco.set(limpo.versao_bloco_id, lista);
  }
  const agrupPorId = new Map<string, VersaoAgrupamento>();
  for (const lista of agrupPorBloco.values()) for (const a of lista) agrupPorId.set(a.id, a);
  for (const i of (itens.data || []) as (VersaoItem & { versao_agrupamento?: unknown })[]) {
    const { versao_agrupamento: _va, ...limpo } = i;
    agrupPorId.get(limpo.versao_agrupamento_id)?.itens.push(limpo);
  }
  const blocosCompletos: VersaoBloco[] = (blocos.data || []).map(b => ({ ...b, agrupamentos: agrupPorBloco.get(b.id) || [] }));

  return { ...versao, curso: curso.data, series: series.data, blocos: blocosCompletos, totais: totais.data, origem: origem.data };
}

versoesRouter.get('/:id', exigirPapel(), seguro(async (req, res) => {
  const { client } = ctx(res);
  const det = await carregarDetalhe(client, req.params.id);
  if (!det) return res.status(404).json({ error: 'Versão não encontrada.' });
  res.json(det);
}));

/* ---------- criar / editar cabeçalho ---------- */
const versaoSchema = z.object({
  curso_id: uuid,
  nome: textoObrigatorio,
  base_legal: texto
});

versoesRouter.post('/', exigirPapel('admin'), seguro(async (req, res) => {
  const body = validar(versaoSchema, req, res);
  if (!body) return;
  const { client, perfil } = ctx(res);
  const { data, error } = await client.from('versao_curricular').insert({ ...body, criado_por: perfil.email }).select().single();
  if (error) throw error;
  res.status(201).json(data);
}));

versoesRouter.put('/:id', exigirPapel('admin'), seguro(async (req, res) => {
  const body = validar(versaoSchema.partial().omit({ curso_id: true }).extend({ ano_fim: inteiro }), req, res);
  if (!body) return;
  const { client } = ctx(res);
  const { data, error } = await client.from('versao_curricular').update(body).eq('id', req.params.id).select().single();
  if (error) throw error;
  res.json(data);
}));

versoesRouter.delete('/:id', exigirPapel('admin'), seguro(async (req, res) => {
  const { client } = ctx(res);
  const { error } = await client.from('versao_curricular').delete().eq('id', req.params.id);
  if (error) throw error;
  res.json({ success: true });
}));

/* ---------- duplicar / publicar (funções SQL, atômicas) ---------- */
versoesRouter.post('/:id/duplicar', exigirPapel('admin'), seguro(async (req, res) => {
  const body = validar(z.object({ nome: textoObrigatorio }), req, res);
  if (!body) return;
  const { client, perfil } = ctx(res);
  const { data, error } = await client.rpc('duplicar_versao', { p_origem_id: req.params.id, p_nome: body.nome, p_usuario: perfil.email });
  if (error) throw error;
  res.status(201).json({ id: data });
}));

versoesRouter.post('/:id/publicar', exigirPapel('admin'), seguro(async (req, res) => {
  const body = validar(z.object({ ano_inicio: z.coerce.number().int().min(1900).max(2200) }), req, res);
  if (!body) return;
  const { client, perfil } = ctx(res);
  const { error } = await client.rpc('publicar_versao', { p_versao_id: req.params.id, p_ano_inicio: body.ano_inicio, p_usuario: perfil.email });
  if (error) throw error;
  res.json({ success: true });
}));

/* ---------- blocos ---------- */
const nomeOrdem = z.object({ nome: textoObrigatorio, ordem: inteiro });

versoesRouter.post('/:id/blocos', exigirPapel('admin'), seguro(async (req, res) => {
  const body = validar(nomeOrdem, req, res);
  if (!body) return;
  const { client } = ctx(res);
  const { data, error } = await client.from('versao_bloco').insert({ versao_id: req.params.id, nome: body.nome, ordem: body.ordem ?? 0 }).select().single();
  if (error) throw error;
  res.status(201).json(data);
}));

versoesRouter.put('/blocos/:id', exigirPapel('admin'), seguro(async (req, res) => {
  const body = validar(nomeOrdem.partial(), req, res);
  if (!body) return;
  const { client } = ctx(res);
  const { data, error } = await client.from('versao_bloco').update(body).eq('id', req.params.id).select().single();
  if (error) throw error;
  res.json(data);
}));

versoesRouter.delete('/blocos/:id', exigirPapel('admin'), seguro(async (req, res) => {
  const { client } = ctx(res);
  const { error } = await client.from('versao_bloco').delete().eq('id', req.params.id);
  if (error) throw error;
  res.json({ success: true });
}));

/* ---------- agrupamentos ---------- */
versoesRouter.post('/blocos/:blocoId/agrupamentos', exigirPapel('admin'), seguro(async (req, res) => {
  const body = validar(nomeOrdem, req, res);
  if (!body) return;
  const { client } = ctx(res);
  const { data, error } = await client.from('versao_agrupamento').insert({ versao_bloco_id: req.params.blocoId, nome: body.nome, ordem: body.ordem ?? 0 }).select().single();
  if (error) throw error;
  res.status(201).json(data);
}));

versoesRouter.put('/agrupamentos/:id', exigirPapel('admin'), seguro(async (req, res) => {
  const body = validar(nomeOrdem.partial(), req, res);
  if (!body) return;
  const { client } = ctx(res);
  const { data, error } = await client.from('versao_agrupamento').update(body).eq('id', req.params.id).select().single();
  if (error) throw error;
  res.json(data);
}));

versoesRouter.delete('/agrupamentos/:id', exigirPapel('admin'), seguro(async (req, res) => {
  const { client } = ctx(res);
  const { error } = await client.from('versao_agrupamento').delete().eq('id', req.params.id);
  if (error) throw error;
  res.json({ success: true });
}));

/* ---------- itens ---------- */
const itemSchema = z.object({
  serie_id: uuid,
  componente_id: z.preprocess(v => (v === '' ? null : v), uuid.nullable().optional()),
  nome_impresso: textoObrigatorio,
  ordem: inteiro,
  carga_horaria: inteiro
});

versoesRouter.post('/agrupamentos/:agrupId/itens', exigirPapel('admin'), seguro(async (req, res) => {
  // Aceita um item ou uma lista (mesmo componente em várias séries de uma vez).
  const lista = Array.isArray(req.body) ? req.body : [req.body];
  const parsed = z.array(itemSchema).min(1).safeParse(lista);
  if (!parsed.success) {
    return res.status(422).json({ error: 'Dados inválidos.', campos: parsed.error.issues.map(i => ({ campo: i.path.join('.'), mensagem: i.message })) });
  }
  const { client } = ctx(res);
  const { data, error } = await client.from('versao_item')
    .insert(parsed.data.map(i => ({ ...i, ordem: i.ordem ?? 0, versao_agrupamento_id: req.params.agrupId })))
    .select();
  if (error) throw error;
  res.status(201).json(data);
}));

versoesRouter.put('/itens/:id', exigirPapel('admin'), seguro(async (req, res) => {
  const body = validar(itemSchema.partial(), req, res);
  if (!body) return;
  const { client } = ctx(res);
  const { data, error } = await client.from('versao_item').update(body).eq('id', req.params.id).select().single();
  if (error) throw error;
  res.json(data);
}));

versoesRouter.delete('/itens/:id', exigirPapel('admin'), seguro(async (req, res) => {
  const { client } = ctx(res);
  const { error } = await client.from('versao_item').delete().eq('id', req.params.id);
  if (error) throw error;
  res.json({ success: true });
}));

/* ---------- totais ---------- */
versoesRouter.put('/:id/totais/:serieId', exigirPapel('admin'), seguro(async (req, res) => {
  const body = validar(z.object({ total_aulas_anuais: inteiro, total_horas_anuais: inteiro }), req, res);
  if (!body) return;
  const { client } = ctx(res);
  const { data, error } = await client.from('versao_total')
    .upsert({ versao_id: req.params.id, serie_id: req.params.serieId, ...body }, { onConflict: 'versao_id,serie_id' })
    .select().single();
  if (error) throw error;
  res.json(data);
}));

/* ---------- vigência (ano letivo × série → versão) ---------- */
versoesRouter.get('/vigencia/:cursoId', exigirPapel(), seguro(async (req, res) => {
  const { client } = ctx(res);
  const { data, error } = await client.from('vigencia_curricular')
    .select('ano_letivo_id, serie_id, versao_id, serie!inner(curso_id)')
    .eq('serie.curso_id', req.params.cursoId);
  if (error) throw error;
  res.json((data || []).map(({ ano_letivo_id, serie_id, versao_id }) => ({ ano_letivo_id, serie_id, versao_id })));
}));

versoesRouter.put('/vigencia', exigirPapel('admin'), seguro(async (req, res) => {
  const body = validar(z.object({ ano_letivo_id: uuid, serie_id: uuid, versao_id: uuid.nullable() }), req, res);
  if (!body) return;
  const { client } = ctx(res);
  if (!body.versao_id) {
    const { error } = await client.from('vigencia_curricular').delete().eq('ano_letivo_id', body.ano_letivo_id).eq('serie_id', body.serie_id);
    if (error) throw error;
    return res.json({ success: true });
  }
  const { error } = await client.from('vigencia_curricular').upsert(body, { onConflict: 'ano_letivo_id,serie_id' });
  if (error) throw error;
  res.json({ success: true });
}));
