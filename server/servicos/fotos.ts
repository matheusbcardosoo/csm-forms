// Foto do aluno (08-carteirinhas §3.1, §6.2). Mora fora de importacao.ts
// de propósito: lá fica uma chamada só, aqui fica a regra.
//
// Duas cópias por aluno no bucket 'alunos-fotos', sem extensão (o tipo é
// lido dos bytes, não do nome):
//   activesoft/{id} — a última foto vinda da origem
//   manual/{id}     — a enviada pela secretaria
// `aluno.foto_path` aponta para a que vale. Guardar a da origem mesmo
// quando a manual manda é o que deixa "Voltar à foto do Activesoft"
// instantâneo, sem depender de a origem estar no ar (RNF-CART-05).
//
// LGPD: o link da origem nunca vai para log, relatório ou mensagem de
// erro — pode ser assinado e dar acesso à foto de um menor.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ResumoFotos } from '../../shared/types/importacao';

export const BUCKET_FOTOS = 'alunos-fotos';
export const FOTO_MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const CONCORRENCIA = 4;

export type TipoImagem = 'image/jpeg' | 'image/png' | 'image/webp';

/** Tipo pela assinatura dos bytes. Nada de confiar no Content-Type de quem mandou. */
export function tipoDaImagem(b: Buffer): TipoImagem | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export const caminhoFoto = (alunoId: string, origem: 'activesoft' | 'manual') => `${origem}/${alunoId}`;

/** Erro de download com mensagem segura para o relatório (sem o link). */
class FalhaFoto extends Error {}

/** Baixa a foto da origem: timeout de 10 s, até 5 MB, só JPEG/PNG/WebP. */
export async function baixarFotoOrigem(url: string): Promise<{ bytes: Buffer; tipo: TipoImagem }> {
  let bytes: Buffer;
  if (url.startsWith('data:')) {
    // o adaptador mock entrega a foto inline, sem rede
    const virgula = url.indexOf(',');
    if (virgula < 0 || !url.slice(0, virgula).endsWith(';base64')) throw new FalhaFoto('formato de foto não reconhecido');
    bytes = Buffer.from(url.slice(virgula + 1), 'base64');
  } else {
    if (!/^https:\/\//i.test(url)) throw new FalhaFoto('endereço da foto não é https');
    const ctl = new AbortController();
    const relogio = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(url, { signal: ctl.signal, redirect: 'follow' });
      if (!r.ok) throw new FalhaFoto(r.status === 403 ? 'a origem recusou o download (link expirado?)' : `a origem respondeu ${r.status}`);
      const tamanho = Number(r.headers.get('content-length') || 0);
      if (tamanho > FOTO_MAX_BYTES) throw new FalhaFoto('foto acima de 5 MB');
      bytes = Buffer.from(await r.arrayBuffer());
    } catch (err) {
      if (err instanceof FalhaFoto) throw err;
      throw new FalhaFoto((err as Error).name === 'AbortError' ? 'a origem demorou mais de 10 s' : 'falha de rede ao baixar a foto');
    } finally {
      clearTimeout(relogio);
    }
  }
  if (bytes.length > FOTO_MAX_BYTES) throw new FalhaFoto('foto acima de 5 MB');
  const tipo = tipoDaImagem(bytes);
  if (!tipo) throw new FalhaFoto('o arquivo da origem não é JPEG, PNG nem WebP');
  return { bytes, tipo };
}

export async function gravarArquivoFoto(db: SupabaseClient, caminho: string, bytes: Buffer, tipo: TipoImagem): Promise<void> {
  const { error } = await db.storage.from(BUCKET_FOTOS).upload(caminho, bytes, { contentType: tipo, upsert: true, cacheControl: '0' });
  if (error) throw error;
}

/** Lê a foto do aluno; `null` se não houver ou o arquivo tiver sumido do bucket. */
export async function lerFoto(db: SupabaseClient, caminho: string | null): Promise<{ bytes: Buffer; tipo: TipoImagem } | null> {
  if (!caminho) return null;
  const { data, error } = await db.storage.from(BUCKET_FOTOS).download(caminho);
  if (error || !data) return null;
  const bytes = Buffer.from(await data.arrayBuffer());
  const tipo = tipoDaImagem(bytes);
  return tipo ? { bytes, tipo } : null;
}

