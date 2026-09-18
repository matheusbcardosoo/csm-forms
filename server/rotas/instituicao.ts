// Configuração da instituição (F1): dados, atos legais, signatários.
// Leitura para qualquer papel (o cabeçalho é consultado na pré-visualização);
// escrita só admin — a RLS repete a regra no banco.
import { Router } from 'express';
import { exigirPapel, ctx, seguro } from '../lib/autorizacao';
import { validar, z, texto, textoObrigatorio, dataIso, inteiro, uuid } from '../lib/validacao';

export const instituicaoRouter = Router();

const CAMPOS_INSTITUICAO = [
  'razao_social', 'nome_fantasia', 'cnpj', 'codigo_inep',
  'endereco_logradouro', 'endereco_numero', 'endereco_complemento', 'bairro', 'municipio', 'uf', 'cep',
  'telefone', 'telefone_secundario', 'email', 'site',
  'mantenedora_nome', 'mantenedora_cnpj', 'orgao_regional'
] as const;

const instituicaoSchema = z.object({
  nome_fantasia: textoObrigatorio,
  razao_social: texto, cnpj: texto, codigo_inep: texto,
  endereco_logradouro: texto, endereco_numero: texto, endereco_complemento: texto, bairro: texto,
  municipio: texto, uf: z.preprocess(v => (typeof v === 'string' ? v.trim().toUpperCase() || null : v), z.string().length(2, 'UF com 2 letras').nullable().optional()),
  cep: texto, telefone: texto, telefone_secundario: texto,
  email: z.preprocess(v => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().email('E-mail inválido').nullable().optional()),
  site: texto, mantenedora_nome: texto, mantenedora_cnpj: texto, orgao_regional: texto
});

async function carregarInstituicao(client: ReturnType<typeof ctx>['client']) {
  const { data, error } = await client.from('instituicao').select('*').maybeSingle();
  if (error) throw error;
  return data;
}

/* ---------- Instituição ---------- */
instituicaoRouter.get('/', exigirPapel(), seguro(async (_req, res) => {
  const { client } = ctx(res);
  const inst = await carregarInstituicao(client);
  const [atos, signatarios] = await Promise.all([
    client.from('instituicao_ato').select('*').order('ordem').order('criado_em'),
    client.from('instituicao_signatario').select('*').order('ordem').order('criado_em')
  ]);
  if (atos.error) throw atos.error;
  if (signatarios.error) throw signatarios.error;
  res.json({ instituicao: inst, atos: atos.data, signatarios: signatarios.data });
}));

instituicaoRouter.put('/', exigirPapel('admin'), seguro(async (req, res) => {
  const body = validar(instituicaoSchema, req, res);
  if (!body) return;
  const { client } = ctx(res);
  const atual = await carregarInstituicao(client);
  const payload: Record<string, unknown> = {};
  for (const c of CAMPOS_INSTITUICAO) payload[c] = (body as Record<string, unknown>)[c] ?? null;

  const q = atual
    ? client.from('instituicao').update(payload).eq('id', atual.id)
    : client.from('instituicao').insert(payload);
  const { data, error } = await q.select().single();
  if (error) throw error;
  res.json(data);
}));

/* ---------- Atos legais ---------- */
const atoSchema = z.object({
  tipo: z.enum(['criacao', 'autorizacao', 'reconhecimento', 'renovacao', 'programa', 'outro']).default('autorizacao'),
  rotulo: textoObrigatorio,
  instrumento: z.preprocess(v => (typeof v === 'string' && v.trim() ? v.trim() : 'Portaria'), z.string()),
  numero: texto,
  orgao_emissor: texto,
  data_ato: dataIso,
  veiculo_publicacao: z.preprocess(v => (typeof v === 'string' && v.trim() ? v.trim() : 'DOE'), z.string()),
  data_publicacao: dataIso,
  texto_impresso: texto,
  observacao: texto,
  curso_id: z.preprocess(v => (v === '' ? null : v), uuid.nullable().optional()),
  ordem: inteiro,
  ativo: z.boolean().optional()
});

async function instituicaoId(client: ReturnType<typeof ctx>['client']): Promise<string> {
  const inst = await carregarInstituicao(client);
  if (inst) return inst.id;
  const { data, error } = await client.from('instituicao').insert({ nome_fantasia: 'Colégio São Marcos' }).select('id').single();
  if (error) throw error;
  return data.id;
}

instituicaoRouter.post('/atos', exigirPapel('admin'), seguro(async (req, res) => {
  const body = validar(atoSchema, req, res);
  if (!body) return;
  const { client } = ctx(res);
  const instId = await instituicaoId(client);
  if (body.ordem == null) {
    const { count } = await client.from('instituicao_ato').select('id', { count: 'exact', head: true });
    body.ordem = count || 0;
  }
  const { data, error } = await client.from('instituicao_ato').insert({ ...body, instituicao_id: instId }).select().single();
  if (error) throw error;
  res.status(201).json(data);
}));

