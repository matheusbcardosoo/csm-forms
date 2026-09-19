// Adaptador da API do Activesoft (SigaWeb) — implementação real.
//
// Baseado no schema OpenAPI público do parceiro (Swagger 2.0, título
// "SigaWeb API", version "v0"), obtido em 19/09/2026 em
// https://siga03.activesoft.com.br/docs/?format=openapi (a UI em /docs/
// exige login, mas o JSON do schema é servido sem autenticação). Ver
// docs/03-integracao-activesoft.md §8 para o checklist respondido.
//
// Autenticação: um único token Bearer por instituição — não há OAuth2
// nem client_id/secret nesta API. ACTIVESOFT_CLIENT_ID/SECRET/TENANT do
// .env.example não são usados por este cliente (mantidos só por
// compatibilidade, caso uma versão futura da API mude o esquema). O
// parâmetro "version" do caminho é sempre "0", fixado pela própria
// documentação do parceiro.
//
// Lacunas confirmadas no schema (nenhuma delas bloqueia o adaptador —
// só limitam o que ele consegue trazer sozinho):
//  - Não existe parâmetro de período/ano letivo em nenhum endpoint (nem
//    em lista_turmas, nem em enturmacao_com_detalhes): por padrão, ambos
//    devolvem o "ano atual" do SIGA. Filtramos as turmas retornadas pelo
//    campo sigla_periodo — se o ano pedido não estiver entre os que o
//    SIGA está expondo como corrente, a busca dá zero resultados. Vale
//    confirmar com a Activesoft se existe algum parâmetro não documentado
//    para anos anteriores antes de depender disto para reimportar
//    históricos antigos.
//  - Não existe nota final anual, nem campos de recuperação/conselho de
//    classe: só notas por "fase" (bimestre/trimestre/etc., endpoint
//    aluno_notas). O valor importado é a média aritmética simples das
//    fases já lançadas — é um rascunho; a secretaria confere na grade de
//    notas (F4, com auditoria) antes de emitir o histórico.
//  - Não existe carga horária por disciplina (só "aulas dadas", que não é
//    a mesma unidade) — capacidades().cargaHoraria fica false, como já
//    era no stub; o histórico usa os totais da versão curricular local.
//  - Documentos do aluno (RG, naturalidade, nacionalidade) exigem o
//    escopo "dados_complementares" no token; se o token não tiver esse
//    escopo, seguimos sem esses campos (aviso no console) em vez de
//    falhar a importação inteira.
import { z, type ZodType } from 'zod';
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

const VERSAO_API = '0';
const TENTATIVAS_MAX = 3;
const TENTATIVAS_429_MAX = 5;
const BACKOFF_BASE_MS = 500;

// ---------- schemas (Zod) dos formatos brutos da API ------------------
// `.passthrough()` em todos: a API pode adicionar campos sem aviso, só
// validamos o que este adaptador de fato lê.

const alunoBasicoSchema = z.object({
  id: z.number(),
  matricula: z.string().nullable().optional(),
  nome: z.string(),
  cpf: z.string().nullable().optional(),
  sexo: z.string().nullable().optional(),
  data_nascimento: z.string().nullable().optional(),
  filiacao_1_id: z.number().nullable().optional(),
  filiacao_2_id: z.number().nullable().optional(),
  registro_aluno_ra: z.string().nullable().optional()
}).passthrough();

const alunoSensivelSchema = z.object({
  id: z.number(),
  nome_civil: z.string().nullable().optional(),
  rg: z.string().nullable().optional(),
  rg_orgao_emissao: z.string().nullable().optional(),
  rg_orgao_emissao_uf: z.string().nullable().optional(),
  naturalidade_cidade: z.string().nullable().optional(),
  naturalidade_uf: z.string().nullable().optional(),
  nacionalidade: z.string().nullable().optional(),
  cpf: z.string().nullable().optional(),
  sexo: z.string().nullable().optional(),
  mae_id: z.number().nullable().optional(),
  pai_id: z.number().nullable().optional()
}).passthrough();

const responsavelSchema = z.object({
  id: z.number(),
  nome: z.string()
}).passthrough();

const turmaSchema = z.object({
  id: z.number(),
  serie_id: z.number().nullable().optional(),
  serie_nome: z.string().nullable().optional(),
  serie_codigo: z.string().nullable().optional(),
  nome: z.union([z.string(), z.number()]).nullable().optional(),
  sigla_periodo: z.union([z.string(), z.number()]).nullable().optional(),
  sigla_turma: z.string().nullable().optional()
}).passthrough();

