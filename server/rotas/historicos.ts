// Histórico escolar (F5): assistente, pré-visualização, edição, estados,
// emissão com numeração e snapshot, 2ª via, cancelamento e PDF.
//
// A montagem do documento vive em servicos/historico/montar.ts — aqui só
// entram transporte, autorização e transição de estado. O que congela o
// documento (numeração, snapshot, auditoria) é função no banco, para que
// número e snapshot nasçam na mesma transação (RF-HIST-06/07).
import { Router } from 'express';
import { exigirPapel, ctx, seguro } from '../lib/autorizacao';
import { validar, z, texto, uuid } from '../lib/validacao';
import { getServiceClient } from '../../lib/supabase';
import { montarDocumento, observacoesIniciais } from '../servicos/historico/montar';
import { nomeArquivo, obterPdf } from '../servicos/historico/pdf';
import { gerarCodigo, verificacaoDoDocumento } from '../servicos/historico/verificacao';
import { metaTipo, type Historico, type HistoricoDocumento, type ObservacaoModelo } from '../../shared/types/historico';
import type { ItemValidacao } from '../../shared/types/aluno';
import type { Curso, EtapaEnsino } from '../../shared/types/curriculo';

export const historicosRouter = Router();

// A lista não carrega `snapshot` — é o documento inteiro em jsonb, e
// trazê-lo para 200 linhas deixaria a tela pesada à toa.
const COLUNAS_LISTA = 'id, aluno_id, curso_id, tipo, status, matricula_ids, via, via_de_id, numero_registro, ano_registro, livro, folha, numero_registro_gdae, com_certificado, signatario_diretor_id, signatario_secretario_id, observacoes, pdf_path, codigo_verificacao, criado_por, conferido_por, emitido_por, cancelado_por, motivo_cancelamento, criado_em, atualizado_em, conferido_em, emitido_em, cancelado_em, aluno(id, nome, ra, codigo_activesoft), curso(id, nome, etapa)';

type Cliente = ReturnType<typeof ctx>['client'];

async function carregarHistorico(client: Cliente, id: string): Promise<Historico | null> {
  const { data, error } = await client.from('historico').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as Historico) || null;
}

async function carregarSignatarios(client: Cliente) {
  const { data, error } = await client.from('instituicao_signatario').select('id, nome, cargo, cargo_impresso, ativo, ordem').order('ordem');
  if (error) throw error;
  return (data || []).filter(s => s.ativo).map(s => ({ id: s.id, nome: s.nome, cargo: s.cargo, cargo_impresso: s.cargo_impresso }));
}

async function carregarModelos(client: Cliente): Promise<ObservacaoModelo[]> {
  const { data, error } = await client.from('observacao_modelo').select('*').eq('ativo', true).order('ordem');
  if (error) throw error;
  return (data || []) as ObservacaoModelo[];
}

/* ==================== lista (RF-HIST-12) ==================== */
historicosRouter.get('/', exigirPapel(), seguro(async (req, res) => {
  const { client } = ctx(res);
  let q = client.from('historico').select(COLUNAS_LISTA).order('criado_em', { ascending: false }).limit(200);
  if (req.query.aluno_id) q = q.eq('aluno_id', String(req.query.aluno_id));
  if (req.query.status) q = q.eq('status', String(req.query.status));
  if (req.query.tipo) q = q.eq('tipo', String(req.query.tipo));
  if (req.query.ano) q = q.eq('ano_registro', Number(req.query.ano));
  const { data, error } = await q;
  if (error) throw error;

  const termo = String(req.query.q || '').trim().toLowerCase();
  type Linha = Historico & { aluno: { nome: string; ra: string | null; codigo_activesoft: string | null } | null };
  const linhas = ((data || []) as unknown as Linha[]).filter(h => !termo
    || (h.aluno?.nome || '').toLowerCase().includes(termo)
    || (h.aluno?.ra || '').toLowerCase().includes(termo)
    || (h.aluno?.codigo_activesoft || '').toLowerCase().includes(termo)
    || String(h.numero_registro ?? '').includes(termo));
  res.json(linhas);
}));

