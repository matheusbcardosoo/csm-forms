// Cadastros base (F2): cursos, séries, componentes, sistema de avaliação,
// estabelecimentos externos. Versões curriculares ficam em versoes.ts.
import { Router } from 'express';
import { exigirPapel, ctx, seguro } from '../lib/autorizacao';
import { validar, z, texto, textoObrigatorio, inteiro, numero, uuid } from '../lib/validacao';

export const cadastrosRouter = Router();

/* ================= CURSOS ================= */
const cursoSchema = z.object({
  etapa: z.enum(['ei', 'ef_iniciais', 'ef_finais', 'em']),
  nome: textoObrigatorio,
  razao_aula_hora: z.preprocess(v => (v === '' || v == null ? 0.75 : Number(String(v).replace(',', '.'))), z.number().positive().max(2)),
  texto_promocao: texto,
  ativo: z.boolean().optional(),
  ordem: inteiro
});

cadastrosRouter.get('/cursos', exigirPapel(), seguro(async (_req, res) => {
  const { client } = ctx(res);
  const [cursos, series, sistemas] = await Promise.all([
    client.from('curso').select('*').order('ordem').order('nome'),
    client.from('serie').select('*').order('ordem').order('codigo'),
    client.from('sistema_avaliacao').select('*')
  ]);
  if (cursos.error) throw cursos.error;
  if (series.error) throw series.error;
  if (sistemas.error) throw sistemas.error;
  res.json({ cursos: cursos.data, series: series.data, sistemas: sistemas.data });
}));

cadastrosRouter.post('/cursos', exigirPapel('admin'), seguro(async (req, res) => {
  const body = validar(cursoSchema, req, res);
  if (!body) return;
  const { client } = ctx(res);
  const { data, error } = await client.from('curso').insert(body).select().single();
  if (error) throw error;
  res.status(201).json(data);
}));

cadastrosRouter.put('/cursos/:id', exigirPapel('admin'), seguro(async (req, res) => {
  const body = validar(cursoSchema.partial(), req, res);
  if (!body) return;
  const { client } = ctx(res);
  const { data, error } = await client.from('curso').update(body).eq('id', req.params.id).select().single();
  if (error) throw error;
  res.json(data);
}));

/* ================= SÉRIES ================= */
const serieSchema = z.object({
  codigo: textoObrigatorio,
  nome: textoObrigatorio,
  ordem: inteiro,
  ativo: z.boolean().optional()
});

cadastrosRouter.post('/cursos/:cursoId/series', exigirPapel('admin'), seguro(async (req, res) => {
  const body = validar(serieSchema, req, res);
  if (!body) return;
  const { client } = ctx(res);
  if (body.ordem == null) {
    const { count } = await client.from('serie').select('id', { count: 'exact', head: true }).eq('curso_id', req.params.cursoId);
    body.ordem = count || 0;
  }
  const { data, error } = await client.from('serie').insert({ ...body, curso_id: req.params.cursoId }).select().single();
  if (error) throw error;
  res.status(201).json(data);
}));

cadastrosRouter.put('/series/:id', exigirPapel('admin'), seguro(async (req, res) => {
  const body = validar(serieSchema.partial(), req, res);
  if (!body) return;
  const { client } = ctx(res);
  const { data, error } = await client.from('serie').update(body).eq('id', req.params.id).select().single();
  if (error) throw error;
  res.json(data);
}));

/* ================= SISTEMA DE AVALIAÇÃO ================= */
const sistemaSchema = z.object({
  tipo: z.enum(['nota_0_10', 'nota_0_100', 'conceito']),
  media_aprovacao: numero,
  frequencia_minima: numero,
  escala_conceitos: z.array(z.object({ conceito: z.string().trim().min(1), descricao: z.string().trim() })).nullable().optional(),
  legenda: texto
});

cadastrosRouter.put('/cursos/:cursoId/sistema-avaliacao', exigirPapel('admin'), seguro(async (req, res) => {
  const body = validar(sistemaSchema, req, res);
  if (!body) return;
  const { client } = ctx(res);
  const { data, error } = await client.from('sistema_avaliacao')
    .upsert({ ...body, curso_id: req.params.cursoId }, { onConflict: 'curso_id' })
    .select().single();
  if (error) throw error;
  res.json(data);
}));

/* ================= COMPONENTES ================= */
const componenteSchema = z.object({
  nome_canonico: textoObrigatorio,
  sigla: texto,
  ativo: z.boolean().optional()
});

cadastrosRouter.get('/componentes', exigirPapel(), seguro(async (_req, res) => {
  const { client } = ctx(res);
  const { data, error } = await client.from('componente').select('*').order('nome_canonico');
  if (error) throw error;
  res.json(data);
}));

cadastrosRouter.post('/componentes', exigirPapel('admin'), seguro(async (req, res) => {
  const body = validar(componenteSchema, req, res);
  if (!body) return;
  const { client } = ctx(res);
  const { data, error } = await client.from('componente').insert(body).select().single();
  if (error) throw error;
  res.status(201).json(data);
}));

cadastrosRouter.put('/componentes/:id', exigirPapel('admin'), seguro(async (req, res) => {
  const body = validar(componenteSchema.partial(), req, res);
  if (!body) return;
  const { client } = ctx(res);
  const { data, error } = await client.from('componente').update(body).eq('id', req.params.id).select().single();
  if (error) throw error;
  res.json(data);
}));

