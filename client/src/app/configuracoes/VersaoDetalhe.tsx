// /app/config/curriculos/:id — editor da estrutura de uma versão:
// blocos → agrupamentos → itens (por série) + totais. Só rascunho edita.
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, mensagemErro } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { useSessao } from '@/hooks/useSessao';
import { useToast } from '@/hooks/useToast';
import { Aviso, Botao, Cabecalho, CampoSelect, CampoTexto, Card, Carregando, Confirmar, EstadoVazio, Modal, Tag } from '@/componentes/ui';
import { Icone } from '@/componentes/Icones';
import { ROTULO_STATUS_VERSAO, type Componente, type ItemDisciplina, type Serie, type VersaoAgrupamento, type VersaoBloco, type VersaoDetalhe as TVersao, type VersaoItem } from '@shared/types/curriculo';

export function VersaoDetalhe() {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const { ehAdmin } = useSessao();
  const toast = useToast();
  const { dados: v, carregando, erro, recarregar } = useRecurso<TVersao>(`/api/versoes/${id}`);
  const componentes = useRecurso<Componente[]>('/api/cadastros/componentes');
  const [ocupado, setOcupado] = useState(false);

  const editavel = !!v && v.status === 'rascunho' && ehAdmin;
  const series = useMemo(() => (v?.series || []).filter(s => s.ativo).sort((a, b) => a.ordem - b.ordem), [v]);

  const executar = useCallback(async (fn: () => Promise<unknown>, ok?: string) => {
    setOcupado(true);
    try { await fn(); if (ok) toast.ok(ok); await recarregar(); return true; }
    catch (err) { toast.erro(mensagemErro(err)); return false; }
    finally { setOcupado(false); }
  }, [recarregar, toast]);

  /* ---------- estado dos modais ---------- */
  const [bloco, setBloco] = useState<{ id?: string; nome: string } | null>(null);
  const [agrup, setAgrup] = useState<{ id?: string; blocoId: string; nome: string } | null>(null);
  const [item, setItem] = useState<{ id?: string; agrupId: string; nome_impresso: string; componente_id: string; series: string[]; novoComponente: boolean } | null>(null);
  const [remover, setRemover] = useState<{ tipo: 'bloco' | 'agrupamento' | 'item'; id: string; nome: string } | null>(null);
  const [publicar, setPublicar] = useState<{ ano: number } | null>(null);
  const [excluirVersao, setExcluirVersao] = useState(false);
  const [despublicar, setDespublicar] = useState(false);
  const [cab, setCab] = useState<{ nome: string; base_legal: string } | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [nova, setNova] = useState<{ codigo: string; descricao: string }>({ codigo: '', descricao: '' });

  const totalItens = (v?.blocos || []).reduce((n, b) => n + b.agrupamentos.reduce((m, a) => m + a.itens.length, 0), 0);

  /* ---------- ações ---------- */
  const salvarBloco = () => bloco && executar(() => bloco.id
    ? api.put(`/api/versoes/blocos/${bloco.id}`, { nome: bloco.nome })
    : api.post(`/api/versoes/${id}/blocos`, { nome: bloco.nome, ordem: v?.blocos.length || 0 })).then(ok => ok && setBloco(null));

  const salvarAgrup = () => agrup && executar(() => agrup.id
    ? api.put(`/api/versoes/agrupamentos/${agrup.id}`, { nome: agrup.nome })
    : api.post(`/api/versoes/blocos/${agrup.blocoId}/agrupamentos`, { nome: agrup.nome, ordem: v?.blocos.find(b => b.id === agrup.blocoId)?.agrupamentos.length || 0 })).then(ok => ok && setAgrup(null));

  async function salvarItem() {
    if (!item) return;
    if (!item.nome_impresso.trim()) return toast.erro('Informe o nome impresso.');
    if (!item.id && item.series.length === 0) return toast.erro('Marque ao menos uma série.');
    const ok = await executar(async () => {
      let componente_id: string | null = item.componente_id || null;
      if (item.novoComponente) {
        const c = await api.post<Componente>('/api/cadastros/componentes', { nome_canonico: item.nome_impresso.trim() });
        componente_id = c.id;
        componentes.recarregar();
      }
      if (item.id) {
        await api.put(`/api/versoes/itens/${item.id}`, { nome_impresso: item.nome_impresso, componente_id });
      } else {
        const ag = v?.blocos.flatMap(b => b.agrupamentos).find(a => a.id === item.agrupId);
        const ordem = ag ? ag.itens.length : 0;
        await api.post(`/api/versoes/agrupamentos/${item.agrupId}/itens`, item.series.map(serie_id => ({ serie_id, componente_id, nome_impresso: item.nome_impresso, ordem })));
      }
    });
    if (ok) setItem(null);
  }

  async function alternarSerie(ag: VersaoAgrupamento, grupo: GrupoItem, serie: Serie) {
    const existente = grupo.porSerie[serie.id];
    await executar(() => existente
      ? api.del(`/api/versoes/itens/${existente.id}`)
      : api.post(`/api/versoes/agrupamentos/${ag.id}/itens`, [{ serie_id: serie.id, componente_id: grupo.componente_id, nome_impresso: grupo.nome_impresso, ordem: grupo.ordem }]));
  }

  /**
   * Grava a composição de UMA linha. A composição não é travada por
   * versão publicada: ela não muda o que o documento imprime, só como a
   * origem alimenta a linha. Ver migration 011.
   */
  const gravarComposicao = (itemId: string, lista: { codigo_origem: string; descricao_origem: string | null; habilitado: boolean }[]) =>
    api.put(`/api/versoes/itens/${itemId}/disciplinas`, lista.map((d, i) => ({ ...d, ordem: i })));

  /** Liga/desliga uma disciplina numa série. Desligada fica registrada, não some. */
  async function alternarDisciplina(g: GrupoItem, serie: Serie, codigo: string) {
    const item = g.porSerie[serie.id];
    if (!item) return;
    const atual = (item.disciplinas || []).map(d => ({ codigo_origem: d.codigo_origem, descricao_origem: d.descricao_origem, habilitado: d.habilitado }));
    const existente = atual.find(d => d.codigo_origem === codigo);
    const lista = existente
      ? atual.map(d => d.codigo_origem === codigo ? { ...d, habilitado: !d.habilitado } : d)
      : [...atual, { codigo_origem: codigo, descricao_origem: descricaoDe(g, codigo), habilitado: true }];
    await executar(() => gravarComposicao(item.id, lista));
  }

  /** Acrescenta a disciplina em todas as séries em que o componente existe. */
  async function adicionarDisciplina(g: GrupoItem) {
    const codigo = nova.codigo.trim();
    if (!codigo) return;
    const ok = await executar(async () => {
      for (const item of g.itens) {
        const atual = (item.disciplinas || []).map(d => ({ codigo_origem: d.codigo_origem, descricao_origem: d.descricao_origem, habilitado: d.habilitado }));
        if (atual.some(d => d.codigo_origem === codigo)) continue;
        await gravarComposicao(item.id, [...atual, { codigo_origem: codigo, descricao_origem: nova.descricao.trim() || null, habilitado: true }]);
      }
    }, 'Disciplina acrescentada em todas as séries do componente.');
    if (ok) setNova({ codigo: '', descricao: '' });
  }

  /** Tira a disciplina do componente inteiro, em todas as séries. */
  async function removerDisciplina(g: GrupoItem, codigo: string) {
    await executar(async () => {
      for (const item of g.itens) {
        const atual = (item.disciplinas || []).filter(d => d.codigo_origem !== codigo)
          .map(d => ({ codigo_origem: d.codigo_origem, descricao_origem: d.descricao_origem, habilitado: d.habilitado }));
        if ((item.disciplinas || []).length === atual.length) continue;
        await gravarComposicao(item.id, atual);
      }
    }, 'Disciplina removida do componente.');
  }

  async function moverGrupo(ag: VersaoAgrupamento, grupos: GrupoItem[], i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= grupos.length) return;
    const a = grupos[i], b = grupos[j];
    await executar(async () => {
      for (const it of a.itens) await api.put(`/api/versoes/itens/${it.id}`, { ordem: j });
      for (const it of b.itens) await api.put(`/api/versoes/itens/${it.id}`, { ordem: i });
      void ag;
    });
  }

  async function moverBloco(i: number, dir: -1 | 1) {
    if (!v) return;
    const j = i + dir; if (j < 0 || j >= v.blocos.length) return;
    await executar(async () => {
      await api.put(`/api/versoes/blocos/${v.blocos[i].id}`, { ordem: j });
      await api.put(`/api/versoes/blocos/${v.blocos[j].id}`, { ordem: i });
    });
  }

  async function moverAgrup(b: VersaoBloco, i: number, dir: -1 | 1) {
    const j = i + dir; if (j < 0 || j >= b.agrupamentos.length) return;
    await executar(async () => {
      await api.put(`/api/versoes/agrupamentos/${b.agrupamentos[i].id}`, { ordem: j });
      await api.put(`/api/versoes/agrupamentos/${b.agrupamentos[j].id}`, { ordem: i });
    });
  }

  const confirmarRemocao = () => remover && executar(() => {
    if (remover.tipo === 'bloco') return api.del(`/api/versoes/blocos/${remover.id}`);
    if (remover.tipo === 'agrupamento') return api.del(`/api/versoes/agrupamentos/${remover.id}`);
    // item: remove o grupo inteiro (todas as séries)
    return Promise.all(remover.id.split(',').map(i => api.del(`/api/versoes/itens/${i}`)));
  }, 'Removido.').then(ok => ok && setRemover(null));

  const salvarTotal = (serieId: string, campo: 'total_aulas_anuais' | 'total_horas_anuais', valor: string) => {
    const atual = v?.totais.find(t => t.serie_id === serieId);
    const corpo = { total_aulas_anuais: atual?.total_aulas_anuais ?? null, total_horas_anuais: atual?.total_horas_anuais ?? null, [campo]: valor === '' ? null : Number(valor) };
    if (campo === 'total_aulas_anuais' && valor !== '' && v?.curso.razao_aula_hora && (atual?.total_horas_anuais == null)) {
      corpo.total_horas_anuais = Math.round(Number(valor) * Number(v.curso.razao_aula_hora));
    }
    return executar(() => api.put(`/api/versoes/${id}/totais/${serieId}`, corpo));
  };

  const confirmarPublicar = () => publicar && executar(() => api.post(`/api/versoes/${id}/publicar`, { ano_inicio: publicar.ano }), 'Versão publicada — agora é a vigente e fica somente leitura.').then(ok => ok && setPublicar(null));

  /**
   * Volta ao rascunho para corrigir o que a primeira importação revelou.
   * A trava é do banco: só passa a versão que nunca serviu histórico
   * emitido. A vigência não muda, então as matrículas seguem ligadas a
   * esta versão — é por isso que este caminho existe em vez de duplicar.
   */
  async function confirmarDespublicar() {
    const ok = await executar(async () => {
      const r = await api.post<{ nome: string; matriculas: number; historicos_em_andamento: number }>(`/api/versoes/${id}/despublicar`, {});
      toast.ok(`"${r.nome}" voltou para rascunho. ${r.matriculas} matrícula(s) seguem ligadas a ela${r.historicos_em_andamento ? ` · ${r.historicos_em_andamento} histórico(s) em andamento vão usar a grade corrigida ao serem emitidos` : ''}.`);
    });
    if (ok) setDespublicar(false);
  }

  const salvarCab = () => cab && executar(() => api.put(`/api/versoes/${id}`, cab), 'Versão atualizada.').then(ok => ok && setCab(null));

  const confirmarExcluirVersao = () => executar(() => api.del(`/api/versoes/${id}`), 'Rascunho excluído.').then(ok => { if (ok) navegar(`/app/config/curriculos?curso=${v?.curso_id || ''}`); });

  /* ---------- render ---------- */
  if (carregando && !v) return <div className="wrap"><Carregando /></div>;
  if (erro || !v) return <div className="wrap"><Aviso tipo="erro">{erro || 'Versão não encontrada.'}</Aviso></div>;

  const tipoTag = v.status === 'vigente' ? 'ok' : v.status === 'rascunho' ? 'aviso' : 'neutro';

  return (
    <div className="wrap">
      <Cabecalho voltar={{ to: `/app/config/curriculos?curso=${v.curso_id}`, rotulo: `Versões de ${v.curso.nome}` }}
        titulo={<span className="linha-h">{v.nome} <Tag tipo={tipoTag} ponto>{ROTULO_STATUS_VERSAO[v.status]}</Tag></span>}
        descricao={<>{v.curso.nome}{v.base_legal ? ` · ${v.base_legal}` : ''}{v.ano_inicio ? ` · ${v.ano_inicio} — ${v.ano_fim ?? 'atual'}` : ''}{v.origem ? ` · duplicada de "${v.origem.nome}"` : ''} · {totalItens} itens</>}
        acoes={ehAdmin ? <>
          {editavel ? <Botao icone="editar" onClick={() => setCab({ nome: v.nome, base_legal: v.base_legal || '' })}>Renomear</Botao> : null}
          {editavel ? <Botao variante="perigo" icone="lixeira" onClick={() => setExcluirVersao(true)}>Excluir rascunho</Botao> : null}
          {editavel ? <Botao variante="primario" icone="publicar" disabled={totalItens === 0} onClick={() => setPublicar({ ano: new Date().getFullYear() })}>Publicar</Botao> : null}
          {!editavel && v.status !== 'rascunho' ? <Botao icone="editar" onClick={() => setDespublicar(true)}>Voltar para rascunho</Botao> : null}
        </> : undefined} />

      {!editavel ? (
        <div style={{ marginBottom: 14 }}>
          <Aviso><span className="alerta-linha"><Icone nome="cadeado" /><span><b>Somente leitura.</b> {v.status === 'rascunho' ? 'Só administradores editam versões.' : <>Versão em uso: os históricos deste período dependem dela. Enquanto ela não tiver servido nenhum histórico emitido, <b>Voltar para rascunho</b> a reabre sem mexer nas matrículas. Depois do primeiro documento impresso, o caminho passa a ser duplicar.</>}</span></span></Aviso>
        </div>
      ) : (
        <div style={{ marginBottom: 14 }}>
          <Aviso tipo="aviso"><b>Rascunho.</b> Monte a estrutura como sai no papel: bloco (coluna vertical) → agrupamento (área do conhecimento) → componente, marcando em quais séries cada componente existe. Ao publicar, a versão passa a valer para o ano informado e fica somente leitura.</Aviso>
        </div>
      )}

      {series.length === 0 ? <div style={{ marginBottom: 14 }}><Aviso tipo="erro">Este curso não tem série ativa. Cadastre as séries em Cursos e séries antes de montar a estrutura.</Aviso></div> : null}

      {v.blocos.length === 0 ? (
        <Card semCorpo><EstadoVazio icone="grade" titulo="Estrutura vazia" descricao='Comece pelo primeiro bloco — no modelo do colégio: "Formação Geral Básica" e "Itinerários Formativos".' acoes={editavel ? <Botao variante="primario" icone="mais" onClick={() => setBloco({ nome: '' })}>Adicionar bloco</Botao> : undefined} /></Card>
      ) : null}

      {v.blocos.map((b, bi) => (
        <div className="bloco-cur" key={b.id}>
          <div className="bloco-cur-cab">
            <h3>{b.nome}</h3>
            {editavel ? <div className="acoes">
              <Botao pequeno variante="fantasma" className="btn-ico" aria-label="Subir bloco" disabled={bi === 0} onClick={() => moverBloco(bi, -1)}><Icone nome="cima" /></Botao>
              <Botao pequeno variante="fantasma" className="btn-ico" aria-label="Descer bloco" disabled={bi === v.blocos.length - 1} onClick={() => moverBloco(bi, 1)}><Icone nome="baixo" /></Botao>
              <Botao pequeno icone="mais" onClick={() => setAgrup({ blocoId: b.id, nome: '' })}>Agrupamento</Botao>
              <Botao pequeno variante="fantasma" className="btn-ico" aria-label="Renomear bloco" onClick={() => setBloco({ id: b.id, nome: b.nome })}><Icone nome="editar" /></Botao>
              <Botao pequeno variante="perigo" className="btn-ico" aria-label="Remover bloco" onClick={() => setRemover({ tipo: 'bloco', id: b.id, nome: b.nome })}><Icone nome="lixeira" /></Botao>
            </div> : null}
          </div>

          {b.agrupamentos.length === 0 ? <p className="cel-sub" style={{ padding: '10px 22px' }}>Sem agrupamentos. {editavel ? 'Adicione uma área do conhecimento (ex.: "Linguagens e suas Tecnologias").' : ''}</p> : null}

          {b.agrupamentos.map((ag, ai) => {
            const grupos = agruparItens(ag.itens, series);
            return (
              <div className="agrup-cur" key={ag.id}>
                <div className="agrup-cur-cab">
                  <h4>{ag.nome}</h4>
                  {editavel ? <div className="acoes">
                    <Botao pequeno variante="fantasma" className="btn-ico" aria-label="Subir agrupamento" disabled={ai === 0} onClick={() => moverAgrup(b, ai, -1)}><Icone nome="cima" /></Botao>
                    <Botao pequeno variante="fantasma" className="btn-ico" aria-label="Descer agrupamento" disabled={ai === b.agrupamentos.length - 1} onClick={() => moverAgrup(b, ai, 1)}><Icone nome="baixo" /></Botao>
                    <Botao pequeno icone="mais" onClick={() => setItem({ agrupId: ag.id, nome_impresso: '', componente_id: '', series: series.map(s => s.id), novoComponente: false })}>Componente</Botao>
                    <Botao pequeno variante="fantasma" className="btn-ico" aria-label="Renomear agrupamento" onClick={() => setAgrup({ id: ag.id, blocoId: b.id, nome: ag.nome })}><Icone nome="editar" /></Botao>
                    <Botao pequeno variante="perigo" className="btn-ico" aria-label="Remover agrupamento" onClick={() => setRemover({ tipo: 'agrupamento', id: ag.id, nome: ag.nome })}><Icone nome="lixeira" /></Botao>
                  </div> : null}
                </div>
                {grupos.length ? (
                  <div className="tab-box"><table className="grade-itens">
                    <thead><tr><th>Componente (nome impresso)</th><th className="col-ident">Identidade</th>{series.map(s => <th key={s.id} className="serie-col">{s.codigo}</th>)}{editavel ? <th className="cel-acoes"><span className="sr-only">Ações</span></th> : null}</tr></thead>
                    <tbody>
                      {grupos.map((g, gi) => (
                        <tr key={g.chave}>
                          <td className="nome-cel">{g.nome_impresso}</td>
                          <td className="cel-sub col-ident">{g.componente_id ? (componentes.dados?.find(c => c.id === g.componente_id)?.nome_canonico || '…') : <Tag>sem antecessor</Tag>}</td>
                          {series.map(s => (
                            <td key={s.id} className="serie-col">
                              {editavel ? (
                                <button type="button" className={`marca-serie ${g.porSerie[s.id] ? 'sim' : 'nao'}`} title={g.porSerie[s.id] ? `Remover da ${s.nome}` : `Incluir na ${s.nome}`} aria-pressed={!!g.porSerie[s.id]} aria-label={`${g.nome_impresso} na ${s.nome}`} disabled={ocupado} onClick={() => alternarSerie(ag, g, s)}>{g.porSerie[s.id] ? '✓' : '–'}</button>
                              ) : (
                                <span className={`marca-serie ${g.porSerie[s.id] ? 'sim' : 'nao'}`}>{g.porSerie[s.id] ? '✓' : '–'}</span>
                              )}
                            </td>
                          ))}
                          {editavel ? <td className="cel-acoes">
                            <Botao pequeno variante="fantasma" className="btn-ico" aria-label="Subir" disabled={gi === 0} onClick={() => moverGrupo(ag, grupos, gi, -1)}><Icone nome="cima" /></Botao>
                            <Botao pequeno variante="fantasma" className="btn-ico" aria-label="Descer" disabled={gi === grupos.length - 1} onClick={() => moverGrupo(ag, grupos, gi, 1)}><Icone nome="baixo" /></Botao>
                            <Botao pequeno variante="fantasma" className="btn-ico" aria-label="Editar componente" onClick={() => setItem({ id: g.itens[0].id, agrupId: ag.id, nome_impresso: g.nome_impresso, componente_id: g.componente_id || '', series: Object.keys(g.porSerie), novoComponente: false })}><Icone nome="editar" /></Botao>
                            <Botao pequeno variante="perigo" className="btn-ico" aria-label="Remover componente" onClick={() => setRemover({ tipo: 'item', id: g.itens.map(i => i.id).join(','), nome: g.nome_impresso })}><Icone nome="lixeira" /></Botao>
                          </td> : null}
                        </tr>
                      )).flatMap((tr, gi) => {
                        const g = grupos[gi];
                        const codigos = disciplinasDoGrupo(g);
                        const linhas = [tr,
                          <tr key={`${g.chave}-disc-cab`} className="linha-composicao">
                            <td colSpan={2 + series.length + (editavel ? 1 : 0)} style={{ padding: '0 0 0 12px' }}>
                              <button type="button" className="btn btn-sm btn-fantasma" aria-expanded={aberto === g.chave}
                                onClick={() => { setAberto(aberto === g.chave ? null : g.chave); setNova({ codigo: '', descricao: '' }); }}>
                                <Icone nome={aberto === g.chave ? 'setaBaixo' : 'seta'} />
                                {codigos.length ? `${codigos.length} disciplina(s) da origem` : 'Sem disciplinas da origem — a linha aceita qualquer código mapeado'}
                              </button>
                            </td>
                          </tr>];
                        if (aberto !== g.chave) return linhas;
                        linhas.push(
                          <tr key={`${g.chave}-disc`}>
                            <td colSpan={2 + series.length + (editavel ? 1 : 0)} style={{ padding: '4px 12px 14px 34px', background: 'var(--superficie-2)' }}>
                              <div className="cel-sub" style={{ marginBottom: 8 }}>
                                Quais disciplinas do Activesoft alimentam <b>{g.nome_impresso}</b>, e em quais séries. Serve para
                                eletiva que só existe numa série e para turma multisseriada. Deixar vazio mantém o comportamento
                                de sempre; configurar faz a importação <b>recusar</b> o código nas séries desmarcadas.
                              </div>
                              {codigos.length ? (
                                <table className="grade-itens" style={{ marginBottom: 8 }}>
                                  <thead><tr><th>Disciplina na origem</th>{series.filter(s => g.porSerie[s.id]).map(s => <th key={s.id} className="serie-col">{s.codigo}</th>)}{editavel ? <th className="cel-acoes"><span className="sr-only">Ações</span></th> : null}</tr></thead>
                                  <tbody>
                                    {codigos.map(cod => (
                                      <tr key={cod.codigo}>
                                        <td className="nome-cel"><code>{cod.codigo}</code>{cod.descricao ? <span className="sub">{cod.descricao}</span> : null}</td>
                                        {series.filter(s => g.porSerie[s.id]).map(s => {
                                          const d = (g.porSerie[s.id]?.disciplinas || []).find(x => x.codigo_origem === cod.codigo);
                                          const on = !!d?.habilitado;
                                          return (
                                            <td key={s.id} className="serie-col">
                                              {ehAdmin ? (
                                                <button type="button" className={`marca-serie ${on ? 'sim' : 'nao'}`} disabled={ocupado}
                                                  aria-pressed={on} aria-label={`${cod.codigo} na ${s.nome}`}
                                                  title={on ? `Desabilitar na ${s.nome}` : `Habilitar na ${s.nome}`}
                                                  onClick={() => alternarDisciplina(g, s, cod.codigo)}>{on ? '✓' : '–'}</button>
                                              ) : <span className={`marca-serie ${on ? 'sim' : 'nao'}`}>{on ? '✓' : '–'}</span>}
                                            </td>
                                          );
                                        })}
                                        {editavel || ehAdmin ? <td className="cel-acoes">
                                          <Botao pequeno variante="perigo" className="btn-ico" aria-label={`Remover ${cod.codigo}`} disabled={ocupado} onClick={() => removerDisciplina(g, cod.codigo)}><Icone nome="lixeira" /></Botao>
                                        </td> : null}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              ) : null}
                              {ehAdmin ? (
                                <div className="acoes" style={{ gap: 6 }}>
                                  <input className="f-campo" style={{ maxWidth: 140 }} placeholder="código na origem" value={aberto === g.chave ? nova.codigo : ''} onChange={e => setNova(n => ({ ...n, codigo: e.target.value }))} aria-label="Código da disciplina na origem" />
                                  <input className="f-campo" style={{ maxWidth: 260 }} placeholder="descrição (opcional)" value={aberto === g.chave ? nova.descricao : ''} onChange={e => setNova(n => ({ ...n, descricao: e.target.value }))} aria-label="Descrição da disciplina" />
                                  <Botao pequeno icone="mais" disabled={!nova.codigo.trim() || ocupado} onClick={() => adicionarDisciplina(g)}>Acrescentar</Botao>
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        );
                        return linhas;
                      })}
                    </tbody>
                  </table></div>
                ) : <p className="cel-sub" style={{ padding: '4px 30px 12px' }}>Sem componentes.</p>}
              </div>
            );
          })}
        </div>
      ))}

      {editavel && v.blocos.length ? <div className="acoes" style={{ marginBottom: 16 }}><Botao icone="mais" onClick={() => setBloco({ nome: '' })}>Adicionar bloco</Botao></div> : null}

      {series.length ? (
        <Card titulo="Totais anuais" descricao="As duas linhas ao pé da grade: total geral de aulas e de horas por série. Horas = aulas × razão do curso, se você deixar em branco." semCorpo>
          <div className="tab-box"><table>
            <thead><tr><th>Série</th><th className="num">Total de aulas anuais</th><th className="num">Total de horas anuais</th></tr></thead>
            <tbody>
              {series.map(s => {
                const t = v.totais.find(x => x.serie_id === s.id);
                return (
                  <tr key={s.id}>
                    <td className="nome-cel">{s.nome}</td>
                    <td className="num"><EntradaNumero valor={t?.total_aulas_anuais ?? null} desabilitado={!editavel} aoSalvar={val => salvarTotal(s.id, 'total_aulas_anuais', val)} rotulo={`Aulas anuais da ${s.nome}`} /></td>
                    <td className="num"><EntradaNumero valor={t?.total_horas_anuais ?? null} desabilitado={!editavel} aoSalvar={val => salvarTotal(s.id, 'total_horas_anuais', val)} rotulo={`Horas anuais da ${s.nome}`} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </Card>
      ) : null}

      {/* ----- modais ----- */}
      <Modal aberto={!!bloco} titulo={bloco?.id ? 'Renomear bloco' : 'Novo bloco'} descricao="Coluna vertical mais à esquerda da grade." aoFechar={() => setBloco(null)} tamanho="sm"
        rodape={<><Botao onClick={() => setBloco(null)}>Cancelar</Botao><Botao variante="primario" carregando={ocupado} onClick={salvarBloco} icone="check">Salvar</Botao></>}>
        {bloco ? <CampoTexto rotulo="Nome" placeholder="Formação Geral Básica" value={bloco.nome} onChange={e => setBloco(b => b && ({ ...b, nome: e.target.value }))} obrigatorio autoFocus onKeyDown={e => { if (e.key === 'Enter') salvarBloco(); }} /> : null}
      </Modal>

      <Modal aberto={!!agrup} titulo={agrup?.id ? 'Renomear agrupamento' : 'Novo agrupamento'} descricao='Área do conhecimento ou programa: "Linguagens e suas Tecnologias", "Ensino Bilíngue", "Eletivas".' aoFechar={() => setAgrup(null)} tamanho="sm"
        rodape={<><Botao onClick={() => setAgrup(null)}>Cancelar</Botao><Botao variante="primario" carregando={ocupado} onClick={salvarAgrup} icone="check">Salvar</Botao></>}>
        {agrup ? <CampoTexto rotulo="Nome" value={agrup.nome} onChange={e => setAgrup(a => a && ({ ...a, nome: e.target.value }))} obrigatorio autoFocus onKeyDown={e => { if (e.key === 'Enter') salvarAgrup(); }} /> : null}
      </Modal>

      <Modal aberto={!!item} titulo={item?.id ? 'Editar componente' : 'Novo componente no agrupamento'} descricao="O nome impresso é o que sai no papel nesta versão. A identidade liga este nome ao mesmo componente em outras versões." aoFechar={() => setItem(null)}
        rodape={<><Botao onClick={() => setItem(null)}>Cancelar</Botao><Botao variante="primario" carregando={ocupado} onClick={salvarItem} icone="check">Salvar</Botao></>}>
        {item ? (
          <div className="form-grade">
            <CampoTexto className="col-2" rotulo="Nome impresso" placeholder="Língua Estrangeira Moderna - Inglês" value={item.nome_impresso} onChange={e => setItem(i => i && ({ ...i, nome_impresso: e.target.value }))} obrigatorio autoFocus />
            <CampoSelect className="col-2" rotulo="Identidade do componente" dica="Escolha o componente existente ou crie um novo a partir do nome impresso." value={item.novoComponente ? '__novo' : item.componente_id}
              onChange={e => setItem(i => i && ({ ...i, novoComponente: e.target.value === '__novo', componente_id: e.target.value === '__novo' ? '' : e.target.value }))}>
              <option value="">— sem antecessor (componente novo nesta versão) —</option>
              <option value="__novo">+ Criar componente com o nome impresso</option>
              {(componentes.dados || []).filter(c => c.ativo).map(c => <option key={c.id} value={c.id}>{c.nome_canonico}{c.sigla ? ` (${c.sigla})` : ''}</option>)}
            </CampoSelect>
            {!item.id ? (
              <div className="col-2 campo">
                <span className="rotulo">Séries em que existe</span>
                <div className="linha-h">
                  {series.map(s => (
                    <label key={s.id} className={`chip-serie ${item.series.includes(s.id) ? 'marcado' : ''}`}>
                      <input type="checkbox" checked={item.series.includes(s.id)} onChange={e => setItem(i => i && ({ ...i, series: e.target.checked ? [...i.series, s.id] : i.series.filter(x => x !== s.id) }))} />
                      {s.nome}
                    </label>
                  ))}
                </div>
              </div>
            ) : <div className="col-2 dica" style={{ fontSize: 12, color: 'var(--texto-3)' }}>As séries são marcadas direto na grade (✓ / –).</div>}
          </div>
        ) : null}
      </Modal>

      <Modal aberto={!!cab} titulo="Renomear versão" aoFechar={() => setCab(null)} tamanho="sm"
        rodape={<><Botao onClick={() => setCab(null)}>Cancelar</Botao><Botao variante="primario" carregando={ocupado} onClick={salvarCab} icone="check">Salvar</Botao></>}>
        {cab ? <div className="form-grade">
          <CampoTexto className="col-2" rotulo="Nome" value={cab.nome} onChange={e => setCab(c => c && ({ ...c, nome: e.target.value }))} obrigatorio autoFocus />
          <CampoTexto className="col-2" rotulo="Base legal" value={cab.base_legal} onChange={e => setCab(c => c && ({ ...c, base_legal: e.target.value }))} />
        </div> : null}
      </Modal>

      <Modal aberto={!!publicar} titulo="Publicar esta versão?" descricao="Ela passa a ser a vigente do curso, fica somente leitura e a vigente anterior é encerrada no ano anterior ao informado." aoFechar={() => setPublicar(null)} tamanho="sm"
        rodape={<><Botao onClick={() => setPublicar(null)}>Cancelar</Botao><Botao variante="destaque" carregando={ocupado} onClick={confirmarPublicar} icone="publicar">Publicar</Botao></>}>
        {publicar ? <CampoTexto rotulo="Vigente a partir do ano letivo" type="number" inputMode="numeric" min={1900} max={2200} value={publicar.ano} onChange={e => setPublicar({ ano: Number(e.target.value) })} dica="A vigência é registrada para todas as séries ativas nesse ano. Reformas escalonadas se ajustam na tela de versões." autoFocus /> : null}
      </Modal>

      <Confirmar aberto={!!remover} titulo={`Remover ${remover?.tipo === 'bloco' ? 'bloco' : remover?.tipo === 'agrupamento' ? 'agrupamento' : 'componente'}?`}
        descricao={remover ? `"${remover.nome}"${remover.tipo !== 'item' ? ' e tudo que está dentro dele' : ' em todas as séries'} sai desta versão. Outras versões não mudam.` : ''}
        rotuloConfirmar="Remover" perigo carregando={ocupado} aoFechar={() => setRemover(null)} aoConfirmar={confirmarRemocao} />

      <Confirmar aberto={despublicar} titulo={`Voltar "${v.nome}" para rascunho?`} rotuloConfirmar="Voltar para rascunho"
        carregando={ocupado} aoFechar={() => setDespublicar(false)} aoConfirmar={confirmarDespublicar}
        descricao={<>
          A versão volta a ser editável para você corrigir o que faltou — uma disciplina que não existia numa série, por exemplo.
          <span style={{ display: 'block', marginTop: 8 }}>
            <b>A vigência não muda.</b> As matrículas já importadas continuam ligadas a esta versão, que é justamente o motivo de
            fazer assim em vez de duplicar: numa cópia, elas continuariam apontando para a antiga.
          </span>
          <span style={{ display: 'block', marginTop: 8 }}>
            Se algum histórico já foi <b>emitido</b> com esta grade, o banco recusa — documento impresso não se reescreve, e aí o
            caminho é duplicar. Publique de novo quando terminar.
          </span>
        </>} />

      <Confirmar aberto={excluirVersao} titulo="Excluir este rascunho?" descricao="A estrutura montada aqui é perdida. Versões publicadas nunca são excluídas — só rascunhos."
        rotuloConfirmar="Excluir" perigo carregando={ocupado} aoFechar={() => setExcluirVersao(false)} aoConfirmar={confirmarExcluirVersao} />
    </div>
  );
}

/* ---------- agrupa itens de um agrupamento por (componente|nome) para
   mostrar UMA linha por componente com ✓ por série ---------- */
interface GrupoItem { chave: string; nome_impresso: string; componente_id: string | null; ordem: number; itens: VersaoItem[]; porSerie: Record<string, VersaoItem> }

/** União dos códigos configurados no grupo, em qualquer série. */
function disciplinasDoGrupo(g: GrupoItem): { codigo: string; descricao: string | null }[] {
  const mapa = new Map<string, string | null>();
  for (const it of g.itens) for (const d of (it.disciplinas || []) as ItemDisciplina[]) {
    if (!mapa.has(d.codigo_origem) || (!mapa.get(d.codigo_origem) && d.descricao_origem)) mapa.set(d.codigo_origem, d.descricao_origem);
  }
  return [...mapa.entries()].map(([codigo, descricao]) => ({ codigo, descricao })).sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
}

function descricaoDe(g: GrupoItem, codigo: string): string | null {
  return disciplinasDoGrupo(g).find(d => d.codigo === codigo)?.descricao ?? null;
}

function normalizar(s: string) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }

function agruparItens(itens: VersaoItem[], _series: Serie[]): GrupoItem[] {
  const mapa = new Map<string, GrupoItem>();
  for (const it of itens) {
    const chave = it.componente_id ? `c:${it.componente_id}` : `n:${normalizar(it.nome_impresso)}`;
    let g = mapa.get(chave);
    if (!g) { g = { chave, nome_impresso: it.nome_impresso, componente_id: it.componente_id, ordem: it.ordem, itens: [], porSerie: {} }; mapa.set(chave, g); }
    g.itens.push(it);
    g.porSerie[it.serie_id] = it;
    g.ordem = Math.min(g.ordem, it.ordem);
  }
  return [...mapa.values()].sort((a, b) => a.ordem - b.ordem || a.nome_impresso.localeCompare(b.nome_impresso));
}

function EntradaNumero({ valor, desabilitado, aoSalvar, rotulo }: { valor: number | null; desabilitado: boolean; aoSalvar: (v: string) => Promise<unknown>; rotulo: string }): ReactNode {
  const [texto, setTexto] = useState<string | null>(null);
  const mostrado = texto ?? (valor == null ? '' : String(valor));
  if (desabilitado) return <span>{valor ?? '—'}</span>;
  return (
    <input type="number" inputMode="numeric" min={0} aria-label={rotulo} value={mostrado} onChange={e => setTexto(e.target.value)}
      onBlur={() => { if (texto !== null && texto !== String(valor ?? '')) aoSalvar(texto).finally(() => setTexto(null)); else setTexto(null); }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      style={{ width: 110, textAlign: 'right', padding: '5px 8px', borderRadius: 6, border: '1px solid var(--linha-forte)', background: 'var(--superficie-2)', color: 'var(--texto)' }} />
  );
}
