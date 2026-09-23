// Monta a grade curricular a partir do que o Activesoft (ou o arquivo)
// realmente manda, em vez de exigir que ela seja digitada antes da
// primeira importação.
//
// O problema que isto resolve: sem grade não há `versao_item`, sem
// `versao_item` não há onde encaixar nota, e a importação devolve uma
// pendência por disciplina por série — dezenas de escolhas manuais para
// dizer ao sistema o que a origem já tinha dito. Só que a origem não
// manda a grade inteira: ela manda disciplinas soltas, sem os blocos
// ("Formação Geral Básica") e sem os agrupamentos ("Linguagens e suas
// Tecnologias") que o histórico imprime. Essa parte é decisão da escola.
//
// Então o que se automatiza é o trabalho braçal — quais disciplinas
// existem em cada série, com que carga horária, e qual código da origem
// aponta para cada uma — e o que fica com a secretaria é a organização
// e a publicação.
//
// Escreve SEMPRE em rascunho. Versão publicada é imutável no banco
// (trigger `bloquear_edicao_versao_em_uso`), e com razão: dois alunos do
// mesmo ano não podem receber históricos com grades diferentes porque
// uma sincronização acrescentou uma linha no meio do caminho.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdaptadorAcademico } from '../adapters/activesoft';
import { buscarTudo } from '../adapters/activesoft';
import type { MatriculaOrigem, NotaOrigem } from '../../shared/types/importacao';
import { normalizar, similaridade, casamentoUnico } from './importacao';

export interface ParametrosGrade {
  anoLetivo: number;
  cursoId: string;
  /** Rascunho a completar. Sem isto, usa o rascunho do curso ou cria um. */
  versaoId?: string;
  nomeVersao?: string;
  modo: 'simulacao' | 'efetiva';
  usuario: string;
}

export interface LinhaGrade { serie: string; nome_impresso: string; carga_horaria: number | null; codigo_origem: string; componente_novo: boolean }

export interface RelatorioGrade {
  versao: { id: string; nome: string } | null;
  criouVersao: boolean;
  linhasCriadas: LinhaGrade[];
  linhasExistentes: number;
  componentesCriados: string[];
  mapeamentosCriados: number;
  seriesSemDestino: { codigo_origem: string; descricao: string | null; registros: number }[];
  avisos: string[];
}

const AGRUPAMENTO_PADRAO = 'A classificar';

interface SerieLocal { id: string; curso_id: string; codigo: string; nome: string; ordem: number; ativo: boolean }