/**
 * Onde este componente está em uso. É o que a confirmação de exclusão
 * mostra: apagar identidade de componente sem ver o estrago é como
 * apagar uma coluna do histórico às cegas.
 */
async function usoDoComponente(client: ReturnType<typeof ctx>['client'], id: string) {
  const [linhas, maps] = await Promise.all([
    client.from('versao_item')
      .select('nome_impresso, serie:serie(nome), versao_agrupamento!inner(versao_bloco!inner(versao_curricular!inner(id, nome, status, curso:curso(nome))))')
      .eq('componente_id', id),
    client.from('mapeamento_activesoft').select('codigo_origem, descricao_origem').eq('componente_id', id)
  ]);
  for (const r of [linhas, maps]) if (r.error) throw r.error;

  const um = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
  const detalhadas = (linhas.data || []).map(l => {
    const versao = um(um((um(l.versao_agrupamento as never) as { versao_bloco: unknown } | null)?.versao_bloco as never) as never) as
      { id: string; nome: string; status: string; curso: { nome: string } | { nome: string }[] } | null;
    return {
      versao_id: versao?.id || '',
      versao: versao?.nome || '—',
      status: versao?.status || '—',
      curso: um(versao?.curso as never as { nome: string } | { nome: string }[])?.nome || '—',
      serie: um(l.serie as never as { nome: string } | { nome: string }[])?.nome || '—',
      nome_impresso: l.nome_impresso as string
    };
  });

  // Nota não aponta para o componente, aponta para a linha da grade; o
  // que interessa é quantas notas existem nas linhas que sumiriam.
  let notas = 0;
  const ids = (linhas.data || []).length
    ? (await client.from('versao_item').select('id').eq('componente_id', id)).data?.map(x => x.id) || []
    : [];
  for (let i = 0; i < ids.length; i += 100) {
    const { count, error } = await client.from('nota').select('id', { count: 'exact', head: true }).in('versao_item_id', ids.slice(i, i + 100));
    if (error) throw error;
    notas += count || 0;
  }

  const emUso = detalhadas.filter(l => l.status !== 'rascunho');
  const motivo = emUso.length
    ? `Está em ${emUso.length} linha(s) de currículo já publicado — é a identidade de uma coluna de histórico emitido, e apagá-la reescreveria documento antigo. Remova a linha do currículo (duplicando a versão) antes.`
    : notas
      ? `Há ${notas} nota(s) gravada(s) nas linhas que seriam removidas. Apague ou remaneje essas notas antes.`
      : null;

  return { linhas: detalhadas, mapeamentos: maps.data || [], notas, podeExcluir: !motivo, motivo };
}

cadastrosRouter.get('/componentes/:id/uso', exigirPapel('admin'), seguro(async (req, res) => {
  const { client } = ctx(res);
  res.json(await usoDoComponente(client, req.params.id));
}));

/**
 * Exclui o componente: solta os mapeamentos, leva as linhas de grade em
 * RASCUNHO que o usavam e some com ele — tudo o que a confirmação na
 * tela prometeu, e nada além. Currículo publicado ou nota gravada
 * bloqueiam.
 *
 * Numa função `security definer`, não em três escritas daqui: a primeira
 * versão fazia os três passos em sequência e, quando o último falhava, o
 * componente ficava vivo, sem linhas e sem códigos apontando para ele —
 * nem excluiu, nem manteve. A função é uma transação só (migration 012),
 * e as checagens vivem lá dentro, onde ninguém as contorna chamando o
 * PostgREST direto.
 */
cadastrosRouter.delete('/componentes/:id', exigirPapel('admin'), seguro(async (req, res) => {
  const { client } = ctx(res);
  const { data, error } = await client.rpc('excluir_componente', { p_id: req.params.id });
  if (error) throw error;
  res.json(data);
}));

/* ================= ESTABELECIMENTOS EXTERNOS ================= */
const estabSchema = z.object({
  nome: textoObrigatorio,
  municipio: texto,
  uf: z.preprocess(v => (typeof v === 'string' ? v.trim().toUpperCase() || null : v), z.string().length(2, 'UF com 2 letras').nullable().optional()),
  cnpj: texto,
  codigo_inep: texto,
  ativo: z.boolean().optional()
});

cadastrosRouter.get('/estabelecimentos', exigirPapel(), seguro(async (_req, res) => {
  const { client } = ctx(res);
  const { data, error } = await client.from('estabelecimento_externo').select('*').order('nome');
  if (error) throw error;
  res.json(data);
}));

cadastrosRouter.post('/estabelecimentos', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const body = validar(estabSchema, req, res);
  if (!body) return;
  const { client } = ctx(res);
  const { data, error } = await client.from('estabelecimento_externo').insert(body).select().single();
  if (error) throw error;
  res.status(201).json(data);
}));

cadastrosRouter.put('/estabelecimentos/:id', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const body = validar(estabSchema.partial(), req, res);
  if (!body) return;
  const { client } = ctx(res);
  const { data, error } = await client.from('estabelecimento_externo').update(body).eq('id', req.params.id).select().single();
  if (error) throw error;
  res.json(data);
}));

// uuid é usado nos schemas acima via validacao; exportado aqui só para
// manter o import "vivo" quando nenhum schema local o usa.
void uuid;
