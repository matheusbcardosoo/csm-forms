// Importações (F3): executar (simulação | efetiva), relatório, divergências
// e mapeamento de códigos. Escrita em importacao/divergência é feita com o
// service_role (02-arquitetura §3.7) depois de exigirPapel().
import { Router } from 'express';
import { exigirPapel, ctx, seguro } from '../lib/autorizacao';
import { validar, z, texto, uuid } from '../lib/validacao';
import { getServiceClient } from '../../lib/supabase';
import { adaptadorPadrao, criarAdaptador, COLUNAS_MODELO, type NomeAdaptador } from '../adapters/activesoft';
import { rodar } from '../servicos/agendador';
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
  let q = client.from('mapeamento_activesoft').select('*, versao:versao_curricular(id, nome, curso_id), componente:componente(id, nome_canonico, sigla), item:versao_item!mapeamento_activesoft_versao_item_id_fkey(id, nome_impresso, serie_id), sugestao:versao_item!mapeamento_activesoft_sugestao_item_id_fkey(id, nome_impresso, serie_id)').order('confirmado').order('tipo').order('codigo_origem');
  // filtrar por currículo não pode esconder os mapeamentos globais: eles
  // valem ali também, e some-los faria a tela dizer "pendente" para um
  // código que a importação resolve sem perguntar nada
  if (req.query.versao) q = q.or(`versao_id.eq.${String(req.query.versao)},versao_id.is.null`);
  if (req.query.pendentes === '1') q = q.eq('confirmado', false);
  const { data, error } = await q;
  if (error) throw error;
  res.json(data);
}));

/**
 * Aceita de uma vez todos os mapeamentos pendentes que já têm sugestão
 * (RF-INT-08). Sem isso, a primeira importação de um colégio de verdade
 * obriga a secretaria a escolher dezenas de destinos num a um, sem que o
 * sistema tenha dúvida nenhuma sobre nenhum deles.
 */
importacoesRouter.post('/mapeamentos/aceitar-sugestoes', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const { client, perfil } = ctx(res);
  let q = client.from('mapeamento_activesoft').select('id, tipo, codigo_origem, versao_id, destino_valor, sugestao_item_id, sugestao:versao_item!mapeamento_activesoft_sugestao_item_id_fkey(componente_id)').eq('confirmado', false);
  if (req.query.versao) q = q.eq('versao_id', String(req.query.versao));
  const { data, error } = await q;
  if (error) throw error;

  const OBS = `Sugestão aceita em lote por ${perfil.email}. Troque aqui se não for isso.`;
  const OBS_GLOBAL = `Sugestão aceita em lote por ${perfil.email}, por componente: vale para todos os cursos e currículos. Troque aqui, ou crie uma exceção num currículo específico.`;
  let aceitos = 0;
  let globais = 0;
  for (const m of data || []) {
    // disciplina resolve pelo item sugerido; série/situação pelo destino
    // que a importação já tinha deixado preenchido como sugestão
    if (m.tipo !== 'disciplina') {
      if (!m.destino_valor) continue;
      const { error: e } = await client.from('mapeamento_activesoft').update({ confirmado: true, observacao: OBS }).eq('id', m.id);
      if (e) throw e;
      aceitos++;
      continue;
    }
    if (!m.sugestao_item_id) continue;
    // O item sugerido tem componente? Então o mapeamento vira global e
    // poupa remapear o mesmo código nos outros cursos. Se já existir um
    // global para o código, o índice único recusa e fica só na versão.
    // o PostgREST devolve o embed como objeto ou como array de um, conforme a cardinalidade que ele infere
    const sug = m.sugestao as unknown as { componente_id: string | null } | { componente_id: string | null }[] | null;
    const componenteId = (Array.isArray(sug) ? sug[0] : sug)?.componente_id || null;
    if (componenteId) {
      const { error: eG } = await client.from('mapeamento_activesoft')
        .update({ versao_id: null, componente_id: componenteId, versao_item_id: null, confirmado: true, observacao: OBS_GLOBAL })
        .eq('id', m.id);
      if (!eG) { aceitos++; globais++; continue; }
      if ((eG as { code?: string }).code !== '23505') throw eG;
    }
    const { error: e } = await client.from('mapeamento_activesoft').update({ versao_item_id: m.sugestao_item_id, confirmado: true, observacao: OBS }).eq('id', m.id);
    if (e) throw e;
    aceitos++;
  }
  res.json({ aceitos, globais, restantes: (data || []).length - aceitos });
}));