export async function montarGradeDaOrigem(db: SupabaseClient, adaptador: AdaptadorAcademico, p: ParametrosGrade): Promise<RelatorioGrade> {
  const efetiva = p.modo === 'efetiva';
  const rel: RelatorioGrade = {
    versao: null, criouVersao: false, linhasCriadas: [], linhasExistentes: 0,
    componentesCriados: [], mapeamentosCriados: 0, seriesSemDestino: [], avisos: []
  };

  const [curso, series, comps, maps] = await Promise.all([
    db.from('curso').select('id, nome').eq('id', p.cursoId).single(),
    db.from('serie').select('id, curso_id, codigo, nome, ordem, ativo'),
    db.from('componente').select('id, nome_canonico, sigla, ativo'),
    db.from('mapeamento_activesoft').select('id, versao_id, tipo, codigo_origem, componente_id, destino_valor, confirmado')
  ]);
  for (const r of [curso, series, comps, maps]) if (r.error) throw r.error;
  const todasAsSeries = (series.data || []) as SerieLocal[];
  const seriesDoCurso = todasAsSeries.filter(s => s.curso_id === p.cursoId);
  if (!seriesDoCurso.length) throw new Error(`O curso "${curso.data?.nome || "selecionado"}" não tem séries cadastradas. Cadastre as séries em Configuração › Cursos e séries antes de montar a grade.`);

  const componentes = (comps.data || []) as { id: string; nome_canonico: string; sigla: string | null; ativo: boolean }[];
  const mapeamentos = (maps.data || []) as { id: string; versao_id: string | null; tipo: string; codigo_origem: string; componente_id: string | null; destino_valor: string | null; confirmado: boolean }[];

  // código de série na origem → série local, pelo mapeamento confirmado
  // ou pelo mesmo casamento por nome que a importação usa
  const mapaSerie = new Map<string, string>();
  for (const m of mapeamentos) if (m.tipo === 'serie' && m.confirmado && m.destino_valor && !m.versao_id) mapaSerie.set(m.codigo_origem, m.destino_valor);
  // código de disciplina → componente já decidido globalmente
  const mapaComponente = new Map<string, string>();
  for (const m of mapeamentos) if (m.tipo === 'disciplina' && !m.versao_id && m.confirmado && m.componente_id) mapaComponente.set(m.codigo_origem, m.componente_id);

  /* ---------- o que a origem tem ---------- */
  const matriculas = await buscarTudo<MatriculaOrigem>(pg => adaptador.buscarMatriculas({ anoLetivo: p.anoLetivo }, pg));
  const notas = await buscarTudo<NotaOrigem>(pg => adaptador.buscarNotas({ anoLetivo: p.anoLetivo }, pg));
  const serieDaMatricula = new Map<string, { codigo: string; descricao: string | null }>();
  for (const m of matriculas) serieDaMatricula.set(m.codigoOrigem, { codigo: m.serieCodigoOrigem, descricao: m.serieDescricao || null });

  const candidatas = seriesDoCurso.filter(s => s.ativo);
  const porNomeOuCodigo = (nome: string, codigo: string): string | null => {
    const auto = casamentoUnico(candidatas.map(s => ({
      alvo: s, score: Math.max(similaridade(nome, s.nome), similaridade(codigo, s.codigo))
    })));
    return auto ? auto.id : null;
  };
  /**
   * Série da origem → série DESTE curso.
   *
   * O mapeamento de série é global e aponta para uma série só, que
   * pertence a um curso só. Quando ele aponta para outro curso, não é
   * motivo para desistir: quem pediu a grade escolheu o curso, e o que
   * falta é a equivalente aqui. "1ª série" do Bilíngue e "1ª série" do
   * Integral são a mesma posição em cursos diferentes.
   */
  const resolverSerie = (codigo: string, descricao: string | null): string | null => {
    const direto = mapaSerie.get(codigo);
    if (direto) {
      const aqui = seriesDoCurso.find(s => s.id === direto);
      if (aqui) return aqui.id;
      const noutroCurso = todasAsSeries.find(s => s.id === direto);
      if (noutroCurso) return porNomeOuCodigo(noutroCurso.nome, noutroCurso.codigo);
    }
    return porNomeOuCodigo(descricao || codigo, codigo);
  };

  // (série local, código da disciplina) → o que a origem diz dela
  const desejado = new Map<string, { serie_id: string; codigo: string; descricao: string; carga: number | null; registros: number }>();
  const semSerie = new Map<string, { codigo_origem: string; descricao: string | null; registros: number }>();
  for (const n of notas) {
    const orig = serieDaMatricula.get(n.matriculaCodigoOrigem);
    if (!orig) continue;
    const serieId = resolverSerie(orig.codigo, orig.descricao);
    if (!serieId) {
      const s = semSerie.get(orig.codigo);
      if (s) s.registros++; else semSerie.set(orig.codigo, { codigo_origem: orig.codigo, descricao: orig.descricao, registros: 1 });
      continue;
    }
    const chave = `${serieId}|${n.disciplinaCodigoOrigem}`;
    const d = desejado.get(chave);
    if (d) { d.registros++; if (d.carga == null && n.cargaHoraria != null) d.carga = n.cargaHoraria; continue; }
    desejado.set(chave, {
      serie_id: serieId, codigo: n.disciplinaCodigoOrigem,
      descricao: (n.disciplinaDescricao || n.disciplinaCodigoOrigem).trim(),
      carga: n.cargaHoraria ?? null, registros: 1
    });
  }
  rel.seriesSemDestino = [...semSerie.values()].sort((a, b) => b.registros - a.registros);
  if (!desejado.size) {
    rel.avisos.push(`A origem não devolveu nenhuma nota de ${p.anoLetivo} para séries deste curso. Confira o ano letivo, e se as séries da origem já estão mapeadas para as séries do curso.`);
    return rel;
  }

  /* ---------- o rascunho onde a grade vai morar ---------- */
  let versaoId = p.versaoId || null;
  if (versaoId) {
    const { data, error } = await db.from('versao_curricular').select('id, nome, status, curso_id').eq('id', versaoId).single();
    if (error) throw error;
    if (data.curso_id !== p.cursoId) throw new Error('A versão informada é de outro curso.');
    if (data.status !== 'rascunho') throw new Error(`"${data.nome}" já está publicada, e versão em uso é somente leitura. Duplique-a e monte a grade na cópia.`);
    rel.versao = { id: data.id, nome: data.nome };
  } else {
    const { data: rascunho, error } = await db.from('versao_curricular').select('id, nome').eq('curso_id', p.cursoId).eq('status', 'rascunho').order('criado_em', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (rascunho) {
      versaoId = rascunho.id;
      rel.versao = { id: rascunho.id, nome: rascunho.nome };
      rel.avisos.push(`Completando o rascunho "${rascunho.nome}", que já existia neste curso.`);
    } else {
      const nome = (p.nomeVersao || `Grade do Activesoft ${p.anoLetivo}`).trim();
      if (!efetiva) { rel.criouVersao = true; rel.versao = { id: 'sim', nome }; }
      else {
        const { data, error: eV } = await db.from('versao_curricular').insert({ curso_id: p.cursoId, nome, status: 'rascunho', criado_por: p.usuario, base_legal: null }).select('id, nome').single();
        if (eV) throw eV;
        versaoId = data.id;
        rel.versao = { id: data.id, nome: data.nome };
        rel.criouVersao = true;
      }
    }
  }

  // bloco e agrupamento onde as linhas novas caem. Ficam com nome
  // provisório de propósito: é o que a secretaria tem de organizar antes
  // de publicar, e um nome neutro deixa isso visível em vez de disfarçar.
  let agrupamentoId: string | null = null;
  const gradeAtual: { id: string; serie_id: string; componente_id: string | null; nome_impresso: string }[] = [];
  if (versaoId) {
    const { data: blocos, error: eB } = await db.from('versao_bloco').select('id, nome, versao_agrupamento(id, nome)').eq('versao_id', versaoId);
    if (eB) throw eB;
    for (const b of blocos || []) {
      for (const a of (b.versao_agrupamento || []) as { id: string; nome: string }[]) {
        if (normalizar(a.nome) === normalizar(AGRUPAMENTO_PADRAO)) agrupamentoId = a.id;
      }
    }
    if (!agrupamentoId && efetiva) {
      let blocoId = (blocos || [])[0]?.id as string | undefined;
      if (!blocoId) {
        const { data, error } = await db.from('versao_bloco').insert({ versao_id: versaoId, nome: AGRUPAMENTO_PADRAO, ordem: 0 }).select('id').single();
        if (error) throw error;
        blocoId = data.id;
      }
      const { data, error } = await db.from('versao_agrupamento').insert({ versao_bloco_id: blocoId, nome: AGRUPAMENTO_PADRAO, ordem: 99 }).select('id').single();
      if (error) throw error;
      agrupamentoId = data.id;
    }

    const { data: itens, error: eI } = await db.from('versao_item')
      .select('id, serie_id, componente_id, nome_impresso, versao_agrupamento!inner(versao_bloco!inner(versao_id))')
      .eq('versao_agrupamento.versao_bloco.versao_id', versaoId);
    if (eI) throw eI;
    for (const i of itens || []) gradeAtual.push({ id: i.id, serie_id: i.serie_id, componente_id: i.componente_id, nome_impresso: i.nome_impresso });
  }

  /* ---------- componente de cada código ---------- */
  const porNomeCanonico = new Map(componentes.map(c => [normalizar(c.nome_canonico), c.id]));
  const nomePorId = new Map(componentes.map(c => [c.id, c.nome_canonico]));
  const componentePorCodigo = new Map<string, string>();   // código → componente id (ou 'novo:<nome>')
  const criarComponente = new Map<string, string>();       // nome canônico → código que pediu

  for (const d of desejado.values()) {
    if (componentePorCodigo.has(d.codigo)) continue;
    const jaMapeado = mapaComponente.get(d.codigo);
    if (jaMapeado) { componentePorCodigo.set(d.codigo, jaMapeado); continue; }
    const porNome = porNomeCanonico.get(normalizar(d.descricao));
    if (porNome) { componentePorCodigo.set(d.codigo, porNome); continue; }
    // nada no cadastro com esse nome: o componente nasce com a descrição
    // da origem como nome canônico, que é o que a secretaria reconhece
    componentePorCodigo.set(d.codigo, `novo:${d.descricao}`);
    criarComponente.set(d.descricao, d.codigo);
  }

  if (efetiva) {
    for (const nome of criarComponente.keys()) {
      const { data, error } = await db.from('componente').insert({ nome_canonico: nome }).select('id, nome_canonico').single();
      if (error && (error as { code?: string }).code === '23505') {
        // corrida, ou nome que já existia com caixa/acento diferente
        const { data: existente, error: e2 } = await db.from('componente').select('id, nome_canonico').ilike('nome_canonico', nome).maybeSingle();
        if (e2) throw e2;
        if (existente) { porNomeCanonico.set(normalizar(nome), existente.id); nomePorId.set(existente.id, existente.nome_canonico); continue; }
        throw error;
      }
      if (error) throw error;
      porNomeCanonico.set(normalizar(nome), data.id);
      nomePorId.set(data.id, data.nome_canonico);
      rel.componentesCriados.push(data.nome_canonico);
    }
  } else {
    rel.componentesCriados.push(...criarComponente.keys());
  }
  const idDoComponente = (marca: string) => marca.startsWith('novo:') ? (porNomeCanonico.get(normalizar(marca.slice(5))) || null) : marca;

  /* ---------- as linhas da grade ---------- */
  const nomeSerie = new Map(seriesDoCurso.map(s => [s.id, s.nome]));
  const pendentesOrdenadas = [...desejado.values()].sort((a, b) =>
    (seriesDoCurso.find(s => s.id === a.serie_id)?.ordem ?? 0) - (seriesDoCurso.find(s => s.id === b.serie_id)?.ordem ?? 0)
    || a.descricao.localeCompare(b.descricao, 'pt-BR'));

  let ordem = gradeAtual.length;
  for (const d of pendentesOrdenadas) {
    const compId = idDoComponente(componentePorCodigo.get(d.codigo)!);
    // já existe na grade? por identidade, ou pelo nome quando a linha
    // antiga foi criada sem componente
    const existe = gradeAtual.some(i => i.serie_id === d.serie_id && (
      (compId && i.componente_id === compId) ||
      (!i.componente_id && normalizar(i.nome_impresso) === normalizar(d.descricao))
    ));
    if (existe) { rel.linhasExistentes++; continue; }

    const linha: LinhaGrade = {
      serie: nomeSerie.get(d.serie_id) || 'série', nome_impresso: d.descricao,
      carga_horaria: d.carga, codigo_origem: d.codigo,
      componente_novo: !!componentePorCodigo.get(d.codigo)?.startsWith('novo:')
    };
    if (efetiva && agrupamentoId) {
      const { data, error } = await db.from('versao_item').insert({
        versao_agrupamento_id: agrupamentoId, serie_id: d.serie_id, componente_id: compId,
        nome_impresso: d.descricao, carga_horaria: d.carga, ordem: ordem++
      }).select('id').single();
      // a mesma identidade já está no agrupamento: nada a fazer
      if (error && (error as { code?: string }).code === '23505') { rel.linhasExistentes++; continue; }
      if (error) throw error;
      gradeAtual.push({ id: data.id, serie_id: d.serie_id, componente_id: compId, nome_impresso: d.descricao });
    } else {
      // a simulação precisa lembrar o que já decidiu criar, senão vários
      // códigos que caem no MESMO componente aparecem como várias linhas
      // e a prévia promete uma grade maior do que a que vai existir
      gradeAtual.push({ id: `sim:${d.serie_id}|${d.codigo}`, serie_id: d.serie_id, componente_id: compId, nome_impresso: d.descricao });
    }
    rel.linhasCriadas.push(linha);
  }

  /* ---------- o mapeamento global de cada código ---------- */
  // Fechar o ciclo: a grade nasce com as disciplinas da origem E com o
  // código que aponta para cada uma. Sem isto, a importação seguinte
  // pediria à mão exatamente o que acabou de ser deduzido aqui.
  const OBS = `Definido ao montar a grade a partir da origem (${p.anoLetivo}). Vale para todos os cursos — troque em Mapeamentos se não for isso.`;
  for (const [codigo, marca] of componentePorCodigo) {
    if (mapaComponente.has(codigo)) continue;
    const compId = idDoComponente(marca);
    if (!compId) continue;
    rel.mapeamentosCriados++;
    if (!efetiva) continue;
    const existente = mapeamentos.find(m => m.tipo === 'disciplina' && !m.versao_id && m.codigo_origem === codigo);
    const patch = { componente_id: compId, versao_item_id: null, confirmado: true, observacao: OBS };
    if (existente) {
      const { error } = await db.from('mapeamento_activesoft').update(patch).eq('id', existente.id);
      if (error) throw error;
    } else {
      const descricao = [...desejado.values()].find(d => d.codigo === codigo)?.descricao || null;
      const { error } = await db.from('mapeamento_activesoft').insert({ versao_id: null, tipo: 'disciplina', codigo_origem: codigo, descricao_origem: descricao, ...patch });
      if (error && (error as { code?: string }).code !== '23505') throw error;
    }
  }

  /* ---------- o que ainda depende de gente ---------- */
  if (rel.linhasCriadas.length) {
    rel.avisos.push(`As linhas novas entraram no agrupamento "${AGRUPAMENTO_PADRAO}". A origem manda disciplinas soltas, sem os blocos e agrupamentos que o histórico imprime — organize-as antes de publicar, senão o documento sai com esse nome provisório.`);
  }
  if (efetiva && versaoId) {
    const { data: totais, error } = await db.from('versao_total').select('serie_id').eq('versao_id', versaoId);
    if (error) throw error;
    const faltam = seriesDoCurso.filter(s => s.ativo && !(totais || []).some(t => t.serie_id === s.id));
    if (faltam.length) rel.avisos.push(`Falta o total anual de aulas e horas de ${faltam.length} série(s): ${faltam.map(s => s.nome).join(', ')}. O histórico imprime esses totais.`);
  }
  if (rel.seriesSemDestino.length) {
    rel.avisos.push(`${rel.seriesSemDestino.length} código(s) de série da origem não casaram com nenhuma série deste curso e ficaram de fora: ${rel.seriesSemDestino.slice(0, 5).map(s => s.codigo_origem).join(', ')}. Se forem de outro curso, monte a grade dele também; se forem deste, mapeie a série em Mapeamentos.`);
  }
  if (!adaptador.capacidades().cargaHoraria) {
    rel.avisos.push('A origem não devolve carga horária por disciplina, então as linhas nasceram sem ela. Preencha no currículo, ou deixe que o histórico use os totais anuais.');
  }
  return rel;
}
