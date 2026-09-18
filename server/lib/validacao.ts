// Validação de corpo de requisição com Zod. Erros voltam como 422 com a
// lista de campos, no formato que o cliente já sabe mostrar.
import type { Request, Response } from 'express';
import { z, type ZodType } from 'zod';

export { z };

export function validar<T>(schema: ZodType<T>, req: Request, res: Response): T | null {
  const r = schema.safeParse(req.body);
  if (r.success) return r.data;
  const campos = r.error.issues.map(i => ({ campo: i.path.join('.'), mensagem: i.message }));
  res.status(422).json({ error: 'Dados inválidos.', campos });
  return null;
}

/** string vazia → null; demais strings aparadas. */
export const texto = z.preprocess(v => {
  if (typeof v !== 'string') return v;
  const t = v.trim();
  return t === '' ? null : t;
}, z.string().nullable().optional());

export const textoObrigatorio = z.preprocess(v => (typeof v === 'string' ? v.trim() : v), z.string().min(1, 'Obrigatório'));

export const dataIso = z.preprocess(v => (v === '' ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida').nullable().optional());

export const inteiro = z.preprocess(v => (v === '' || v === null || v === undefined ? null : Number(v)), z.number().int().nullable().optional());

export const numero = z.preprocess(v => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.'))), z.number().nullable().optional());

export const uuid = z.string().uuid();
