// Importações (F3): executar (simulação | efetiva), relatório, divergências
// e mapeamento de códigos. Escrita em importacao/divergência é feita com o
// service_role (02-arquitetura §3.7) depois de exigirPapel().
import { Router } from 'express';
import { exigirPapel, ctx, seguro } from '../lib/autorizacao';
import { validar, z, texto, uuid } from '../lib/validacao';
import { getServiceClient } from '../../lib/supabase';
import { adaptadorPadrao, criarAdaptador, COLUNAS_MODELO, type NomeAdaptador } from '../adapters/activesoft';
import { executarImportacao } from '../servicos/importacao';

export const importacoesRouter = Router();

const ROTULO_ADAPTADOR: Record<NomeAdaptador, string> = { activesoft: 'API Activesoft', arquivo: 'Arquivo CSV', mock: 'Mock (dados de exemplo)' };

importacoesRouter.get('/adaptador', exigirPapel('admin', 'secretaria'), seguro(async (_req, res) => {
  const nome = adaptadorPadrao();
  const ad = criarAdaptador(nome);
  const conexao = await ad.testarConexao();
  res.json({ nome, rotulo: ROTULO_ADAPTADOR[nome], capacidades: ad.capacidades(), conexao, aceitaArquivo: true, colunasModelo: COLUNAS_MODELO });
}));

importacoesRouter.get('/csv-modelo/:tipo', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const tipo = req.params.tipo as keyof typeof COLUNAS_MODELO;
  const colunas = COLUNAS_MODELO[tipo];
  if (!colunas) return res.status(404).json({ error: 'Tipo inválido.' });
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="modelo-${tipo}.csv"` });
  res.send('﻿' + colunas.join(';') + '\n');
}));

importacoesRouter.get('/', exigirPapel('admin', 'secretaria'), seguro(async (_req, res) => {
  const { client } = ctx(res);
  const { data, error } = await client.from('importacao').select('*').order('iniciado_em', { ascending: false }).limit(60);
  if (error) throw error;
  res.json(data);
}));

/* ---------- mapeamentos (antes de /:id para não colidir) ---------- */
importacoesRouter.get('/mapeamentos', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const { client } = ctx(res);
  let q = client.from('mapeamento_activesoft').select('*, versao:versao_curricular(id, nome, curso_id), item:versao_item!mapeamento_activesoft_versao_item_id_fkey(id, nome_impresso, serie_id), sugestao:versao_item!mapeamento_activesoft_sugestao_item_id_fkey(id, nome_impresso, serie_id)').order('confirmado').order('tipo').order('codigo_origem');
  if (req.query.versao) q = q.eq('versao_id', String(req.query.versao));
  if (req.query.pendentes === '1') q = q.eq('confirmado', false);
  const { data, error } = await q;
  if (error) throw error;
  res.json(data);
}));

const mapSchema = z.object({
  versao_item_id: z.preprocess(v => (v === '' ? null : v), uuid.nullable().optional()),
  destino_valor: texto,
  confirmado: z.boolean().optional(),
  observacao: texto
});

importacoesRouter.put('/mapeamentos/:id', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const body = validar(mapSchema, req, res);
  if (!body) return;
  const { client } = ctx(res);
  const { data, error } = await client.from('mapeamento_activesoft').update(body).eq('id', req.params.id).select().single();
  if (error) throw error;
  res.json(data);
}));

importacoesRouter.post('/mapeamentos', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const body = validar(mapSchema.extend({
    tipo: z.enum(['disciplina', 'serie', 'turma', 'situacao']),
    codigo_origem: z.string().trim().min(1),
    versao_id: z.preprocess(v => (v === '' ? null : v), uuid.nullable().optional()),
    descricao_origem: texto
  }), req, res);
  if (!body) return;
  const { client } = ctx(res);
  const { data, error } = await client.from('mapeamento_activesoft').insert({ ...body, confirmado: body.confirmado ?? true }).select().single();
  if (error) throw error;
  res.status(201).json(data);
}));

/* ---------- executar ---------- */
const execSchema = z.object({
  adaptador: z.enum(['activesoft', 'arquivo', 'mock']).optional(),
  tipo: z.enum(['alunos', 'matriculas', 'notas', 'completo']),
  modo: z.enum(['simulacao', 'efetiva']),
  anoLetivo: z.coerce.number().int().min(1900).max(2200),
  serieCodigoOrigem: texto,
  turma: texto,
  alunoCodigoOrigem: texto,
  arquivos: z.object({ alunos: z.string().optional(), matriculas: z.string().optional(), notas: z.string().optional() }).optional()
});

importacoesRouter.post('/', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const body = validar(execSchema, req, res);
  if (!body) return;
  const { perfil } = ctx(res);
  const nome: NomeAdaptador = body.arquivos && (body.arquivos.alunos || body.arquivos.matriculas || body.arquivos.notas) ? 'arquivo' : (body.adaptador || adaptadorPadrao());
  const ad = criarAdaptador(nome, body.arquivos);
  const conexao = await ad.testarConexao();
  if (!conexao.ok) return res.status(503).json({ error: conexao.detalhe || 'Origem indisponível.' });

  const db = getServiceClient();
  try {
    const r = await executarImportacao(db, ad, {
      filtro: { anoLetivo: body.anoLetivo, serieCodigoOrigem: body.serieCodigoOrigem || undefined, turma: body.turma || undefined, alunoCodigoOrigem: body.alunoCodigoOrigem || undefined },
      tipo: body.tipo, modo: body.modo, usuario: perfil.email
    });
    res.status(201).json(r);
  } catch (err) {
    res.status(422).json({ error: (err as Error).message });
  }
}));

importacoesRouter.get('/:id', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const { client } = ctx(res);
  const [imp, div, pend] = await Promise.all([
    client.from('importacao').select('*').eq('id', req.params.id).maybeSingle(),
    client.from('importacao_divergencia').select('*').eq('importacao_id', req.params.id).order('resolucao').order('descricao'),
    client.from('mapeamento_activesoft').select('*, versao:versao_curricular(id, nome), sugestao:versao_item!mapeamento_activesoft_sugestao_item_id_fkey(id, nome_impresso)').eq('confirmado', false).order('tipo').order('codigo_origem')
  ]);
  if (imp.error) throw imp.error;
  if (!imp.data) return res.status(404).json({ error: 'Importação não encontrada.' });
  if (div.error) throw div.error;
  if (pend.error) throw pend.error;
  res.json({ importacao: imp.data, divergencias: div.data, pendencias: pend.data });
}));

importacoesRouter.post('/divergencias/:id/resolver', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const body = validar(z.object({ resolucao: z.enum(['manter_local', 'aceitar_origem', 'ignorada']) }), req, res);
  if (!body) return;
  const { client, perfil } = ctx(res);
  const { error } = await client.rpc('resolver_divergencia', { p_id: req.params.id, p_resolucao: body.resolucao, p_usuario: perfil.email });
  if (error) throw error;
  res.json({ success: true });
}));

importacoesRouter.post('/divergencias/resolver-lote', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const body = validar(z.object({ ids: z.array(uuid).min(1), resolucao: z.enum(['manter_local', 'aceitar_origem', 'ignorada']) }), req, res);
  if (!body) return;
  const { client, perfil } = ctx(res);
  let ok = 0; const falhas: string[] = [];
  for (const id of body.ids) {
    const { error } = await client.rpc('resolver_divergencia', { p_id: id, p_resolucao: body.resolucao, p_usuario: perfil.email });
    if (error) falhas.push(error.message); else ok++;
  }
  res.json({ resolvidas: ok, falhas });
}));