const enturmacaoDetalheSchema = z.object({
  turma_id: z.number(),
  aluno_id: z.number(),
  data_efetivacao_matricula: z.string().nullable().optional(),
  situacao_aluno_turma: z.string().nullable().optional()
}).passthrough();

const faseNotaSchema = z.object({
  id_fase_nota: z.number(),
  nota_fase: z.number().nullable().optional(),
  nota_fase_exibicao: z.string().nullable().optional(),
  faltas: z.number().nullable().optional(),
  fase_informada: z.boolean().nullable().optional()
}).passthrough();

const disciplinaNotasSchema = z.object({
  id_disciplina: z.number(),
  nome: z.string(),
  tipo_composicao: z.string().nullable().optional(),
  situacao_atual: z.string().nullable().optional(),
  fases: z.array(faseNotaSchema).default([])
}).passthrough();

const alunoNotasSchema = z.object({
  disciplinas: z.array(disciplinaNotasSchema).default([])
}).passthrough();

const parametroSchema = z.object({
  codigo: z.string().nullable().optional(),
  token_portal: z.string().nullable().optional()
}).passthrough();

type Turma = z.infer<typeof turmaSchema>;
type EnturmacaoDetalhe = z.infer<typeof enturmacaoDetalheSchema>;

function envelopeSchema<T extends ZodType>(item: T) {
  return z.union([
    z.array(item),
    z.object({
      next: z.string().nullable().optional(),
      results: z.array(item)
    }).passthrough()
  ]);
}

// ---------- HTTP: montagem de URL, retry/backoff, validação -----------

function montarUrl(cfg: ConfigActivesoft, caminho: string, query: Record<string, string | number | boolean | undefined>): string {
  const base = (cfg.baseUrl || '').replace(/\/+$/, '');
  const url = new URL(`${base}/api/v${VERSAO_API}${caminho}`);
  for (const [chave, valor] of Object.entries(query)) {
    if (valor !== undefined && valor !== null) url.searchParams.set(chave, String(valor));
  }
  return url.toString();
}

function aguardar(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** GET com timeout, 3 tentativas com backoff exponencial em erro de rede/5xx, e respeito a Retry-After em 429 (RNF-05, docs/03 §7). */
async function requisitar(cfg: ConfigActivesoft, url: string): Promise<Response> {
  for (let tentativa = 1, tentativas429 = 1; ; ) {
    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), cfg.timeoutMs);
    let resp: Response;
    try {
      resp = await fetch(url, { headers: { Authorization: `Bearer ${cfg.apiKey}`, Accept: 'application/json' }, signal: controle.signal });
    } catch (err) {
      clearTimeout(timer);
      const abortou = err instanceof Error && err.name === 'AbortError';
      const msg = abortou ? `tempo esgotado (${cfg.timeoutMs}ms)` : err instanceof Error ? err.message : String(err);
      if (tentativa >= TENTATIVAS_MAX) throw new Error(`Activesoft API — falha de rede em ${url} após ${tentativa} tentativa(s): ${msg}`);
      await aguardar(BACKOFF_BASE_MS * 2 ** (tentativa - 1));
      tentativa++;
      continue;
    }
    clearTimeout(timer);
    if (resp.status === 429) {
      if (tentativas429 >= TENTATIVAS_429_MAX) throw new Error(`Activesoft API — limite de requisições (429) persistente em ${url}`);
      const retryAfter = Number(resp.headers.get('retry-after'));
      const espera = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : BACKOFF_BASE_MS * 2 ** (tentativas429 - 1);
      await aguardar(espera);
      tentativas429++;
      continue;
    }
    if (resp.status >= 500 && tentativa < TENTATIVAS_MAX) {
      await aguardar(BACKOFF_BASE_MS * 2 ** (tentativa - 1));
      tentativa++;
      continue;
    }
    return resp;
  }
}

