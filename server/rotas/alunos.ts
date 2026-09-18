// Alunos e notas (F4): lista, ficha, edição auditada, trajetória (inclusive
// anos em outra escola), grade de notas por matrícula e validação RF-ALU-08.
import { Router } from 'express';
import { exigirPapel, ctx, seguro } from '../lib/autorizacao';
import { validar, z, texto, textoObrigatorio, dataIso, inteiro, numero, uuid } from '../lib/validacao';
import { getServiceClient } from '../../lib/supabase';
import { CAMPOS_OBRIGATORIOS_HISTORICO, type Aluno, type ItemValidacao, type MatriculaDetalhe } from '../../shared/types/aluno';

export const alunosRouter = Router();

const TAMANHO_PAGINA = 50;

/* ---------- lista ---------- */
alunosRouter.get('/', exigirPapel(), seguro(async (req, res) => {
  const { client } = ctx(res);
  const q = String(req.query.q || '').trim();
  const ano = req.query.ano ? Number(req.query.ano) : null;
  const serie = req.query.serie ? String(req.query.serie) : null;
  const turma = req.query.turma ? String(req.query.turma).trim() : null;
  const situacao = req.query.situacao ? String(req.query.situacao) : null;
  const pagina = Math.max(1, Number(req.query.pagina) || 1);

  // Com filtro de ano/série/turma, o join com matrícula é inner; sem, é left.
  const filtraMatricula = !!(ano || serie || turma);
  const selecao = `id, nome, codigo_activesoft, ra, data_nascimento, situacao, origem, matricula${filtraMatricula ? '!inner' : ''}(id, turma, situacao_final, ano_letivo${filtraMatricula && ano ? '!inner' : ''}(ano), serie(nome), curso(nome))`;
  let query = client.from('aluno').select(selecao, { count: 'exact' }).order('nome').range((pagina - 1) * TAMANHO_PAGINA, pagina * TAMANHO_PAGINA - 1);
  if (q) query = query.or(`nome.ilike.%${q.replace(/[%,()]/g, ' ')}%,codigo_activesoft.ilike.%${q}%,ra.ilike.%${q}%`);
  if (situacao) query = query.eq('situacao', situacao);
  if (ano) query = query.eq('matricula.ano_letivo.ano', ano);
  if (serie) query = query.eq('matricula.serie_id', serie);
  if (turma) query = query.ilike('matricula.turma', turma);
  const { data, error, count } = await query;
  if (error) throw error;

  type Linha = { id: string; nome: string; codigo_activesoft: string | null; ra: string | null; data_nascimento: string | null; situacao: string; origem: string; matricula: { id: string; turma: string | null; situacao_final: string; ano_letivo: { ano: number } | null; serie: { nome: string } | null; curso: { nome: string } | null }[] };
  const linhas = ((data || []) as unknown as Linha[]).map(a => {
    const mats = (a.matricula || []).filter(m => m.ano_letivo).sort((x, y) => (y.ano_letivo!.ano) - (x.ano_letivo!.ano));
    const m = (ano ? mats.find(x => x.ano_letivo!.ano === ano) : mats[0]) || null;
    return {
      id: a.id, nome: a.nome, codigo_activesoft: a.codigo_activesoft, ra: a.ra, data_nascimento: a.data_nascimento, situacao: a.situacao, origem: a.origem,
      matricula: m ? { id: m.id, ano: m.ano_letivo!.ano, serie: m.serie?.nome || '', curso: m.curso?.nome || '', turma: m.turma, situacao_final: m.situacao_final } : null
    };
  });
  res.json({ alunos: linhas, total: count || 0, pagina, tamanho: TAMANHO_PAGINA });
}));

/* ---------- criar (manual) ---------- */
const alunoSchema = z.object({
  nome: textoObrigatorio, nome_social: texto, data_nascimento: dataIso, municipio_nascimento: texto,
  uf_nascimento: z.preprocess(v => (typeof v === 'string' ? v.trim().toUpperCase() || null : v), z.string().length(2, 'UF com 2 letras').nullable().optional()),
  pais_nascimento: texto, nacionalidade: texto, sexo: z.preprocess(v => (v === '' ? null : v), z.enum(['M', 'F', 'outro']).nullable().optional()),
  cin: texto, rg: texto, rg_orgao: texto, rg_uf: texto, rg_data: dataIso, cpf: texto,
  certidao_tipo: texto, certidao_termo: texto, certidao_livro: texto, certidao_folha: texto,
  filiacao_1: texto, filiacao_2: texto, ra: texto, codigo_activesoft: texto,
  situacao: z.enum(['ativo', 'transferido', 'concluinte', 'evadido', 'inativo']).optional()
});

