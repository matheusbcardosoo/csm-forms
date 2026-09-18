import type { Curso, Serie, VersaoBloco } from './curriculo';
import type { AnoLetivo } from './instituicao';
import type { EstabelecimentoExterno } from './curriculo';

export type SituacaoAluno = 'ativo' | 'transferido' | 'concluinte' | 'evadido' | 'inativo';
export type OrigemRegistro = 'activesoft' | 'manual' | 'importacao_arquivo';
export type SituacaoMatricula = 'em_curso' | 'aprovado' | 'aprovado_conselho' | 'reprovado' | 'transferido' | 'evadido';
export type SituacaoNota = 'aprovado' | 'reprovado' | 'dispensado' | 'cursando' | 'sem_registro';

export const ROTULO_SITUACAO_ALUNO: Record<SituacaoAluno, string> = {
  ativo: 'Ativo', transferido: 'Transferido', concluinte: 'Concluinte', evadido: 'Evadido', inativo: 'Inativo'
};
export const ROTULO_SITUACAO_MATRICULA: Record<SituacaoMatricula, string> = {
  em_curso: 'Em curso', aprovado: 'Aprovado', aprovado_conselho: 'Aprovado pelo conselho', reprovado: 'Reprovado', transferido: 'Transferido', evadido: 'Evadido'
};
export const ROTULO_SITUACAO_NOTA: Record<SituacaoNota, string> = {
  aprovado: 'Aprovado', reprovado: 'Reprovado', dispensado: 'Dispensado', cursando: 'Cursando', sem_registro: 'Sem registro'
};
export const ROTULO_ORIGEM: Record<OrigemRegistro, string> = { activesoft: 'Activesoft', manual: 'Manual', importacao_arquivo: 'Arquivo' };

export interface Aluno {
  id: string;
  codigo_activesoft: string | null;
  ra: string | null;
  nome: string;
  nome_social: string | null;
  data_nascimento: string | null;
  municipio_nascimento: string | null;
  uf_nascimento: string | null;
  pais_nascimento: string | null;
  nacionalidade: string | null;
  sexo: 'M' | 'F' | 'outro' | null;
  cin: string | null;
  rg: string | null;
  rg_orgao: string | null;
  rg_uf: string | null;
  rg_data: string | null;
  cpf: string | null;
  certidao_tipo: string | null;
  certidao_termo: string | null;
  certidao_livro: string | null;
  certidao_folha: string | null;
  filiacao_1: string | null;
  filiacao_2: string | null;
  situacao: SituacaoAluno;
  origem: OrigemRegistro;
  editado: boolean;
  editado_por: string | null;
  editado_em: string | null;
  sincronizado_em: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface Matricula {
  id: string;
  aluno_id: string;
  ano_letivo_id: string;
  serie_id: string;
  curso_id: string;
  versao_curricular_id: string | null;
  turma: string | null;
  numero_matricula: string | null;
  data_matricula: string | null;
  data_saida: string | null;
  estabelecimento_externo_id: string | null;
  situacao_final: SituacaoMatricula;
  carga_horaria_total: number | null;
  observacao: string | null;
  codigo_activesoft: string | null;
  origem: OrigemRegistro;
  editado: boolean;
  sincronizado_em: string | null;
}

export interface MatriculaDetalhe extends Matricula {
  ano_letivo: Pick<AnoLetivo, 'id' | 'ano'>;
  serie: Pick<Serie, 'id' | 'codigo' | 'nome'>;
  curso: Pick<Curso, 'id' | 'nome' | 'etapa'>;
  versao: { id: string; nome: string; status: string } | null;
  estabelecimento: Pick<EstabelecimentoExterno, 'id' | 'nome' | 'municipio' | 'uf'> | null;
  total_itens: number;
  total_notas: number;
  notas_editadas: number;
}

/** Linha da lista de alunos (com a matrícula do ano letivo selecionado, se houver). */
export interface AlunoLista {
  id: string;
  nome: string;
  codigo_activesoft: string | null;
  ra: string | null;
  data_nascimento: string | null;
  situacao: SituacaoAluno;
  origem: OrigemRegistro;
  matricula: { id: string; ano: number; serie: string; curso: string; turma: string | null; situacao_final: SituacaoMatricula } | null;
}

export interface Nota {
  id: string;
  matricula_id: string;
  versao_item_id: string;
  valor: number | null;
  conceito: string | null;
  carga_horaria: number | null;
  faltas: number | null;
  situacao: SituacaoNota;
  origem: OrigemRegistro;
  editado: boolean;
  valor_importado: { valor?: number | null; conceito?: string | null; faltas?: number | null; situacao?: string | null; carga_horaria?: number | null } | null;
  editado_por: string | null;
  editado_em: string | null;
  sincronizado_em: string | null;
}

/** Grade de notas de uma matrícula: estrutura da versão congelada + notas. */
export interface GradeNotas {
  matricula: MatriculaDetalhe;
  versao: { id: string; nome: string; status: string } | null;
  blocos: (Omit<VersaoBloco, 'agrupamentos'> & { agrupamentos: { id: string; nome: string; ordem: number; itens: { id: string; nome_impresso: string; componente_id: string | null; ordem: number; nota: Nota | null }[] }[] })[];
  totais: { total_aulas_anuais: number | null; total_horas_anuais: number | null } | null;
  sistema: { tipo: string; media_aprovacao: number | null; frequencia_minima: number | null; escala_conceitos: { conceito: string; descricao: string }[] | null } | null;
  resumo: { total_itens: number; com_nota: number; sem_nota: number; editadas: number; ultima_sincronizacao: string | null };
}

export interface Auditoria {
  id: string;
  entidade: string;
  entidade_id: string | null;
  aluno_id: string | null;
  acao: 'criar' | 'editar' | 'excluir' | 'emitir' | 'cancelar' | 'importar' | 'resolver';
  campo: string | null;
  valor_anterior: Record<string, unknown> | null;
  valor_novo: Record<string, unknown> | null;
  motivo: string | null;
  usuario_email: string | null;
  criado_em: string;
}

/** Validação automática antes da emissão (RF-ALU-08). */
export interface ItemValidacao { nivel: 'bloqueia' | 'alerta'; codigo: string; mensagem: string; matricula_id?: string; aba?: 'dados' | 'trajetoria' | 'notas' }

export interface AlunoDetalhe {
  aluno: Aluno;
  matriculas: MatriculaDetalhe[];
  validacao: ItemValidacao[];
}

/** Campos do aluno obrigatórios para o histórico (05-modelo §1.3 + certificado). */
export const CAMPOS_OBRIGATORIOS_HISTORICO: { campo: keyof Aluno; rotulo: string }[] = [
  { campo: 'nome', rotulo: 'Nome' },
  { campo: 'data_nascimento', rotulo: 'Data de nascimento' },
  { campo: 'municipio_nascimento', rotulo: 'Município de nascimento' },
  { campo: 'uf_nascimento', rotulo: 'UF de nascimento' },
  { campo: 'nacionalidade', rotulo: 'Nacionalidade' }
];
