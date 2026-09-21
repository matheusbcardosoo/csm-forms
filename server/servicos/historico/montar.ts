// Montagem do histórico escolar (F5, 02-arquitetura §4 e D2).
//
// Este módulo é a ÚNICA fonte do documento: a pré-visualização React e o
// template EJS de PDF renderizam o mesmo `HistoricoDocumento` produzido
// aqui (RNF-04). Tudo que é decisão de conteúdo — casamento de linhas
// entre versões curriculares, qual nome imprimir, onde vai traço, texto do
// certificado — acontece neste arquivo, e não nos renderizadores.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  dataCurta, dataPorExtenso, normalizar, notaImpressa, textoCertificado,
  RODAPE_HISTORICO, metaTipo,
  type AssinaturaDocumento, type BlocoDocumento, type ColunaAno, type EstabelecimentoLinha,
  type Historico, type HistoricoDocumento
} from '../../../shared/types/historico';
import { linhasCabecalho, type AtoLegal, type Instituicao, type Signatario } from '../../../shared/types/instituicao';
import { CAMPOS_OBRIGATORIOS_HISTORICO, type Aluno, type ItemValidacao } from '../../../shared/types/aluno';
import { ROTULO_ETAPA_CURTO, type Curso, type EtapaEnsino } from '../../../shared/types/curriculo';

type Cliente = SupabaseClient;

interface MatriculaDoc {
  id: string;
  ano: number;
  serie_id: string;
  serie_nome: string;
  serie_codigo: string;
  curso_id: string;
  curso_nome: string;
  curso_etapa: EtapaEnsino;
  versao_id: string | null;
  versao_nome: string | null;
  situacao_final: string;
  externa: boolean;
  estabelecimento_nome: string | null;
  estabelecimento_municipio: string | null;
  estabelecimento_uf: string | null;
}

export interface ItemVersao {
  id: string;
  nome_impresso: string;
  componente_id: string | null;
  ordem: number;
  agrupamento_nome: string;
  agrupamento_ordem: number;
  bloco_nome: string;
  bloco_ordem: number;
}

export interface ResultadoMontagem {
  documento: HistoricoDocumento;
  validacao: ItemValidacao[];
  matriculas: MatriculaDoc[];
}

/* ---------------- carregamento ---------------- */

async function carregarMatriculas(client: Cliente, ids: string[]): Promise<MatriculaDoc[]> {
  if (!ids.length) return [];
  const { data, error } = await client.from('matricula')
    .select('id, serie_id, curso_id, versao_curricular_id, situacao_final, estabelecimento_externo_id, ano_letivo(ano), serie(codigo, nome), curso(nome, etapa), versao:versao_curricular(id, nome), estabelecimento:estabelecimento_externo(nome, municipio, uf)')
    .in('id', ids);
  if (error) throw error;
  type Linha = {
    id: string; serie_id: string; curso_id: string; versao_curricular_id: string | null; situacao_final: string;
    estabelecimento_externo_id: string | null;
    ano_letivo: { ano: number } | null; serie: { codigo: string; nome: string } | null;
    curso: { nome: string; etapa: EtapaEnsino } | null; versao: { id: string; nome: string } | null;
    estabelecimento: { nome: string; municipio: string | null; uf: string | null } | null;
  };
  return ((data || []) as unknown as Linha[])
    .map(m => ({
      id: m.id,
      ano: m.ano_letivo?.ano || 0,
      serie_id: m.serie_id,
      serie_nome: m.serie?.nome || '',
      serie_codigo: m.serie?.codigo || m.serie?.nome || '',
      curso_id: m.curso_id,
      curso_nome: m.curso?.nome || '',
      curso_etapa: (m.curso?.etapa || 'em') as EtapaEnsino,
      versao_id: m.versao?.id || null,
      versao_nome: m.versao?.nome || null,
      situacao_final: m.situacao_final,
      externa: !!m.estabelecimento_externo_id,
      estabelecimento_nome: m.estabelecimento?.nome || null,
      estabelecimento_municipio: m.estabelecimento?.municipio || null,
      estabelecimento_uf: m.estabelecimento?.uf || null
    }))
    .sort((a, b) => a.ano - b.ano);
}

