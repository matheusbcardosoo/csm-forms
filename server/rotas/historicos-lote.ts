// Geração de históricos em lote (RF-HIST-13). Desenho em
// docs/superpowers/specs/2026-09-21-f7-refino-design.md §3.3.
//
// O caso que justifica: no fim do ano, a turma inteira de concluintes
// precisa do documento. Um a um pelo assistente são trinta idas e
// voltas para uma decisão que é a mesma trinta vezes.
//
// O que NÃO muda em relação à emissão individual: a montagem, a
// conferência e a função de emissão do banco são exatamente as mesmas.
// Lote aqui é orquestração — repetir o caminho que já existe, na ordem
// certa, e contar o que aconteceu. Nenhuma regra de documento mora aqui.
import { Router } from 'express';
import JSZip from 'jszip';
import { exigirPapel, ctx, seguro } from '../lib/autorizacao';
import { validar, z, uuid } from '../lib/validacao';
import { getServiceClient } from '../../lib/supabase';
import { montarDocumento, observacoesIniciais } from '../servicos/historico/montar';
import { nomeArquivo, obterPdf } from '../servicos/historico/pdf';
import { gerarCodigo } from '../servicos/historico/verificacao';
import { metaTipo, type Historico, type HistoricoDocumento, type TipoHistorico } from '../../shared/types/historico';
import type { ItemValidacao } from '../../shared/types/aluno';
import type { Curso } from '../../shared/types/curriculo';

export const historicosLoteRouter = Router();

type Cliente = ReturnType<typeof ctx>['client'];

const TIPOS = ['transferencia', 'conclusao_ef', 'conclusao_em', 'parcial', 'declaracao'] as const;

/* ==================== conferência agregada ==================== */
const prepararSchema = z.object({
  ano: z.coerce.number().int().min(1900).max(2200),
  serie_id: uuid,
  turma: z.string().trim().optional(),
  tipo: z.enum(TIPOS)
});

/**
 * Monta o documento de cada aluno da turma **sem gravar nada** e devolve
 * a conferência de cada um.
 *
 * Roda a montagem de verdade, com um `Historico` de mentira em memória,
 * em vez de reimplementar as regras numa versão "leve": conferência que
 * diverge da real é pior que conferência nenhuma — mandaria a secretaria
 * criar trinta rascunhos para descobrir na emissão que doze estão
 * bloqueados.
 */
