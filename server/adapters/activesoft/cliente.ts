// Adaptador da API do Activesoft — STUB. A documentação da API ainda não
// foi analisada (03-integracao §8); este arquivo é o único lugar que
// mudará quando ela chegar. Até lá, testarConexao() explica a situação e
// as buscas falham com mensagem clara, sem derrubar o resto do sistema
// (RNF-05).
import type { AdaptadorAcademico, Capacidades, FiltroImportacao, ResultadoBusca, AlunoOrigem, MatriculaOrigem, NotaOrigem } from './tipos';

export interface ConfigActivesoft {
  baseUrl?: string;
  authTipo?: string;
  clientId?: string;
  clientSecret?: string;
  apiKey?: string;
  tenant?: string;
  timeoutMs: number;
  paginaTamanho: number;
}

export function configDoAmbiente(env: NodeJS.ProcessEnv): ConfigActivesoft {
  return {
    baseUrl: env.ACTIVESOFT_BASE_URL || undefined,
    authTipo: env.ACTIVESOFT_AUTH_TIPO || undefined,
    clientId: env.ACTIVESOFT_CLIENT_ID || undefined,
    clientSecret: env.ACTIVESOFT_CLIENT_SECRET || undefined,
    apiKey: env.ACTIVESOFT_API_KEY || undefined,
    tenant: env.ACTIVESOFT_TENANT || undefined,
    timeoutMs: Number(env.ACTIVESOFT_TIMEOUT_MS) || 30000,
    paginaTamanho: Number(env.ACTIVESOFT_PAGINA_TAMANHO) || 100
  };
}

const PENDENTE = 'Adaptador da API do Activesoft ainda não implementado — depende da documentação da API (docs/03-integracao-activesoft.md §8). Use o adaptador "arquivo" (CSV) ou "mock" enquanto isso.';

export class AdaptadorActivesoftApi implements AdaptadorAcademico {
  nome = 'API Activesoft';
  origem = 'activesoft_api' as const;
  constructor(private cfg: ConfigActivesoft) {}

  async testarConexao() {
    if (!this.cfg.baseUrl) return { ok: false, detalhe: 'ACTIVESOFT_BASE_URL não configurada. ' + PENDENTE };
    return { ok: false, detalhe: PENDENTE };
  }

  capacidades(): Capacidades {
    // Desconhecidas até a documentação: assume o mínimo, para a interface
    // avisar que carga horária e documentos podem vir da matriz/cadastro local.
    return { delta: false, cargaHoraria: false, situacaoFinal: false, faltas: false, documentosAluno: false, paginacao: true };
  }

  async buscarAlunos(_f: FiltroImportacao, _p?: number): Promise<ResultadoBusca<AlunoOrigem>> { throw new Error(PENDENTE); }
  async buscarMatriculas(_f: FiltroImportacao, _p?: number): Promise<ResultadoBusca<MatriculaOrigem>> { throw new Error(PENDENTE); }
  async buscarNotas(_f: FiltroImportacao, _p?: number): Promise<ResultadoBusca<NotaOrigem>> { throw new Error(PENDENTE); }
}