/* ==================== textos-padrão de observação (RF-HIST-04) ==================== */
historicosRouter.get('/observacoes/modelos', exigirPapel(), seguro(async (_req, res) => {
  const { client } = ctx(res);
  const { data, error } = await client.from('observacao_modelo').select('*').order('ordem');
  if (error) throw error;
  res.json(data);
}));

const modeloSchema = z.object({
  titulo: z.string().trim().min(1, 'Obrigatório'),
  texto: z.string().trim().min(5, 'Escreva o texto-padrão'),
  base_legal: texto,
  etapa: z.preprocess(v => (v === '' ? null : v), z.enum(['ei', 'ef_iniciais', 'ef_finais', 'em']).nullable().optional()),
  ativo: z.boolean().optional(),
  ordem: z.preprocess(v => (v === '' || v == null ? null : Number(v)), z.number().int().nullable().optional())
});

historicosRouter.post('/observacoes/modelos', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const body = validar(modeloSchema, req, res);
  if (!body) return;
  const { client } = ctx(res);
  const { data, error } = await client.from('observacao_modelo').insert(body).select().single();
  if (error) throw error;
  res.status(201).json(data);
}));

historicosRouter.put('/observacoes/modelos/:id', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const body = validar(modeloSchema.partial(), req, res);
  if (!body) return;
  const { client } = ctx(res);
  const { data, error } = await client.from('observacao_modelo').update(body).eq('id', req.params.id).select().single();
  if (error) throw error;
  res.json(data);
}));

historicosRouter.delete('/observacoes/modelos/:id', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const { client } = ctx(res);
  const { error } = await client.from('observacao_modelo').delete().eq('id', req.params.id);
  if (error) throw error;
  res.json({ success: true });
}));

/* ==================== assistente: o que dá para gerar ==================== */
historicosRouter.get('/preparar/:alunoId', exigirPapel(), seguro(async (req, res) => {
  const { client } = ctx(res);
  const { data: aluno, error: eAluno } = await client.from('aluno').select('id, nome, ra').eq('id', req.params.alunoId).maybeSingle();
  if (eAluno) throw eAluno;
  if (!aluno) return res.status(404).json({ error: 'Aluno não encontrado.' });

  const { data: mats, error: eMats } = await client.from('matricula')
    .select('id, serie_id, curso_id, versao_curricular_id, situacao_final, estabelecimento_externo_id, ano_letivo(ano), serie(nome), curso(nome, etapa), estabelecimento:estabelecimento_externo(nome), nota(id)')
    .eq('aluno_id', aluno.id);
  if (eMats) throw eMats;

  type Linha = {
    id: string; serie_id: string; curso_id: string; versao_curricular_id: string | null; situacao_final: string;
    estabelecimento_externo_id: string | null; ano_letivo: { ano: number } | null; serie: { nome: string } | null;
    curso: { nome: string; etapa: EtapaEnsino } | null; estabelecimento: { nome: string } | null; nota: { id: string }[];
  };
  const linhas = (mats || []) as unknown as Linha[];

  // total de itens da grade por (versão, série) — mesma contagem da ficha
  const chaves = [...new Set(linhas.filter(m => m.versao_curricular_id).map(m => `${m.versao_curricular_id}|${m.serie_id}`))];
  const totais = new Map<string, number>();
  for (const ch of chaves) {
    const [vid, sid] = ch.split('|');
    const { count } = await client.from('versao_item')
      .select('id, versao_agrupamento!inner(versao_bloco!inner(versao_id))', { count: 'exact', head: true })
      .eq('serie_id', sid).eq('versao_agrupamento.versao_bloco.versao_id', vid);
    totais.set(ch, count || 0);
  }

  const matriculas = linhas.map(m => ({
    id: m.id,
    ano: m.ano_letivo?.ano || 0,
    serie: m.serie?.nome || '',
    serie_id: m.serie_id,
    curso_id: m.curso_id,
    curso: m.curso?.nome || '',
    etapa: (m.curso?.etapa || 'em') as EtapaEnsino,
    externa: !!m.estabelecimento_externo_id,
    estabelecimento: m.estabelecimento?.nome || null,
    situacao_final: m.situacao_final,
    sem_curriculo: !m.versao_curricular_id && !m.estabelecimento_externo_id,
    total_itens: totais.get(`${m.versao_curricular_id}|${m.serie_id}`) || 0,
    total_notas: (m.nota || []).length
  })).sort((a, b) => a.ano - b.ano);

  const validacao: ItemValidacao[] = [];
  if (!matriculas.length) validacao.push({ nivel: 'bloqueia', codigo: 'trajetoria.vazia', mensagem: 'Nenhum ano letivo na trajetória deste aluno.', aba: 'trajetoria' });

  const [signatarios, modelos, historicos] = await Promise.all([
    carregarSignatarios(client),
    carregarModelos(client),
    client.from('historico').select(COLUNAS_LISTA).eq('aluno_id', aluno.id).order('criado_em', { ascending: false })
  ]);
  if (historicos.error) throw historicos.error;

  res.json({ aluno, matriculas, validacao, signatarios, modelos_observacao: modelos, historicos: historicos.data });
}));

