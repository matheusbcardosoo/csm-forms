// Interface do adaptador acadêmico (03-integracao §3). Implementações:
// ActivesoftApi (stub até a documentação), ArquivoCsv, Mock.
import type { AlunoOrigem, MatriculaOrigem, NotaOrigem, ResultadoBusca, FiltroImportacao, Capacidades, OrigemImportacao } from '../../../shared/types/importacao';

export type { AlunoOrigem, MatriculaOrigem, NotaOrigem, ResultadoBusca, FiltroImportacao, Capacidades };

export interface AdaptadorAcademico {
  nome: string;
  origem: OrigemImportacao;
  testarConexao(): Promise<{ ok: boolean; detalhe?: string }>;
  buscarAlunos(f: FiltroImportacao, pagina?: number): Promise<ResultadoBusca<AlunoOrigem>>;
  buscarMatriculas(f: FiltroImportacao, pagina?: number): Promise<ResultadoBusca<MatriculaOrigem>>;
  buscarNotas(f: FiltroImportacao, pagina?: number): Promise<ResultadoBusca<NotaOrigem>>;
  capacidades(): Capacidades;
}

/** Percorre todas as páginas de uma busca. */
export async function buscarTudo<T>(buscar: (pagina: number) => Promise<ResultadoBusca<T>>): Promise<T[]> {
  const itens: T[] = [];
  let pagina = 1;
  for (;;) {
    const r = await buscar(pagina);
    itens.push(...r.itens);
    if (!r.totalPaginas || pagina >= r.totalPaginas || r.itens.length === 0) break;
    pagina++;
    if (pagina > 500) throw new Error('Paginação sem fim no adaptador.');
  }
  return itens;
}
