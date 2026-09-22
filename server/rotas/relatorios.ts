// Relatórios da secretaria (F7 incremento D). Desenho em
// docs/superpowers/specs/2026-09-21-f7-refino-design.md §3.4.
//
// Três perguntas que a secretaria e a direção fazem de verdade: o que
// foi emitido no período, o que a importação trouxe, e o que está
// pendente de decisão. Nenhum deles inventa número: são leituras das
// mesmas tabelas que as telas já mostram, agregadas por período.
//
// Todos saem também em CSV, porque o destino deles é a planilha da
// direção — e é por isso que o CSV é `;` com BOM (ver `paraCSV`).
import { Router } from 'express';
import { exigirPapel, ctx, seguro } from '../lib/autorizacao';
import { ROTULO_STATUS_HISTORICO, ROTULO_TIPO_HISTORICO, type TipoHistorico, type StatusHistorico } from '../../shared/types/historico';

export const relatoriosRouter = Router();

type Cliente = ReturnType<typeof ctx>['client'];

/**
 * CSV que o Excel brasileiro abre com dois cliques: separador `;`
 * (vírgula é separador decimal aqui) e BOM na frente, senão acentuação
 * vira caixinha. Campo com `;`, aspas ou quebra de linha vai entre
 * aspas, com as aspas internas dobradas.
 */
function paraCSV(cabecalho: string[], linhas: (string | number | null)[][]): string {
  const celula = (v: string | number | null) => {
    const texto = v === null || v === undefined ? '' : String(v);
    return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  const corpo = [cabecalho, ...linhas].map(l => l.map(celula).join(';')).join('\r\n');
  return `﻿${corpo}\r\n`;
}

function enviarCSV(res: Parameters<Parameters<typeof relatoriosRouter.get>[1]>[1], nome: string, csv: string) {
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${nome}"`
  });
  res.send(csv);
}

const FUSO = 'America/Sao_Paulo';

/**
 * Instante em que o dia começa em São Paulo, em UTC.
 *
 * Comparar `timestamptz` com 'YYYY-MM-DD' cru corta à meia-noite UTC, e
 * o documento emitido às 21h30 do dia 30 (horário de Brasília) já está
 * no dia 1º em UTC: caía no relatório do mês seguinte e o fechamento da
 * secretaria não batia com o livro de registro. O deslocamento é lido do
 * próprio fuso, e não fixado em -03:00, para não passar a mentir caso o
 * horário de verão volte.
 */
function inicioDoDiaEmSaoPaulo(dia: string): string {
  const palpite = new Date(`${dia}T00:00:00Z`);
  if (Number.isNaN(palpite.getTime())) throw Object.assign(new Error(`Data inválida: ${dia}`), { status: 422 });
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const p = Object.fromEntries(fmt.formatToParts(palpite).map(x => [x.type, x.value])) as Record<string, string>;
  const comoSeFosseUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return new Date(palpite.getTime() - (comoSeFosseUtc - palpite.getTime())).toISOString();
}

const DIA_MS = 24 * 3600_000;

/** Período pedido, com um mês para trás como padrão. */
function periodo(req: { query: Record<string, unknown> }) {
  const hoje = new Date();
  const de = String(req.query.de || new Date(hoje.getTime() - 30 * DIA_MS).toISOString().slice(0, 10));
  const ate = String(req.query.ate || hoje.toISOString().slice(0, 10));

  // `ate` é dia inclusivo: quem pede 01/09 a 30/09 espera o dia 30
  // inteiro, então o corte é o começo do dia seguinte
  const diaSeguinte = new Date(`${ate}T00:00:00Z`);
  if (Number.isNaN(diaSeguinte.getTime())) throw Object.assign(new Error(`Data inválida: ${ate}`), { status: 422 });
  diaSeguinte.setUTCDate(diaSeguinte.getUTCDate() + 1);

  return { de, ate, inicio: inicioDoDiaEmSaoPaulo(de), fimExclusivo: inicioDoDiaEmSaoPaulo(diaSeguinte.toISOString().slice(0, 10)) };
}

const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

/* ==================== documentos emitidos ==================== */
interface LinhaDocumento {
  id: string; tipo: TipoHistorico; status: StatusHistorico; via: number;
  numero_registro: number | null; ano_registro: number | null;
  emitido_em: string | null; emitido_por: string | null;
  cancelado_em: string | null; motivo_cancelamento: string | null;
  aluno: { nome: string; ra: string | null } | null;
  curso: { nome: string } | null;
}

async function documentos(client: Cliente, inicio: string, fimExclusivo: string) {
  const { data, error } = await client.from('historico')
    .select('id, tipo, status, via, numero_registro, ano_registro, emitido_em, emitido_por, cancelado_em, motivo_cancelamento, aluno(nome, ra), curso(nome)')
    .gte('emitido_em', inicio).lt('emitido_em', fimExclusivo)
    .in('status', ['emitido', 'cancelado'])
    .order('numero_registro');
  if (error) throw error;
  return (data || []) as unknown as LinhaDocumento[];
}

