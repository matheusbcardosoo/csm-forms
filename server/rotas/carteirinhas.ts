// Carteirinhas e fichas de inscrição de eventos (08-carteirinhas §6.5).
// Módulo inteiro só para admin e secretaria (RNF-CART-01): a RLS das
// tabelas e do bucket repete a regra no banco (migration 015).
import { Router, type Response } from 'express';
import JSZip from 'jszip';
import { exigirPapel, ctx, seguro } from '../lib/autorizacao';
import { validar, z, texto, textoObrigatorio, dataIso, uuid } from '../lib/validacao';
import { tipoDaImagem } from '../servicos/fotos';
import {
  BUCKET_CARTEIRINHAS, carregarAluno, carregarPasta, carregarSubpasta, conferir, contar, detalharInscritos, logoDoColegio,
  montarCarteirinhas, montarFichaInscricao, ordenar, diretorAtivo, type AlunoInscrito
} from '../servicos/carteirinha/montar';
import { gerarPdfCarteirinhas, gerarPdfFicha, registrarEmissao, slug } from '../servicos/carteirinha/pdf';
import type {
  CarteirinhaPasta, CarteirinhaSubpasta, Contadores, Emissao, InscricaoDoAluno, PastaDetalhe, PastaResumo, SubpastaDetalhe, SubpastaResumo
} from '../../shared/types/carteirinha';

export const carteirinhasRouter = Router();
carteirinhasRouter.use(exigirPapel('admin', 'secretaria'));

type Db = ReturnType<typeof ctx>['client'];
const LOGO_MAX = 5 * 1024 * 1024;

/* ---------------- leituras auxiliares ---------------- */

type AlunoMin = Pick<AlunoInscrito, 'id' | 'foto_path' | 'ra' | 'data_nascimento'>;

/** Inscritos (só o que a conferência usa) por subpasta, paginando além das 1000 linhas do PostgREST. */
async function inscritosPorSubpasta(db: Db, subpastaIds: string[]): Promise<Map<string, AlunoMin[]>> {
  const mapa = new Map<string, AlunoMin[]>(subpastaIds.map(id => [id, []]));
  if (!subpastaIds.length) return mapa;
  for (let de = 0; ; de += 1000) {
    const { data, error } = await db.from('carteirinha_inscrito').select('subpasta_id, aluno(id, foto_path, ra, data_nascimento)')
      .in('subpasta_id', subpastaIds).order('subpasta_id').order('aluno_id').range(de, de + 999);
    if (error) throw error;
    for (const l of (data || []) as unknown as { subpasta_id: string; aluno: AlunoMin | null }[]) if (l.aluno) mapa.get(l.subpasta_id)?.push(l.aluno);
    if (!data || data.length < 1000) break;
  }
  return mapa;
}

const comoContador = (alunos: AlunoMin[]): Contadores => contar(alunos as AlunoInscrito[]);

function distintos(listas: AlunoMin[][]): AlunoMin[] {
  const vistos = new Map<string, AlunoMin>();
  for (const l of listas) for (const a of l) vistos.set(a.id, a);
  return [...vistos.values()];
}

type LinhaEmissao = { id: string; documento: Emissao['documento']; escopo: Emissao['escopo']; aluno_ids: string[]; emitido_por: string | null; emitido_em: string; subpasta_id: string | null; pasta_id: string | null };
const paraEmissao = (e: LinhaEmissao): Emissao => ({ id: e.id, documento: e.documento, escopo: e.escopo, quantidade: e.aluno_ids.length, emitido_por: e.emitido_por, emitido_em: e.emitido_em });

async function emissoes(db: Db, filtro: { pasta_id?: string; subpasta_id?: string }, limite = 200): Promise<LinhaEmissao[]> {
  let q = db.from('carteirinha_emissao').select('id, documento, escopo, aluno_ids, emitido_por, emitido_em, subpasta_id, pasta_id').order('emitido_em', { ascending: false }).limit(limite);
  if (filtro.pasta_id) q = q.eq('pasta_id', filtro.pasta_id);
  if (filtro.subpasta_id) q = q.eq('subpasta_id', filtro.subpasta_id);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as LinhaEmissao[];
}

function enviarPdf(res: Response, pdf: Buffer, nome: string) {
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${nome}"`, 'Content-Length': String(pdf.length) });
  res.send(pdf);
}

