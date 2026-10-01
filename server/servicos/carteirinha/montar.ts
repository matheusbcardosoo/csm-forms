// Montagem dos dois documentos das carteirinhas (08-carteirinhas §6.4).
// O mesmo objeto alimenta a pré-visualização da tela e o PDF — muda só
// como as imagens são endereçadas: URL da API na tela, data URL no PDF.
//
// Nada aqui é congelado: os documentos saem sempre com o dado atual.
import fs from 'fs';
import path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { nomeDeExibicao } from '../../../shared/formatos';
import { dataUrl, lerFoto, tipoDaImagem } from '../fotos';
import {
  INSCRITOS_POR_FOLHA_FICHA,
  type CarteirinhaPasta, type CarteirinhaSubpasta, type Cartao, type Conferencia, type Contadores,
  type DocCarteirinhas, type DocFichaInscricao, type FolhaFicha, type InscritoFicha, type InscritoDetalhe, type PendenciaInscrito, type TamanhoTexto
} from '../../../shared/types/carteirinha';

export const BUCKET_CARTEIRINHAS = 'carteirinhas';
export type Modo = 'tela' | 'pdf';

/** Aluno com o que os documentos e a conferência usam. */
export interface AlunoInscrito {
  id: string;
  nome: string;
  nome_social: string | null;
  data_nascimento: string | null;
  foto_path: string | null;
  foto_atualizada_em: string | null;
  codigo_activesoft: string | null;
  ra: string | null;
  serie_turma: string | null;
  ordem: number;
}

const SELECAO_ALUNO = 'id, nome, nome_social, data_nascimento, foto_path, foto_atualizada_em, codigo_activesoft, ra, matricula(turma, ano_letivo(ano), serie(nome))';

type LinhaAluno = Omit<AlunoInscrito, 'serie_turma' | 'ordem'> & {
  matricula: { turma: string | null; ano_letivo: { ano: number } | null; serie: { nome: string } | null }[] | null;
};

function serieTurma(a: LinhaAluno): string | null {
  const m = (a.matricula || []).filter(x => x.ano_letivo).sort((x, y) => y.ano_letivo!.ano - x.ano_letivo!.ano)[0];
  return m ? `${m.serie?.nome || ''}${m.turma ? ` ${m.turma}` : ''}`.trim() || null : null;
}

function paraInscrito(a: LinhaAluno, ordem: number): AlunoInscrito {
  const { matricula: _m, ...resto } = a;
  return { ...resto, serie_turma: serieTurma(a), ordem };
}

/** Ordem da subpasta = a numeração #01, #02… da ficha (RF-CART-06). */
export function ordenar(alunos: AlunoInscrito[], ordenacao: CarteirinhaSubpasta['ordenacao']): AlunoInscrito[] {
  const porNome = (a: AlunoInscrito, b: AlunoInscrito) => nomeDeExibicao(a).localeCompare(nomeDeExibicao(b), 'pt-BR', { sensitivity: 'base' });
  return [...alunos].sort(ordenacao === 'manual' ? (a, b) => a.ordem - b.ordem || porNome(a, b) : porNome);
}

export async function carregarPasta(db: SupabaseClient, id: string): Promise<CarteirinhaPasta | null> {
  const { data, error } = await db.from('carteirinha_pasta').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as CarteirinhaPasta | null;
}

export async function carregarSubpasta(db: SupabaseClient, id: string): Promise<{ pasta: CarteirinhaPasta; subpasta: CarteirinhaSubpasta; alunos: AlunoInscrito[] } | null> {
  const { data: sub, error } = await db.from('carteirinha_subpasta').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!sub) return null;
  const pasta = await carregarPasta(db, sub.pasta_id);
  if (!pasta) return null;
  const { data: ins, error: e2 } = await db.from('carteirinha_inscrito').select(`ordem, aluno(${SELECAO_ALUNO})`).eq('subpasta_id', id);
  if (e2) throw e2;
  const alunos = ((ins || []) as unknown as { ordem: number; aluno: LinhaAluno }[]).filter(i => i.aluno).map(i => paraInscrito(i.aluno, i.ordem));
  return { pasta, subpasta: sub as CarteirinhaSubpasta, alunos: ordenar(alunos, sub.ordenacao) };
}

export async function carregarAluno(db: SupabaseClient, id: string): Promise<AlunoInscrito | null> {
  const { data, error } = await db.from('aluno').select(SELECAO_ALUNO).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? paraInscrito(data as unknown as LinhaAluno, 0) : null;
}

/* ---------------- Conferência (RF-CART-15) ---------------- */

export function pendencias(a: Pick<AlunoInscrito, 'foto_path' | 'ra' | 'data_nascimento'>): PendenciaInscrito[] {
  const p: PendenciaInscrito[] = [];
  if (!a.foto_path) p.push('sem_foto');
  if (!(a.ra || '').trim()) p.push('sem_ra');
  if (!a.data_nascimento) p.push('sem_nascimento');
  return p;
}