alunosRouter.post('/', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const body = validar(alunoSchema, req, res);
  if (!body) return;
  const { client, perfil } = ctx(res);
  const { data, error } = await client.from('aluno').insert({ ...body, origem: 'manual' }).select().single();
  if (error) throw error;
  await getServiceClient().from('auditoria').insert({ entidade: 'aluno', entidade_id: data.id, aluno_id: data.id, acao: 'criar', valor_novo: { nome: data.nome }, usuario_email: perfil.email });
  res.status(201).json(data);
}));

/* ---------- ficha ---------- */
function validarAluno(aluno: Aluno, matriculas: MatriculaDetalhe[]): ItemValidacao[] {
  const itens: ItemValidacao[] = [];
  for (const c of CAMPOS_OBRIGATORIOS_HISTORICO) {
    if (!aluno[c.campo]) itens.push({ nivel: 'bloqueia', codigo: `aluno.${c.campo}`, mensagem: `${c.rotulo} não preenchido — obrigatório no histórico.`, aba: 'dados' });
  }
  if (!aluno.cpf && !aluno.cin) itens.push({ nivel: 'bloqueia', codigo: 'aluno.documento', mensagem: 'CIN ou CPF não preenchido — sai na identificação do histórico.', aba: 'dados' });
  if (!aluno.ra) itens.push({ nivel: 'alerta', codigo: 'aluno.ra', mensagem: 'RA não preenchido — sai no certificado de conclusão.', aba: 'dados' });
  if (!matriculas.length) itens.push({ nivel: 'bloqueia', codigo: 'trajetoria.vazia', mensagem: 'Nenhum ano letivo na trajetória.', aba: 'trajetoria' });
  for (const m of matriculas) {
    const rot = `${m.ano_letivo.ano} · ${m.serie.nome}`;
    if (!m.versao_curricular_id && !m.estabelecimento_externo_id) itens.push({ nivel: 'bloqueia', codigo: 'matricula.sem_versao', mensagem: `${rot}: sem currículo cadastrado para o período — a emissão fica bloqueada (RF-VER-11).`, matricula_id: m.id, aba: 'trajetoria' });
    if (m.versao_curricular_id && m.total_itens > 0 && m.total_notas < m.total_itens) itens.push({ nivel: 'bloqueia', codigo: 'notas.faltando', mensagem: `${rot}: ${m.total_itens - m.total_notas} componente(s) sem nota.`, matricula_id: m.id, aba: 'notas' });
    if (m.situacao_final === 'em_curso' && m.ano_letivo.ano < new Date().getFullYear()) itens.push({ nivel: 'alerta', codigo: 'matricula.em_curso', mensagem: `${rot}: situação final ainda "em curso".`, matricula_id: m.id, aba: 'trajetoria' });
  }
  return itens;
}

async function carregarMatriculas(client: ReturnType<typeof ctx>['client'], alunoId: string): Promise<MatriculaDetalhe[]> {
  const { data, error } = await client.from('matricula')
    .select('*, ano_letivo(id, ano), serie(id, codigo, nome), curso(id, nome, etapa), versao:versao_curricular(id, nome, status), estabelecimento:estabelecimento_externo(id, nome, municipio, uf), nota(id, editado)')
    .eq('aluno_id', alunoId);
  if (error) throw error;
  type Linha = Omit<MatriculaDetalhe, 'total_itens' | 'total_notas' | 'notas_editadas'> & { nota: { id: string; editado: boolean }[] };
  const mats = (data || []) as unknown as Linha[];
  // total de itens da grade por (versão, série)
  const chaves = [...new Set(mats.filter(m => m.versao_curricular_id).map(m => `${m.versao_curricular_id}|${m.serie_id}`))];
  const totais = new Map<string, number>();
  for (const ch of chaves) {
    const [vid, sid] = ch.split('|');
    const { count } = await client.from('versao_item').select('id, versao_agrupamento!inner(versao_bloco!inner(versao_id))', { count: 'exact', head: true }).eq('serie_id', sid).eq('versao_agrupamento.versao_bloco.versao_id', vid);
    totais.set(ch, count || 0);
  }
  return mats.map(m => {
    const { nota, ...resto } = m;
    return { ...resto, total_itens: totais.get(`${m.versao_curricular_id}|${m.serie_id}`) || 0, total_notas: nota.length, notas_editadas: nota.filter(n => n.editado).length };
  }).sort((a, b) => a.ano_letivo.ano - b.ano_letivo.ano);
}

alunosRouter.get('/:id', exigirPapel(), seguro(async (req, res) => {
  const { client } = ctx(res);
  const { data: aluno, error } = await client.from('aluno').select('*').eq('id', req.params.id).maybeSingle();
  if (error) throw error;
  if (!aluno) return res.status(404).json({ error: 'Aluno não encontrado.' });
  const matriculas = await carregarMatriculas(client, aluno.id);
  res.json({ aluno, matriculas, validacao: validarAluno(aluno, matriculas) });
}));