/* ---------------- logo do colégio (para a pré-visualização) ---------------- */
carteirinhasRouter.get('/logo-colegio', seguro(async (_req, res) => {
  const logo = await logoDoColegio(ctx(res).client);
  if (!logo) return res.status(404).json({ error: 'Sem logo do colégio.' });
  res.set({ 'Content-Type': logo.tipo, 'Cache-Control': 'private, max-age=300' });
  res.send(logo.bytes);
}));

/* ---------------- árvore pasta › subpasta (seletores) ---------------- */
carteirinhasRouter.get('/arvore', seguro(async (_req, res) => {
  const { client } = ctx(res);
  const [p, s] = await Promise.all([
    client.from('carteirinha_pasta').select('id, nome, validade, logo_evento_path').eq('arquivada', false).order('criado_em', { ascending: false }),
    client.from('carteirinha_subpasta').select('id, pasta_id, nome, ordem').order('ordem').order('nome')
  ]);
  if (p.error) throw p.error;
  if (s.error) throw s.error;
  res.json((p.data || []).map(pasta => ({ ...pasta, subpastas: (s.data || []).filter(x => x.pasta_id === pasta.id) })));
}));

/* ==================== pastas ==================== */
const pastaSchema = z.object({
  nome: textoObrigatorio,
  descricao: texto,
  validade: dataIso,
  ano_letivo_id: z.preprocess(v => (v === '' ? null : v), uuid.nullable().optional())
});

carteirinhasRouter.get('/pastas', seguro(async (req, res) => {
  const { client } = ctx(res);
  const arquivadas = req.query.arquivadas === '1';
  const { data: pastas, error } = await client.from('carteirinha_pasta').select('*').eq('arquivada', arquivadas).order('criado_em', { ascending: false });
  if (error) throw error;
  const ids = (pastas || []).map(p => p.id);
  const { data: subs, error: e2 } = ids.length ? await client.from('carteirinha_subpasta').select('id, pasta_id').in('pasta_id', ids) : { data: [], error: null };
  if (e2) throw e2;
  const porSub = await inscritosPorSubpasta(client, (subs || []).map(s => s.id));
  const { count: nArquivadas } = await client.from('carteirinha_pasta').select('id', { count: 'exact', head: true }).eq('arquivada', true);

  const lista: PastaResumo[] = (pastas || []).map(p => {
    const minhas = (subs || []).filter(s => s.pasta_id === p.id);
    return { ...(p as CarteirinhaPasta), subpastas: minhas.length, ...comoContador(distintos(minhas.map(s => porSub.get(s.id) || []))) };
  });
  res.json({ pastas: lista, arquivadas: nArquivadas || 0 });
}));

carteirinhasRouter.post('/pastas', seguro(async (req, res) => {
  const body = validar(pastaSchema, req, res);
  if (!body) return;
  const { client, perfil } = ctx(res);
  const { data, error } = await client.from('carteirinha_pasta').insert({ ...body, criado_por: perfil.email }).select().single();
  if (error) throw error;
  res.status(201).json(data);
}));

carteirinhasRouter.put('/pastas/:id', seguro(async (req, res) => {
  const body = validar(pastaSchema.partial().extend({ arquivada: z.boolean().optional() }), req, res);
  if (!body) return;
  const { data, error } = await ctx(res).client.from('carteirinha_pasta').update(body).eq('id', req.params.id).select().single();
  if (error) throw error;
  res.json(data);
}));

/** RF-CART-09: só exclui vazia; com subpasta, a saída é arquivar. */
carteirinhasRouter.delete('/pastas/:id', seguro(async (req, res) => {
  const { client } = ctx(res);
  const { count, error: e0 } = await client.from('carteirinha_subpasta').select('id', { count: 'exact', head: true }).eq('pasta_id', req.params.id);
  if (e0) throw e0;
  if (count) return res.status(409).json({ error: `A pasta tem ${count} subpasta(s). Arquive a pasta em vez de excluir — ela some da lista e continua consultável em Arquivadas.` });
  const pasta = await carregarPasta(client, req.params.id);
  const { error } = await client.from('carteirinha_pasta').delete().eq('id', req.params.id);
  if (error) throw error;
  if (pasta?.logo_evento_path) await client.storage.from(BUCKET_CARTEIRINHAS).remove([pasta.logo_evento_path]);
  res.json({ success: true });
}));