export function contar(alunos: AlunoInscrito[]): Contadores {
  const c: Contadores = { inscritos: alunos.length, sem_foto: 0, sem_ra: 0, sem_nascimento: 0 };
  for (const a of alunos) for (const p of pendencias(a)) c[p]++;
  return c;
}

/** Bloqueia o que deixaria TODO cartão incompleto; o resto só avisa. */
export function conferir(pasta: CarteirinhaPasta, alunos: AlunoInscrito[]): Conferencia {
  const bloqueios: string[] = [];
  if (!pasta.validade) bloqueios.push('A pasta não tem data de validade — todo cartão sairia sem o "Válida até". Edite a pasta.');
  if (!pasta.logo_evento_path) bloqueios.push('A pasta não tem a logo do evento — o verso de todo cartão sairia em branco. Edite a pasta.');
  return { bloqueios, avisos: contar(alunos) };
}

export function detalharInscritos(alunos: AlunoInscrito[]): InscritoDetalhe[] {
  return alunos.map((a, i) => ({
    aluno_id: a.id, numero: i + 1, nome: nomeDeExibicao(a), codigo_activesoft: a.codigo_activesoft, ra: a.ra,
    serie_turma: a.serie_turma, foto_path: a.foto_path, foto_atualizada_em: a.foto_atualizada_em, pendencias: pendencias(a)
  }));
}

/* ---------------- Imagens ---------------- */

// a logo principal do colégio (a mesma dos formulários e dos PDFs de
// visita); o brasão é a marca da São Marcos School, não do colégio
const LOGO_PADRAO = path.resolve(__dirname, '..', '..', '..', 'public', 'images', 'logo.jpg');

/**
 * Resolve os endereços das imagens conforme o modo. No PDF tudo vira data
 * URL lida com o cliente de serviço (a rota interna não tem usuário); na
 * tela, URLs da API, que passam pela sessão e pela RLS.
 */
class Imagens {
  private cache = new Map<string, string | null>();
  constructor(private db: SupabaseClient, private modo: Modo) {}

  private async memo(chave: string, fn: () => Promise<string | null>) {
    if (!this.cache.has(chave)) this.cache.set(chave, await fn());
    return this.cache.get(chave)!;
  }

  async foto(a: Pick<AlunoInscrito, 'id' | 'foto_path' | 'foto_atualizada_em'>): Promise<string | null> {
    if (!a.foto_path) return null;
    if (this.modo === 'tela') return `/api/alunos/${a.id}/foto${a.foto_atualizada_em ? `?v=${encodeURIComponent(a.foto_atualizada_em)}` : ''}`;
    const f = await lerFoto(this.db, a.foto_path);
    return f ? dataUrl(f) : null;
  }

  async logoEvento(p: CarteirinhaPasta): Promise<string | null> {
    if (!p.logo_evento_path) return null;
    if (this.modo === 'tela') return `/api/carteirinhas/pastas/${p.id}/logo?v=${encodeURIComponent(p.atualizado_em)}`;
    return this.memo(`evento:${p.logo_evento_path}`, async () => {
      const { data, error } = await this.db.storage.from(BUCKET_CARTEIRINHAS).download(p.logo_evento_path!);
      if (error || !data) return null;
      const bytes = Buffer.from(await data.arrayBuffer());
      const tipo = tipoDaImagem(bytes);
      return tipo ? dataUrl({ bytes, tipo }) : null;
    });
  }

  async logoColegio(): Promise<string | null> {
    if (this.modo === 'tela') return '/api/carteirinhas/logo-colegio';
    return this.memo('colegio', async () => {
      const l = await logoDoColegio(this.db);
      return l ? dataUrl(l) : null;
    });
  }
}

/**
 * Logo do colégio: a do cadastro da instituição (bucket 'institucional'),
 * se houver, e a logo principal do site (public/images/logo.jpg) senão —
 * o cartão e a ficha nunca saem sem a marca do colégio.
 */
export async function logoDoColegio(db: SupabaseClient): Promise<{ bytes: Buffer; tipo: string } | null> {
  const { data: inst } = await db.from('instituicao').select('logo_path').maybeSingle();
  if (inst?.logo_path) {
    const { data, error } = await db.storage.from('institucional').download(inst.logo_path);
    if (!error && data) {
      const bytes = Buffer.from(await data.arrayBuffer());
      const tipo = tipoDaImagem(bytes);
      if (tipo) return { bytes, tipo };
    }
  }
  if (!fs.existsSync(LOGO_PADRAO)) return null;
  const bytes = fs.readFileSync(LOGO_PADRAO);
  return { bytes, tipo: tipoDaImagem(bytes) || 'image/jpeg' };
}

