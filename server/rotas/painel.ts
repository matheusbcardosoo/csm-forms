// Indicadores da tela Início. Nas fases 0–2 os contadores de alunos,
// históricos e importações ainda não existem no banco; a rota devolve o
// que já é mensurável (configuração) e marca o resto como indisponível
// para a tela mostrar o estado vazio certo em vez de "0".
import { Router } from 'express';
import { exigirPapel, ctx, seguro } from '../lib/autorizacao';

export const painelRouter = Router();

painelRouter.get('/inicio', exigirPapel(), seguro(async (_req, res) => {
  const { client, perfil } = ctx(res);

  const [inst, atos, sign, anos, cursos, versoes, usuarios] = await Promise.all([
    client.from('instituicao').select('id, nome_fantasia, mantenedora_nome, orgao_regional').maybeSingle(),
    client.from('instituicao_ato').select('id', { count: 'exact', head: true }).eq('ativo', true),
    client.from('instituicao_signatario').select('id, cargo, ativo').eq('ativo', true),
    client.from('ano_letivo').select('ano, situacao').order('ano', { ascending: false }),
    client.from('curso').select('id, nome, ativo').eq('ativo', true),
    client.from('versao_curricular').select('id, curso_id, status'),
    perfil.papel === 'admin'
      ? client.from('usuario_perfil').select('email', { count: 'exact', head: true }).eq('ativo', true)
      : Promise.resolve({ count: null, error: null })
  ]);

  for (const r of [inst, atos, sign, anos, cursos, versoes, usuarios]) {
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
  for (const c of cursosSemVigente) {
    pendencias.push({ tipo: 'aviso', titulo: `"${c.nome}" sem versão curricular vigente`, detalhe: 'Sem estrutura vigente, nenhuma nota deste curso pode ser importada nem impressa.', rota: '/app/config/curriculos', acao: 'Abrir' });
  }

  res.json({
    anoLetivoAtual: anoLetivoAtual?.ano ?? anoAtual,
    indicadores: {
      alunosAtivos: null,          // F4
      emitidosNoMes: null,         // F5
      divergenciasAbertas: null,   // F3
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