/* ---------- logo do evento ---------- */
carteirinhasRouter.post('/pastas/:id/logo', seguro(async (req, res) => {
  const body = validar(z.object({ base64: z.string().min(1) }), req, res);
  if (!body) return;
  const bytes = Buffer.from(body.base64, 'base64');
  if (bytes.length > LOGO_MAX) return res.status(422).json({ error: 'A logo deve ter no máximo 5 MB.' });
  // SVG é convertido para PNG no navegador; aqui só entra bitmap (§6.3)
  const tipo = tipoDaImagem(bytes);
  if (!tipo) return res.status(422).json({ error: 'Envie a logo em PNG, JPG ou WebP (SVG é convertido automaticamente pela tela).' });
  const { client } = ctx(res);
  const caminho = `logos/${req.params.id}`;
  const { error: upErr } = await client.storage.from(BUCKET_CARTEIRINHAS).upload(caminho, bytes, { contentType: tipo, upsert: true, cacheControl: '0' });
  if (upErr) throw upErr;
  // atualizado_em muda junto, e é ele que versiona a URL da logo na tela
  const { data, error } = await client.from('carteirinha_pasta').update({ logo_evento_path: caminho }).eq('id', req.params.id).select().single();
  if (error) throw error;
  res.json(data);
}));

carteirinhasRouter.delete('/pastas/:id/logo', seguro(async (req, res) => {
  const { client } = ctx(res);
  const pasta = await carregarPasta(client, req.params.id);
  if (!pasta) return res.status(404).json({ error: 'Pasta não encontrada.' });
  if (pasta.logo_evento_path) await client.storage.from(BUCKET_CARTEIRINHAS).remove([pasta.logo_evento_path]);
  const { data, error } = await client.from('carteirinha_pasta').update({ logo_evento_path: null }).eq('id', pasta.id).select().single();
  if (error) throw error;
  res.json(data);
}));

carteirinhasRouter.get('/pastas/:id/logo', seguro(async (req, res) => {
  const { client } = ctx(res);
  const pasta = await carregarPasta(client, req.params.id);
  if (!pasta?.logo_evento_path) return res.status(404).json({ error: 'Pasta sem logo.' });
  const { data, error } = await client.storage.from(BUCKET_CARTEIRINHAS).download(pasta.logo_evento_path);
  if (error || !data) return res.status(404).json({ error: 'Logo não encontrada.' });
  const bytes = Buffer.from(await data.arrayBuffer());
  res.set({ 'Content-Type': tipoDaImagem(bytes) || 'application/octet-stream', 'Cache-Control': 'private, max-age=300' });
  res.send(bytes);
}));

/* ---------- duplicar (RF-CART-08) ---------- */
carteirinhasRouter.post('/pastas/:id/duplicar', seguro(async (req, res) => {
  const body = validar(z.object({ nome: textoObrigatorio, com_inscritos: z.boolean().default(false) }), req, res);
  if (!body) return;
  const { client, perfil } = ctx(res);
  const origem = await carregarPasta(client, req.params.id);
  if (!origem) return res.status(404).json({ error: 'Pasta não encontrada.' });

  const { data: nova, error } = await client.from('carteirinha_pasta').insert({
    nome: body.nome, descricao: origem.descricao, validade: origem.validade, ano_letivo_id: origem.ano_letivo_id, criado_por: perfil.email
  }).select().single();
  if (error) throw error;
  if (origem.logo_evento_path) {
    const { data: arq } = await client.storage.from(BUCKET_CARTEIRINHAS).download(origem.logo_evento_path);
    if (arq) {
      const bytes = Buffer.from(await arq.arrayBuffer());
      const caminho = `logos/${nova.id}`;
      const { error: upErr } = await client.storage.from(BUCKET_CARTEIRINHAS).upload(caminho, bytes, { contentType: tipoDaImagem(bytes) || 'image/png', upsert: true });
      if (!upErr) await client.from('carteirinha_pasta').update({ logo_evento_path: caminho }).eq('id', nova.id);
    }
  }
  const { data: subs, error: e2 } = await client.from('carteirinha_subpasta').select('*').eq('pasta_id', origem.id).order('ordem');
  if (e2) throw e2;
  for (const s of subs || []) {
    const { data: ns, error: e3 } = await client.from('carteirinha_subpasta').insert({
      pasta_id: nova.id, nome: s.nome, professor_responsavel: s.professor_responsavel, ordem: s.ordem, ordenacao: s.ordenacao, criado_por: perfil.email
    }).select('id').single();
    if (e3) throw e3;
    if (body.com_inscritos) {
      const { data: ins, error: e4 } = await client.from('carteirinha_inscrito').select('aluno_id, ordem').eq('subpasta_id', s.id);
      if (e4) throw e4;
      if (ins?.length) {
        const { error: e5 } = await client.from('carteirinha_inscrito').insert(ins.map(i => ({ ...i, subpasta_id: ns.id, adicionado_por: perfil.email })));
        if (e5) throw e5;
      }
    }
  }
  res.status(201).json(await carregarPasta(client, nova.id));
}));