relatoriosRouter.get('/documentos', exigirPapel(), seguro(async (req, res) => {
  const { client } = ctx(res);
  const { de, ate, inicio, fimExclusivo } = periodo(req);
  const linhas = await documentos(client, inicio, fimExclusivo);

  const porTipo: Record<string, number> = {};
  for (const l of linhas) porTipo[ROTULO_TIPO_HISTORICO[l.tipo]] = (porTipo[ROTULO_TIPO_HISTORICO[l.tipo]] || 0) + 1;

  res.json({
    periodo: { de, ate },
    resumo: {
      total: linhas.length,
      emitidos: linhas.filter(l => l.status === 'emitido').length,
      cancelados: linhas.filter(l => l.status === 'cancelado').length,
      segundas_vias: linhas.filter(l => l.via > 1).length,
      por_tipo: porTipo
    },
    linhas: linhas.map(l => ({
      id: l.id,
      aluno: l.aluno?.nome || '',
      ra: l.aluno?.ra || '',
      curso: l.curso?.nome || '',
      tipo: ROTULO_TIPO_HISTORICO[l.tipo],
      via: l.via,
      registro: l.numero_registro != null ? `${l.numero_registro}/${l.ano_registro}` : '',
      status: ROTULO_STATUS_HISTORICO[l.status],
      emitido_em: l.emitido_em,
      emitido_por: l.emitido_por || '',
      cancelado_em: l.cancelado_em,
      motivo_cancelamento: l.motivo_cancelamento || ''
    }))
  });
}));

relatoriosRouter.get('/documentos.csv', exigirPapel(), seguro(async (req, res) => {
  const { client } = ctx(res);
  const { de, ate, inicio, fimExclusivo } = periodo(req);
  const linhas = await documentos(client, inicio, fimExclusivo);
  enviarCSV(res, `documentos-${de}-a-${ate}.csv`, paraCSV(
    ['Registro', 'Aluno', 'RA', 'Curso', 'Documento', 'Via', 'Status', 'Emitido em', 'Emitido por', 'Cancelado em', 'Motivo do cancelamento'],
    linhas.map(l => [
      l.numero_registro != null ? `${l.numero_registro}/${l.ano_registro}` : '',
      l.aluno?.nome || '', l.aluno?.ra || '', l.curso?.nome || '',
      ROTULO_TIPO_HISTORICO[l.tipo], l.via, ROTULO_STATUS_HISTORICO[l.status],
      dataBR(l.emitido_em), l.emitido_por || '', dataBR(l.cancelado_em), l.motivo_cancelamento || ''
    ])
  ));
}));

/* ==================== importações ==================== */
interface LinhaImportacao {
  id: string; origem: string; tipo: string; modo: string; status: string;
  lidos: number; criados: number; atualizados: number; ignorados: number;
  com_divergencia: number; pendentes_mapeamento: number; erros: number;
  erro: string | null; iniciado_por: string | null; iniciado_em: string; concluido_em: string | null;
  parametros: { anoLetivo?: number } | null;
}

async function importacoes(client: Cliente, inicio: string, fimExclusivo: string) {
  const { data, error } = await client.from('importacao')
    .select('id, origem, tipo, modo, status, lidos, criados, atualizados, ignorados, com_divergencia, pendentes_mapeamento, erros, erro, iniciado_por, iniciado_em, concluido_em, parametros')
    .gte('iniciado_em', inicio).lt('iniciado_em', fimExclusivo)
    .order('iniciado_em', { ascending: false });
  if (error) throw error;
  return (data || []) as unknown as LinhaImportacao[];
}

// quem disparou: o agendador se identifica assim ao chamar a importação
const AGENDADOR = 'agendador';

relatoriosRouter.get('/importacoes', exigirPapel(), seguro(async (req, res) => {
  const { client } = ctx(res);
  const { de, ate, inicio, fimExclusivo } = periodo(req);
  const linhas = await importacoes(client, inicio, fimExclusivo);
  const efetivas = linhas.filter(l => l.modo === 'efetiva');

  res.json({
    periodo: { de, ate },
    resumo: {
      total: linhas.length,
      efetivas: efetivas.length,
      agendadas: linhas.filter(l => l.iniciado_por === AGENDADOR).length,
      com_erro: linhas.filter(l => l.status === 'erro' || l.erros > 0).length,
      criados: efetivas.reduce((n, l) => n + (l.criados || 0), 0),
      atualizados: efetivas.reduce((n, l) => n + (l.atualizados || 0), 0),
      pendentes_mapeamento: efetivas.reduce((n, l) => n + (l.pendentes_mapeamento || 0), 0)
    },
    linhas: linhas.map(l => ({
      id: l.id, origem: l.origem, tipo: l.tipo, modo: l.modo, status: l.status,
      ano: l.parametros?.anoLetivo ?? null,
      agendada: l.iniciado_por === AGENDADOR,
      iniciado_por: l.iniciado_por || '',
      lidos: l.lidos, criados: l.criados, atualizados: l.atualizados,
      com_divergencia: l.com_divergencia, pendentes_mapeamento: l.pendentes_mapeamento,
      erros: l.erros, erro: l.erro, quando: l.iniciado_em
    }))
  });
}));