historicosLoteRouter.post('/preparar', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const body = validar(prepararSchema, req, res);
  if (!body) return;
  const { client } = ctx(res);

  const { data: anoLetivo, error: eAno } = await client.from('ano_letivo').select('id').eq('ano', body.ano).maybeSingle();
  if (eAno) throw eAno;
  if (!anoLetivo) return res.status(422).json({ error: `Ano letivo ${body.ano} não está cadastrado.` });

  let q = client.from('matricula')
    .select('id, aluno_id, curso_id, turma, aluno(id, nome, ra)')
    .eq('ano_letivo_id', anoLetivo.id).eq('serie_id', body.serie_id);
  if (body.turma) q = q.eq('turma', body.turma);
  const { data: daTurma, error: eTurma } = await q;
  if (eTurma) throw eTurma;

  type LinhaTurma = { id: string; aluno_id: string; curso_id: string; turma: string | null; aluno: { id: string; nome: string; ra: string | null } | null };
  const turma = (daTurma || []) as unknown as LinhaTurma[];
  if (!turma.length) return res.json({ candidatos: [], resumo: { total: 0, prontos: 0, bloqueados: 0, ja_emitidos: 0 } });

  const alunoIds = [...new Set(turma.map(m => m.aluno_id))];

  // toda a trajetória de cada aluno, não só o ano escolhido: um histórico
  // de conclusão traz as três séries, e é a mesma regra do assistente
  const { data: todas, error: eTodas } = await client.from('matricula')
    .select('id, aluno_id, curso_id, ano_letivo(ano)').in('aluno_id', alunoIds);
  if (eTodas) throw eTodas;
  type LinhaTraj = { id: string; aluno_id: string; curso_id: string; ano_letivo: { ano: number } | null };
  const trajetoria = new Map<string, LinhaTraj[]>();
  for (const m of ((todas || []) as unknown as LinhaTraj[])) {
    const lista = trajetoria.get(m.aluno_id) || [];
    lista.push(m);
    trajetoria.set(m.aluno_id, lista);
  }

  // documento do mesmo tipo já emitido: não é impedimento, é aviso — a
  // secretaria reemite de propósito às vezes, mas nunca por engano
  const { data: existentes, error: eExist } = await client.from('historico')
    .select('id, aluno_id, tipo, status, via, numero_registro, ano_registro')
    .in('aluno_id', alunoIds).eq('tipo', body.tipo).in('status', ['rascunho', 'conferido', 'emitido']);
  if (eExist) throw eExist;
  type Existente = { id: string; aluno_id: string; status: string; via: number; numero_registro: number | null; ano_registro: number | null };
  const jaTem = new Map<string, Existente>();
  for (const h of ((existentes || []) as unknown as Existente[])) {
    // emitido manda sobre rascunho na hora de avisar
    const atual = jaTem.get(h.aluno_id);
    if (!atual || (h.status === 'emitido' && atual.status !== 'emitido')) jaTem.set(h.aluno_id, h);
  }

  const meta = metaTipo(body.tipo);
  const candidatos = [];
  for (const alunoId of alunoIds) {
    const daTrajetoria = (trajetoria.get(alunoId) || []).sort((a, b) => (a.ano_letivo?.ano || 0) - (b.ano_letivo?.ano || 0));
    const linhaTurma = turma.find(m => m.aluno_id === alunoId)!;
    const aluno = linhaTurma.aluno;
    const maisRecente = daTrajetoria[daTrajetoria.length - 1];

    const fantasma: Historico = {
      id: '00000000-0000-0000-0000-000000000000',
      aluno_id: alunoId,
      curso_id: maisRecente?.curso_id || linhaTurma.curso_id,
      tipo: body.tipo,
      status: 'rascunho',
      matricula_ids: daTrajetoria.map(m => m.id),
      via: 1, via_de_id: null,
      numero_registro: null, ano_registro: null, livro: null, folha: null,
      numero_registro_gdae: null,
      com_certificado: meta.certificado,
      signatario_diretor_id: null, signatario_secretario_id: null,
      observacoes: null, snapshot: null, pdf_path: null, codigo_verificacao: null,
      criado_por: null, conferido_por: null, emitido_por: null, cancelado_por: null,
      motivo_cancelamento: null,
      criado_em: '', atualizado_em: '', conferido_em: null, emitido_em: null, cancelado_em: null
    };

    let validacao: ItemValidacao[];
    try {
      validacao = (await montarDocumento(client, fantasma)).validacao;
    } catch (err) {
      validacao = [{ nivel: 'bloqueia', codigo: 'montagem.erro', mensagem: `Não foi possível montar o documento: ${(err as Error).message}` }];
    }

    // O número da SED é digitado por aluno (RF-HIST-15) e nunca está
    // preenchido antes de o rascunho existir. Num lote de conclusão ele
    // apareceria como bloqueio em todos, escondendo os problemas de
    // verdade — então sai da conferência daqui e vira exigência do passo
    // de emissão, onde já há um rascunho para receber o número.
    const bloqueios = validacao.filter(v => v.nivel === 'bloqueia' && v.codigo !== 'documento.sed');
    const existente = jaTem.get(alunoId);

    candidatos.push({
      aluno: aluno || { id: alunoId, nome: '(aluno sem cadastro)', ra: null },
      turma: linhaTurma.turma,
      matricula_ids: fantasma.matricula_ids,
      anos: daTrajetoria.map(m => m.ano_letivo?.ano || 0).filter(Boolean),
      bloqueios: bloqueios.map(b => ({ codigo: b.codigo, mensagem: b.mensagem })),
      alertas: validacao.filter(v => v.nivel === 'alerta').length,
      ja_tem: existente
        ? { id: existente.id, status: existente.status, registro: existente.numero_registro != null ? `${existente.numero_registro}/${existente.ano_registro}` : null }
        : null
    });
  }

  candidatos.sort((a, b) => a.aluno.nome.localeCompare(b.aluno.nome, 'pt-BR'));
  res.json({
    candidatos,
    resumo: {
      total: candidatos.length,
      prontos: candidatos.filter(c => !c.bloqueios.length && !c.ja_tem).length,
      bloqueados: candidatos.filter(c => c.bloqueios.length).length,
      ja_emitidos: candidatos.filter(c => c.ja_tem).length
    }
  });
}));