/* ---------- detalhe da pasta ---------- */
carteirinhasRouter.get('/pastas/:id', seguro(async (req, res) => {
  const { client } = ctx(res);
  const pasta = await carregarPasta(client, req.params.id);
  if (!pasta) return res.status(404).json({ error: 'Pasta não encontrada.' });
  const { data: subs, error } = await client.from('carteirinha_subpasta').select('*').eq('pasta_id', pasta.id).order('ordem').order('nome');
  if (error) throw error;
  const porSub = await inscritosPorSubpasta(client, (subs || []).map(s => s.id));
  const log = await emissoes(client, { pasta_id: pasta.id });

  const subpastas: SubpastaResumo[] = (subs || []).map(s => {
    const ultima = log.find(e => e.subpasta_id === s.id);
    return { ...(s as CarteirinhaSubpasta), ...comoContador(porSub.get(s.id) || []), ultima_emissao: ultima ? paraEmissao(ultima) : null };
  });
  const corpo: PastaDetalhe = {
    pasta, subpastas,
    totais: comoContador(distintos([...porSub.values()])),
    ultima_emissao: log[0] ? paraEmissao(log[0]) : null
  };
  res.json(corpo);
}));

/* ==================== subpastas ==================== */
const subpastaSchema = z.object({
  nome: textoObrigatorio,
  professor_responsavel: texto,
  ordenacao: z.enum(['alfabetica', 'manual']).optional()
});

carteirinhasRouter.post('/pastas/:id/subpastas', seguro(async (req, res) => {
  const body = validar(subpastaSchema, req, res);
  if (!body) return;
  const { client, perfil } = ctx(res);
  const { data: ultima } = await client.from('carteirinha_subpasta').select('ordem').eq('pasta_id', req.params.id).order('ordem', { ascending: false }).limit(1);
  const { data, error } = await client.from('carteirinha_subpasta').insert({ ...body, pasta_id: req.params.id, ordem: (ultima?.[0]?.ordem ?? -1) + 1, criado_por: perfil.email }).select().single();
  if (error) {
    if ((error as { code?: string }).code === '23505') return res.status(409).json({ error: `Já existe uma subpasta "${body.nome}" nesta pasta.` });
    throw error;
  }
  res.status(201).json(data);
}));

/** Reordenação das subpastas da pasta: [id, id, …] na ordem nova. */
carteirinhasRouter.put('/pastas/:id/ordem', seguro(async (req, res) => {
  const body = validar(z.object({ ids: z.array(uuid) }), req, res);
  if (!body) return;
  const { client } = ctx(res);
  for (const [i, id] of body.ids.entries()) {
    const { error } = await client.from('carteirinha_subpasta').update({ ordem: i }).eq('id', id).eq('pasta_id', req.params.id);
    if (error) throw error;
  }
  res.json({ success: true });
}));

carteirinhasRouter.put('/subpastas/:id', seguro(async (req, res) => {
  const body = validar(subpastaSchema.partial(), req, res);
  if (!body) return;
  const { data, error } = await ctx(res).client.from('carteirinha_subpasta').update(body).eq('id', req.params.id).select().single();
  if (error) {
    if ((error as { code?: string }).code === '23505') return res.status(409).json({ error: `Já existe uma subpasta "${body.nome}" nesta pasta.` });
    throw error;
  }
  res.json(data);
}));