relatoriosRouter.get('/importacoes.csv', exigirPapel(), seguro(async (req, res) => {
  const { client } = ctx(res);
  const { de, ate, inicio, fimExclusivo } = periodo(req);
  const linhas = await importacoes(client, inicio, fimExclusivo);
  enviarCSV(res, `importacoes-${de}-a-${ate}.csv`, paraCSV(
    ['Quando', 'Ano', 'Origem', 'Tipo', 'Modo', 'Disparo', 'Status', 'Lidos', 'Criados', 'Atualizados', 'Divergências', 'Pendências', 'Erros', 'Erro'],
    linhas.map(l => [
      dataBR(l.iniciado_em), l.parametros?.anoLetivo ?? '', l.origem, l.tipo, l.modo,
      l.iniciado_por === AGENDADOR ? 'agendada' : 'manual', l.status,
      l.lidos, l.criados, l.atualizados, l.com_divergencia, l.pendentes_mapeamento, l.erros, l.erro || ''
    ])
  ));
}));

/* ==================== divergências em aberto ==================== */
interface LinhaDivergencia {
  id: string; importacao_id: string; entidade: string; descricao: string; campo: string;
  valor_local: unknown; valor_origem: unknown; resolucao: string;
  aluno: { nome: string; ra: string | null } | null;
  // a divergência não tem carimbo próprio: ela nasce de uma importação,
  // e a data que importa para a secretaria é a daquela execução
  importacao: { iniciado_em: string } | null;
}

async function divergencias(client: Cliente) {
  const { data, error } = await client.from('importacao_divergencia')
    // `resolucao` é not null com default 'pendente' — filtrar por null
    // aqui devolveria lista vazia para sempre, e o relatório diria que
    // não há nada esperando decisão justamente quando há
    .select('id, importacao_id, entidade, descricao, campo, valor_local, valor_origem, resolucao, aluno(nome, ra), importacao(iniciado_em)')
    .eq('resolucao', 'pendente');
  if (error) throw error;
  // ordenação em memória porque o campo vem do registro embutido
  return ((data || []) as unknown as LinhaDivergencia[])
    .sort((a, b) => (b.importacao?.iniciado_em || '').localeCompare(a.importacao?.iniciado_em || ''));
}

const paraTexto = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/**
 * A divergência guarda os valores como `{ <campo>: valor }`. Na planilha
 * da direção, `{"valor":9.9}` não diz nada que `9,9` não diga melhor —
 * então desembrulha-se o campo quando ele está lá.
 */
function valorDoCampo(v: unknown, campo: string): string {
  if (v && typeof v === 'object' && !Array.isArray(v) && campo in (v as Record<string, unknown>)) {
    return paraTexto((v as Record<string, unknown>)[campo]);
  }
  return paraTexto(v);
}

relatoriosRouter.get('/divergencias', exigirPapel(), seguro(async (_req, res) => {
  const { client } = ctx(res);
  const linhas = await divergencias(client);
  const porEntidade: Record<string, number> = {};
  for (const l of linhas) porEntidade[l.entidade] = (porEntidade[l.entidade] || 0) + 1;

  res.json({
    resumo: { total: linhas.length, por_entidade: porEntidade },
    linhas: linhas.map(l => ({
      id: l.id, entidade: l.entidade, aluno: l.aluno?.nome || '', ra: l.aluno?.ra || '',
      importacao_id: l.importacao_id,
      descricao: l.descricao, campo: l.campo,
      valor_local: valorDoCampo(l.valor_local, l.campo), valor_origem: valorDoCampo(l.valor_origem, l.campo),
      quando: l.importacao?.iniciado_em || null
    }))
  });
}));

relatoriosRouter.get('/divergencias.csv', exigirPapel(), seguro(async (_req, res) => {
  const { client } = ctx(res);
  const linhas = await divergencias(client);
  enviarCSV(res, `divergencias-em-aberto-${new Date().toISOString().slice(0, 10)}.csv`, paraCSV(
    ['Quando', 'Entidade', 'Aluno', 'RA', 'Campo', 'Descrição', 'Valor local', 'Valor na origem'],
    linhas.map(l => [
      dataBR(l.importacao?.iniciado_em || null), l.entidade, l.aluno?.nome || '', l.aluno?.ra || '',
      l.campo, l.descricao, valorDoCampo(l.valor_local, l.campo), valorDoCampo(l.valor_origem, l.campo)
    ])
  ));
}));