/* ==================== criar rascunho ==================== */
const criarSchema = z.object({
  aluno_id: uuid,
  tipo: z.enum(['transferencia', 'conclusao_ef', 'conclusao_em', 'parcial', 'declaracao']),
  matricula_ids: z.array(uuid).min(1, 'Selecione ao menos um ano letivo'),
  curso_id: z.preprocess(v => (v === '' ? null : v), uuid.nullable().optional()),
  observacoes: texto,
  signatario_diretor_id: z.preprocess(v => (v === '' ? null : v), uuid.nullable().optional()),
  signatario_secretario_id: z.preprocess(v => (v === '' ? null : v), uuid.nullable().optional()),
  numero_registro_gdae: texto,
  livro: texto,
  folha: texto
});

historicosRouter.post('/', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const body = validar(criarSchema, req, res);
  if (!body) return;
  const { client, perfil } = ctx(res);

  const { data: mats, error: eMats } = await client.from('matricula')
    .select('id, aluno_id, curso_id, ano_letivo(ano)').in('id', body.matricula_ids);
  if (eMats) throw eMats;
  const linhas = (mats || []) as unknown as { id: string; aluno_id: string; curso_id: string; ano_letivo: { ano: number } | null }[];
  if (linhas.length !== body.matricula_ids.length) return res.status(422).json({ error: 'Algum ano selecionado não existe na trajetória.' });
  if (linhas.some(m => m.aluno_id !== body.aluno_id)) return res.status(422).json({ error: 'Os anos selecionados são de outro aluno.' });

  // o curso do documento é o do ano mais recente selecionado — é ele que
  // nomeia a faixa de título ("HISTÓRICO ESCOLAR - <curso>")
  const maisRecente = [...linhas].sort((a, b) => (a.ano_letivo?.ano || 0) - (b.ano_letivo?.ano || 0)).pop()!;
  const cursoId = body.curso_id || maisRecente.curso_id;

  const { data: curso, error: eCurso } = await client.from('curso').select('*').eq('id', cursoId).single();
  if (eCurso) throw eCurso;

  const meta = metaTipo(body.tipo);
  const { data, error } = await client.from('historico').insert({
    aluno_id: body.aluno_id,
    curso_id: cursoId,
    tipo: body.tipo,
    matricula_ids: body.matricula_ids,
    com_certificado: meta.certificado,
    observacoes: body.observacoes ?? observacoesIniciais(curso as Curso, body.tipo),
    signatario_diretor_id: body.signatario_diretor_id ?? null,
    signatario_secretario_id: body.signatario_secretario_id ?? null,
    numero_registro_gdae: body.numero_registro_gdae ?? null,
    livro: body.livro ?? null,
    folha: body.folha ?? null,
    // o código nasce com o rascunho, não na emissão: assim o QR já
    // aparece na pré-visualização e o que se confere na tela é o que
    // vai no papel (RNF-04)
    codigo_verificacao: gerarCodigo(),
    criado_por: perfil.email
  }).select().single();
  if (error) throw error;

  await getServiceClient().from('auditoria').insert({
    entidade: 'historico', entidade_id: data.id, aluno_id: body.aluno_id, acao: 'criar',
    valor_novo: { tipo: body.tipo, anos: linhas.map(m => m.ano_letivo?.ano).filter(Boolean) }, usuario_email: perfil.email
  });
  res.status(201).json(data);
}));