/* ==================== criação dos rascunhos ==================== */
const criarSchema = z.object({
  tipo: z.enum(TIPOS),
  alunos: z.array(z.object({ aluno_id: uuid, matricula_ids: z.array(uuid).min(1) })).min(1, 'Selecione ao menos um aluno'),
  signatario_diretor_id: z.preprocess(v => (v === '' ? null : v), uuid.nullable().optional()),
  signatario_secretario_id: z.preprocess(v => (v === '' ? null : v), uuid.nullable().optional()),
  livro: z.string().trim().optional()
});

historicosLoteRouter.post('/criar', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const body = validar(criarSchema, req, res);
  if (!body) return;
  const { client, perfil } = ctx(res);
  const meta = metaTipo(body.tipo);

  const cursos = new Map<string, Curso>();
  const criados: { aluno_id: string; historico_id: string }[] = [];
  const falhas: { aluno_id: string; erro: string }[] = [];

  for (const alvo of body.alunos) {
    try {
      const { data: mats, error: eMats } = await client.from('matricula')
        .select('id, aluno_id, curso_id, ano_letivo(ano)').in('id', alvo.matricula_ids);
      if (eMats) throw eMats;
      type Linha = { id: string; aluno_id: string; curso_id: string; ano_letivo: { ano: number } | null };
      const linhas = (mats || []) as unknown as Linha[];
      if (linhas.some(m => m.aluno_id !== alvo.aluno_id)) throw new Error('Anos de outro aluno na seleção.');
      if (!linhas.length) throw new Error('Nenhum ano letivo encontrado.');

      const maisRecente = [...linhas].sort((a, b) => (a.ano_letivo?.ano || 0) - (b.ano_letivo?.ano || 0)).pop()!;
      let curso = cursos.get(maisRecente.curso_id);
      if (!curso) {
        const { data, error } = await client.from('curso').select('*').eq('id', maisRecente.curso_id).single();
        if (error) throw error;
        curso = data as Curso;
        cursos.set(maisRecente.curso_id, curso);
      }

      const { data, error } = await client.from('historico').insert({
        aluno_id: alvo.aluno_id,
        curso_id: maisRecente.curso_id,
        tipo: body.tipo,
        matricula_ids: alvo.matricula_ids,
        com_certificado: meta.certificado,
        observacoes: observacoesIniciais(curso, body.tipo),
        signatario_diretor_id: body.signatario_diretor_id ?? null,
        signatario_secretario_id: body.signatario_secretario_id ?? null,
        livro: body.livro || null,
        codigo_verificacao: gerarCodigo(),
        criado_por: perfil.email
      }).select('id').single();
      if (error) throw error;

      criados.push({ aluno_id: alvo.aluno_id, historico_id: data.id });
    } catch (err) {
      falhas.push({ aluno_id: alvo.aluno_id, erro: (err as Error).message });
    }
  }

  if (criados.length) {
    await getServiceClient().from('auditoria').insert(criados.map(c => ({
      entidade: 'historico', entidade_id: c.historico_id, aluno_id: c.aluno_id, acao: 'criar',
      valor_novo: { tipo: body.tipo, origem: 'lote' }, usuario_email: perfil.email
    })));
  }

  res.status(201).json({ criados, falhas });
}));

/* ==================== emissão ==================== */
const emitirSchema = z.object({
  ids: z.array(uuid).min(1, 'Nenhum documento selecionado'),
  /** número da SED por documento — obrigatório em conclusão (RF-HIST-15) */
  sed: z.record(z.string(), z.string().trim()).optional()
});

/**
 * Emite um por um, **não numa transação só**.
 *
 * É a decisão que mais importa neste arquivo: número de registro
 * consumido não volta. Se o aluno 14 falhar, os 13 que já ganharam
 * número continuam emitidos — desfazer ficaria com buracos na sequência
 * ou, pior, reaproveitaria número já impresso. Quem falha continua
 * rascunho e aparece na lista de falhas com o motivo.
 *
 * O PDF **não** é gerado aqui, ao contrário da emissão individual: são
 * alguns segundos de Puppeteer por documento, e trinta deles dentro de
 * uma requisição HTTP estouram qualquer proxy. O download em lote gera
 * sob demanda, e a rota individual continua regenerando quando precisa.
 */
