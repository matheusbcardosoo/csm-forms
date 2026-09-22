// Importação agendada (RF-INT-10). Desenho em
// docs/superpowers/specs/2026-09-21-f7-refino-design.md §3.4.
//
// O agendador é um relógio, não um caminho novo: ele chama exatamente a
// mesma `executarImportacao` que o botão da tela chama, com o mesmo
// adaptador e o mesmo modo efetivo. Se a importação agendada divergisse
// da manual em qualquer coisa, o erro apareceria de madrugada e ninguém
// saberia de onde veio.
import { randomUUID } from 'node:crypto';
import { getServiceClient } from '../../lib/supabase';
import { criarAdaptador, adaptadorPadrao } from '../adapters/activesoft';
import { executarImportacao } from './importacao';

const FUSO = 'America/Sao_Paulo';
/** De quanto em quanto tempo se olha o relógio. */
const TIQUE_MS = 30_000;
/**
 * Janela mínima entre duas execuções. Serve de trava: o agendamento é
 * diário, então 23h impede a mesma janela de rodar duas vezes sem
 * impedir o dia seguinte.
 */
const INTERVALO_MINIMO_H = 23;

export interface Agendamento {
  id: string;
  ativo: boolean;
  hora: string;
  dias_semana: number[];
  tipo: 'alunos' | 'matriculas' | 'notas' | 'completo';
  ultima_execucao: string | null;
  reserva_token: string | null;
  ultimo_resultado: ResultadoAgendado | null;
  atualizado_em: string;
  atualizado_por: string | null;
}

export interface ResultadoAgendado {
  quando: string;
  ano: number;
  ok: boolean;
  importacao_id?: string;
  criados?: number;
  atualizados?: number;
  pendentes?: number;
  /** Registros que ficaram de fora sem derrubar a execução. */
  erros?: number;
  erro?: string;
}

/** Hora e dia da semana em São Paulo, sem depender do fuso do servidor. */
function agoraEmSaoPaulo(momento = new Date()) {
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO, hour: '2-digit', minute: '2-digit', weekday: 'short', year: 'numeric'
  }).formatToParts(momento);
  const pegar = (tipo: string) => partes.find(p => p.type === tipo)?.value || '';
  const DIAS: Record<string, number> = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sáb: 6, sab: 6 };
  const diaTexto = pegar('weekday').toLowerCase().replace('.', '').slice(0, 3);
  return {
    hhmm: `${pegar('hour')}:${pegar('minute')}`,
    diaSemana: DIAS[diaTexto] ?? new Date(momento).getDay(),
    ano: Number(pegar('year')) || new Date(momento).getFullYear()
  };
}

/**
 * Tenta reservar a janela atual. O `update` condicional é atômico no
 * Postgres: se duas réplicas acordarem no mesmo minuto, a segunda
 * reavalia o `where` depois de a primeira ter gravado, não casa mais, e
 * não escreve. É o que faz o agendador em processo ser seguro mesmo se
 * o EasyPanel subir mais de uma réplica.
 *
 * **Quem reservou descobre relendo, não pelo retorno do update.** O
 * PostgREST reaplica o filtro para montar a resposta, e a linha que
 * acabou de ser marcada já não casa com "ultima_execucao é nula ou
 * antiga" — então a resposta volta vazia mesmo tendo gravado. Confiar
 * nela fazia o agendador marcar a janela e nunca importar: silêncio às
 * três da manhã, que é o pior defeito possível aqui. Por isso cada
 * processo grava um token e relê para saber se o token é o seu.
 */
async function reservarJanela(db: ReturnType<typeof getServiceClient>, agora: Date): Promise<boolean> {
  const limite = new Date(agora.getTime() - INTERVALO_MINIMO_H * 3600_000).toISOString();
  const token = randomUUID();

  const { error } = await db.from('importacao_agendamento')
    .update({ ultima_execucao: agora.toISOString(), reserva_token: token })
    .or(`ultima_execucao.is.null,ultima_execucao.lt.${limite}`);
  if (error) throw error;

  const { data, error: eLeitura } = await db.from('importacao_agendamento').select('reserva_token').maybeSingle();
  if (eLeitura) throw eLeitura;
  return data?.reserva_token === token;
}

/**
 * Um batimento do relógio. Exportada para poder ser exercitada no
 * ambiente local sem esperar o horário chegar — é o único jeito de
 * verificar o caminho inteiro (ler configuração → casar horário →
 * reservar janela → importar → gravar resultado) sem depender de qual
 * processo ganhou a janela naquele minuto.
 */
export async function tique(): Promise<void> {
  const db = getServiceClient();
  const { data, error } = await db.from('importacao_agendamento').select('*').maybeSingle();
  if (error) throw error;
  const cfg = data as Agendamento | null;
  if (!cfg?.ativo) return;

  const agora = new Date();
  const { hhmm, diaSemana, ano } = agoraEmSaoPaulo(agora);
  if (hhmm !== cfg.hora) return;
  if (!cfg.dias_semana.includes(diaSemana)) return;
  if (!(await reservarJanela(db, agora))) return;
  const resultado = await rodar(cfg.tipo, ano, 'agendador');
  await db.from('importacao_agendamento').update({ ultimo_resultado: resultado }).eq('id', cfg.id);
  console.log(`[agendador] importação ${resultado.ok ? 'concluída' : 'falhou'} (${ano}):`,
    resultado.ok ? `${resultado.criados} criados, ${resultado.atualizados} atualizados` : resultado.erro);
}

/**
 * Executa e devolve o resumo. Sempre em modo **efetivo** — simulação
 * agendada não serviria para nada — e sem resolver mapeamento nenhum
 * além do que o casamento automático já resolve sozinho (RF-INT-08):
 * escolher destino de código ambíguo continua sendo decisão humana,
 * inclusive às três da manhã.
 */
export async function rodar(tipo: Agendamento['tipo'], ano: number, usuario: string): Promise<ResultadoAgendado> {
  const quando = new Date().toISOString();
  try {
    const adaptador = criarAdaptador(adaptadorPadrao());
    const conexao = await adaptador.testarConexao();
    if (!conexao.ok) throw new Error(conexao.detalhe || 'Origem indisponível.');

    // `usuario` vira `iniciado_por` na linha de importacao — é por ele
    // que o relatório distingue o que rodou sozinho do que alguém clicou
    const r = await executarImportacao(getServiceClient(), adaptador, {
      filtro: { anoLetivo: ano }, tipo, modo: 'efetiva', usuario
    });
    return {
      quando, ano, ok: true, importacao_id: r.id,
      criados: r.criados, atualizados: r.atualizados, pendentes: r.pendentes_mapeamento, erros: r.erros
    };
  } catch (err) {
    // falha vira resultado gravado, não exceção solta: o ponto da
    // importação agendada é justamente não precisar ninguém olhando
    return { quando, ano, ok: false, erro: (err as Error).message };
  }
}

let relogio: NodeJS.Timeout | null = null;

export function iniciarAgendador(): void {
  if (relogio) return;
  console.log(`[agendador] relógio ligado — confere a cada ${TIQUE_MS / 1000}s`);
  relogio = setInterval(() => {
    tique().catch(err => console.error('[agendador]', (err as Error).message));
  }, TIQUE_MS);
  // não segura o processo de pé sozinho
  relogio.unref();
}