async function carregarItens(client: Cliente, versaoId: string, serieId: string): Promise<ItemVersao[]> {
  const { data, error } = await client.from('versao_item')
    .select('id, nome_impresso, componente_id, ordem, versao_agrupamento!inner(nome, ordem, versao_bloco!inner(nome, ordem, versao_id))')
    .eq('serie_id', serieId)
    .eq('versao_agrupamento.versao_bloco.versao_id', versaoId)
    .order('ordem');
  if (error) throw error;
  type Linha = {
    id: string; nome_impresso: string; componente_id: string | null; ordem: number;
    versao_agrupamento: { nome: string; ordem: number; versao_bloco: { nome: string; ordem: number } };
  };
  return ((data || []) as unknown as Linha[]).map(i => ({
    id: i.id,
    nome_impresso: i.nome_impresso,
    componente_id: i.componente_id,
    ordem: i.ordem,
    agrupamento_nome: i.versao_agrupamento?.nome || '',
    agrupamento_ordem: i.versao_agrupamento?.ordem ?? 0,
    bloco_nome: i.versao_agrupamento?.versao_bloco?.nome || '',
    bloco_ordem: i.versao_agrupamento?.versao_bloco?.ordem ?? 0
  }));
}

/* ---------------- grade ---------------- */

interface LinhaAcumulada {
  chave: string;
  agrupChave: string;
  nome: string;
  ordem: number;
  blocoNome: string; blocoOrdem: number;
  agrupNome: string; agrupOrdem: number;
  celulas: string[];
}

/**
 * União das matrizes das séries envolvidas (RF-HIST-17). A chave de
 * casamento é (bloco, agrupamento, componente) — caindo para o nome
 * impresso normalizado quando o componente não tem identidade
 * (06-versionamento §4). Percorrendo os anos do mais antigo para o mais
 * recente, a última escrita vence: o nome e a ordem impressos são os da
 * versão do ano mais recente presente no documento.
 *
 * Pura e exportada de propósito: é a regra mais delicada do documento e
 * dá para exercitá-la sem banco nenhum.
 */
export function montarGrade(
  colunas: ColunaAno[],
  itensPorColuna: ItemVersao[][],
  notasPorColuna: Map<string, { valor: number | null; conceito: string | null }>[]
): BlocoDocumento[] {
  const linhas = new Map<string, LinhaAcumulada>();
  const blocos = new Map<string, { nome: string; ordem: number }>();
  const agrupamentos = new Map<string, { blocoChave: string; nome: string; ordem: number }>();

  colunas.forEach((_col, idx) => {
    for (const item of itensPorColuna[idx] || []) {
      const blocoChave = normalizar(item.bloco_nome);
      const agrupChave = `${blocoChave}|${normalizar(item.agrupamento_nome)}`;
      const identidade = item.componente_id || `n:${normalizar(item.nome_impresso)}`;
      const chave = `${agrupChave}|${identidade}`;

      blocos.set(blocoChave, { nome: item.bloco_nome, ordem: item.bloco_ordem });
      agrupamentos.set(agrupChave, { blocoChave, nome: item.agrupamento_nome, ordem: item.agrupamento_ordem });

      let linha = linhas.get(chave);
      if (!linha) {
        linha = { chave, agrupChave, nome: item.nome_impresso, ordem: item.ordem, blocoNome: item.bloco_nome, blocoOrdem: item.bloco_ordem, agrupNome: item.agrupamento_nome, agrupOrdem: item.agrupamento_ordem, celulas: colunas.map(() => '-') };
        linhas.set(chave, linha);
      }
      // versão mais recente manda no nome e na ordem (06-versionamento §4)
      linha.nome = item.nome_impresso;
      linha.ordem = item.ordem;
      linha.blocoNome = item.bloco_nome;
      linha.agrupNome = item.agrupamento_nome;

      const nota = notasPorColuna[idx]?.get(item.id);
      linha.celulas[idx] = nota ? notaImpressa(nota.valor, nota.conceito) : '-';
    }
  });

  const porAgrupamento = new Map<string, LinhaAcumulada[]>();
  for (const l of linhas.values()) {
    const lista = porAgrupamento.get(l.agrupChave) || [];
    lista.push(l);
    porAgrupamento.set(l.agrupChave, lista);
  }

  return [...blocos.entries()]
    .sort((a, b) => a[1].ordem - b[1].ordem)
    .map(([blocoChave, bloco]) => ({
      nome: bloco.nome,
      agrupamentos: [...agrupamentos.entries()]
        .filter(([, ag]) => ag.blocoChave === blocoChave)
        .sort((a, b) => a[1].ordem - b[1].ordem)
        .map(([agrupChave, ag]) => ({
          nome: ag.nome,
          linhas: (porAgrupamento.get(agrupChave) || [])
            .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'))
            .map(l => ({ chave: l.chave, nome: l.nome, celulas: l.celulas }))
        }))
        .filter(ag => ag.linhas.length)
    }))
    .filter(b => b.agrupamentos.length);
}

/* ---------------- assinaturas ---------------- */

