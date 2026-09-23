export type EtapaEnsino = 'ei' | 'ef_iniciais' | 'ef_finais' | 'em';

export const ROTULO_ETAPA: Record<EtapaEnsino, string> = {
  ei: 'Educação Infantil',
  ef_iniciais: 'Ensino Fundamental — anos iniciais',
  ef_finais: 'Ensino Fundamental — anos finais',
  em: 'Ensino Médio'
};

/**
 * Como a etapa sai na coluna ENSINO da tabela de estabelecimentos do
 * histórico (05-modelo §1.6): lá vai a etapa, não o curso — o modelo real
 * imprime "ENSINO MÉDIO" mesmo quando o título é "ENSINO MÉDIO BILÍNGUE".
 */
export const ROTULO_ETAPA_CURTO: Record<EtapaEnsino, string> = {
  ei: 'EDUCAÇÃO INFANTIL',
  ef_iniciais: 'ENSINO FUNDAMENTAL',
  ef_finais: 'ENSINO FUNDAMENTAL',
  em: 'ENSINO MÉDIO'
};

export interface Curso {
  id: string;
  etapa: EtapaEnsino;
  nome: string;
  razao_aula_hora: number;
  texto_promocao: string | null;
  ativo: boolean;
  ordem: number;
}

export interface Serie {
  id: string;
  curso_id: string;
  codigo: string;
  nome: string;
  ordem: number;
  ativo: boolean;
}

/**
 * Uma disciplina da origem que compõe esta linha da grade. "Língua
 * Portuguesa" no papel costuma ser Literatura + Gramática + Redação na
 * origem; e a lista muda por série — eletiva que só existe no 9º ano,
 * nível de inglês que atende três séries de uma vez.
 */
export interface ItemDisciplina {
  id: string;
  versao_item_id: string;
  codigo_origem: string;
  descricao_origem: string | null;
  habilitado: boolean;
  ordem: number;
}

/** Onde um componente está em uso — o que a exclusão precisa mostrar. */
export interface UsoComponente {
  linhas: { versao_id: string; versao: string; status: string; curso: string; serie: string; nome_impresso: string }[];
  mapeamentos: { codigo_origem: string; descricao_origem: string | null }[];
  notas: number;
  podeExcluir: boolean;
  motivo: string | null;
}

export interface Componente {
  id: string;
  nome_canonico: string;
  sigla: string | null;
  ativo: boolean;
}

export type StatusVersao = 'rascunho' | 'vigente' | 'encerrada';

export const ROTULO_STATUS_VERSAO: Record<StatusVersao, string> = {
  rascunho: 'Rascunho',
  vigente: 'Vigente',
  encerrada: 'Encerrada'
};

export interface VersaoCurricular {
  id: string;
  curso_id: string;
  nome: string;
  base_legal: string | null;
  status: StatusVersao;
  ano_inicio: number | null;
  ano_fim: number | null;
  duplicada_de_id: string | null;
  criado_por: string | null;
  criado_em: string;
  publicado_por: string | null;
  publicado_em: string | null;
}

export interface VersaoItem {
  id: string;
  versao_agrupamento_id: string;
  serie_id: string;
  componente_id: string | null;
  nome_impresso: string;
  ordem: number;
  carga_horaria: number | null;
  /** Disciplinas da origem que alimentam esta linha nesta série. */
  disciplinas?: ItemDisciplina[];
}

export interface VersaoAgrupamento {
  id: string;
  versao_bloco_id: string;
  nome: string;
  ordem: number;
  itens: VersaoItem[];
}

export interface VersaoBloco {
  id: string;
  versao_id: string;
  nome: string;
  ordem: number;
  agrupamentos: VersaoAgrupamento[];
}

export interface VersaoTotal {
  versao_id: string;
  serie_id: string;
  total_aulas_anuais: number | null;
  total_horas_anuais: number | null;
}

export interface VersaoDetalhe extends VersaoCurricular {
  blocos: VersaoBloco[];
  totais: VersaoTotal[];
  series: Serie[];
  curso: Curso;
  origem: Pick<VersaoCurricular, 'id' | 'nome'> | null;
}

export interface VersaoResumo extends VersaoCurricular {
  total_itens: number;
}

export interface VigenciaCurricular {
  ano_letivo_id: string;
  serie_id: string;
  versao_id: string;
}

export type TipoSistemaAvaliacao = 'nota_0_10' | 'nota_0_100' | 'conceito';

export const ROTULO_SISTEMA: Record<TipoSistemaAvaliacao, string> = {
  nota_0_10: 'Nota de 0 a 10',
  nota_0_100: 'Nota de 0 a 100',
  conceito: 'Conceito'
};

export interface SistemaAvaliacao {
  id?: string;
  curso_id: string;
  tipo: TipoSistemaAvaliacao;
  media_aprovacao: number | null;
  frequencia_minima: number | null;
  escala_conceitos: { conceito: string; descricao: string }[] | null;
  legenda: string | null;
}

export interface EstabelecimentoExterno {
  id: string;
  nome: string;
  municipio: string | null;
  uf: string | null;
  cnpj: string | null;
  codigo_inep: string | null;
  ativo: boolean;
}
