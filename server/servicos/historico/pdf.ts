// PDF do histórico (RF-HIST-08). O pipeline é o mesmo dos outros
// documentos do sistema: Puppeteer abre uma rota interna protegida por
// token (server/rotas/pdf-interno.ts) e imprime o HTML renderizado pelo
// EJS. A diferença é que, uma vez EMITIDO, o PDF é gravado no Storage e
// as próximas baixas servem o arquivo guardado — reemissão de 2ª via não
// recalcula nada (RF-HIST-06).
import type { SupabaseClient } from '@supabase/supabase-js';
import { renderHistoricoPdf } from '../../../lib/pdf';
import type { Historico } from '../../../shared/types/historico';

const BUCKET = 'documentos';

function baseUrl(): string {
  return process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
}

function caminhoStorage(h: Historico): string {
  return `historicos/${h.id}.pdf`;
}

/** csm-historico-ana-souza-2026-123.pdf */
export function nomeArquivo(h: Historico, nomeAluno: string): string {
  const base = nomeAluno.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const registro = h.numero_registro != null ? `-${h.ano_registro}-${h.numero_registro}` : '-rascunho';
  const via = h.via > 1 ? `-${h.via}a-via` : '';
  return `historico-${base || 'aluno'}${registro}${via}.pdf`;
}

export async function gerarPdf(historicoId: string): Promise<Buffer> {
  return renderHistoricoPdf({
    baseUrl: baseUrl(),
    historicoId,
    internalToken: process.env.INTERNAL_PDF_SECRET
  });
}

/**
 * Devolve o PDF do documento. Emitido: serve o do Storage, gravando-o na
 * primeira vez. Rascunho/conferido: renderiza na hora e não guarda — o
 * documento ainda pode mudar.
 */
export async function obterPdf(client: SupabaseClient, h: Historico): Promise<Buffer> {
  const congelado = h.status === 'emitido' || h.status === 'cancelado';

  if (congelado && h.pdf_path) {
    const { data, error } = await client.storage.from(BUCKET).download(h.pdf_path);
    if (!error && data) return Buffer.from(await data.arrayBuffer());
    // arquivo sumiu do bucket: cai para a regeração abaixo
  }

  const pdf = await gerarPdf(h.id);

  if (congelado) {
    const caminho = caminhoStorage(h);
    const { error: upErr } = await client.storage.from(BUCKET).upload(caminho, pdf, { contentType: 'application/pdf', upsert: true });
    if (!upErr) await client.from('historico').update({ pdf_path: caminho }).eq('id', h.id);
  }
  return pdf;
}