function escolherAssinaturas(signatarios: Signatario[], h: Pick<Historico, 'signatario_secretario_id' | 'signatario_diretor_id'>): AssinaturaDocumento[] {
  const ativos = signatarios.filter(s => s.ativo).sort((a, b) => a.ordem - b.ordem);
  const achar = (id: string | null, cargo: Signatario['cargo']) =>
    (id ? signatarios.find(s => s.id === id) : null) || ativos.find(s => s.cargo === cargo) || null;
  // Ordem do papel (05-modelo §2.3): secretária à esquerda, diretor à direita.
  const escolhidos = [achar(h.signatario_secretario_id, 'secretario'), achar(h.signatario_diretor_id, 'diretor')];
  return escolhidos.filter((s): s is Signatario => !!s).map(s => ({
    nome: s.nome,
    cargo: s.cargo_impresso || s.cargo,
    rg: s.rg,
    registro_autorizacao: s.registro_autorizacao,
    assinatura_path: s.assinatura_path
  }));
}

/* ---------------- observações ---------------- */

function montarObservacoes(texto: string | null, matriculas: MatriculaDoc[]): string[] {
  const linhas = (texto || '').split('\n').map(l => l.trim()).filter(Boolean);

  // RF-VER-13: documento que cruza versões ganha a nota da reforma.
  const versoes = new Map<string, { nome: string; anos: number[] }>();
  for (const m of matriculas) {
    if (!m.versao_id || !m.versao_nome) continue;
    const v = versoes.get(m.versao_id) || { nome: m.versao_nome, anos: [] };
    v.anos.push(m.ano);
    versoes.set(m.versao_id, v);
  }
  if (versoes.size > 1) {
    const partes = [...versoes.values()].map(v => {
      const min = Math.min(...v.anos), max = Math.max(...v.anos);
      return `${v.nome} (${min === max ? min : `${min} a ${max}`})`;
    });
    const nota = `Este histórico abrange mais de uma estrutura curricular: ${partes.join('; ')}. Os componentes são apresentados com a nomenclatura da versão mais recente.`;
    if (!linhas.some(l => normalizar(l).startsWith('este historico abrange mais de uma estrutura'))) linhas.push(nota);
  }
  return linhas;
}

/* ---------------- validação ---------------- */

function validar(args: {
  aluno: Aluno; matriculas: MatriculaDoc[]; historico: Pick<Historico, 'tipo' | 'com_certificado' | 'numero_registro_gdae'>;
  blocos: BlocoDocumento[]; assinaturas: AssinaturaDocumento[]; totais: { aulas: string[]; horas: string[] };
  cabecalhoLinhas: string[]; colunas: ColunaAno[];
}): ItemValidacao[] {
  const { aluno, matriculas, historico, blocos, assinaturas, totais, cabecalhoLinhas, colunas } = args;
  const itens: ItemValidacao[] = [];

  for (const c of CAMPOS_OBRIGATORIOS_HISTORICO) {
    if (!aluno[c.campo]) itens.push({ nivel: 'bloqueia', codigo: `aluno.${c.campo}`, mensagem: `${c.rotulo} não preenchido — sai na identificação do documento.`, aba: 'dados' });
  }
  if (!aluno.cpf && !aluno.cin) itens.push({ nivel: 'bloqueia', codigo: 'aluno.documento', mensagem: 'CIN ou CPF não preenchido — sai na identificação do documento.', aba: 'dados' });
  if (!aluno.ra) {
    itens.push(historico.com_certificado
      ? { nivel: 'bloqueia', codigo: 'aluno.ra', mensagem: 'RA não preenchido — é obrigatório no bloco do certificado.', aba: 'dados' }
      : { nivel: 'alerta', codigo: 'aluno.ra', mensagem: 'RA não preenchido — fica fora do documento.', aba: 'dados' });
  }

  if (!colunas.length) itens.push({ nivel: 'bloqueia', codigo: 'documento.sem_anos', mensagem: 'Nenhum ano letivo selecionado para o documento.', aba: 'trajetoria' });

  for (const m of matriculas) {
    const rot = `${m.ano} · ${m.serie_nome}`;
    if (!m.versao_id && !m.externa) {
      itens.push({ nivel: 'bloqueia', codigo: 'matricula.sem_versao', mensagem: `${rot}: nenhum currículo cadastrado para o período — a emissão fica bloqueada (RF-VER-11). Cadastre a versão vigente daquele ano em Currículos.`, matricula_id: m.id, aba: 'trajetoria' });
    }
    if (m.situacao_final === 'em_curso' && historico.com_certificado) {
      itens.push({ nivel: 'bloqueia', codigo: 'matricula.em_curso', mensagem: `${rot}: situação final ainda "em curso" — histórico de conclusão exige o ano encerrado.`, matricula_id: m.id, aba: 'trajetoria' });
    }
  }

  const semNota = blocos.flatMap(b => b.agrupamentos.flatMap(ag => ag.linhas))
    .filter(l => l.celulas.every(c => c === '-'));
  if (semNota.length) {
    itens.push({ nivel: 'bloqueia', codigo: 'notas.linha_vazia', mensagem: `${semNota.length} componente(s) sem nota em nenhum ano: ${semNota.slice(0, 4).map(l => l.nome).join(', ')}${semNota.length > 4 ? '…' : ''}.`, aba: 'notas' });
  }
  const lacunas = blocos.flatMap(b => b.agrupamentos.flatMap(ag => ag.linhas))
    .filter(l => l.celulas.some(c => c === '-') && !l.celulas.every(c => c === '-')).length;
  if (lacunas) itens.push({ nivel: 'alerta', codigo: 'notas.traco', mensagem: `${lacunas} linha(s) com traço em algum ano — confira se o componente realmente não foi cursado naquele período.`, aba: 'notas' });

  if (historico.com_certificado && !(historico.numero_registro_gdae || '').trim()) {
    itens.push({ nivel: 'bloqueia', codigo: 'documento.sed', mensagem: 'Número de publicação da SED ("Registro / Visto Confere") não preenchido — obrigatório em histórico de conclusão (RF-HIST-15).' });
  }
  if (assinaturas.length < 2) itens.push({ nivel: 'bloqueia', codigo: 'documento.assinaturas', mensagem: 'Documento precisa do secretário e do diretor. Cadastre-os em Signatários.' });
  if (!cabecalhoLinhas.length) itens.push({ nivel: 'alerta', codigo: 'documento.cabecalho', mensagem: 'Cabeçalho sem mantenedora, atos legais ou Diretoria de Ensino — confira em Instituição e Atos legais.' });
  if (totais.aulas.some(t => t === '-') || totais.horas.some(t => t === '-')) {
    itens.push({ nivel: 'alerta', codigo: 'documento.totais', mensagem: 'Algum ano está sem total de aulas/horas. Cadastre os totais anuais na versão curricular.' });
  }
  return itens;
}