async function chamar<T>(cfg: ConfigActivesoft, caminho: string, query: Record<string, string | number | boolean | undefined>, schema: ZodType<T>): Promise<T> {
  if (!cfg.baseUrl) throw new Error('ACTIVESOFT_BASE_URL não configurada.');
  if (!cfg.apiKey) throw new Error('ACTIVESOFT_API_KEY não configurada (token Bearer da instituição).');
  const url = montarUrl(cfg, caminho, query);
  const resp = await requisitar(cfg, url);
  if (!resp.ok) {
    const corpo = await resp.text().catch(() => '');
    throw new Error(`Activesoft API — ${resp.status} ${resp.statusText} em ${caminho}${corpo ? ': ' + corpo.slice(0, 300) : ''}`);
  }
  let bruto: unknown;
  try {
    bruto = await resp.json();
  } catch {
    throw new Error(`Activesoft API — resposta não é JSON válido em ${caminho}`);
  }
  const validado = schema.safeParse(bruto);
  if (!validado.success) {
    const problemas = validado.error.issues.slice(0, 5).map(i => `${i.path.join('.') || '(raiz)'}: ${i.message}`).join('; ');
    throw new Error(`Activesoft API — resposta em formato inesperado em ${caminho} (${problemas}) — payload: ${JSON.stringify(bruto).slice(0, 500)}`);
  }
  return validado.data;
}

/** Percorre todas as páginas (limit/offset) de um endpoint de listagem. */
async function paginarTudo<T>(cfg: ConfigActivesoft, caminho: string, itemSchema: ZodType<T>): Promise<T[]> {
  const schema = envelopeSchema(itemSchema);
  const itens: T[] = [];
  let offset = 0;
  for (;;) {
    const pagina = await chamar(cfg, caminho, { limit: cfg.paginaTamanho, offset }, schema);
    const lote = Array.isArray(pagina) ? pagina : pagina.results;
    itens.push(...lote);
    const acabou = Array.isArray(pagina) ? true : !pagina.next;
    if (acabou || lote.length === 0) break;
    offset += cfg.paginaTamanho;
    if (offset > 500000) throw new Error(`Activesoft API — paginação sem fim em ${caminho}`);
  }
  return itens;
}

/** Executa `fn` para cada item com no máximo `limite` chamadas em paralelo. */
async function mapComLimite<T, R>(itens: T[], limite: number, fn: (item: T, indice: number) => Promise<R>): Promise<R[]> {
  const resultado: R[] = new Array(itens.length);
  let proximo = 0;
  async function trabalhador() {
    for (;;) {
      const i = proximo++;
      if (i >= itens.length) return;
      resultado[i] = await fn(itens[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limite, itens.length)) }, trabalhador));
  return resultado;
}

// ---------- adaptador ---------------------------------------------------

export class AdaptadorActivesoftApi implements AdaptadorAcademico {
  nome = 'API Activesoft';
  origem = 'activesoft_api' as const;

  private cacheMatriculas = new Map<string, Promise<{ turmas: Turma[]; enturmacoes: EnturmacaoDetalhe[] }>>();

  constructor(private cfg: ConfigActivesoft) {}

  async testarConexao() {
    if (!this.cfg.baseUrl) return { ok: false, detalhe: 'ACTIVESOFT_BASE_URL não configurada.' };
    if (!this.cfg.apiKey) return { ok: false, detalhe: 'ACTIVESOFT_API_KEY não configurada (token Bearer da instituição, gerado no painel do Activesoft).' };
    try {
      const parametro = await chamar(this.cfg, '/parametro/', {}, parametroSchema);
      return { ok: true, detalhe: `Conectado a ${this.cfg.baseUrl} (código ${parametro.codigo ?? '—'}).` };
    } catch (err) {
      return { ok: false, detalhe: err instanceof Error ? err.message : String(err) };
    }
  }

  capacidades(): Capacidades {
    // Ver notas no topo do arquivo: sem delta (nenhum endpoint aceita
    // filtro por data), sem carga horária (só "aulas dadas"). Situação
    // final e faltas vêm de enturmacao_com_detalhes e aluno_notas.
    // Documentos do aluno dependem do escopo "dados_complementares".
    return { delta: false, cargaHoraria: false, situacaoFinal: true, faltas: true, documentosAluno: true, paginacao: true };
  }