const mapSchema = z.object({
  versao_item_id: z.preprocess(v => (v === '' ? null : v), uuid.nullable().optional()),
  componente_id: z.preprocess(v => (v === '' ? null : v), uuid.nullable().optional()),
  destino_valor: texto,
  confirmado: z.boolean().optional(),
  observacao: texto
});

importacoesRouter.put('/mapeamentos/:id', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const body = validar(mapSchema.extend({ versao_id: z.preprocess(v => (v === '' ? null : v), uuid.nullable().optional()) }), req, res);
  if (!body) return;
  const { client } = ctx(res);
  // Escolher um componente torna o mapeamento global; escolher um item da
  // grade o prende àquele currículo. São destinos mutuamente exclusivos, e
  // deixar os dois gravados faria a precedência depender de qual coluna a
  // tela mandou por último.
  const patch = body.componente_id
    ? { ...body, versao_id: null, versao_item_id: null }
    : body.versao_item_id ? { ...body, componente_id: null } : body;
  const { data, error } = await client.from('mapeamento_activesoft').update(patch).eq('id', req.params.id).select().single();
  // já existe um global para o mesmo código: dizer isso, e não "já existe
  // um registro com esses dados" — a saída aqui é apagar esta linha ou
  // trocar o destino do global, e a mensagem genérica não sugere nenhuma
  if (error && (error as { code?: string }).code === '23505' && body.componente_id) {
    return void res.status(409).json({ error: 'Este código já tem um destino global, definido em outra linha. Ajuste o destino lá, ou deixe esta linha como exceção apontando para um item da grade.' });
  }
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

/* ---------- agendamento (RF-INT-10) ---------- */
// Fica antes de '/:id' porque '/agendamento' seria lido como um id.
importacoesRouter.get('/agendamento', exigirPapel(), seguro(async (_req, res) => {
  const { client } = ctx(res);
  const { data, error } = await client.from('importacao_agendamento').select('*').maybeSingle();
  if (error) throw error;
  res.json(data);
}));

const agendamentoSchema = z.object({
  ativo: z.boolean(),
  hora: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'Horário no formato HH:MM.'),
  dias_semana: z.array(z.number().int().min(0).max(6)).min(1, 'Escolha ao menos um dia da semana.'),
  tipo: z.enum(['alunos', 'matriculas', 'notas', 'completo'])
});

importacoesRouter.put('/agendamento', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const body = validar(agendamentoSchema, req, res);
  if (!body) return;
  const { client, perfil } = ctx(res);
  const { data: atual, error: eAtual } = await client.from('importacao_agendamento').select('id').maybeSingle();
  if (eAtual) throw eAtual;
  if (!atual) return res.status(500).json({ error: 'Agendamento não inicializado — a migration 009 já foi aplicada?' });

  const { data, error } = await client.from('importacao_agendamento')
    .update({ ...body, atualizado_por: perfil.email }).eq('id', atual.id).select().single();
  if (error) throw error;
  res.json(data);
}));

/**
 * Roda agora o que o agendamento rodaria de madrugada. Existe para a
 * secretaria conferir que a configuração funciona sem esperar até as
 * três da manhã para descobrir que a origem estava fora do ar.
 */
importacoesRouter.post('/agendamento/executar', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const body = validar(z.object({ anoLetivo: z.coerce.number().int().min(1900).max(2200) }), req, res);
  if (!body) return;
  const { client, perfil } = ctx(res);
  const { data: cfg, error } = await client.from('importacao_agendamento').select('*').maybeSingle();
  if (error) throw error;
  if (!cfg) return res.status(500).json({ error: 'Agendamento não inicializado.' });

  const resultado = await rodar((cfg as { tipo: 'alunos' | 'matriculas' | 'notas' | 'completo' }).tipo, body.anoLetivo, perfil.email);
  res.json(resultado);
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
