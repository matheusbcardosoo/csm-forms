// Histórico escolar (F5). O objeto `HistoricoDocumento` é a fonte de
// verdade única da pré-visualização React e do template EJS de PDF
// (02-arquitetura D2 / RNF-04): o servidor já entrega tudo formatado —
// nota com vírgula, traço onde não houve componente, data por extenso —
// para que os dois renderizadores não tenham lógica própria e não possam
// divergir.
import type { EtapaEnsino } from './curriculo';
import type { ItemValidacao } from './aluno';

export type TipoHistorico = 'transferencia' | 'conclusao_ef' | 'conclusao_em' | 'parcial' | 'declaracao';
export type StatusHistorico = 'rascunho' | 'conferido' | 'emitido' | 'cancelado';

export const ROTULO_TIPO_HISTORICO: Record<TipoHistorico, string> = {
  transferencia: 'Transferência',
  conclusao_ef: 'Conclusão do Ensino Fundamental',
  conclusao_em: 'Conclusão do Ensino Médio',
  parcial: 'Histórico parcial',
  declaracao: 'Declaração'
};

export const ROTULO_STATUS_HISTORICO: Record<StatusHistorico, string> = {
  rascunho: 'Rascunho', conferido: 'Conferido', emitido: 'Emitido', cancelado: 'Cancelado'
};

/**
 * O que cada tipo implica no papel. `certificado` liga o bloco CERTIFICADO
 * da página 2 (RF-HIST-16) e, com ele, a exigência do número de publicação
 * da SED (RF-HIST-15). `etapas` restringe os cursos oferecidos no assistente.
 */
export const TIPOS_HISTORICO: { tipo: TipoHistorico; rotulo: string; certificado: boolean; etapas: EtapaEnsino[] | null; descricao: string }[] = [
  { tipo: 'transferencia', rotulo: 'Transferência', certificado: false, etapas: null,
    descricao: 'Aluno que sai antes de concluir a etapa. Sem bloco de certificado.' },
  { tipo: 'conclusao_ef', rotulo: 'Conclusão do Ensino Fundamental', certificado: true, etapas: ['ef_iniciais', 'ef_finais'],
    descricao: 'Concluinte do 9º ano. Com certificado e número de publicação da SED.' },
  { tipo: 'conclusao_em', rotulo: 'Conclusão do Ensino Médio', certificado: true, etapas: ['em'],
    descricao: 'Concluinte da 3ª série. Com certificado e número de publicação da SED.' },
  { tipo: 'parcial', rotulo: 'Histórico parcial', certificado: false, etapas: null,
    descricao: 'Aluno em curso — anos já concluídos, sem certificação.' },
  { tipo: 'declaracao', rotulo: 'Declaração', certificado: false, etapas: null,
    descricao: 'Declaração de matrícula/escolaridade no mesmo layout, sem certificado.' }
];

export function metaTipo(tipo: TipoHistorico) {
  return TIPOS_HISTORICO.find(t => t.tipo === tipo) || TIPOS_HISTORICO[0];
}

/* ================== A linha do banco ================== */

export interface Historico {
  id: string;
  aluno_id: string;
  curso_id: string;
  tipo: TipoHistorico;
  status: StatusHistorico;
  matricula_ids: string[];
  via: number;
  via_de_id: string | null;
  numero_registro: number | null;
  ano_registro: number | null;
  livro: string | null;
  folha: string | null;
  numero_registro_gdae: string | null;
  com_certificado: boolean;
  signatario_diretor_id: string | null;
  signatario_secretario_id: string | null;
  observacoes: string | null;
  /** Documento congelado na emissão (RF-HIST-06). Só vem preenchido nas
   *  rotas de detalhe — a lista não carrega o snapshot. */
  snapshot?: HistoricoDocumento | null;
  pdf_path: string | null;
  criado_por: string | null;
  conferido_por: string | null;
  emitido_por: string | null;
  cancelado_por: string | null;
  motivo_cancelamento: string | null;
  criado_em: string;
  atualizado_em: string;
  conferido_em: string | null;
  emitido_em: string | null;
  cancelado_em: string | null;
}

/** Linha da lista de documentos (RF-HIST-12). */
export interface HistoricoLista extends Historico {
  aluno: { id: string; nome: string; ra: string | null; codigo_activesoft: string | null };
  curso: { id: string; nome: string; etapa: EtapaEnsino };
}

export interface ObservacaoModelo {
  id: string;
  titulo: string;
  texto: string;
  base_legal: string | null;
  etapa: EtapaEnsino | null;
  ativo: boolean;
  ordem: number;
}

/* ================== O documento renderizável ================== */

/** Uma coluna da grade: um ano letivo cursado. */
export interface ColunaAno {
  matricula_id: string;
  ano: number;
  serie: string;
  serie_codigo: string;
  externa: boolean;
}

export interface LinhaGradeDocumento {
  chave: string;
  nome: string;           // nome_impresso da versão mais recente (06-versionamento §4)
  celulas: string[];      // uma por coluna, já formatada ('6,1' ou '-')
}

export interface AgrupamentoDocumento { nome: string; linhas: LinhaGradeDocumento[] }
export interface BlocoDocumento { nome: string; agrupamentos: AgrupamentoDocumento[] }

export interface AssinaturaDocumento {
  nome: string;
  cargo: string;
  rg: string | null;
  registro_autorizacao: string | null;
  assinatura_path: string | null;
}

