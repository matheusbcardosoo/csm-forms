// Contrato canônico da importação (03-integracao-activesoft §2). Nenhum
// serviço fora de server/adapters conhece um campo da API do Activesoft:
// o adaptador traduz para este formato.

export interface AlunoOrigem {
  codigoOrigem: string;          // identificador no Activesoft — chave de correlação
  nome: string;
  nomeSocial?: string;
  dataNascimento?: string;       // ISO 8601 (yyyy-mm-dd)
  municipioNascimento?: string;
  ufNascimento?: string;
  paisNascimento?: string;
  nacionalidade?: string;
  sexo?: 'M' | 'F' | 'outro';
  rg?: string; rgOrgao?: string; rgUf?: string;
  cpf?: string;
  cin?: string;
  ra?: string;
  certidao?: { tipo?: string; termo?: string; livro?: string; folha?: string };
  filiacao1?: string;
  filiacao2?: string;
  situacao?: string;             // texto cru; traduzido via mapeamento
}

export interface MatriculaOrigem {
  codigoOrigem: string;
  alunoCodigoOrigem: string;
  anoLetivo: number;
  serieCodigoOrigem: string;
  serieDescricao?: string;
  turma?: string;
  numeroMatricula?: string;
  dataMatricula?: string;
  dataSaida?: string;
  situacaoFinal?: string;        // texto cru
  cargaHorariaTotal?: number;
}

export interface NotaOrigem {
  matriculaCodigoOrigem: string;
  disciplinaCodigoOrigem: string;
  disciplinaDescricao?: string;
  valor?: number;                // nota final
  conceito?: string;
  cargaHoraria?: number;
  faltas?: number;
  situacao?: string;             // texto cru
}

export interface ResultadoBusca<T> {
  itens: T[];
  paginaAtual: number;
  totalPaginas?: number;
  totalItens?: number;
}

export interface FiltroImportacao {
  anoLetivo: number;
  serieCodigoOrigem?: string;
  turma?: string;
  alunoCodigoOrigem?: string;
  atualizadosApos?: string;
}

export interface Capacidades {
  delta: boolean;
  cargaHoraria: boolean;
  situacaoFinal: boolean;
  faltas: boolean;
  documentosAluno: boolean;
  paginacao: boolean;
  limiteRequisicoes?: number;
}

export type OrigemImportacao = 'activesoft_api' | 'arquivo_csv' | 'arquivo_xlsx' | 'mock';
export type TipoImportacao = 'alunos' | 'matriculas' | 'notas' | 'completo';
export type ModoImportacao = 'simulacao' | 'efetiva';
export type StatusImportacao = 'pendente' | 'executando' | 'concluida' | 'erro' | 'cancelada';
export type ResolucaoDivergencia = 'pendente' | 'manter_local' | 'aceitar_origem' | 'ignorada';

export const ROTULO_TIPO_IMPORTACAO: Record<TipoImportacao, string> = {
  alunos: 'Alunos', matriculas: 'Matrículas', notas: 'Notas', completo: 'Completo (alunos, matrículas e notas)'
};

export interface Importacao {
  id: string;
  origem: OrigemImportacao;
  tipo: TipoImportacao;
  parametros: { anoLetivo?: number; serieCodigoOrigem?: string; turma?: string; alunoCodigoOrigem?: string; adaptador?: string };
  modo: ModoImportacao;
  status: StatusImportacao;
  lidos: number; criados: number; atualizados: number; ignorados: number;
  com_divergencia: number; pendentes_mapeamento: number; erros: number;
  erro: string | null;
  relatorio: RelatorioImportacao | null;
  iniciado_por: string | null;
  iniciado_em: string;
  concluido_em: string | null;
}

export interface LinhaRelatorio { entidade: 'aluno' | 'matricula' | 'nota'; acao: 'criar' | 'atualizar' | 'ignorar' | 'divergencia' | 'pendencia' | 'erro'; chave: string; descricao: string; detalhe?: string }

export interface RelatorioImportacao {
  adaptador: string;
  capacidades: Capacidades;
  avisos: string[];
  linhas: LinhaRelatorio[];              // amostra (limitada) por ação
  divergenciasPrevistas?: DivergenciaPrevista[];   // só na simulação
  /** Códigos que a importação casou sozinha por nome idêntico ao cadastro. */
  mapeamentosAutomaticos?: MapeamentoAutomatico[];
  /**
   * (ano letivo, série) sem versão curricular publicada. Enquanto isso
   * existe, a matrícula entra sem grade e NENHUMA nota daquela série pode
   * ser gravada (RF-VER-11) — é o bloqueio que precede o de mapeamento.
   */
  seriesSemCurriculo?: SerieSemCurriculo[];
  /**
   * Erros agrupados por causa, com o que fazer para resolver cada uma.
   * A importação não para no primeiro erro: o registro que falhou entra
   * aqui e na aba Erros, e os demais seguem sendo gravados.
   */
  errosResumo?: ResumoErro[];
  /** Erros que passaram do teto de linhas do relatório e não foram listados um a um. */
  errosOmitidos?: number;
}

export interface ResumoErro { causa: string; sugestao: string; quantidade: number }

export interface SerieSemCurriculo { ano: number; serie: string; serie_id: string; matriculas: number }

export interface MapeamentoAutomatico {
  tipo: 'disciplina' | 'serie';
  codigo_origem: string;
  descricao_origem: string | null;
  destino: string;
  registros: number;
}

export interface DivergenciaPrevista { entidade: string; descricao: string; campo: string; valor_local: unknown; valor_origem: unknown }

export interface Divergencia {
  id: string;
  importacao_id: string;
  entidade: 'aluno' | 'matricula' | 'nota';
  entidade_id: string;
  aluno_id: string | null;
  descricao: string | null;
  campo: string;
  valor_local: Record<string, unknown> | null;
  valor_origem: Record<string, unknown> | null;
  contexto: { editado_por?: string; editado_em?: string; motivo?: string; valor_origem_anterior?: unknown } | null;
  resolucao: ResolucaoDivergencia;
  resolvido_por: string | null;
  resolvido_em: string | null;
}

export type TipoMapeamento = 'disciplina' | 'serie' | 'turma' | 'situacao';

export interface Mapeamento {
  id: string;
  versao_id: string | null;
  tipo: TipoMapeamento;
  codigo_origem: string;
  descricao_origem: string | null;
  versao_item_id: string | null;
  destino_valor: string | null;
  confirmado: boolean;
  observacao: string | null;
  sugestao_item_id: string | null;
  registros_afetados: number;
}