historicosLoteRouter.post('/emitir', exigirPapel('admin', 'secretaria'), seguro(async (req, res) => {
  const body = validar(emitirSchema, req, res);
  if (!body) return;
  const { client, perfil } = ctx(res);

  const emitidos: { id: string; aluno: string; registro: string }[] = [];
  const falhas: { id: string; aluno: string; erro: string }[] = [];

  for (const id of body.ids) {
    let nome = '';
    try {
      const { data: linha, error: eLinha } = await client.from('historico').select('*, aluno(nome)').eq('id', id).maybeSingle();
      if (eLinha) throw eLinha;
      if (!linha) throw new Error('Documento não encontrado.');
      const h = linha as unknown as Historico & { aluno: { nome: string } | null };
      nome = h.aluno?.nome || '';

      if (h.status === 'emitido') throw new Error('Já estava emitido.');
      if (h.status === 'cancelado') throw new Error('Documento cancelado.');

      const numeroSed = body.sed?.[id];
      if (numeroSed && numeroSed !== (h.numero_registro_gdae || '')) {
        const { error } = await client.from('historico').update({ numero_registro_gdae: numeroSed }).eq('id', id);
        if (error) throw error;
        h.numero_registro_gdae = numeroSed;
      }

      const { documento, validacao } = await montarDocumento(client, h);
      const bloqueios = validacao.filter(v => v.nivel === 'bloqueia');
      if (bloqueios.length) throw new Error(bloqueios[0].mensagem);

      const snapshot: HistoricoDocumento = { ...documento, status: 'emitido', gerado_em: new Date().toISOString() };
      const { data, error } = await client.rpc('emitir_historico', { p_id: id, p_snapshot: snapshot, p_usuario: perfil.email });
      if (error) throw error;

      const emitido = data as Historico;
      emitidos.push({ id, aluno: nome, registro: `${emitido.numero_registro}/${emitido.ano_registro}` });
    } catch (err) {
      falhas.push({ id, aluno: nome, erro: (err as Error).message });
    }
  }

  res.json({ emitidos, falhas });
}));

/* ==================== download em lote ==================== */
/**
 * Um ZIP com os PDFs. Sem compressão de propósito: PDF já é comprimido,
 * e `STORE` troca ganho nenhum de tamanho por menos tempo de CPU numa
 * rota que já é a mais lenta do sistema.
 *
 * Gera em série porque o Puppeteer é um só. Documento já emitido costuma
 * ter o PDF guardado no Storage, e aí é só baixar — o custo alto é o da
 * primeira vez.
 */
historicosLoteRouter.post('/pdf', exigirPapel(), seguro(async (req, res) => {
  const body = validar(z.object({ ids: z.array(uuid).min(1).max(60, 'No máximo 60 documentos por vez.') }), req, res);
  if (!body) return;
  const { client } = ctx(res);

  const zip = new JSZip();
  const problemas: string[] = [];
  const usados = new Set<string>();
  let incluidos = 0;

  // Dois documentos podem gerar o mesmo nome — `nomeArquivo` só tem o
  // aluno e o registro, e rascunho não tem registro. O JSZip guardaria só
  // o último, e o PDF sumiria do pacote sem entrar no aviso de falhas,
  // porque nada falhou.
  const nomeUnico = (base: string) => {
    if (!usados.has(base)) { usados.add(base); return base; }
    for (let n = 2; ; n++) {
      const tentativa = base.replace(/\.pdf$/, `-${n}.pdf`);
      if (!usados.has(tentativa)) { usados.add(tentativa); return tentativa; }
    }
  };

  for (const id of body.ids) {
    try {
      const { data, error } = await client.from('historico').select('*, aluno(nome)').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('não encontrado');
      const h = data as unknown as Historico & { aluno: { nome: string } | null };
      const pdf = await obterPdf(client as Cliente, h);
      zip.file(nomeUnico(nomeArquivo(h, h.aluno?.nome || 'aluno')), pdf);
      incluidos++;
    } catch (err) {
      problemas.push(`${id}: ${(err as Error).message}`);
    }
  }

  if (!incluidos) {
    return res.status(422).json({ error: 'Nenhum PDF pôde ser gerado.', detalhes: problemas });
  }
  // o que falhou vira um aviso dentro do próprio ZIP: quem baixa 30
  // documentos não confere um a um, e um arquivo a menos passaria batido
  if (problemas.length) {
    zip.file('AVISO-documentos-que-ficaram-de-fora.txt',
      `Estes documentos não entraram no ZIP:\n\n${problemas.join('\n')}\n`);
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
  res.set({
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="historicos-${new Date().toISOString().slice(0, 10)}.zip"`,
    'Content-Length': String(buffer.length)
  });
  res.send(buffer);
}));
