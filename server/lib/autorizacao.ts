// Autorização no servidor (02-arquitetura D7): a RLS é a segunda barreira,
// a primeira é este middleware. Cada rota do painel declara os papéis que
// aceita; o cliente Supabase autenticado do usuário (RLS ativa) fica em
// res.locals para as rotas usarem.
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Papel, Perfil } from '../../shared/types/usuario';

import { requireAuth, getPerfil } from '../../lib/auth';

export interface ContextoAutenticado {
  client: SupabaseClient;
  perfil: Perfil;
}

declare module 'express-serve-static-core' {
  interface Locals {
    ctx?: ContextoAutenticado;
  }
}

export const TODOS_PAPEIS: Papel[] = ['admin', 'secretaria', 'coordenacao', 'leitura'];

export function exigirPapel(...papeis: Papel[]): RequestHandler {
  const aceitos = papeis.length ? papeis : TODOS_PAPEIS;
  return async (req: Request, res: Response, next: NextFunction) => {
    const client = await requireAuth(req, res);
    if (!client) return; // requireAuth já respondeu 401

    let perfil: Perfil | null = null;
    try {
      perfil = await getPerfil(client);
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
    if (!perfil || !perfil.ativo) {
      return res.status(403).json({ error: 'Seu e-mail não está autorizado a usar o painel.' });
    }
    if (!aceitos.includes(perfil.papel)) {
      return res.status(403).json({ error: 'Seu perfil não tem permissão para esta ação.' });
    }
    res.locals.ctx = { client, perfil };
    next();
  };
}

export function ctx(res: Response): ContextoAutenticado {
  if (!res.locals.ctx) throw new Error('Rota sem exigirPapel() antes do handler.');
  return res.locals.ctx;
}

/** Converte erro do PostgREST/Postgres numa resposta HTTP legível. */
export function responderErro(res: Response, err: unknown): void {
  const e = err as { code?: string; message?: string; details?: string; status?: number };
  const msg = e?.message || 'Erro inesperado.';
  // 23505 unique_violation · 23503 fk · 23514 check · 42501 privilégio (RLS)
  if (e?.code === '23505') return void res.status(409).json({ error: 'Já existe um registro com esses dados.', detalhe: e.details || msg });
  if (e?.code === '23503') return void res.status(409).json({ error: 'Há registros dependentes deste — não é possível remover.', detalhe: e.details || msg });
  if (e?.code === '23514' || e?.code === 'P0001') return void res.status(422).json({ error: msg });
  if (e?.code === '42501') return void res.status(403).json({ error: 'Seu perfil não tem permissão para esta ação.' });
  if (typeof e?.status === 'number' && e.status >= 400 && e.status < 600) return void res.status(e.status).json({ error: msg });
  res.status(500).json({ error: msg });
}

/** Envolve um handler async para que erros caiam em responderErro. */
export function seguro(fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res) => { fn(req, res).catch(err => responderErro(res, err)); };
}
