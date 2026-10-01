// Carteirinhas e fichas de inscrição de eventos (docs/08-carteirinhas.md).
// Pasta = o evento; subpasta = a turma do evento, que gera os documentos.

export type DocumentoCarteirinha = 'carteirinhas' | 'ficha_inscricao';
export type EscopoEmissao = 'subpasta' | 'selecao' | 'avulsa' | 'pasta';
export type Ordenacao = 'alfabetica' | 'manual';

export const ROTULO_DOCUMENTO: Record<DocumentoCarteirinha, string> = {
  carteirinhas: 'Carteirinhas', ficha_inscricao: 'Ficha de inscrição'
};

/* ---------------- Entidades ---------------- */

export interface CarteirinhaPasta {
  id: string;
  nome: string;
  descricao: string | null;
  logo_evento_path: string | null;
  validade: string | null;           // yyyy-mm-dd
  ano_letivo_id: string | null;
  arquivada: boolean;
  criado_por: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface CarteirinhaSubpasta {
  id: string;
  pasta_id: string;
  nome: string;
  professor_responsavel: string | null;
  ordem: number;
  ordenacao: Ordenacao;
  criado_em: string;
  atualizado_em: string;
}

export interface Emissao {
  id: string;
  documento: DocumentoCarteirinha;
  escopo: EscopoEmissao;
  quantidade: number;
  emitido_por: string | null;
  emitido_em: string;
}

/** Contadores de conferência (RF-CART-07). */
export interface Contadores { inscritos: number; sem_foto: number; sem_cpf: number; sem_nascimento: number }

export interface PastaResumo extends CarteirinhaPasta, Contadores {
  subpastas: number;
}

export interface SubpastaResumo extends CarteirinhaSubpasta, Contadores {
  ultima_emissao: Emissao | null;
}

export interface PastaDetalhe {
  pasta: CarteirinhaPasta;
  subpastas: SubpastaResumo[];
  totais: Contadores;
  ultima_emissao: Emissao | null;
}

export type PendenciaInscrito = 'sem_foto' | 'sem_cpf' | 'sem_nascimento';

export const ROTULO_PENDENCIA: Record<PendenciaInscrito, string> = {
  sem_foto: 'sem foto', sem_cpf: 'sem CPF', sem_nascimento: 'sem nascimento'
};

export interface InscritoDetalhe {
  aluno_id: string;
  /** Número na ficha de inscrição (#01, #02…), na ordem da subpasta. */
  numero: number;
  nome: string;                 // nome de exibição (social quando houver)
  codigo_activesoft: string | null;
  ra: string | null;
  serie_turma: string | null;   // turma escolar, não a do evento
  foto_path: string | null;
  foto_atualizada_em: string | null;
  pendencias: PendenciaInscrito[];
}

export interface Conferencia {
  /** Impede a emissão das carteirinhas: o cartão sairia incompleto em todos. */
  bloqueios: string[];
  /** Não impede: o campo sai com "—" ou o quadro "sem foto". */
  avisos: Contadores;
}

export interface SubpastaDetalhe {
  pasta: CarteirinhaPasta;
  subpasta: CarteirinhaSubpasta;
  inscritos: InscritoDetalhe[];
  conferencia: Conferencia;
  emissoes: Emissao[];
}

/** Onde o aluno está inscrito (ficha do aluno). */
export interface InscricaoDoAluno { pasta_id: string; pasta: string; subpasta_id: string; subpasta: string; arquivada: boolean }

/* ---------------- Documentos (fonte única da tela e do PDF) ---------------- */
// `logo`/`foto` são endereços prontos para o <img>: URL da API na tela,
// data URL no PDF (o Chromium não tem sessão). Quem monta decide.

export interface EventoDoc { nome: string; logo: string | null; validade: string | null /* dd/mm/aaaa */ }

/** Tamanho da fonte (pt) escolhido pelo comprimento: nunca corta letra. */
export type TamanhoTexto = 9 | 8 | 7;

export interface Cartao {
  aluno_id: string;
  turma: string;                // nome da subpasta
  nome: string;
  tamanho_nome: TamanhoTexto;
  /**
   * SEMPRE censurado (RNF-CART-06). O montador nunca recebe o CPF
   * completo neste objeto, para que um erro de template não o vaze.
   */
  cpf_censurado: string;
  data_nascimento: string;      // dd/mm/aaaa ou "—"
  foto: string | null;
}

export interface DocCarteirinhas {
  evento: EventoDoc & { tamanho_nome: TamanhoTexto };
  colegio: { nome: string; logo: string | null };
  cartoes: Cartao[];
}

export interface InscritoFicha {
  numero: number;
  aluno_id: string;
  nome: string;
  cpf: string;                  // completo e formatado: a direção atesta o documento
  data_nascimento: string;      // dd/mm/aaaa ou "—"
  foto: string | null;
}

export interface FolhaFicha {
  /** 15 vagas; as vazias têm só o número, para inscrição à mão (RF-FICHA-06). */
  vagas: { numero: number; inscrito: InscritoFicha | null }[];
  /** Inscritos impressos nesta folha — o N do atesto. */
  quantidade: number;
}

export interface DocFichaInscricao {
  evento: EventoDoc;
  subpasta: { nome: string; professor: string | null };
  diretor: string | null;
  folhas: FolhaFicha[];
}

export const CARTOES_POR_FOLHA = 4;
export const INSCRITOS_POR_FOLHA_FICHA = 15;