export function dataUrl(foto: { bytes: Buffer; tipo: string }): string {
  return `data:${foto.tipo};base64,${foto.bytes.toString('base64')}`;
}

/* ---------------- Sincronização na importação ---------------- */

export interface FotoParaSincronizar {
  alunoId: string;
  nome: string;
  urlFoto?: string;
  fotoAlteradaEm?: string;
  local: { foto_path: string | null; foto_origem: string | null; foto_alterada_origem: string | null };
}

const instante = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);

/**
 * A origem tem foto diferente da que guardamos? Com data de alteração, a
 * data decide (RF-FOTO-02). Sem ela, baixa só se nunca baixou: o link pode
 * ser assinado e mudar a cada chamada, então não serve de chave.
 */
function precisaBaixar(f: FotoParaSincronizar): boolean {
  if (!f.urlFoto) return false;
  if (!f.local.foto_alterada_origem) return true;
  if (!f.fotoAlteradaEm) return false;
  return instante(f.fotoAlteradaEm) !== instante(f.local.foto_alterada_origem);
}

/**
 * Copia para o Storage as fotos que mudaram na origem. Nunca derruba a
 * importação: falha vira contador e aviso (§6.2). A simulação só conta.
 */
export async function sincronizarFotos(db: SupabaseClient, itens: FotoParaSincronizar[], efetiva: boolean): Promise<{ resumo: ResumoFotos; avisos: string[] }> {
  const resumo: ResumoFotos = { a_baixar: 0, novas: 0, atualizadas: 0, com_erro: 0, manuais_preservadas: 0 };
  const pendentes = itens.filter(precisaBaixar);
  resumo.a_baixar = pendentes.length;
  if (!efetiva || !pendentes.length) return { resumo, avisos: [] };

  const erros: string[] = [];
  const preservadas: string[] = [];
  let proximo = 0;
  async function trabalhador() {
    while (proximo < pendentes.length) {
      const f = pendentes[proximo++];
      try {
        const { bytes, tipo } = await baixarFotoOrigem(f.urlFoto!);
        const caminho = caminhoFoto(f.alunoId, 'activesoft');
        await gravarArquivoFoto(db, caminho, bytes, tipo);
        const manual = f.local.foto_origem === 'manual';
        // a manual continua valendo (RF-FOTO-05); a da origem fica guardada
        // ao lado para o "Voltar à foto do Activesoft"
        const { error } = await db.from('aluno').update({
          foto_alterada_origem: f.fotoAlteradaEm || new Date().toISOString(),
          ...(manual ? {} : { foto_path: caminho, foto_origem: 'activesoft', foto_atualizada_em: new Date().toISOString() })
        }).eq('id', f.alunoId);
        if (error) throw error;
        if (manual) { resumo.manuais_preservadas++; preservadas.push(f.nome); }
        else if (f.local.foto_path) resumo.atualizadas++;
        else resumo.novas++;
      } catch (err) {
        resumo.com_erro++;
        const motivo = err instanceof FalhaFoto ? err.message : 'não foi possível gravar no Storage';
        erros.push(`${f.nome} (${motivo})`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCORRENCIA, pendentes.length) }, trabalhador));

  const avisos: string[] = [];
  if (resumo.novas || resumo.atualizadas) avisos.push(`Fotos: ${resumo.novas} nova(s) e ${resumo.atualizadas} atualizada(s) copiadas do Activesoft.`);
  if (preservadas.length) avisos.push(`${preservadas.length} aluno(s) têm foto enviada pela secretaria e o Activesoft trouxe outra: a enviada foi mantida (${resumir(preservadas)}). Para usar a do Activesoft, abra a ficha › Dados › Foto › Voltar à foto do Activesoft.`);
  if (erros.length) avisos.push(`${erros.length} foto(s) não puderam ser copiadas e ficam para a próxima importação: ${resumir(erros)}. O resto da importação não foi afetado.`);
  return { resumo, avisos };
}

function resumir(nomes: string[]): string {
  return nomes.length > 5 ? `${nomes.slice(0, 5).join('; ')} e mais ${nomes.length - 5}` : nomes.join('; ');
}