carteirinhasRouter.delete('/subpastas/:id', seguro(async (req, res) => {
  const { error } = await ctx(res).client.from('carteirinha_subpasta').delete().eq('id', req.params.id);
  if (error) throw error;
  res.json({ success: true });
}));

carteirinhasRouter.get('/subpastas/:id', seguro(async (req, res) => {
  const { client } = ctx(res);
  const dados = await carregarSubpasta(client, req.params.id);
  if (!dados) return res.status(404).json({ error: 'Subpasta não encontrada.' });
  const [log, diretores] = await Promise.all([
    emissoes(client, { subpasta_id: dados.subpasta.id }, 20),
    client.from('instituicao_signatario').select('id, nome').eq('cargo', 'diretor').eq('ativo', true).order('ordem')
  ]);
  const corpo: SubpastaDetalhe & { diretores: { id: string; nome: string }[] } = {
    pasta: dados.pasta, subpasta: dados.subpasta,
    inscritos: detalharInscritos(dados.alunos),
    conferencia: conferir(dados.pasta, dados.alunos),
    emissoes: log.map(paraEmissao),
    diretores: diretores.data || []
  };
  res.json(corpo);
}));

/* ---------- inscritos ---------- */
/** Em lote e idempotente (RF-CART-03/05): quem já estava fica onde estava. */
carteirinhasRouter.post('/subpastas/:id/inscritos', seguro(async (req, res) => {
  const body = validar(z.object({ aluno_ids: z.array(uuid).min(1, 'Escolha ao menos um aluno.').max(2000) }), req, res);
  if (!body) return;
  const { client, perfil } = ctx(res);
  const { data: atuais, error: e0 } = await client.from('carteirinha_inscrito').select('aluno_id, ordem').eq('subpasta_id', req.params.id);
  if (e0) throw e0;
  const ja = new Set((atuais || []).map(i => i.aluno_id));
  let ordem = Math.max(-1, ...(atuais || []).map(i => i.ordem)) + 1;
  const novos = [...new Set(body.aluno_ids)].filter(id => !ja.has(id)).map(aluno_id => ({ subpasta_id: req.params.id, aluno_id, ordem: ordem++, adicionado_por: perfil.email }));
  if (novos.length) {
    const { error } = await client.from('carteirinha_inscrito').upsert(novos, { onConflict: 'subpasta_id,aluno_id', ignoreDuplicates: true });
    if (error) throw error;
  }
  res.json({ adicionados: novos.length, ja_estavam: body.aluno_ids.length - novos.length });
}));

carteirinhasRouter.delete('/subpastas/:id/inscritos/:alunoId', seguro(async (req, res) => {
  const { error } = await ctx(res).client.from('carteirinha_inscrito').delete().eq('subpasta_id', req.params.id).eq('aluno_id', req.params.alunoId);
  if (error) throw error;
  res.json({ success: true });
}));

/** Ordem manual (RF-CART-06): a lista inteira, na ordem nova. */
carteirinhasRouter.put('/subpastas/:id/ordem', seguro(async (req, res) => {
  const body = validar(z.object({ aluno_ids: z.array(uuid) }), req, res);
  if (!body) return;
  const { client } = ctx(res);
  for (const [i, aluno_id] of body.aluno_ids.entries()) {
    const { error } = await client.from('carteirinha_inscrito').update({ ordem: i }).eq('subpasta_id', req.params.id).eq('aluno_id', aluno_id);
    if (error) throw error;
  }
  const { error } = await client.from('carteirinha_subpasta').update({ ordenacao: 'manual' }).eq('id', req.params.id);
  if (error) throw error;
  res.json({ success: true });
}));

/* ==================== prévia e emissão ==================== */
const listaIds = (v: unknown) => String(v || '').split(',').map(s => s.trim()).filter(s => uuid.safeParse(s).success);

/** Os alunos pedidos, na ordem da subpasta; os de fora (avulsa) vêm do cadastro. */
async function selecionar(db: Db, inscritos: AlunoInscrito[], ids: string[], ordenacao: CarteirinhaSubpasta['ordenacao']): Promise<AlunoInscrito[]> {
  if (!ids.length) return inscritos;
  const porId = new Map(inscritos.map(a => [a.id, a]));
  const escolhidos: AlunoInscrito[] = [];
  for (const id of ids) {
    const a = porId.get(id) || await carregarAluno(db, id);
    if (a) escolhidos.push(a);
  }
  return ordenar(escolhidos, ordenacao);
}