  /** Turmas do ano/série/turma pedidos + enturmações correspondentes, com cache por filtro (uma importação chama isto 3x: alunos, matrículas, notas). */
  private async matriculasBrutas(f: FiltroImportacao): Promise<{ turmas: Turma[]; enturmacoes: EnturmacaoDetalhe[] }> {
    const chave = `${f.anoLetivo}|${f.serieCodigoOrigem ?? ''}|${f.turma ?? ''}|${f.alunoCodigoOrigem ?? ''}`;
    const emCache = this.cacheMatriculas.get(chave);
    if (emCache) return emCache;

    const promessa = (async (): Promise<{ turmas: Turma[]; enturmacoes: EnturmacaoDetalhe[] }> => {
      const todasTurmas = await paginarTudo(this.cfg, '/lista_turmas/', turmaSchema);
      const alvoTurma = f.turma?.trim().toUpperCase();
      // lista_turmas não documenta filtro de período: filtramos pelo ano
      // embutido em sigla_periodo. Se o ano pedido não estiver entre os
      // que o SIGA está expondo como "atuais", o resultado é vazio.
      const turmasDoAno = todasTurmas.filter(t => {
        const ano = parseInt(String(t.sigla_periodo ?? '').trim(), 10);
        if (ano !== f.anoLetivo) return false;
        if (f.serieCodigoOrigem && t.serie_codigo !== f.serieCodigoOrigem) return false;
        if (alvoTurma) {
          const nome = String(t.nome ?? '').trim().toUpperCase();
          const sigla = (t.sigla_turma ?? '').trim().toUpperCase();
          if (nome !== alvoTurma && sigla !== alvoTurma) return false;
        }
        return true;
      });
      if (!turmasDoAno.length) return { turmas: [], enturmacoes: [] };

      const idsTurma = new Set(turmasDoAno.map(t => t.id));
      // enturmacao_com_detalhes também não filtra por turma: paginamos o
      // total e filtramos aqui.
      const todasEnturmacoes = await paginarTudo(this.cfg, '/enturmacao_com_detalhes/', enturmacaoDetalheSchema);
      let enturmacoes = todasEnturmacoes.filter(e => idsTurma.has(e.turma_id));
      if (f.alunoCodigoOrigem) enturmacoes = enturmacoes.filter(e => String(e.aluno_id) === f.alunoCodigoOrigem);
      return { turmas: turmasDoAno, enturmacoes };
    })();
    this.cacheMatriculas.set(chave, promessa);
    return promessa;
  }

  private pagina<T>(itens: T[]): ResultadoBusca<T> {
    return { itens, paginaAtual: 1, totalPaginas: 1, totalItens: itens.length };
  }

  async buscarMatriculas(f: FiltroImportacao): Promise<ResultadoBusca<MatriculaOrigem>> {
    const { turmas: turmasDoAno, enturmacoes } = await this.matriculasBrutas(f);
    const turmaPorId = new Map(turmasDoAno.map(t => [t.id, t]));
    const itens: MatriculaOrigem[] = enturmacoes.map(e => {
      const t = turmaPorId.get(e.turma_id);
      return {
        codigoOrigem: `${e.aluno_id}-${e.turma_id}`,
        alunoCodigoOrigem: String(e.aluno_id),
        anoLetivo: f.anoLetivo,
        serieCodigoOrigem: t?.serie_codigo || String(t?.serie_id ?? ''),
        serieDescricao: t?.serie_nome ?? undefined,
        turma: (t?.nome != null ? String(t.nome) : t?.sigla_turma) ?? undefined,
        dataMatricula: e.data_efetivacao_matricula ? e.data_efetivacao_matricula.slice(0, 10) : undefined,
        // texto cru — traduzido em servicos/importacao.ts (traduzirSituacaoMatricula)
        situacaoFinal: e.situacao_aluno_turma ?? undefined
      };
    });
    return this.pagina(itens);
  }