/* ==================== detalhe (pré-visualização) ==================== */
async function montarResposta(client: Cliente, h: Historico) {
  const congelado = (h.status === 'emitido' || h.status === 'cancelado') && h.snapshot;
  const montado = congelado ? null : await montarDocumento(client, h);
  // Documento emitido renderiza o snapshot, nunca recalcula (RF-HIST-06).
  // O status vem da linha, não do snapshot: cancelar não reescreve o
  // documento congelado, mas a folha tem de sair com a marca de cancelado.
  const base = congelado
    ? { ...(h.snapshot as unknown as HistoricoDocumento), status: h.status, via: h.via }
    : montado!.documento;
  // O QR não faz parte do snapshot: ele identifica a via impressa, e a
  // 2ª via herda o snapshot da 1ª com um código só dela. Por isso entra
  // aqui, na leitura, a partir da linha (RF-HIST-14).
  const documento: HistoricoDocumento = { ...base, verificacao: verificacaoDoDocumento(h.codigo_verificacao) };

  const [{ data: aluno }, { data: curso }, signatarios, modelos, todasMats, vias] = await Promise.all([
    client.from('aluno').select('id, nome, ra').eq('id', h.aluno_id).single(),
    client.from('curso').select('id, nome, etapa').eq('id', h.curso_id).single(),
    carregarSignatarios(client),
    carregarModelos(client),
    client.from('matricula').select('id, estabelecimento_externo_id, ano_letivo(ano), serie(nome), curso(nome)').eq('aluno_id', h.aluno_id),
    client.from('historico').select('id, via, emitido_em, status').or(`id.eq.${h.via_de_id || h.id},via_de_id.eq.${h.via_de_id || h.id}`).order('via')
  ]);
  if (todasMats.error) throw todasMats.error;

  type Mat = { id: string; estabelecimento_externo_id: string | null; ano_letivo: { ano: number } | null; serie: { nome: string } | null; curso: { nome: string } | null };
  const matriculas_disponiveis = ((todasMats.data || []) as unknown as Mat[])
    .map(m => ({
      id: m.id, ano: m.ano_letivo?.ano || 0, serie: m.serie?.nome || '', curso: m.curso?.nome || '',
      externa: !!m.estabelecimento_externo_id, selecionada: h.matricula_ids.includes(m.id)
    }))
    .sort((a, b) => a.ano - b.ano);

  return {
    historico: h,
    documento,
    validacao: montado ? montado.validacao : [],
    aluno, curso, signatarios,
    modelos_observacao: modelos,
    matriculas_disponiveis,
    vias: vias.data || []
  };
}

historicosRouter.get('/:id', exigirPapel(), seguro(async (req, res) => {
  const { client } = ctx(res);
  const h = await carregarHistorico(client, req.params.id);
  if (!h) return res.status(404).json({ error: 'Histórico não encontrado.' });
  res.json(await montarResposta(client, h));
}));

/* ==================== edição do rascunho (RF-HIST-03) ==================== */
const editarSchema = z.object({
  tipo: z.enum(['transferencia', 'conclusao_ef', 'conclusao_em', 'parcial', 'declaracao']).optional(),
  curso_id: uuid.optional(),
  matricula_ids: z.array(uuid).min(1, 'Selecione ao menos um ano letivo').optional(),
  observacoes: texto,
  signatario_diretor_id: z.preprocess(v => (v === '' ? null : v), uuid.nullable().optional()),
  signatario_secretario_id: z.preprocess(v => (v === '' ? null : v), uuid.nullable().optional()),
  numero_registro_gdae: texto,
  livro: texto,
  folha: texto
});