alunosRouter.put('/:id', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const body = validar(alunoSchema.partial(), req, res);
  if (!body) return;
  const { client, perfil } = ctx(res);
  const { data: atual, error: e0 } = await client.from('aluno').select('*').eq('id', req.params.id).maybeSingle();
  if (e0) throw e0;
  if (!atual) return res.status(404).json({ error: 'Aluno não encontrado.' });

  const mudancas = Object.entries(body).filter(([c, v]) => JSON.stringify(atual[c] ?? null) !== JSON.stringify(v ?? null));
  if (!mudancas.length) return res.json(atual);
  const { data, error } = await client.from('aluno').update({ ...Object.fromEntries(mudancas), editado: true, editado_por: perfil.email, editado_em: new Date().toISOString() }).eq('id', req.params.id).select().single();
  if (error) throw error;
  const svc = getServiceClient();
  await svc.from('auditoria').insert(mudancas.map(([c, v]) => ({ entidade: 'aluno', entidade_id: data.id, aluno_id: data.id, acao: 'editar', campo: c, valor_anterior: { [c]: atual[c] ?? null }, valor_novo: { [c]: v ?? null }, motivo: (req.body.motivo as string) || null, usuario_email: perfil.email })));
  res.json(data);
}));

alunosRouter.get('/:id/auditoria', exigirPapel('admin', 'secretaria', 'coordenacao'), seguro(async (req, res) => {
  const { client } = ctx(res);
  const { data, error } = await client.from('auditoria').select('*').eq('aluno_id', req.params.id).order('criado_em', { ascending: false }).limit(200);
  if (error) throw error;
  res.json(data);
}));

/* ---------- trajetória ---------- */
const matriculaSchema = z.object({
  ano: z.coerce.number().int().min(1900).max(2200),
  serie_id: uuid,
  turma: texto,
  numero_matricula: texto,
  data_matricula: dataIso,
  data_saida: dataIso,
  estabelecimento_externo_id: z.preprocess(v => (v === '' ? null : v), uuid.nullable().optional()),
  situacao_final: z.enum(['em_curso', 'aprovado', 'aprovado_conselho', 'reprovado', 'transferido', 'evadido']).optional(),
  carga_horaria_total: inteiro,
  observacao: texto
});

alunosRouter.post('/:id/matriculas', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const body = validar(matriculaSchema, req, res);
  if (!body) return;
  const { client, perfil } = ctx(res);
  const { ano, ...resto } = body;
  let { data: anoLetivo } = await client.from('ano_letivo').select('id').eq('ano', ano).maybeSingle();
  if (!anoLetivo) {
    // anos antigos (aluno de outra escola) entram como encerrados
    const { data: novo, error } = await getServiceClient().from('ano_letivo').insert({ ano, situacao: ano < new Date().getFullYear() ? 'encerrado' : 'aberto' }).select('id').single();
    if (error) throw error;
    anoLetivo = novo;
  }
  const { data: serie, error: eSerie } = await client.from('serie').select('curso_id').eq('id', body.serie_id).single();
  if (eSerie) throw eSerie;
  const { data, error } = await client.from('matricula').insert({ ...resto, aluno_id: req.params.id, ano_letivo_id: anoLetivo.id, curso_id: serie.curso_id, origem: 'manual', editado: true }).select().single();
  if (error) throw error;
  await getServiceClient().from('auditoria').insert({ entidade: 'matricula', entidade_id: data.id, aluno_id: req.params.id, acao: 'criar', valor_novo: { ano, serie_id: body.serie_id, estabelecimento_externo_id: body.estabelecimento_externo_id || null }, usuario_email: perfil.email });
  res.status(201).json(data);
}));

alunosRouter.put('/matriculas/:id', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const body = validar(matriculaSchema.partial().omit({ ano: true, serie_id: true }), req, res);
  if (!body) return;
  const { client, perfil } = ctx(res);
  const { data: atual, error: e0 } = await client.from('matricula').select('*').eq('id', req.params.id).maybeSingle();
  if (e0) throw e0;
  if (!atual) return res.status(404).json({ error: 'Matrícula não encontrada.' });
  const mudancas = Object.entries(body).filter(([c, v]) => JSON.stringify(atual[c] ?? null) !== JSON.stringify(v ?? null));
  if (!mudancas.length) return res.json(atual);
  const { data, error } = await client.from('matricula').update({ ...Object.fromEntries(mudancas), editado: true }).eq('id', req.params.id).select().single();
  if (error) throw error;
  await getServiceClient().from('auditoria').insert(mudancas.map(([c, v]) => ({ entidade: 'matricula', entidade_id: data.id, aluno_id: atual.aluno_id, acao: 'editar', campo: c, valor_anterior: { [c]: atual[c] ?? null }, valor_novo: { [c]: v ?? null }, motivo: (req.body.motivo as string) || null, usuario_email: perfil.email })));
  res.json(data);
}));