carteirinhasRouter.get('/subpastas/:id/previa', seguro(async (req, res) => {
  const { client } = ctx(res);
  const dados = await carregarSubpasta(client, req.params.id);
  if (!dados) return res.status(404).json({ error: 'Subpasta não encontrada.' });
  if (req.query.doc === 'ficha') {
    const diretor = await diretorAtivo(client, req.query.diretor ? String(req.query.diretor) : null);
    return res.json(await montarFichaInscricao(client, dados.pasta, dados.subpasta, dados.alunos, 'tela', diretor));
  }
  const alunos = await selecionar(client, dados.alunos, listaIds(req.query.alunos), dados.subpasta.ordenacao);
  res.json(await montarCarteirinhas(client, dados.pasta, dados.subpasta, alunos, 'tela'));
}));

carteirinhasRouter.get('/subpastas/:id/carteirinhas.pdf', seguro(async (req, res) => {
  const { client, perfil } = ctx(res);
  const dados = await carregarSubpasta(client, req.params.id);
  if (!dados) return res.status(404).json({ error: 'Subpasta não encontrada.' });
  const { bloqueios } = conferir(dados.pasta, dados.alunos);
  if (bloqueios.length) return res.status(422).json({ error: bloqueios.join(' ') });
  const pedidos = listaIds(req.query.alunos);
  const alunos = await selecionar(client, dados.alunos, pedidos, dados.subpasta.ordenacao);
  if (!alunos.length) return res.status(422).json({ error: 'Nenhum aluno inscrito nesta subpasta.' });
  const pdf = await gerarPdfCarteirinhas(dados.subpasta.id, pedidos.length ? alunos.map(a => a.id) : undefined);
  await registrarEmissao(client, { pasta_id: dados.pasta.id, subpasta_id: dados.subpasta.id, documento: 'carteirinhas', escopo: pedidos.length ? 'selecao' : 'subpasta', aluno_ids: alunos.map(a => a.id), emitido_por: perfil.email });
  enviarPdf(res, pdf, `carteirinhas-${slug(dados.pasta.nome, dados.subpasta.nome)}.pdf`);
}));

carteirinhasRouter.get('/subpastas/:id/ficha.pdf', seguro(async (req, res) => {
  const { client, perfil } = ctx(res);
  const dados = await carregarSubpasta(client, req.params.id);
  if (!dados) return res.status(404).json({ error: 'Subpasta não encontrada.' });
  const pdf = await gerarPdfFicha({ subpasta: dados.subpasta.id }, req.query.diretor ? String(req.query.diretor) : null);
  await registrarEmissao(client, { pasta_id: dados.pasta.id, subpasta_id: dados.subpasta.id, documento: 'ficha_inscricao', escopo: 'subpasta', aluno_ids: dados.alunos.map(a => a.id), emitido_por: perfil.email });
  enviarPdf(res, pdf, `ficha-inscricao-${slug(dados.pasta.nome, dados.subpasta.nome)}.pdf`);
}));

/* ---------- pasta inteira (RF-CART-14 / RF-FICHA-07) ---------- */
async function subpastasCheias(db: Db, pastaId: string) {
  const { data, error } = await db.from('carteirinha_subpasta').select('id').eq('pasta_id', pastaId).order('ordem').order('nome');
  if (error) throw error;
  const todas: NonNullable<Awaited<ReturnType<typeof carregarSubpasta>>>[] = [];
  for (const s of data || []) { const d = await carregarSubpasta(db, s.id); if (d) todas.push(d); }
  return todas;
}

