// Indicadores da tela Início. Nas fases 0–2 os contadores de alunos,
// históricos e importações ainda não existem no banco; a rota devolve o
// que já é mensurável (configuração) e marca o resto como indisponível
// para a tela mostrar o estado vazio certo em vez de "0".
import { Router } from 'express';
import { exigirPapel, ctx, seguro } from '../lib/autorizacao';

export const painelRouter = Router();

painelRouter.get('/inicio', exigirPapel(), seguro(async (_req, res) => {
  const { client, perfil } = ctx(res);

  const podeImportar = perfil.papel === 'admin' || perfil.papel === 'secretaria';
  const [inst, atos, sign, anos, cursos, versoes, usuarios, alunos, divergencias, pendMap, ultimaImp] = await Promise.all([
    client.from('instituicao').select('id, nome_fantasia, mantenedora_nome, orgao_regional').maybeSingle(),
    client.from('instituicao_ato').select('id', { count: 'exact', head: true }).eq('ativo', true),
    client.from('instituicao_signatario').select('id, cargo, ativo').eq('ativo', true),
    client.from('ano_letivo').select('ano, situacao').order('ano', { ascending: false }),
    client.from('curso').select('id, nome, ativo').eq('ativo', true),
    client.from('versao_curricular').select('id, curso_id, status'),
    perfil.papel === 'admin'
      ? client.from('usuario_perfil').select('email', { count: 'exact', head: true }).eq('ativo', true)
      : Promise.resolve({ count: null, error: null }),
    client.from('aluno').select('id', { count: 'exact', head: true }).eq('situacao', 'ativo'),
    podeImportar ? client.from('importacao_divergencia').select('id', { count: 'exact', head: true }).eq('resolucao', 'pendente') : Promise.resolve({ count: null, error: null }),
    podeImportar ? client.from('mapeamento_activesoft').select('id', { count: 'exact', head: true }).eq('confirmado', false) : Promise.resolve({ count: null, error: null }),
    podeImportar ? client.from('importacao').select('id, tipo, modo, status, iniciado_em, concluido_em').order('iniciado_em', { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null, error: null })
  ]);

  for (const r of [inst, atos, sign, anos, cursos, versoes, usuarios, alunos, divergencias, pendMap, ultimaImp]) {
    if (r.error) throw r.error;
  }

  const signatarios = sign.data || [];
  const cursosAtivos = cursos.data || [];
  const vers = versoes.data || [];
  const cursosSemVigente = cursosAtivos.filter(c => !vers.some(v => v.curso_id === c.id && v.status === 'vigente'));
  const anoAtual = new Date().getFullYear();
  const anoLetivoAtual = (anos.data || []).find(a => a.ano === anoAtual) || null;

  // "Precisa de atenção": itens que travam a emissão ou a configuração.
  const pendencias: { tipo: 'erro' | 'aviso' | 'info'; titulo: string; detalhe: string; rota: string; acao: string }[] = [];
  if (!inst.data?.mantenedora_nome || !inst.data?.orgao_regional) {
    pendencias.push({ tipo: 'erro', titulo: 'Cabeçalho da instituição incompleto', detalhe: 'Mantenedora e Diretoria de Ensino saem em todo histórico emitido.', rota: '/app/config/instituicao', acao: 'Preencher' });
  }
  if ((atos.count || 0) === 0) {
    pendencias.push({ tipo: 'erro', titulo: 'Nenhum ato legal cadastrado', detalhe: 'Autorização de funcionamento e programas entram no cabeçalho do documento.', rota: '/app/config/atos-legais', acao: 'Cadastrar' });
  }
  if (!signatarios.some(s => s.cargo === 'diretor') || !signatarios.some(s => s.cargo === 'secretario')) {
    pendencias.push({ tipo: 'erro', titulo: 'Falta signatário ativo', detalhe: 'O histórico exige um(a) diretor(a) e um(a) secretário(a) escolar ativos.', rota: '/app/config/signatarios', acao: 'Cadastrar' });
  }
  if (!anoLetivoAtual) {
    pendencias.push({ tipo: 'aviso', titulo: `Ano letivo de ${anoAtual} não cadastrado`, detalhe: 'Importações e vigências curriculares dependem do ano letivo.', rota: '/app/config/anos-letivos', acao: 'Cadastrar' });
  }
  if (cursosAtivos.length === 0) {
    pendencias.push({ tipo: 'aviso', titulo: 'Nenhum curso cadastrado', detalhe: 'O curso nomeia o documento ("Histórico Escolar - Ensino Médio Bilíngue").', rota: '/app/config/cursos', acao: 'Cadastrar' });
  }
  if ((divergencias.count || 0) > 0) {
    pendencias.push({ tipo: 'aviso', titulo: `${divergencias.count} divergência(s) de importação sem decisão`, detalhe: 'Valor editado à mão e valor na origem mudaram — o sistema não escolhe sozinho.', rota: '/app/importacoes', acao: 'Resolver' });
  }
  if ((pendMap.count || 0) > 0) {
    pendencias.push({ tipo: 'info', titulo: `${pendMap.count} código(s) da origem sem correspondência`, detalhe: 'Notas dessas disciplinas/séries não são gravadas até o mapeamento ser confirmado.', rota: '/app/importacoes/mapeamentos', acao: 'Mapear' });
  }
  for (const c of cursosSemVigente) {
    pendencias.push({ tipo: 'aviso', titulo: `"${c.nome}" sem versão curricular vigente`, detalhe: 'Sem estrutura vigente, nenhuma nota deste curso pode ser importada nem impressa.', rota: '/app/config/curriculos', acao: 'Abrir' });
  }

  res.json({
    anoLetivoAtual: anoLetivoAtual?.ano ?? anoAtual,
    indicadores: {
      alunosAtivos: alunos.count ?? 0,
      emitidosNoMes: null,         // F5
      divergenciasAbertas: divergencias.count,
      pendentesMapeamento: pendMap.count,
      ultimaImportacao: ultimaImp.data || null,
      rascunhosParados: null,      // F5
      cursosAtivos: cursosAtivos.length,
      versoesVigentes: vers.filter(v => v.status === 'vigente').length,
      versoesRascunho: vers.filter(v => v.status === 'rascunho').length,
      signatariosAtivos: signatarios.length,
      atosLegais: atos.count || 0,
      usuariosAtivos: usuarios.count ?? null
    },
    pendencias,
    instituicao: inst.data || null
  });
}));