historicosRouter.put('/:id', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const body = validar(editarSchema, req, res);
  if (!body) return;
  const { client, perfil } = ctx(res);
  const h = await carregarHistorico(client, req.params.id);
  if (!h) return res.status(404).json({ error: 'Histórico não encontrado.' });
  if (h.status === 'emitido' || h.status === 'cancelado') {
    return res.status(422).json({ error: 'Documento emitido é somente leitura. Gere uma 2ª via ou cancele o documento.' });
  }

  // só o que veio no corpo entra: um PUT parcial não pode apagar campo
  // que o cliente nem mandou (null é apagar de propósito; undefined não)
  const payload: Record<string, unknown> = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  // trocar o tipo troca a presença do bloco de certificado (RF-HIST-16)
  if (body.tipo) payload.com_certificado = metaTipo(body.tipo).certificado;

  const mudancas = Object.entries(payload).filter(([c, v]) => JSON.stringify((h as unknown as Record<string, unknown>)[c] ?? null) !== JSON.stringify(v ?? null));
  if (!mudancas.length) return res.json(await montarResposta(client, h));

  const { data, error } = await client.from('historico').update(Object.fromEntries(mudancas)).eq('id', h.id).select().single();
  if (error) throw error;
  await getServiceClient().from('auditoria').insert(mudancas.map(([c, v]) => ({
    entidade: 'historico', entidade_id: h.id, aluno_id: h.aluno_id, acao: 'editar' as const, campo: c,
    valor_anterior: { [c]: (h as unknown as Record<string, unknown>)[c] ?? null }, valor_novo: { [c]: v ?? null },
    motivo: (req.body.motivo as string) || null, usuario_email: perfil.email
  })));
  res.json(await montarResposta(client, data as Historico));
}));

/* ==================== estados (RF-HIST-05) ==================== */
historicosRouter.post('/:id/conferir', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const { client, perfil } = ctx(res);
  const h = await carregarHistorico(client, req.params.id);
  if (!h) return res.status(404).json({ error: 'Histórico não encontrado.' });
  if (h.status !== 'rascunho') return res.status(422).json({ error: 'Só um rascunho pode ser marcado como conferido.' });

  const { validacao } = await montarDocumento(client, h);
  const bloqueios = validacao.filter(v => v.nivel === 'bloqueia');
  if (bloqueios.length) return res.status(422).json({ error: 'Resolva as pendências antes de conferir.', campos: bloqueios.map(b => ({ campo: b.codigo, mensagem: b.mensagem })) });

  const { data, error } = await client.from('historico')
    .update({ status: 'conferido', conferido_por: perfil.email, conferido_em: new Date().toISOString() })
    .eq('id', h.id).select().single();
  if (error) throw error;
  res.json(await montarResposta(client, data as Historico));
}));

historicosRouter.post('/:id/reabrir', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const { client } = ctx(res);
  const h = await carregarHistorico(client, req.params.id);
  if (!h) return res.status(404).json({ error: 'Histórico não encontrado.' });
  if (h.status !== 'conferido') return res.status(422).json({ error: 'Só um documento conferido volta a rascunho.' });
  const { data, error } = await client.from('historico').update({ status: 'rascunho', conferido_por: null, conferido_em: null }).eq('id', h.id).select().single();
  if (error) throw error;
  res.json(await montarResposta(client, data as Historico));
}));

/* ==================== emissão (RF-HIST-06/07) ==================== */
historicosRouter.post('/:id/emitir', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const { client, perfil } = ctx(res);
  const h = await carregarHistorico(client, req.params.id);
  if (!h) return res.status(404).json({ error: 'Histórico não encontrado.' });
  if (h.status === 'emitido') return res.status(422).json({ error: 'Este histórico já foi emitido.' });
  if (h.status === 'cancelado') return res.status(422).json({ error: 'Este histórico está cancelado.' });

  // Documento criado antes da migration 008 não tem código. Atribui-se
  // aqui, enquanto ainda é rascunho, para que nasça emitido já
  // verificável — depois de congelado só o backfill explícito resolve.
  if (!h.codigo_verificacao) {
    const { data: comCodigo, error: eCodigo } = await client.from('historico')
      .update({ codigo_verificacao: gerarCodigo() }).eq('id', h.id).select().single();
    if (eCodigo) throw eCodigo;
    h.codigo_verificacao = (comCodigo as Historico).codigo_verificacao;
  }

  const { documento, validacao } = await montarDocumento(client, h);
  const bloqueios = validacao.filter(v => v.nivel === 'bloqueia');
  if (bloqueios.length) {
    return res.status(422).json({ error: 'O documento ainda tem pendências que bloqueiam a emissão.', campos: bloqueios.map(b => ({ campo: b.codigo, mensagem: b.mensagem })) });
  }

  // o snapshot guarda o documento já com o status final, para a 2ª via
  // renderizar exatamente o que foi emitido
  const snapshot: HistoricoDocumento = { ...documento, status: 'emitido', gerado_em: new Date().toISOString() };
  const { data, error } = await client.rpc('emitir_historico', { p_id: h.id, p_snapshot: snapshot, p_usuario: perfil.email });
  if (error) throw error;

  // Gera e guarda o PDF já na emissão, para o "Baixar PDF" ser imediato.
  // Falha aqui não desfaz a emissão — o documento já está congelado e a
  // rota de download regenera sob demanda.
  const emitido = data as Historico;
  try { await obterPdf(client, emitido); } catch (err) { console.error('PDF do histórico', emitido.id, (err as Error).message); }

  res.json(await montarResposta(client, (await carregarHistorico(client, emitido.id)) || emitido));
}));