export interface EstabelecimentoLinha {
  ensino: string;
  serie: string;
  ano: number;
  estabelecimento: string;
  municipio_uf: string;
}

export interface HistoricoDocumento {
  /** Versão do formato do snapshot — muda se o layout do objeto mudar. */
  formato: 1;
  tipo: TipoHistorico;
  status: StatusHistorico;
  via: number;
  cabecalho: { titulo: string; linhas: string[] };
  faixa: string;                       // "HISTÓRICO ESCOLAR - ENSINO MÉDIO BILÍNGUE"
  aluno: {
    id: string;
    nome: string;
    nascimento: string;
    naturalidade: string;
    nacionalidade: string;
    documento: string;                 // CIN / CPF
    ra: string;
  };
  colunas: ColunaAno[];
  blocos: BlocoDocumento[];
  totais: { aulas: string[]; horas: string[] };
  estabelecimentos: EstabelecimentoLinha[];
  observacoes: string[];
  certificado: { texto: string; local_data: string } | null;
  assinaturas: AssinaturaDocumento[];
  registro_sed: string | null;
  registro: { numero: string; livro: string | null; folha: string | null; emitido_em: string | null } | null;
  rodape: string;
  gerado_em: string;
}

/** O que a tela de pré-visualização recebe (RF-HIST-02/03). */
export interface HistoricoDetalhe {
  historico: Historico;
  documento: HistoricoDocumento;
  validacao: ItemValidacao[];
  aluno: { id: string; nome: string; ra: string | null };
  curso: { id: string; nome: string; etapa: EtapaEnsino };
  /** Anos da trajetória fora do documento, para o painel de edição. */
  matriculas_disponiveis: { id: string; ano: number; serie: string; curso: string; externa: boolean; selecionada: boolean }[];
  signatarios: { id: string; nome: string; cargo: string; cargo_impresso: string }[];
  modelos_observacao: ObservacaoModelo[];
  vias: { id: string; via: number; emitido_em: string | null; status: StatusHistorico }[];
}

/** Passo 1/2 do assistente: o que dá para gerar para este aluno. */
export interface PreparoHistorico {
  aluno: { id: string; nome: string; ra: string | null };
  matriculas: {
    id: string; ano: number; serie: string; serie_id: string; curso_id: string; curso: string;
    etapa: EtapaEnsino; externa: boolean; estabelecimento: string | null;
    situacao_final: string; sem_curriculo: boolean; total_itens: number; total_notas: number;
  }[];
  validacao: ItemValidacao[];
  signatarios: { id: string; nome: string; cargo: string; cargo_impresso: string }[];
  modelos_observacao: ObservacaoModelo[];
  historicos: HistoricoLista[];
}

/* ================== Formatação compartilhada ================== */

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** dd/mm/aaaa — como sai na identificação do aluno. */
export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : iso;
}

/** "17 de setembro de 2026" — fecho do certificado (05-modelo §2.2). */
export function dataPorExtenso(iso: string | null | undefined): string {
  const base = (iso || new Date().toISOString()).slice(0, 10);
  const [a, m, d] = base.split('-');
  const mes = MESES[Number(m) - 1];
  if (!mes) return base;
  return `${Number(d)} de ${mes} de ${a}`;
}

/** Nota como no papel: uma casa decimal e vírgula; `-` quando não houve. */
export function notaImpressa(valor: number | string | null | undefined, conceito?: string | null): string {
  if (conceito) return conceito;
  if (valor === null || valor === undefined || valor === '') return '-';
  const n = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'));
  if (!Number.isFinite(n)) return '-';
  return n.toFixed(1).replace('.', ',');
}

/** Chave de casamento entre versões: sem acento, minúsculo, espaços colapsados. */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Texto do certificado com os campos interpolados (05-modelo §2.2).
 * Fica aqui, e não no template, porque o snapshot guarda o texto pronto —
 * reimprimir uma 2ª via não pode depender de a função ter mudado depois.
 */
export function textoCertificado(dados: {
  nome: string; nacionalidade: string; municipio: string; uf: string;
  cpf: string; ra: string; nascimento: string; curso: string; ano: number | string;
  diretor?: string | null;
}): string {
  const diretor = dados.diretor ? `O Diretor do Colégio São Marcos, ${dados.diretor},` : 'O Diretor do Colégio São Marcos,';
  return `${diretor} de acordo com o inciso VII do art. 24 da Lei nº 9394/96, certifica que o(a) aluno(a) ${dados.nome}, `
    + `de nacionalidade ${dados.nacionalidade || '—'}, natural de ${dados.municipio || '—'}, estado de ${dados.uf || '—'}, `
    + `portador(a) do CPF nº ${dados.cpf || '—'} / RA nº ${dados.ra || '—'}, nascido(a) em ${dados.nascimento || '—'}, `
    + `concluiu o ${dados.curso} no ano letivo de ${dados.ano}, estando apto(a) ao prosseguimento de estudos.`;
}

export const RODAPE_HISTORICO = 'Este Histórico não contém emendas ou rasuras.';

/** "Certificado expedido conforme publicação na SED, sob Registro / Visto Confere nº 000000000000." */
export function linhaRegistroSed(numero: string | null | undefined): string | null {
  const n = (numero || '').trim();
  if (!n) return null;
  return `Certificado expedido conforme publicação na SED, sob Registro / Visto Confere nº ${n}.`;
}
