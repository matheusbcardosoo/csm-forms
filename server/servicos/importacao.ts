// Pipeline de importação (03-integracao §4). Independente do adaptador:
// recebe o contrato canônico, correlaciona com o banco, aplica a regra
// central (RF-INT-06: comparar com valor_importado, nunca com valor) e
// produz o relatório. Idempotente (RNF-03): rodar duas vezes seguidas dá
// criados=0, atualizados=0.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdaptadorAcademico } from '../adapters/activesoft';
import { buscarTudo } from '../adapters/activesoft';
import type { AlunoOrigem, MatriculaOrigem, NotaOrigem, FiltroImportacao, TipoImportacao, ModoImportacao, RelatorioImportacao, LinhaRelatorio, DivergenciaPrevista } from '../../shared/types/importacao';

export interface ParametrosExecucao {
  filtro: FiltroImportacao;
  tipo: TipoImportacao;
  modo: ModoImportacao;
  usuario: string;
}

interface Contadores { lidos: number; criados: number; atualizados: number; ignorados: number; com_divergencia: number; pendentes_mapeamento: number; erros: number }

interface SerieLocal { id: string; curso_id: string; codigo: string; nome: string; ordem: number; ativo: boolean }
interface ItemLocal { id: string; serie_id: string; componente_id: string | null; nome_impresso: string; versao_id: string }
interface MapeamentoLocal { id: string; versao_id: string | null; tipo: string; codigo_origem: string; versao_item_id: string | null; destino_valor: string | null; confirmado: boolean }

const LIMITE_LINHAS = 400;