historicosRouter.post('/:id/cancelar', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const body = validar(z.object({ motivo: z.string().trim().min(5, 'Informe o motivo (ao menos 5 caracteres).') }), req, res);
  if (!body) return;
  const { client, perfil } = ctx(res);
  const { data, error } = await client.rpc('cancelar_historico', { p_id: req.params.id, p_motivo: body.motivo, p_usuario: perfil.email });
  if (error) throw error;
  res.json(await montarResposta(client, data as Historico));
}));

historicosRouter.post('/:id/segunda-via', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const { client, perfil } = ctx(res);
  const { data, error } = await client.rpc('criar_segunda_via', { p_id: req.params.id, p_usuario: perfil.email });
  if (error) throw error;

  // A 2ª via é outro papel: herda o snapshot da 1ª, mas precisa do
  // código dela. `criar_segunda_via` não copia o campo (a unicidade do
  // índice impediria), então ele é atribuído aqui.
  const nova = data as Historico;
  const { data: comCodigo, error: eCodigo } = await client.from('historico')
    .update({ codigo_verificacao: gerarCodigo() }).eq('id', nova.id).select().single();
  if (eCodigo) throw eCodigo;

  res.status(201).json(await montarResposta(client, comCodigo as Historico));
}));

/**
 * Backfill para documento emitido antes da migration 008 (RF-HIST-14).
 * Não reemite nem toca no snapshot — só dá um código a quem não tem,
 * para que uma 2ª via impressa de agora em diante saia verificável. O
 * papel já entregue continua sem QR, e não há o que fazer quanto a isso.
 */
historicosRouter.post('/:id/codigo-verificacao', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const { client } = ctx(res);
  const h = await carregarHistorico(client, req.params.id);
  if (!h) return res.status(404).json({ error: 'Histórico não encontrado.' });
  if (h.codigo_verificacao) return res.status(422).json({ error: 'Este documento já tem código de verificação.' });

  const { data, error } = await client.from('historico')
    .update({ codigo_verificacao: gerarCodigo() }).eq('id', h.id).select().single();
  if (error) throw error;
  res.json(await montarResposta(client, data as Historico));
}));

/* ==================== PDF (RF-HIST-08) ==================== */
historicosRouter.get('/:id/pdf', exigirPapel(), seguro(async (req, res) => {
  const { client } = ctx(res);
  const h = await carregarHistorico(client, req.params.id);
  if (!h) return res.status(404).json({ error: 'Histórico não encontrado.' });
  const { data: aluno } = await client.from('aluno').select('nome').eq('id', h.aluno_id).single();
  const pdf = await obterPdf(client, h);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${nomeArquivo(h, aluno?.nome || 'aluno')}"`,
    'Content-Length': String(pdf.length)
  });
  res.send(pdf);
}));

/* ==================== auditoria do documento (RF-HIST-11) ==================== */
historicosRouter.get('/:id/auditoria', exigirPapel(), seguro(async (req, res) => {
  const { client } = ctx(res);
  const { data, error } = await client.from('auditoria').select('*')
    .eq('entidade', 'historico').eq('entidade_id', req.params.id)
    .order('criado_em', { ascending: false });
  if (error) throw error;
  res.json(data);
}));
