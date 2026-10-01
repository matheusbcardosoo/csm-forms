// Rotas internas dos PDFs das carteirinhas — sem UI, só o Puppeteer entra
// aqui, com o token que apenas o próprio servidor conhece (mesma convenção
// de pdf-interno.ts). Renderizam os mesmos objetos da pré-visualização,
// com o mesmo CSS compartilhado (08-carteirinhas §6.4).
import { Router, type Request } from 'express';
import fs from 'fs';
import path from 'path';
import { getServiceClient } from '../../lib/supabase';
import {
  carregarAluno, carregarPasta, carregarSubpasta, diretorAtivo, montarCarteirinhas, montarFichaInscricao, ordenar,
  type AlunoInscrito
} from '../servicos/carteirinha/montar';
import { CARTOES_POR_FOLHA, type CarteirinhaSubpasta, type DocFichaInscricao } from '../../shared/types/carteirinha';
import { INSTRUCAO_IMPRESSAO, emGrupos, estiloMarca, marcasDaFolha, posicaoRotuloDobra, type Marca } from '../../shared/carteirinha-folha';

export const carteirinhasPdfInternoRouter = Router();

const CAMINHO_CSS = path.resolve(__dirname, '..', '..', 'shared', 'carteirinha-documento.css');
let cssCache: { conteudo: string; mtime: number } | null = null;
function cssDocumento(): string {
  const stat = fs.statSync(CAMINHO_CSS);
  if (!cssCache || cssCache.mtime !== stat.mtimeMs) cssCache = { conteudo: fs.readFileSync(CAMINHO_CSS, 'utf8'), mtime: stat.mtimeMs };
  return cssCache.conteudo;
}

const autorizado = (req: Request) => !!process.env.INTERNAL_PDF_SECRET && req.query.token === process.env.INTERNAL_PDF_SECRET;
const lista = (v: unknown) => String(v || '').split(',').map(s => s.trim()).filter(Boolean);

/** Estilo inline em texto, para o EJS. */
function estiloTexto(m: Marca): string {
  return Object.entries(estiloMarca(m)).map(([k, v]) => `${k}: ${v}`).join('; ');
}

carteirinhasPdfInternoRouter.get('/internal/pdf/carteirinhas', async (req, res) => {
  if (!autorizado(req)) return res.status(403).send('Forbidden');
  try {
    const db = getServiceClient();
    const dados = await carregarSubpasta(db, String(req.query.subpasta || ''));
    if (!dados) return res.status(404).send('Subpasta não encontrada.');

    // `alunos` = seleção (RF-CART-18) ou o avulso (RF-CART-11), que pode
    // ainda não estar inscrito na subpasta escolhida
    const pedidos = lista(req.query.alunos);
    let alunos: AlunoInscrito[] = dados.alunos;
    if (pedidos.length) {
      const porId = new Map(dados.alunos.map(a => [a.id, a]));
      alunos = [];
      for (const id of pedidos) {
        const a = porId.get(id) || await carregarAluno(db, id);
        if (a) alunos.push(a);
      }
      alunos = ordenar(alunos, dados.subpasta.ordenacao);
    }

    const doc = await montarCarteirinhas(db, dados.pasta, dados.subpasta, alunos, 'pdf');
    const folhas = emGrupos(doc.cartoes, CARTOES_POR_FOLHA);
    res.render('pdf-carteirinhas', {
      doc, css: cssDocumento(), folhas,
      marcas: folhas.map(f => marcasDaFolha(f.length)),
      instrucao: INSTRUCAO_IMPRESSAO, rotuloDobra: posicaoRotuloDobra(), estilo: estiloTexto
    });
  } catch (err) {
    res.status(500).send('Erro ao renderizar PDF: ' + (err as Error).message);
  }
});

carteirinhasPdfInternoRouter.get('/internal/pdf/ficha-inscricao', async (req, res) => {
  if (!autorizado(req)) return res.status(403).send('Forbidden');
  try {
    const db = getServiceClient();
    const diretor = await diretorAtivo(db, req.query.diretor ? String(req.query.diretor) : null);
    const docs: DocFichaInscricao[] = [];

    if (req.query.pasta) {
      // pasta inteira: uma ficha por subpasta, em sequência (RF-FICHA-07)
      const pasta = await carregarPasta(db, String(req.query.pasta));
      if (!pasta) return res.status(404).send('Pasta não encontrada.');
      const { data: subs, error } = await db.from('carteirinha_subpasta').select('id').eq('pasta_id', pasta.id).order('ordem').order('nome');
      if (error) throw error;
      for (const s of subs || []) {
        const dados = await carregarSubpasta(db, s.id);
        if (dados) docs.push(await montarFichaInscricao(db, pasta, dados.subpasta as CarteirinhaSubpasta, dados.alunos, 'pdf', diretor));
      }
    } else {
      const dados = await carregarSubpasta(db, String(req.query.subpasta || ''));
      if (!dados) return res.status(404).send('Subpasta não encontrada.');
      docs.push(await montarFichaInscricao(db, dados.pasta, dados.subpasta, dados.alunos, 'pdf', diretor));
    }
    res.render('pdf-ficha-inscricao', { docs, css: cssDocumento() });
  } catch (err) {
    res.status(500).send('Erro ao renderizar PDF: ' + (err as Error).message);
  }
});
