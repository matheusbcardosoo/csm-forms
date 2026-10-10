// /app/auditoria — versão inicial: as últimas alterações registradas na
// tabela auditoria, mais recentes primeiro, com filtro por tipo e
// paginação por posição ("carregar mais") — não por data: uma importação
// grava muitas linhas com o mesmo criado_em, e cortar por data as pularia. Só leitura, só admin. A versão
// completa (filtros por pessoa/período, exportação) vem depois.
import { Router } from 'express';
import { exigirPapel, ctx, seguro } from '../lib/autorizacao';

export const auditoriaRouter = Router();

const ENTIDADES = ['aluno', 'matricula', 'nota', 'historico', 'importacao', 'usuario'];
const POR_PAGINA = 50;

auditoriaRouter.get('/', exigirPapel('admin'), seguro(async (req, res) => {
  const { client } = ctx(res);
  const entidade = String(req.query.entidade || '');
  const desde = Math.max(0, Number.parseInt(String(req.query.desde || '0'), 10) || 0);
  let consulta = client.from('auditoria')
    .select('id, entidade, entidade_id, aluno_id, acao, campo, valor_anterior, valor_novo, motivo, usuario_email, criado_em, aluno:aluno_id (nome)')
    .order('criado_em', { ascending: false })
    .order('id', { ascending: true })
    .range(desde, desde + POR_PAGINA); // uma a mais: diz se há próxima página
  if (ENTIDADES.includes(entidade)) consulta = consulta.eq('entidade', entidade);
  const { data, error } = await consulta;
  if (error) throw error;
  res.json({ linhas: data.slice(0, POR_PAGINA), temMais: data.length > POR_PAGINA });
}));