carteirinhasRouter.get('/pastas/:id/fichas.pdf', seguro(async (req, res) => {
  const { client, perfil } = ctx(res);
  const pasta = await carregarPasta(client, req.params.id);
  if (!pasta) return res.status(404).json({ error: 'Pasta não encontrada.' });
  const subs = await subpastasCheias(client, pasta.id);
  if (!subs.length) return res.status(422).json({ error: 'A pasta não tem subpastas.' });
  const pdf = await gerarPdfFicha({ pasta: pasta.id }, req.query.diretor ? String(req.query.diretor) : null);
  await registrarEmissao(client, { pasta_id: pasta.id, subpasta_id: null, documento: 'ficha_inscricao', escopo: 'pasta', aluno_ids: [...new Set(subs.flatMap(s => s.alunos.map(a => a.id)))], emitido_por: perfil.email });
  enviarPdf(res, pdf, `fichas-inscricao-${slug(pasta.nome)}.pdf`);
}));

carteirinhasRouter.get('/pastas/:id/carteirinhas.zip', seguro(async (req, res) => {
  const { client, perfil } = ctx(res);
  const pasta = await carregarPasta(client, req.params.id);
  if (!pasta) return res.status(404).json({ error: 'Pasta não encontrada.' });
  const { bloqueios } = conferir(pasta, []);
  if (bloqueios.length) return res.status(422).json({ error: bloqueios.join(' ') });
  const subs = (await subpastasCheias(client, pasta.id)).filter(s => s.alunos.length);
  if (!subs.length) return res.status(422).json({ error: 'Nenhuma subpasta tem inscritos.' });

  const zip = new JSZip();
  const usados = new Set<string>();
  for (const s of subs) {
    let nome = `carteirinhas-${slug(s.subpasta.nome)}.pdf`;
    for (let n = 2; usados.has(nome); n++) nome = `carteirinhas-${slug(s.subpasta.nome)}-${n}.pdf`;
    usados.add(nome);
    zip.file(nome, await gerarPdfCarteirinhas(s.subpasta.id));
  }
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
  for (const s of subs) {
    await registrarEmissao(client, { pasta_id: pasta.id, subpasta_id: s.subpasta.id, documento: 'carteirinhas', escopo: 'pasta', aluno_ids: s.alunos.map(a => a.id), emitido_por: perfil.email });
  }
  res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="carteirinhas-${slug(pasta.nome)}.zip"`, 'Content-Length': String(buffer.length) });
  res.send(buffer);
}));

/* ==================== pelo aluno (RF-CART-11) ==================== */
/** Subpastas em que o aluno está inscrito. */
export async function inscricoesDoAluno(db: Db, alunoId: string): Promise<InscricaoDoAluno[]> {
  const { data, error } = await db.from('carteirinha_inscrito').select('subpasta:carteirinha_subpasta(id, nome, pasta:carteirinha_pasta(id, nome, arquivada))').eq('aluno_id', alunoId);
  if (error) throw error;
  type L = { subpasta: { id: string; nome: string; pasta: { id: string; nome: string; arquivada: boolean } | null } | null };
  return ((data || []) as unknown as L[]).filter(l => l.subpasta?.pasta).map(l => ({
    pasta_id: l.subpasta!.pasta!.id, pasta: l.subpasta!.pasta!.nome, subpasta_id: l.subpasta!.id, subpasta: l.subpasta!.nome, arquivada: l.subpasta!.pasta!.arquivada
  }));
}

/** Avulsa: uma folha com o cartão do aluno, com o evento e a turma da subpasta escolhida. */
export async function carteirinhaAvulsa(db: Db, alunoId: string, subpastaId: string, email: string): Promise<{ pdf: Buffer; nome: string } | { erro: string; status: number }> {
  const dados = await carregarSubpasta(db, subpastaId);
  if (!dados) return { erro: 'Subpasta não encontrada.', status: 404 };
  const aluno = dados.alunos.find(a => a.id === alunoId) || await carregarAluno(db, alunoId);
  if (!aluno) return { erro: 'Aluno não encontrado.', status: 404 };
  const { bloqueios } = conferir(dados.pasta, [aluno]);
  if (bloqueios.length) return { erro: bloqueios.join(' '), status: 422 };
  const pdf = await gerarPdfCarteirinhas(dados.subpasta.id, [aluno.id]);
  await registrarEmissao(db, { pasta_id: dados.pasta.id, subpasta_id: dados.subpasta.id, documento: 'carteirinhas', escopo: 'avulsa', aluno_ids: [aluno.id], emitido_por: email });
  return { pdf, nome: `carteirinha-${slug(aluno.nome, dados.subpasta.nome)}.pdf` };
}