function normalizar(s: string | null | undefined): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Similaridade simples por tokens (0..1) para sugerir destino de mapeamento. */
function similaridade(a: string, b: string): number {
  const ta = new Set(normalizar(a).split(' ').filter(Boolean));
  const tb = new Set(normalizar(b).split(' ').filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let comum = 0;
  for (const t of ta) if (tb.has(t)) comum++;
  const jaccard = comum / (ta.size + tb.size - comum);
  const na = normalizar(a), nb = normalizar(b);
  const contem = na === nb ? 1 : na.includes(nb) || nb.includes(na) ? 0.85 : 0;
  return Math.max(jaccard, contem);
}

function traduzirSituacaoNota(s: string | undefined, valor: number | undefined, media: number | null): 'aprovado' | 'reprovado' | 'dispensado' | 'cursando' | 'sem_registro' {
  const n = normalizar(s);
  if (n.startsWith('aprov')) return 'aprovado';
  if (n.startsWith('reprov') || n.startsWith('retid')) return 'reprovado';
  if (n.startsWith('dispens')) return 'dispensado';
  if (n.startsWith('curs') || n.startsWith('em curso') || n.startsWith('matric')) return 'cursando';
  if (valor == null) return s ? 'cursando' : 'sem_registro';
  if (media != null) return valor >= media ? 'aprovado' : 'reprovado';
  return 'aprovado';
}

function traduzirSituacaoMatricula(s: string | undefined, mapa: Map<string, string>): 'em_curso' | 'aprovado' | 'aprovado_conselho' | 'reprovado' | 'transferido' | 'evadido' {
  if (s && mapa.has(normalizar(s))) return mapa.get(normalizar(s)) as ReturnType<typeof traduzirSituacaoMatricula>;
  const n = normalizar(s);
  if (n.includes('conselho')) return 'aprovado_conselho';
  if (n.startsWith('aprov') || n.startsWith('promov')) return 'aprovado';
  if (n.startsWith('reprov') || n.startsWith('retid')) return 'reprovado';
  if (n.startsWith('transf')) return 'transferido';
  if (n.startsWith('evad') || n.startsWith('desist') || n.startsWith('abandon')) return 'evadido';
  return 'em_curso';
}

function traduzirSituacaoAluno(s: string | undefined): 'ativo' | 'transferido' | 'concluinte' | 'evadido' | 'inativo' {
  const n = normalizar(s);
  if (n.startsWith('transf')) return 'transferido';
  if (n.startsWith('conclu') || n.startsWith('formad')) return 'concluinte';
  if (n.startsWith('evad') || n.startsWith('desist') || n.startsWith('abandon')) return 'evadido';
  if (n.startsWith('inativ') || n.startsWith('cancel')) return 'inativo';
  return 'ativo';
}

const CAMPOS_ALUNO: [keyof AlunoOrigem, string][] = [
  ['nome', 'nome'], ['nomeSocial', 'nome_social'], ['dataNascimento', 'data_nascimento'], ['municipioNascimento', 'municipio_nascimento'],
  ['ufNascimento', 'uf_nascimento'], ['paisNascimento', 'pais_nascimento'], ['nacionalidade', 'nacionalidade'], ['sexo', 'sexo'],
  ['rg', 'rg'], ['rgOrgao', 'rg_orgao'], ['rgUf', 'rg_uf'], ['cpf', 'cpf'], ['cin', 'cin'], ['ra', 'ra'], ['filiacao1', 'filiacao_1'], ['filiacao2', 'filiacao_2']
];

export async function executarImportacao(db: SupabaseClient, adaptador: AdaptadorAcademico, p: ParametrosExecucao) {
  const efetiva = p.modo === 'efetiva';
  const cont: Contadores = { lidos: 0, criados: 0, atualizados: 0, ignorados: 0, com_divergencia: 0, pendentes_mapeamento: 0, erros: 0 };
  const relatorio: RelatorioImportacao = { adaptador: adaptador.nome, capacidades: adaptador.capacidades(), avisos: [], linhas: [], divergenciasPrevistas: efetiva ? undefined : [] };
  const linha = (l: LinhaRelatorio) => { if (relatorio.linhas.length < LIMITE_LINHAS) relatorio.linhas.push(l); };
  const divergencias: { entidade: 'aluno' | 'matricula' | 'nota'; entidade_id: string; aluno_id: string | null; descricao: string; campo: string; valor_local: unknown; valor_origem: unknown; contexto: unknown }[] = [];
  const pendencias = new Map<string, { versao_id: string | null; tipo: 'disciplina' | 'serie' | 'situacao'; codigo_origem: string; descricao_origem: string | null; sugestao_item_id: string | null; destino_sugerido: string | null; registros: number }>();
  const agora = new Date().toISOString();

  // registro da importação
  const { data: imp, error: eImp } = await db.from('importacao').insert({
    origem: adaptador.origem, tipo: p.tipo, modo: p.modo, status: 'executando',
    parametros: { ...p.filtro, adaptador: adaptador.nome }, iniciado_por: p.usuario
  }).select('id').single();
  if (eImp) throw eImp;
  const importacaoId = imp.id as string;

  const capacidades = adaptador.capacidades();
  if (!capacidades.cargaHoraria) relatorio.avisos.push('A origem não devolve carga horária por componente — o histórico usa os totais anuais da versão curricular.');
  if (!capacidades.situacaoFinal) relatorio.avisos.push('A origem não devolve situação final da matrícula — fica "em curso" até ser editada.');
  if (!capacidades.documentosAluno) relatorio.avisos.push('A origem não devolve documentos do aluno (CPF/RG/naturalidade) — completar no cadastro.');

  try {
    /* ---------- referências locais ---------- */
    const { data: anoLetivo, error: eAno } = await db.from('ano_letivo').select('id, ano').eq('ano', p.filtro.anoLetivo).maybeSingle();
    if (eAno) throw eAno;
    if (!anoLetivo) throw new Error(`Ano letivo de ${p.filtro.anoLetivo} não cadastrado. Cadastre-o em Configuração › Anos letivos antes de importar.`);

    const [series, mapeamentos, sistemas] = await Promise.all([
      db.from('serie').select('id, curso_id, codigo, nome, ordem, ativo'),
      db.from('mapeamento_activesoft').select('id, versao_id, tipo, codigo_origem, versao_item_id, destino_valor, confirmado'),
      db.from('sistema_avaliacao').select('curso_id, media_aprovacao')
    ]);
    for (const r of [series, mapeamentos, sistemas]) if (r.error) throw r.error;
    const seriesLocais = (series.data || []) as SerieLocal[];
    const maps = (mapeamentos.data || []) as MapeamentoLocal[];
    const mediaPorCurso = new Map<string, number | null>((sistemas.data || []).map(s => [s.curso_id, s.media_aprovacao]));

    const mapaSerie = new Map<string, string>();       // codigo_origem → serie_id
    const mapaSituacao = new Map<string, string>();    // normalizado → enum
    for (const m of maps) {
      if (!m.confirmado || m.versao_id) continue;
      if (m.tipo === 'serie' && m.destino_valor) mapaSerie.set(m.codigo_origem, m.destino_valor);
      if (m.tipo === 'situacao' && m.destino_valor) mapaSituacao.set(normalizar(m.codigo_origem), m.destino_valor);
    }
    const mapaDisciplina = new Map<string, MapeamentoLocal>(); // `${versao_id}|${codigo}` → mapeamento
    for (const m of maps) if (m.tipo === 'disciplina' && m.versao_id) mapaDisciplina.set(`${m.versao_id}|${m.codigo_origem}`, m);

    const registrarPendencia = (chave: string, dados: Omit<NonNullable<ReturnType<typeof pendencias.get>>, 'registros'>) => {
      const p0 = pendencias.get(chave);
      if (p0) p0.registros++; else pendencias.set(chave, { ...dados, registros: 1 });
    };

    /* ---------- 1. ALUNOS ---------- */
    const querAlunos = p.tipo === 'alunos' || p.tipo === 'completo';
    const querMatriculas = p.tipo === 'matriculas' || p.tipo === 'completo';
    const querNotas = p.tipo === 'notas' || p.tipo === 'completo';

    const alunosPorCodigo = new Map<string, { id: string; editado: boolean; dados_importados: Record<string, unknown> | null; editado_por: string | null; editado_em: string | null; [k: string]: unknown }>();
    async function carregarAlunos(codigos: string[]) {
      for (let i = 0; i < codigos.length; i += 200) {
        const { data, error } = await db.from('aluno').select('*').in('codigo_activesoft', codigos.slice(i, i + 200));
        if (error) throw error;
        for (const a of data || []) alunosPorCodigo.set(a.codigo_activesoft, a);
      }
    }

    if (querAlunos) {
      const alunos = await buscarTudo<AlunoOrigem>(pg => adaptador.buscarAlunos(p.filtro, pg));
      cont.lidos += alunos.length;
      await carregarAlunos(alunos.map(a => a.codigoOrigem));

      for (const a of alunos) {
        const local = alunosPorCodigo.get(a.codigoOrigem);
        const valores: Record<string, unknown> = {};
        for (const [origem, coluna] of CAMPOS_ALUNO) { const v = a[origem]; if (v !== undefined) valores[coluna] = v === '' ? null : v; }
        if (a.certidao) { valores.certidao_tipo = a.certidao.tipo ?? null; valores.certidao_termo = a.certidao.termo ?? null; valores.certidao_livro = a.certidao.livro ?? null; valores.certidao_folha = a.certidao.folha ?? null; }
        if (a.situacao !== undefined) valores.situacao = traduzirSituacaoAluno(a.situacao);
        const snapshot = { ...valores };

        if (!local) {
          cont.criados++;
          linha({ entidade: 'aluno', acao: 'criar', chave: a.codigoOrigem, descricao: a.nome });
          if (efetiva) {
            const { data: novo, error } = await db.from('aluno').insert({ ...valores, codigo_activesoft: a.codigoOrigem, origem: adaptador.origem === 'mock' ? 'activesoft' : adaptador.origem === 'activesoft_api' ? 'activesoft' : 'importacao_arquivo', dados_importados: snapshot, sincronizado_em: agora }).select('*').single();
            if (error) throw error;
            alunosPorCodigo.set(a.codigoOrigem, novo);
          } else {
            // simulação: o aluno "existiria" para as matrículas e notas seguintes
            alunosPorCodigo.set(a.codigoOrigem, { id: `sim:${a.codigoOrigem}`, nome: a.nome, editado: false, dados_importados: null, editado_por: null, editado_em: null });
          }
          continue;
        }

        const importadoAntes = (local.dados_importados || {}) as Record<string, unknown>;
        const mudancasOrigem = Object.entries(valores).filter(([c, v]) => JSON.stringify(importadoAntes[c] ?? null) !== JSON.stringify(v ?? null));
        if (!mudancasOrigem.length) { cont.ignorados++; continue; }

        if (!local.editado) {
          cont.atualizados++;
          linha({ entidade: 'aluno', acao: 'atualizar', chave: a.codigoOrigem, descricao: a.nome, detalhe: mudancasOrigem.map(([c]) => c).join(', ') });
          if (efetiva) {
            const { error } = await db.from('aluno').update({ ...Object.fromEntries(mudancasOrigem), dados_importados: { ...importadoAntes, ...snapshot }, sincronizado_em: agora }).eq('id', local.id);
            if (error) throw error;
          }
          continue;
        }

        // editado à mão: campo a campo
        const aplicar: Record<string, unknown> = {};
        let houveDivergencia = false;
        for (const [c, v] of mudancasOrigem) {
          const valorLocal = local[c] ?? null;
          if (JSON.stringify(valorLocal) === JSON.stringify(v ?? null)) { aplicar[c] = v; continue; } // local já igual à origem
          houveDivergencia = true;
          const dv = { entidade: 'aluno' as const, entidade_id: local.id, aluno_id: local.id, descricao: `${local.nome as string} · ${c}`, campo: c, valor_local: { [c]: valorLocal }, valor_origem: { [c]: v ?? null }, contexto: { editado_por: local.editado_por, editado_em: local.editado_em, valor_origem_anterior: importadoAntes[c] ?? null } };
          if (efetiva) divergencias.push(dv); else relatorio.divergenciasPrevistas!.push({ entidade: 'aluno', descricao: dv.descricao, campo: c, valor_local: valorLocal, valor_origem: v ?? null });
        }
        if (houveDivergencia) { cont.com_divergencia++; linha({ entidade: 'aluno', acao: 'divergencia', chave: a.codigoOrigem, descricao: a.nome }); }
        else cont.ignorados++;
        if (efetiva) {
          // campos divergentes NÃO entram em dados_importados: a divergência fica aberta até ser resolvida
          const { error } = await db.from('aluno').update({ ...aplicar, dados_importados: { ...importadoAntes, ...aplicar }, sincronizado_em: agora }).eq('id', local.id);
          if (error) throw error;
        }
      }
    }

    /* ---------- 2. MATRÍCULAS ---------- */
    const matriculasPorCodigo = new Map<string, { id: string; aluno_id: string; serie_id: string; curso_id: string; versao_curricular_id: string | null; editado: boolean; dados_importados: Record<string, unknown> | null; [k: string]: unknown }>();
    async function carregarMatriculas(codigos: string[]) {
      for (let i = 0; i < codigos.length; i += 200) {
        const { data, error } = await db.from('matricula').select('*').in('codigo_activesoft', codigos.slice(i, i + 200));
        if (error) throw error;
        for (const m of data || []) matriculasPorCodigo.set(m.codigo_activesoft, m);
      }
    }

    if (querMatriculas || querNotas) {
      const matriculas = await buscarTudo<MatriculaOrigem>(pg => adaptador.buscarMatriculas(p.filtro, pg));
      if (querMatriculas) cont.lidos += matriculas.length;
      await carregarMatriculas(matriculas.map(m => m.codigoOrigem));
      if (!querAlunos) await carregarAlunos([...new Set(matriculas.map(m => m.alunoCodigoOrigem))]);

      if (querMatriculas) {
        for (const m of matriculas) {
          const aluno = alunosPorCodigo.get(m.alunoCodigoOrigem);
          if (!aluno) {
            cont.erros++;
            linha({ entidade: 'matricula', acao: 'erro', chave: m.codigoOrigem, descricao: `Aluno ${m.alunoCodigoOrigem} não existe localmente`, detalhe: 'Importe os alunos antes das matrículas (tipo "completo" faz os dois).' });
            continue;
          }
          const serieId = mapaSerie.get(m.serieCodigoOrigem);
          if (!serieId) {
            cont.pendentes_mapeamento++;
            const melhor = seriesLocais.filter(s => s.ativo).map(s => ({ s, score: Math.max(similaridade(m.serieDescricao || m.serieCodigoOrigem, s.nome), similaridade(m.serieCodigoOrigem, s.codigo)) })).sort((a, b) => b.score - a.score)[0];
            registrarPendencia(`serie|${m.serieCodigoOrigem}`, { versao_id: null, tipo: 'serie', codigo_origem: m.serieCodigoOrigem, descricao_origem: m.serieDescricao || null, sugestao_item_id: null, destino_sugerido: melhor && melhor.score >= 0.5 ? melhor.s.id : null });
            linha({ entidade: 'matricula', acao: 'pendencia', chave: m.codigoOrigem, descricao: `${aluno.nome as string} · série "${m.serieCodigoOrigem}" sem mapeamento` });
            continue;
          }
          if (m.anoLetivo !== p.filtro.anoLetivo) { cont.ignorados++; continue; }
          const serie = seriesLocais.find(s => s.id === serieId)!;
          const valores: Record<string, unknown> = {
            turma: m.turma ?? null, numero_matricula: m.numeroMatricula ?? null, data_matricula: m.dataMatricula ?? null, data_saida: m.dataSaida ?? null,
            carga_horaria_total: m.cargaHorariaTotal ?? null
          };
          if (m.situacaoFinal !== undefined) valores.situacao_final = traduzirSituacaoMatricula(m.situacaoFinal, mapaSituacao);
          const local = matriculasPorCodigo.get(m.codigoOrigem);

          if (!local) {
            cont.criados++;
            linha({ entidade: 'matricula', acao: 'criar', chave: m.codigoOrigem, descricao: `${aluno.nome as string} · ${serie.nome} ${m.turma || ''} · ${m.anoLetivo}` });
            if (efetiva) {
              const { data: nova, error } = await db.from('matricula').upsert({
                aluno_id: aluno.id, ano_letivo_id: anoLetivo.id, serie_id: serieId, curso_id: serie.curso_id, ...valores,
                codigo_activesoft: m.codigoOrigem, origem: adaptador.origem === 'arquivo_csv' ? 'importacao_arquivo' : 'activesoft', dados_importados: valores, sincronizado_em: agora
              }, { onConflict: 'aluno_id,ano_letivo_id,serie_id' }).select('*').single();
              if (error) throw error;
              matriculasPorCodigo.set(m.codigoOrigem, nova);
              if (!nova.versao_curricular_id) relatorio.avisos.push(`Sem currículo cadastrado para ${m.anoLetivo} / ${serie.nome}: a matrícula de ${aluno.nome as string} ficou sem versão curricular e as notas não podem ser importadas (RF-VER-11).`);
            } else {
              const versao = (await db.rpc('resolver_versao', { p_ano_letivo_id: anoLetivo.id, p_serie_id: serieId })).data as string | null;
              if (!versao) relatorio.avisos.push(`Sem currículo cadastrado para ${m.anoLetivo} / ${serie.nome} — matrículas ficariam sem versão curricular (RF-VER-11).`);
              // simulação: a matrícula "existiria" para as notas seguintes
              matriculasPorCodigo.set(m.codigoOrigem, { id: `sim:${m.codigoOrigem}`, aluno_id: aluno.id, serie_id: serieId, curso_id: serie.curso_id, versao_curricular_id: versao || null, editado: false, dados_importados: null });
            }
            continue;
          }

          const importadoAntes = (local.dados_importados || {}) as Record<string, unknown>;
          const mudancas = Object.entries(valores).filter(([c, v]) => JSON.stringify(importadoAntes[c] ?? null) !== JSON.stringify(v ?? null));
          if (!mudancas.length) { cont.ignorados++; continue; }
          if (!local.editado) {
            cont.atualizados++;
            linha({ entidade: 'matricula', acao: 'atualizar', chave: m.codigoOrigem, descricao: `${aluno.nome as string} · ${serie.nome}`, detalhe: mudancas.map(([c]) => c).join(', ') });
            if (efetiva) {
              const { error } = await db.from('matricula').update({ ...Object.fromEntries(mudancas), dados_importados: { ...importadoAntes, ...valores }, sincronizado_em: agora }).eq('id', local.id);
              if (error) throw error;
            }
            continue;
          }
          let houve = false;
          const aplicar: Record<string, unknown> = {};
          for (const [c, v] of mudancas) {
            if (JSON.stringify(local[c] ?? null) === JSON.stringify(v ?? null)) { aplicar[c] = v; continue; }
            houve = true;
            const dv = { entidade: 'matricula' as const, entidade_id: local.id, aluno_id: aluno.id, descricao: `${aluno.nome as string} · ${serie.nome} · ${c}`, campo: c, valor_local: { [c]: local[c] ?? null }, valor_origem: { [c]: v ?? null }, contexto: { valor_origem_anterior: importadoAntes[c] ?? null } };
            if (efetiva) divergencias.push(dv); else relatorio.divergenciasPrevistas!.push({ entidade: 'matricula', descricao: dv.descricao, campo: c, valor_local: local[c] ?? null, valor_origem: v ?? null });
          }
          if (houve) { cont.com_divergencia++; linha({ entidade: 'matricula', acao: 'divergencia', chave: m.codigoOrigem, descricao: `${aluno.nome as string} · ${serie.nome}` }); } else cont.ignorados++;
          if (efetiva) {
            const { error } = await db.from('matricula').update({ ...aplicar, dados_importados: { ...importadoAntes, ...aplicar }, sincronizado_em: agora }).eq('id', local.id);
            if (error) throw error;
          }
        }
      }
    }

    /* ---------- 3. NOTAS ---------- */
    if (querNotas) {
      const notas = await buscarTudo<NotaOrigem>(pg => adaptador.buscarNotas(p.filtro, pg));
      cont.lidos += notas.length;

      // itens das versões envolvidas
      const versoes = [...new Set([...matriculasPorCodigo.values()].map(m => m.versao_curricular_id).filter(Boolean))] as string[];
      const itensPorVersao = new Map<string, ItemLocal[]>();
      for (const vid of versoes) {
        const { data, error } = await db.from('versao_item').select('id, serie_id, componente_id, nome_impresso, versao_agrupamento!inner(versao_bloco!inner(versao_id))').eq('versao_agrupamento.versao_bloco.versao_id', vid);
        if (error) throw error;
        itensPorVersao.set(vid, (data || []).map(i => ({ id: i.id, serie_id: i.serie_id, componente_id: i.componente_id, nome_impresso: i.nome_impresso, versao_id: vid })));
      }
      const itemPorId = new Map<string, ItemLocal>();
      for (const lista of itensPorVersao.values()) for (const i of lista) itemPorId.set(i.id, i);

      // notas locais das matrículas envolvidas
      const notasLocais = new Map<string, { id: string; valor: number | null; conceito: string | null; faltas: number | null; situacao: string; carga_horaria: number | null; editado: boolean; editado_por: string | null; editado_em: string | null; valor_importado: Record<string, unknown> | null }>();
      const idsMat = [...matriculasPorCodigo.values()].map(m => m.id).filter(id => !id.startsWith('sim:'));
      for (let i = 0; i < idsMat.length; i += 100) {
        const { data, error } = await db.from('nota').select('*').in('matricula_id', idsMat.slice(i, i + 100));
        if (error) throw error;
        for (const n of data || []) notasLocais.set(`${n.matricula_id}|${n.versao_item_id}`, n);
      }
      const motivosAuditoria = new Map<string, string>();
      if (idsMat.length) {
        const { data: aud } = await db.from('auditoria').select('entidade_id, motivo').eq('entidade', 'nota').eq('acao', 'editar').order('criado_em', { ascending: false });
        for (const a of aud || []) if (a.entidade_id && !motivosAuditoria.has(a.entidade_id)) motivosAuditoria.set(a.entidade_id, a.motivo || '');
      }

      for (const n of notas) {
        const mat = matriculasPorCodigo.get(n.matriculaCodigoOrigem);
        if (!mat) {
          cont.erros++;
          linha({ entidade: 'nota', acao: 'erro', chave: `${n.matriculaCodigoOrigem}/${n.disciplinaCodigoOrigem}`, descricao: `Matrícula ${n.matriculaCodigoOrigem} não existe localmente`, detalhe: 'Importe as matrículas antes das notas.' });
          continue;
        }
        const aluno = [...alunosPorCodigo.values()].find(a => a.id === mat.aluno_id);
        const nomeAluno = (aluno?.nome as string) || mat.aluno_id;
        if (!mat.versao_curricular_id) {
          cont.erros++;
          linha({ entidade: 'nota', acao: 'erro', chave: `${n.matriculaCodigoOrigem}/${n.disciplinaCodigoOrigem}`, descricao: `${nomeAluno}: matrícula sem versão curricular`, detalhe: 'Cadastre a vigência (ano letivo × série) em Currículos e reimporte (RF-VER-11).' });
          continue;
        }
        const itens = itensPorVersao.get(mat.versao_curricular_id) || [];
        const map = mapaDisciplina.get(`${mat.versao_curricular_id}|${n.disciplinaCodigoOrigem}`);
        let item: ItemLocal | undefined;
        if (map?.confirmado && map.versao_item_id) {
          const alvo = itemPorId.get(map.versao_item_id);
          // o mapeamento aponta para uma linha da grade; resolve a linha da MESMA identidade na série da matrícula
          if (alvo) item = alvo.serie_id === mat.serie_id ? alvo : itens.find(i => i.serie_id === mat.serie_id && (alvo.componente_id ? i.componente_id === alvo.componente_id : normalizar(i.nome_impresso) === normalizar(alvo.nome_impresso)));
        }
        if (!item) {
          cont.pendentes_mapeamento++;
          const candidatos = itens.filter(i => i.serie_id === mat.serie_id);
          const melhor = candidatos.map(i => ({ i, score: similaridade(n.disciplinaDescricao || n.disciplinaCodigoOrigem, i.nome_impresso) })).sort((a, b) => b.score - a.score)[0];
          registrarPendencia(`disciplina|${mat.versao_curricular_id}|${n.disciplinaCodigoOrigem}`, { versao_id: mat.versao_curricular_id, tipo: 'disciplina', codigo_origem: n.disciplinaCodigoOrigem, descricao_origem: n.disciplinaDescricao || null, sugestao_item_id: melhor && melhor.score >= 0.5 ? melhor.i.id : null, destino_sugerido: null });
          linha({ entidade: 'nota', acao: 'pendencia', chave: `${n.matriculaCodigoOrigem}/${n.disciplinaCodigoOrigem}`, descricao: `${nomeAluno} · "${n.disciplinaDescricao || n.disciplinaCodigoOrigem}" sem mapeamento`, detalhe: map && !map.confirmado ? 'Mapeamento existe mas não foi confirmado.' : (map && !item ? 'O item mapeado não existe nesta série.' : undefined) });
          continue;
        }

        const media = mediaPorCurso.get(mat.curso_id) ?? null;
        const origem: Record<string, unknown> = {
          valor: n.valor ?? null, conceito: n.conceito ?? null, faltas: n.faltas ?? null,
          situacao: traduzirSituacaoNota(n.situacao, n.valor, media), carga_horaria: n.cargaHoraria ?? null
        };
        const chave = `${mat.id}|${item.id}`;
        const local = notasLocais.get(chave);
        const descricao = `${nomeAluno} · ${item.nome_impresso}`;

        if (!local) {
          cont.criados++;
          linha({ entidade: 'nota', acao: 'criar', chave: `${n.matriculaCodigoOrigem}/${n.disciplinaCodigoOrigem}`, descricao, detalhe: origem.valor != null ? String(origem.valor) : (origem.conceito as string) || '—' });
          if (efetiva) {
            const { error } = await db.from('nota').insert({ matricula_id: mat.id, versao_item_id: item.id, ...origem, origem: adaptador.origem === 'arquivo_csv' ? 'importacao_arquivo' : 'activesoft', valor_importado: origem, sincronizado_em: agora });
            if (error) throw error;
          }
          continue;
        }

        const importadoAntes = (local.valor_importado || {}) as Record<string, unknown>;
        const mudancas = Object.entries(origem).filter(([c, v]) => JSON.stringify(importadoAntes[c] ?? null) !== JSON.stringify(v ?? null));
        if (!mudancas.length) { cont.ignorados++; continue; }

        if (!local.editado) {
          cont.atualizados++;
          linha({ entidade: 'nota', acao: 'atualizar', chave: `${n.matriculaCodigoOrigem}/${n.disciplinaCodigoOrigem}`, descricao, detalhe: mudancas.map(([c, v]) => `${c}: ${importadoAntes[c] ?? '—'} → ${v ?? '—'}`).join(', ') });
          if (efetiva) {
            const { error } = await db.from('nota').update({ ...Object.fromEntries(mudancas), valor_importado: { ...importadoAntes, ...origem }, sincronizado_em: agora }).eq('id', local.id);
            if (error) throw error;
          }
          continue;
        }

        // editada à mão (RF-INT-06): campo a campo, valor local vs origem
        let houve = false;
        const aplicar: Record<string, unknown> = {};
        for (const [c, v] of mudancas) {
          const valorLocal = (local as Record<string, unknown>)[c] ?? null;
          if (JSON.stringify(valorLocal) === JSON.stringify(v ?? null)) { aplicar[c] = v; continue; }
          houve = true;
          const dv = { entidade: 'nota' as const, entidade_id: local.id, aluno_id: mat.aluno_id, descricao: `${descricao} · ${c === 'valor' ? 'nota final' : c}`, campo: c, valor_local: { [c]: valorLocal }, valor_origem: { [c]: v ?? null }, contexto: { editado_por: local.editado_por, editado_em: local.editado_em, motivo: motivosAuditoria.get(local.id) || null, valor_origem_anterior: importadoAntes[c] ?? null } };
          if (efetiva) divergencias.push(dv); else relatorio.divergenciasPrevistas!.push({ entidade: 'nota', descricao: dv.descricao, campo: c, valor_local: valorLocal, valor_origem: v ?? null });
        }
        if (houve) { cont.com_divergencia++; linha({ entidade: 'nota', acao: 'divergencia', chave: `${n.matriculaCodigoOrigem}/${n.disciplinaCodigoOrigem}`, descricao }); } else cont.ignorados++;
        if (efetiva) {
          const { error } = await db.from('nota').update({ ...aplicar, valor_importado: { ...importadoAntes, ...aplicar }, sincronizado_em: agora }).eq('id', local.id);
          if (error) throw error;
        }
      }
    }

    /* ---------- pendências de mapeamento (gravadas nos dois modos) ---------- */
    for (const pd of pendencias.values()) {
      const existente = maps.find(m => m.tipo === pd.tipo && m.codigo_origem === pd.codigo_origem && (m.versao_id || null) === (pd.versao_id || null));
      if (existente) {
        await db.from('mapeamento_activesoft').update({ registros_afetados: pd.registros, descricao_origem: pd.descricao_origem, sugestao_item_id: pd.sugestao_item_id }).eq('id', existente.id);
      } else {
        const { error } = await db.from('mapeamento_activesoft').insert({
          versao_id: pd.versao_id, tipo: pd.tipo, codigo_origem: pd.codigo_origem, descricao_origem: pd.descricao_origem,
          sugestao_item_id: pd.sugestao_item_id, destino_valor: pd.tipo === 'serie' ? pd.destino_sugerido : null, confirmado: false, registros_afetados: pd.registros
        });
        if (error && (error as { code?: string }).code !== '23505') throw error;
      }
    }

    /* ---------- divergências (só efetiva) ---------- */
    if (efetiva && divergencias.length) {
      const { error } = await db.from('importacao_divergencia').insert(divergencias.map(d => ({ ...d, importacao_id: importacaoId })));
      if (error) throw error;
    }
    if (efetiva && (cont.criados || cont.atualizados)) {
      await db.from('auditoria').insert({ entidade: 'importacao', entidade_id: importacaoId, acao: 'importar', valor_novo: { ...cont, tipo: p.tipo, filtro: p.filtro }, usuario_email: p.usuario });
    }

    const { error: eFim } = await db.from('importacao').update({ status: 'concluida', ...cont, relatorio, concluido_em: new Date().toISOString() }).eq('id', importacaoId);
    if (eFim) throw eFim;
    return { id: importacaoId, ...cont, relatorio };
  } catch (err) {
    const msg = (err as Error).message || String(err);
    await db.from('importacao').update({ status: 'erro', erro: msg, ...cont, relatorio, concluido_em: new Date().toISOString() }).eq('id', importacaoId);
    throw err;
  }
}