/* ---------------- montagem ---------------- */

export async function montarDocumento(client: Cliente, historico: Historico): Promise<ResultadoMontagem> {
  const [alunoRes, cursoRes, instRes, atosRes, signRes] = await Promise.all([
    client.from('aluno').select('*').eq('id', historico.aluno_id).single(),
    client.from('curso').select('*').eq('id', historico.curso_id).single(),
    client.from('instituicao').select('*').maybeSingle(),
    client.from('instituicao_ato').select('*').order('ordem'),
    client.from('instituicao_signatario').select('*').order('ordem')
  ]);
  for (const r of [alunoRes, cursoRes, instRes, atosRes, signRes]) if (r.error) throw r.error;

  const aluno = alunoRes.data as Aluno;
  const curso = cursoRes.data as Curso;
  const instituicao = (instRes.data || null) as Instituicao | null;
  const atos = ((atosRes.data || []) as AtoLegal[])
    // o cabeçalho traz os atos gerais + os do curso deste documento
    .filter(a => !a.curso_id || a.curso_id === curso.id);
  const signatarios = (signRes.data || []) as Signatario[];

  const matriculas = await carregarMatriculas(client, historico.matricula_ids);

  const colunas: ColunaAno[] = matriculas.map(m => ({
    matricula_id: m.id, ano: m.ano, serie: m.serie_nome, serie_codigo: m.serie_codigo, externa: m.externa
  }));

  const itensPorColuna: ItemVersao[][] = [];
  const notasPorColuna: Map<string, { valor: number | null; conceito: string | null }>[] = [];
  const totaisAulas: string[] = [];
  const totaisHoras: string[] = [];

  for (const m of matriculas) {
    const itens = m.versao_id ? await carregarItens(client, m.versao_id, m.serie_id) : [];
    itensPorColuna.push(itens);

    const { data: notas, error: eNotas } = await client.from('nota').select('versao_item_id, valor, conceito').eq('matricula_id', m.id);
    if (eNotas) throw eNotas;
    notasPorColuna.push(new Map(((notas || []) as { versao_item_id: string; valor: number | null; conceito: string | null }[])
      .map(n => [n.versao_item_id, { valor: n.valor, conceito: n.conceito }])));

    let aulas: number | null = null;
    let horas: number | null = null;
    if (m.versao_id) {
      const { data: t, error: eT } = await client.from('versao_total')
        .select('total_aulas_anuais, total_horas_anuais').eq('versao_id', m.versao_id).eq('serie_id', m.serie_id).maybeSingle();
      if (eT) throw eT;
      aulas = t?.total_aulas_anuais ?? null;
      horas = t?.total_horas_anuais ?? null;
    }
    // a razão aula/hora do curso completa o total que não foi cadastrado
    if (aulas != null && horas == null && curso.razao_aula_hora) horas = Math.round(aulas * Number(curso.razao_aula_hora));
    totaisAulas.push(aulas != null ? String(aulas) : '-');
    totaisHoras.push(horas != null ? String(horas) : '-');
  }

  const blocos = montarGrade(colunas, itensPorColuna, notasPorColuna);

  const estabelecimentos: EstabelecimentoLinha[] = matriculas.map(m => ({
    ensino: ROTULO_ETAPA_CURTO[m.curso_etapa] || m.curso_nome.toUpperCase(),
    serie: m.serie_codigo,
    ano: m.ano,
    estabelecimento: (m.externa ? m.estabelecimento_nome : instituicao?.nome_fantasia) || 'COLÉGIO SÃO MARCOS',
    municipio_uf: m.externa
      ? [m.estabelecimento_municipio, m.estabelecimento_uf].filter(Boolean).join(' / ')
      : [instituicao?.municipio, instituicao?.uf].filter(Boolean).join(' / ')
  }));

  const cabecalho = linhasCabecalho(instituicao, atos);
  const assinaturas = escolherAssinaturas(signatarios, historico);
  const observacoes = montarObservacoes(historico.observacoes, matriculas);

  const ultimoAno = matriculas.length ? matriculas[matriculas.length - 1].ano : new Date().getFullYear();
  const dataDocumento = (historico.emitido_em || new Date().toISOString()).slice(0, 10);
  const certificado = historico.com_certificado ? {
    texto: textoCertificado({
      nome: aluno.nome,
      nacionalidade: aluno.nacionalidade || '',
      municipio: aluno.municipio_nascimento || '',
      uf: aluno.uf_nascimento || '',
      cpf: aluno.cpf || '',
      ra: aluno.ra || '',
      nascimento: dataCurta(aluno.data_nascimento),
      curso: curso.nome,
      ano: ultimoAno
    }),
    local_data: `${instituicao?.municipio || 'Mogi das Cruzes'}, ${dataPorExtenso(dataDocumento)}.`
  } : null;

  const totais = { aulas: totaisAulas, horas: totaisHoras };

  const documento: HistoricoDocumento = {
    formato: 1,
    tipo: historico.tipo,
    status: historico.status,
    via: historico.via,
    cabecalho,
    faixa: `HISTÓRICO ESCOLAR - ${curso.nome.toUpperCase()}`,
    aluno: {
      id: aluno.id,
      nome: (aluno.nome_social || aluno.nome).toUpperCase(),
      nascimento: dataCurta(aluno.data_nascimento),
      naturalidade: [aluno.municipio_nascimento, aluno.uf_nascimento].filter(Boolean).join(' / '),
      nacionalidade: aluno.nacionalidade || '',
      documento: [aluno.cin, aluno.cpf].filter(Boolean).join(' / '),
      ra: aluno.ra || ''
    },
    colunas,
    blocos,
    totais,
    estabelecimentos,
    observacoes,
    certificado,
    assinaturas,
    registro_sed: (historico.numero_registro_gdae || '').trim() || null,
    registro: historico.numero_registro != null
      ? { numero: `${historico.numero_registro}/${historico.ano_registro}`, livro: historico.livro, folha: historico.folha, emitido_em: historico.emitido_em }
      : null,
    rodape: RODAPE_HISTORICO,
    gerado_em: new Date().toISOString()
  };

  const validacao = validar({
    aluno, matriculas, historico, blocos, assinaturas, totais, cabecalhoLinhas: cabecalho.linhas, colunas
  });

  return { documento, validacao, matriculas };
}

/** Sugestão de conteúdo do campo Observações ao criar o documento (RF-HIST-04). */
export function observacoesIniciais(curso: Pick<Curso, 'texto_promocao'>, tipo: Historico['tipo']): string {
  const linhas: string[] = [];
  if (curso.texto_promocao) linhas.push(curso.texto_promocao.trim());
  if (!metaTipo(tipo).certificado && tipo === 'transferencia') {
    linhas.push('O(a) referido(a) aluno(a) foi transferido(a) sem conclusão do ano letivo.');
  }
  return linhas.join('\n');
}