  async buscarAlunos(f: FiltroImportacao): Promise<ResultadoBusca<AlunoOrigem>> {
    const { enturmacoes } = await this.matriculasBrutas(f);
    if (!enturmacoes.length) return this.pagina([]);
    const idsAluno = new Set(enturmacoes.map(e => e.aluno_id));

    const basicos = await paginarTudo(this.cfg, '/lista_alunos/', alunoBasicoSchema);
    const porId = new Map(basicos.filter(a => idsAluno.has(a.id)).map(a => [a.id, a]));

    const sensiveisPorId = new Map<number, z.infer<typeof alunoSensivelSchema>>();
    try {
      for (const s of await paginarTudo(this.cfg, '/lista_alunos_dados_sensiveis/', alunoSensivelSchema)) sensiveisPorId.set(s.id, s);
    } catch (err) {
      console.warn('[activesoft] lista_alunos_dados_sensiveis indisponível (falta o escopo "dados_complementares" no token?) — seguindo sem naturalidade/RG/nacionalidade.', err instanceof Error ? err.message : err);
    }

    const responsaveisPorId = new Map<number, string>();
    try {
      for (const r of await paginarTudo(this.cfg, '/lista_responsaveis/', responsavelSchema)) responsaveisPorId.set(r.id, r.nome);
    } catch (err) {
      console.warn('[activesoft] lista_responsaveis indisponível — seguindo sem nome de filiação.', err instanceof Error ? err.message : err);
    }

    const itens: AlunoOrigem[] = [];
    for (const id of idsAluno) {
      const base = porId.get(id);
      if (!base) continue; // aluno enturmado mas ausente em lista_alunos — inconsistência da origem, ignora
      const sens = sensiveisPorId.get(id);
      const sexoBruto = (sens?.sexo ?? base.sexo ?? '').toUpperCase();
      const filiacao1Id = sens?.mae_id ?? base.filiacao_1_id ?? undefined;
      const filiacao2Id = sens?.pai_id ?? base.filiacao_2_id ?? undefined;
      itens.push({
        codigoOrigem: String(base.id),
        nome: base.nome,
        dataNascimento: base.data_nascimento ? base.data_nascimento.slice(0, 10) : undefined,
        municipioNascimento: sens?.naturalidade_cidade ?? undefined,
        ufNascimento: sens?.naturalidade_uf ?? undefined,
        nacionalidade: sens?.nacionalidade ?? undefined,
        sexo: sexoBruto === 'M' ? 'M' : sexoBruto === 'F' ? 'F' : sexoBruto ? 'outro' : undefined,
        rg: sens?.rg ?? undefined,
        rgOrgao: sens?.rg_orgao_emissao ?? undefined,
        rgUf: sens?.rg_orgao_emissao_uf ?? undefined,
        cpf: sens?.cpf ?? base.cpf ?? undefined,
        ra: base.registro_aluno_ra ?? undefined,
        filiacao1: filiacao1Id != null ? responsaveisPorId.get(filiacao1Id) : undefined,
        filiacao2: filiacao2Id != null ? responsaveisPorId.get(filiacao2Id) : undefined
      });
    }
    return this.pagina(itens);
  }

  async buscarNotas(f: FiltroImportacao): Promise<ResultadoBusca<NotaOrigem>> {
    const { enturmacoes } = await this.matriculasBrutas(f);
    if (!enturmacoes.length) return this.pagina([]);

    // aluno_notas exige aluno_id + turma_id por chamada — não há busca em
    // lote. Limitamos a concorrência para não estourar um limite de
    // requisições não documentado.
    const respostas = await mapComLimite(enturmacoes, 5, async e => {
      try {
        return await chamar(this.cfg, '/aluno_notas/', { aluno_id: e.aluno_id, turma_id: e.turma_id }, alunoNotasSchema);
      } catch (err) {
        console.warn(`[activesoft] aluno_notas falhou (aluno ${e.aluno_id}, turma ${e.turma_id}) — sem notas para esta matrícula.`, err instanceof Error ? err.message : err);
        return null;
      }
    });

    const itens: NotaOrigem[] = [];
    respostas.forEach((dados, i) => {
      if (!dados) return;
      const e = enturmacoes[i];
      const matriculaCodigoOrigem = `${e.aluno_id}-${e.turma_id}`;
      for (const disc of dados.disciplinas) {
        if (disc.tipo_composicao === 'C') continue; // disciplina-pai de composição: sem nota própria, só agrega as componentes
        const fasesLancadas = disc.fases.filter(fs => fs.fase_informada);
        if (!fasesLancadas.length) continue;
        const numericas = fasesLancadas.map(fs => fs.nota_fase).filter((n): n is number => typeof n === 'number');
        const faltas = fasesLancadas.reduce((soma, fs) => soma + (fs.faltas ?? 0), 0);
        const ultimaExibicao = [...fasesLancadas].reverse().find(fs => fs.nota_fase_exibicao)?.nota_fase_exibicao;
        itens.push({
          matriculaCodigoOrigem,
          disciplinaCodigoOrigem: String(disc.id_disciplina),
          disciplinaDescricao: disc.nome,
          // Sem nota final anual na API: média simples das fases já
          // lançadas. É rascunho — conferir na grade de notas (F4) antes
          // de emitir o histórico.
          valor: numericas.length ? Math.round((numericas.reduce((a, b) => a + b, 0) / numericas.length) * 10) / 10 : undefined,
          conceito: numericas.length === 0 ? ultimaExibicao ?? undefined : undefined,
          faltas,
          // texto cru — traduzido em servicos/importacao.ts (traduzirSituacaoNota)
          situacao: disc.situacao_atual ?? undefined
        });
      }
    });
    return this.pagina(itens);
  }
}
