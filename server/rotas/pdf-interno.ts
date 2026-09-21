// Rota interna do PDF do histórico — sem UI, só o Puppeteer entra aqui
// (mesma convenção de routes/pdf.js: token compartilhado que apenas o
// próprio servidor conhece). Renderiza views/pdf-historico.ejs com o
// mesmo `HistoricoDocumento` da tela e o mesmo CSS compartilhado (RNF-04).
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { getServiceClient } from '../../lib/supabase';
import { montarDocumento } from '../servicos/historico/montar';
import { verificacaoDoDocumento } from '../servicos/historico/verificacao';
import type { Historico, HistoricoDocumento } from '../../shared/types/historico';

export const pdfInternoRouter = Router();

const CAMINHO_CSS = path.resolve(__dirname, '..', '..', 'shared', 'historico-documento.css');
let cssCache: { conteudo: string; mtime: number } | null = null;

function cssDocumento(): string {
  const stat = fs.statSync(CAMINHO_CSS);
  if (!cssCache || cssCache.mtime !== stat.mtimeMs) {
    cssCache = { conteudo: fs.readFileSync(CAMINHO_CSS, 'utf8'), mtime: stat.mtimeMs };
  }
  return cssCache.conteudo;
}

/** Assinaturas digitalizadas viram data URL: o Chromium não tem sessão. */
async function carregarImagens(client: ReturnType<typeof getServiceClient>, doc: HistoricoDocumento): Promise<Record<string, string>> {
  const imagens: Record<string, string> = {};
  for (const a of doc.assinaturas || []) {
    if (!a.assinatura_path || imagens[a.assinatura_path]) continue;
    const { data, error } = await client.storage.from('institucional').download(a.assinatura_path);
    if (error || !data) continue;
    const buffer = Buffer.from(await data.arrayBuffer());
    const ext = a.assinatura_path.split('.').pop()?.toLowerCase();
    const tipo = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    imagens[a.assinatura_path] = `data:${tipo};base64,${buffer.toString('base64')}`;
  }
  return imagens;
}

pdfInternoRouter.get('/internal/pdf/historico/:id', async (req, res) => {
  const secret = process.env.INTERNAL_PDF_SECRET;
  if (!secret || req.query.token !== secret) return res.status(403).send('Forbidden');

  try {
    const client = getServiceClient();
    const { data, error } = await client.from('historico').select('*').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).send('Histórico não encontrado.');

    const h = data as Historico;
    // Emitido imprime o snapshot; rascunho monta na hora para a
    // pré-visualização em PDF sair igual à da tela.
    // Mesma regra da tela (server/rotas/historicos.ts): o snapshot manda
    // no conteúdo, a linha manda no status — documento cancelado imprime
    // com a marca, sem reescrever o que foi congelado.
    const base = (h.status === 'emitido' || h.status === 'cancelado') && h.snapshot
      ? { ...(h.snapshot as unknown as HistoricoDocumento), status: h.status, via: h.via }
      : (await montarDocumento(client, h)).documento;
    // mesma injeção da tela: o QR vem da linha, não do snapshot
    const doc: HistoricoDocumento = { ...base, verificacao: verificacaoDoDocumento(h.codigo_verificacao) };

    res.render('pdf-historico', { doc, css: cssDocumento(), imagens: await carregarImagens(client, doc) });
  } catch (err) {
    res.status(500).send('Erro ao renderizar PDF: ' + (err as Error).message);
  }
});
