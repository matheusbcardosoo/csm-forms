// PDFs das carteirinhas e da ficha de inscrição. Mesmo pipeline dos outros
// documentos (Puppeteer abre a rota interna), mas nada é guardado: o PDF é
// derivado e barato de regenerar, e o log de emissão responde quem
// imprimiu o quê (08-carteirinhas §6.1).
import type { SupabaseClient } from '@supabase/supabase-js';
import { renderCarteirinhasPdf, renderFichaInscricaoPdf } from '../../../lib/pdf';
import type { DocumentoCarteirinha, EscopoEmissao } from '../../../shared/types/carteirinha';

function baseUrl(): string {
  return process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
}

export async function gerarPdfCarteirinhas(subpastaId: string, alunoIds?: string[]): Promise<Buffer> {
  const q = new URLSearchParams({ subpasta: subpastaId });
  if (alunoIds?.length) q.set('alunos', alunoIds.join(','));
  return renderCarteirinhasPdf({ baseUrl: baseUrl(), query: q.toString(), internalToken: process.env.INTERNAL_PDF_SECRET });
}

export async function gerarPdfFicha(alvo: { subpasta: string } | { pasta: string }, diretorId?: string | null): Promise<Buffer> {
  const q = new URLSearchParams(alvo as Record<string, string>);
  if (diretorId) q.set('diretor', diretorId);
  return renderFichaInscricaoPdf({ baseUrl: baseUrl(), query: q.toString(), internalToken: process.env.INTERNAL_PDF_SECRET });
}

/** "copa-integracao-2026-sub-12-volei" — para o nome do arquivo. */
export function slug(...partes: string[]): string {
  return partes.join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'documento';
}

/** RF-CART-17: só log. Falhar aqui não pode impedir a secretaria de imprimir. */
export async function registrarEmissao(db: SupabaseClient, e: {
  pasta_id: string | null; subpasta_id: string | null; documento: DocumentoCarteirinha; escopo: EscopoEmissao; aluno_ids: string[]; emitido_por: string;
}): Promise<void> {
  const { error } = await db.from('carteirinha_emissao').insert(e);
  if (error) console.warn('[carteirinhas] emissão não registrada no log:', error.message);
}
