export interface Instituicao {
  id: string;
  razao_social: string | null;
  nome_fantasia: string;
  cnpj: string | null;
  codigo_inep: string | null;
  endereco_logradouro: string | null;
  endereco_numero: string | null;
  endereco_complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
  telefone: string | null;
  telefone_secundario: string | null;
  email: string | null;
  site: string | null;
  mantenedora_nome: string | null;
  mantenedora_cnpj: string | null;
  orgao_regional: string | null;
  logo_path: string | null;
  brasao_path: string | null;
  atualizado_em?: string;
}

export type TipoAtoLegal = 'criacao' | 'autorizacao' | 'reconhecimento' | 'renovacao' | 'programa' | 'outro';

export const ROTULO_TIPO_ATO: Record<TipoAtoLegal, string> = {
  criacao: 'Criação',
  autorizacao: 'Autorização de funcionamento',
  reconhecimento: 'Reconhecimento',
  renovacao: 'Renovação',
  programa: 'Programa',
  outro: 'Outro'
};

export interface AtoLegal {
  id: string;
  instituicao_id: string;
  tipo: TipoAtoLegal;
  rotulo: string;
  instrumento: string;
  numero: string | null;
  orgao_emissor: string | null;
  data_ato: string | null;
  veiculo_publicacao: string;
  data_publicacao: string | null;
  texto_impresso: string | null;
  observacao: string | null;
  curso_id: string | null;
  ordem: number;
  ativo: boolean;
}

export type CargoSignatario = 'diretor' | 'vice_diretor' | 'secretario';

export const ROTULO_CARGO: Record<CargoSignatario, string> = {
  diretor: 'Diretor(a)',
  vice_diretor: 'Vice-diretor(a)',
  secretario: 'Secretário(a) escolar'
};

export interface Signatario {
  id: string;
  instituicao_id: string;
  nome: string;
  cargo: CargoSignatario;
  cargo_impresso: string;
  rg: string | null;
  registro_autorizacao: string | null;
  assinatura_path: string | null;
  ativo: boolean;
  ordem: number;
}

export interface AnoLetivo {
  id: string;
  ano: number;
  data_inicio: string | null;
  data_fim: string | null;
  dias_letivos: number | null;
  situacao: 'aberto' | 'encerrado';
}

/** Formata a data ISO (yyyy-mm-dd) como no cabeçalho do documento: dd-mm-aaaa. */
export function dataAto(iso: string | null | undefined): string {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return d && m && a ? `${d}-${m}-${a}` : iso;
}

/**
 * Linha do cabeçalho do histórico para um ato legal (05-modelo-historico §1.1):
 *   "Autorização de Funcionamento - Portaria de 16-03-2012 - DOE 28-03-2012"
 *   "Ensino Bilíngue - Portaria 11-01-2022 - DOE 12-01-2022"
 * Mesma função usada na pré-visualização e no PDF (RNF-04).
 */
export function linhaAto(ato: Pick<AtoLegal, 'rotulo' | 'instrumento' | 'numero' | 'data_ato' | 'veiculo_publicacao' | 'data_publicacao' | 'texto_impresso'>): string {
  if (ato.texto_impresso && ato.texto_impresso.trim()) return ato.texto_impresso.trim();
  const partes: string[] = [];
  if (ato.rotulo) partes.push(ato.rotulo.trim());
  const instrumento = (ato.instrumento || '').trim();
  if (ato.numero && ato.numero.trim()) {
    partes.push(`${instrumento} nº ${ato.numero.trim()}${ato.data_ato ? ` de ${dataAto(ato.data_ato)}` : ''}`.trim());
  } else if (ato.data_ato) {
    partes.push(`${instrumento} de ${dataAto(ato.data_ato)}`.trim());
  } else if (instrumento) {
    partes.push(instrumento);
  }
  if (ato.data_publicacao) {
    partes.push(`${(ato.veiculo_publicacao || 'DOE').trim()} ${dataAto(ato.data_publicacao)}`);
  }
  return partes.filter(Boolean).join(' - ');
}

/** Linhas do cabeçalho institucional, na ordem em que saem no papel. */
export function linhasCabecalho(inst: Pick<Instituicao, 'nome_fantasia' | 'mantenedora_nome' | 'orgao_regional'> | null, atos: AtoLegal[]): { titulo: string; linhas: string[] } {
  const titulo = (inst?.nome_fantasia || 'Colégio São Marcos').toUpperCase();
  const linhas: string[] = [];
  if (inst?.mantenedora_nome) linhas.push(`Entidade Mantenedora: ${inst.mantenedora_nome}`);
  atos
    .filter(a => a.ativo)
    .sort((a, b) => a.ordem - b.ordem)
    .forEach(a => { const l = linhaAto(a); if (l) linhas.push(l); });
  if (inst?.orgao_regional) linhas.push(inst.orgao_regional);
  return { titulo, linhas };
}