/* ---------------- Documentos ---------------- */

export function fmtDataBr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : '—';
}

/**
 * Fonte pelo comprimento, igual na tela e no PDF (as duas pontas usam o
 * mesmo número, e não uma medição que dependeria da fonte instalada).
 * Os limites cabem em duas linhas na largura do campo; acima de 7 pt não
 * se reduz mais e o texto quebra numa terceira linha em vez de cortar.
 */
export function tamanhoPorComprimento(texto: string, limites: [number, number]): TamanhoTexto {
  const n = texto.length;
  return n <= limites[0] ? 9 : n <= limites[1] ? 8 : 7;
}

async function montarCartao(img: Imagens, a: AlunoInscrito, turma: string): Promise<Cartao> {
  const nome = nomeDeExibicao(a);
  return {
    aluno_id: a.id,
    turma,
    nome,
    tamanho_nome: tamanhoPorComprimento(nome, [38, 48]),
    // o documento é o R.A.; o CPF nem é lido do banco (RNF-CART-06)
    ra: (a.ra || '').trim() || '—',
    data_nascimento: fmtDataBr(a.data_nascimento),
    foto: await img.foto(a)
  };
}

async function nomeDoColegio(db: SupabaseClient): Promise<string> {
  const { data } = await db.from('instituicao').select('nome_fantasia').maybeSingle();
  return data?.nome_fantasia || 'Colégio São Marcos';
}

export async function montarCarteirinhas(db: SupabaseClient, pasta: CarteirinhaPasta, subpasta: { nome: string }, alunos: AlunoInscrito[], modo: Modo): Promise<DocCarteirinhas> {
  const img = new Imagens(db, modo);
  const [logoEvento, logoColegio, nomeColegio] = await Promise.all([img.logoEvento(pasta), img.logoColegio(), nomeDoColegio(db)]);
  const cartoes: Cartao[] = [];
  // em lotes: 40 fotos de uma vez no Storage é pedir para tomar 429
  for (let i = 0; i < alunos.length; i += 8) {
    cartoes.push(...await Promise.all(alunos.slice(i, i + 8).map(a => montarCartao(img, a, subpasta.nome))));
  }
  return {
    evento: { nome: pasta.nome, logo: logoEvento, validade: pasta.validade ? fmtDataBr(pasta.validade) : null, tamanho_nome: tamanhoPorComprimento(pasta.nome, [30, 40]) },
    colegio: { nome: nomeColegio, logo: logoColegio },
    cartoes
  };
}

/** Diretor(a) ativo em Signatários (RF-FICHA-04); com `id`, o escolhido (RF-FICHA-08). */
export async function diretorAtivo(db: SupabaseClient, id?: string | null): Promise<string | null> {
  let q = db.from('instituicao_signatario').select('id, nome').eq('cargo', 'diretor').eq('ativo', true).order('ordem').order('criado_em').limit(1);
  if (id) q = q.eq('id', id);
  const { data, error } = await q;
  if (error) throw error;
  return data?.[0]?.nome || null;
}

export async function montarFichaInscricao(db: SupabaseClient, pasta: CarteirinhaPasta, subpasta: CarteirinhaSubpasta, alunos: AlunoInscrito[], modo: Modo, diretor: string | null): Promise<DocFichaInscricao> {
  const img = new Imagens(db, modo);
  const inscritos: InscritoFicha[] = [];
  for (let i = 0; i < alunos.length; i += 8) {
    inscritos.push(...await Promise.all(alunos.slice(i, i + 8).map(async (a, j) => ({
      numero: i + j + 1,
      aluno_id: a.id,
      nome: nomeDeExibicao(a),
      ra: (a.ra || '').trim() || '—',
      data_nascimento: fmtDataBr(a.data_nascimento),
      foto: await img.foto(a)
    }))));
  }
  // subpasta vazia ainda gera uma folha: serve para inscrição à mão
  const nFolhas = Math.max(1, Math.ceil(inscritos.length / INSCRITOS_POR_FOLHA_FICHA));
  const folhas: FolhaFicha[] = [];
  for (let f = 0; f < nFolhas; f++) {
    const vagas = Array.from({ length: INSCRITOS_POR_FOLHA_FICHA }, (_, k) => {
      const numero = f * INSCRITOS_POR_FOLHA_FICHA + k + 1;
      return { numero, inscrito: inscritos[numero - 1] || null };
    });
    folhas.push({ vagas, quantidade: vagas.filter(v => v.inscrito).length });
  }
  return {
    evento: { nome: pasta.nome, logo: await img.logoEvento(pasta), validade: pasta.validade ? fmtDataBr(pasta.validade) : null },
    colegio: { logo: await img.logoColegio() },
    subpasta: { nome: subpasta.nome, professor: subpasta.professor_responsavel },
    diretor,
    folhas
  };
}