instituicaoRouter.put('/atos/:id', exigirPapel('admin'), seguro(async (req, res) => {
  const body = validar(atoSchema.partial(), req, res);
  if (!body) return;
  const { client } = ctx(res);
  const { data, error } = await client.from('instituicao_ato').update(body).eq('id', req.params.id).select().single();
  if (error) throw error;
  res.json(data);
}));

instituicaoRouter.put('/atos', exigirPapel('admin'), seguro(async (req, res) => {
  // Reordenação: [{id, ordem}]
  const body = validar(z.array(z.object({ id: uuid, ordem: z.number().int() })), req, res);
  if (!body) return;
  const { client } = ctx(res);
  for (const { id, ordem } of body) {
    const { error } = await client.from('instituicao_ato').update({ ordem }).eq('id', id);
    if (error) throw error;
  }
  res.json({ success: true });
}));

instituicaoRouter.delete('/atos/:id', exigirPapel('admin'), seguro(async (req, res) => {
  const { client } = ctx(res);
  const { error } = await client.from('instituicao_ato').delete().eq('id', req.params.id);
  if (error) throw error;
  res.json({ success: true });
}));

/* ---------- Signatários ---------- */
const signatarioSchema = z.object({
  nome: textoObrigatorio,
  cargo: z.enum(['diretor', 'vice_diretor', 'secretario']),
  cargo_impresso: textoObrigatorio,
  rg: texto,
  registro_autorizacao: texto,
  ativo: z.boolean().optional(),
  ordem: inteiro
});

instituicaoRouter.post('/signatarios', exigirPapel('admin'), seguro(async (req, res) => {
  const body = validar(signatarioSchema, req, res);
  if (!body) return;
  const { client } = ctx(res);
  const instId = await instituicaoId(client);
  const { data, error } = await client.from('instituicao_signatario').insert({ ...body, instituicao_id: instId }).select().single();
  if (error) throw error;
  res.status(201).json(data);
}));

instituicaoRouter.put('/signatarios/:id', exigirPapel('admin'), seguro(async (req, res) => {
  const body = validar(signatarioSchema.partial(), req, res);
  if (!body) return;
  const { client } = ctx(res);
  const { data, error } = await client.from('instituicao_signatario').update(body).eq('id', req.params.id).select().single();
  if (error) throw error;
  res.json(data);
}));

instituicaoRouter.delete('/signatarios/:id', exigirPapel('admin'), seguro(async (req, res) => {
  const { client } = ctx(res);
  const { error } = await client.from('instituicao_signatario').delete().eq('id', req.params.id);
  if (error) throw error;
  res.json({ success: true });
}));

/* ---------- Assinatura digitalizada (Storage, bucket institucional) ---------- */
const ASSINATURA_TIPOS = ['image/png', 'image/jpeg', 'image/webp'];
const ASSINATURA_MAX = 2 * 1024 * 1024;

instituicaoRouter.post('/signatarios/:id/assinatura', exigirPapel('admin'), seguro(async (req, res) => {
  const body = validar(z.object({ nome: z.string(), tipo: z.string(), base64: z.string().min(1) }), req, res);
  if (!body) return;
  if (!ASSINATURA_TIPOS.includes(body.tipo)) return res.status(422).json({ error: 'Envie a assinatura em PNG, JPG ou WebP.' });
  const buffer = Buffer.from(body.base64, 'base64');
  if (buffer.length > ASSINATURA_MAX) return res.status(422).json({ error: 'A imagem da assinatura deve ter no máximo 2 MB.' });

  const { client } = ctx(res);
  const ext = body.tipo === 'image/png' ? 'png' : body.tipo === 'image/webp' ? 'webp' : 'jpg';
  const caminho = `assinaturas/${req.params.id}.${ext}`;
  const { error: upErr } = await client.storage.from('institucional').upload(caminho, buffer, { contentType: body.tipo, upsert: true });
  if (upErr) throw upErr;
  const { data, error } = await client.from('instituicao_signatario').update({ assinatura_path: caminho }).eq('id', req.params.id).select().single();
  if (error) throw error;
  res.json(data);
}));

instituicaoRouter.get('/arquivo', exigirPapel(), seguro(async (req, res) => {
  // URL assinada temporária para exibir logo/brasão/assinatura no painel.
  const caminho = String(req.query.caminho || '');
  if (!caminho || caminho.includes('..')) return res.status(400).json({ error: 'Caminho inválido.' });
  const { client } = ctx(res);
  const { data, error } = await client.storage.from('institucional').createSignedUrl(caminho, 300);
  if (error) throw error;
  res.json({ url: data.signedUrl });
}));