/* ---------- grade de notas ---------- */
alunosRouter.get('/matriculas/:id/grade', exigirPapel(), seguro(async (req, res) => {
  const { client } = ctx(res);
  const { data: m, error } = await client.from('matricula')
    .select('*, ano_letivo(id, ano), serie(id, codigo, nome), curso(id, nome, etapa), versao:versao_curricular(id, nome, status), estabelecimento:estabelecimento_externo(id, nome, municipio, uf)')
    .eq('id', req.params.id).maybeSingle();
  if (error) throw error;
  if (!m) return res.status(404).json({ error: 'Matrícula não encontrada.' });

  const [notas, sistema] = await Promise.all([
    client.from('nota').select('*').eq('matricula_id', m.id),
    client.from('sistema_avaliacao').select('tipo, media_aprovacao, frequencia_minima, escala_conceitos').eq('curso_id', m.curso_id).maybeSingle()
  ]);
  if (notas.error) throw notas.error;
  const notaPorItem = new Map((notas.data || []).map(n => [n.versao_item_id, n]));

  let blocos: unknown[] = [];
  let totais: { total_aulas_anuais: number | null; total_horas_anuais: number | null } | null = null;
  let totalItens = 0;
  if (m.versao_curricular_id) {
    const [b, a, i, t] = await Promise.all([
      client.from('versao_bloco').select('id, versao_id, nome, ordem').eq('versao_id', m.versao_curricular_id).order('ordem'),
      client.from('versao_agrupamento').select('id, versao_bloco_id, nome, ordem, versao_bloco!inner(versao_id)').eq('versao_bloco.versao_id', m.versao_curricular_id).order('ordem'),
      client.from('versao_item').select('id, versao_agrupamento_id, nome_impresso, componente_id, ordem, versao_agrupamento!inner(versao_bloco!inner(versao_id))').eq('serie_id', m.serie_id).eq('versao_agrupamento.versao_bloco.versao_id', m.versao_curricular_id).order('ordem'),
      client.from('versao_total').select('total_aulas_anuais, total_horas_anuais').eq('versao_id', m.versao_curricular_id).eq('serie_id', m.serie_id).maybeSingle()
    ]);
    for (const r of [b, a, i, t]) if (r.error) throw r.error;
    totais = t.data;
    const itens = (i.data || []) as { id: string; versao_agrupamento_id: string; nome_impresso: string; componente_id: string | null; ordem: number }[];
    totalItens = itens.length;
    const agrups = (a.data || []) as { id: string; versao_bloco_id: string; nome: string; ordem: number }[];
    blocos = (b.data || []).map(bl => ({
      ...bl,
      agrupamentos: agrups.filter(ag => ag.versao_bloco_id === bl.id).map(ag => ({
        id: ag.id, nome: ag.nome, ordem: ag.ordem,
        itens: itens.filter(it => it.versao_agrupamento_id === ag.id).map(it => ({ id: it.id, nome_impresso: it.nome_impresso, componente_id: it.componente_id, ordem: it.ordem, nota: notaPorItem.get(it.id) || null }))
      })).filter(ag => ag.itens.length)
    })).filter(bl => bl.agrupamentos.length);
  }

  const lista = notas.data || [];
  res.json({
    matricula: { ...m, total_itens: totalItens, total_notas: lista.length, notas_editadas: lista.filter(n => n.editado).length },
    versao: m.versao, blocos, totais, sistema: sistema.data || null,
    resumo: { total_itens: totalItens, com_nota: lista.filter(n => n.valor != null || n.conceito).length, sem_nota: Math.max(0, totalItens - lista.filter(n => n.valor != null || n.conceito).length), editadas: lista.filter(n => n.editado).length, ultima_sincronizacao: lista.map(n => n.sincronizado_em).filter(Boolean).sort().pop() || null }
  });
}));

alunosRouter.put('/matriculas/:id/notas/:itemId', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const body = validar(z.object({
    valor: numero, conceito: texto, faltas: inteiro,
    situacao: z.enum(['aprovado', 'reprovado', 'dispensado', 'cursando', 'sem_registro']),
    motivo: z.string().trim().min(5, 'Informe o motivo (ao menos 5 caracteres).')
  }), req, res);
  if (!body) return;
  const { client, perfil } = ctx(res);
  const { data, error } = await client.rpc('editar_nota', {
    p_matricula_id: req.params.id, p_versao_item_id: req.params.itemId,
    p_valor: body.valor ?? null, p_conceito: body.conceito ?? null, p_faltas: body.faltas ?? null, p_situacao: body.situacao,
    p_motivo: body.motivo, p_usuario: perfil.email
  });
  if (error) throw error;
  res.json(data);
}));
