// /app/alunos — lista (04-telas §3.2): busca, ano letivo global, série,
// turma, situação. Estado vazio chama a importação.
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ErroApi, mensagemErro, type CampoInvalido } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { useSessao } from '@/hooks/useSessao';
import { useToast } from '@/hooks/useToast';
import { useAnoLetivo } from '@/hooks/useAnoLetivo';
import { Aviso, Botao, BotaoLink, Cabecalho, CampoSelect, CampoTexto, Card, Carregando, EstadoVazio, Modal, Tabela, Tag, fmtData } from '@/componentes/ui';
import { Icone } from '@/componentes/Icones';
import { ROTULO_SITUACAO_ALUNO, ROTULO_SITUACAO_MATRICULA, type AlunoLista, type SituacaoAluno } from '@shared/types/aluno';
import type { Curso, Serie } from '@shared/types/curriculo';

interface Resposta {
  alunos: AlunoLista[]; total: number; pagina: number; tamanho: number;
  /** Só vem quando a lista saiu vazia por causa do filtro de ano letivo. */
  contexto?: { total_geral: number; anos_com_matricula: number[] };
}

export function Alunos() {
  const { podeEditar } = useSessao();
  const { ano, setAno } = useAnoLetivo();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const serie = params.get('serie') || '';
  const turma = params.get('turma') || '';
  const situacao = params.get('situacao') || '';
  const todosAnos = params.get('todos') === '1';
  const pagina = Number(params.get('pagina') || 1);
  const [busca, setBusca] = useState(q);
  useEffect(() => setBusca(q), [q]);

  const cadastros = useRecurso<{ cursos: Curso[]; series: Serie[] }>('/api/cadastros/cursos');
  const url = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (!todosAnos && ano) p.set('ano', String(ano));
    if (serie) p.set('serie', serie);
    if (turma) p.set('turma', turma);
    if (situacao) p.set('situacao', situacao);
    p.set('pagina', String(pagina));
    return `/api/alunos?${p.toString()}`;
  }, [q, ano, serie, turma, situacao, pagina, todosAnos]);
  const { dados, carregando, erro, recarregar } = useRecurso<Resposta>(url);

  const definir = (chave: string, valor: string) => {
    const p = new URLSearchParams(params);
    if (valor) p.set(chave, valor); else p.delete(chave);
    p.delete('pagina');
    setParams(p);
  };

  const [novo, setNovo] = useState<{ nome: string; data_nascimento: string; municipio_nascimento: string; uf_nascimento: string; cpf: string; ra: string } | null>(null);
  const [campos, setCampos] = useState<CampoInvalido[]>([]);
  const [salvando, setSalvando] = useState(false);

  async function criar() {
    if (!novo) return;
    setSalvando(true); setCampos([]);
    try {
      const a = await api.post<{ id: string }>('/api/alunos', novo);
      toast.ok('Aluno cadastrado.'); setNovo(null); recarregar();
      window.location.assign(`/app/alunos/${a.id}`);
    } catch (err) { if (err instanceof ErroApi && err.campos.length) setCampos(err.campos); toast.erro(mensagemErro(err)); }
    finally { setSalvando(false); }
  }

  const series = (cadastros.dados?.series || []).filter(s => s.ativo).sort((a, b) => a.ordem - b.ordem);
  const totalPaginas = dados ? Math.max(1, Math.ceil(dados.total / dados.tamanho)) : 1;

  return (
    <div className="wrap">
      <Cabecalho titulo="Alunos" descricao={dados ? `${dados.total} aluno(s)${!todosAnos && ano ? ` com matrícula em ${ano}` : ''}` : 'Lista, ficha, trajetória e grade de notas de cada aluno'}
        acoes={podeEditar ? <>
          <BotaoLink to="/app/importacoes" icone="importar">Importar</BotaoLink>
          <Botao variante="primario" icone="mais" onClick={() => { setNovo({ nome: '', data_nascimento: '', municipio_nascimento: 'Mogi das Cruzes', uf_nascimento: 'SP', cpf: '', ra: '' }); setCampos([]); }}>Novo aluno</Botao>
        </> : undefined} />
      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      <form className="filtros" onSubmit={e => { e.preventDefault(); definir('q', busca.trim()); }}>
        <label className="f-campo" style={{ flex: '1 1 220px', maxWidth: 360 }}>
          <Icone nome="buscar" style={{ width: 14, height: 14 }} />
          <input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome, código ou RA" aria-label="Buscar aluno" style={{ border: 0, background: 'transparent', outline: 0, flex: 1, minWidth: 0, color: 'var(--texto)' }} />
        </label>
        <label className="f-campo">Série: <select value={serie} onChange={e => definir('serie', e.target.value)} aria-label="Série"><option value="">Todas</option>{series.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></label>
        <label className="f-campo">Turma: <input value={turma} onChange={e => definir('turma', e.target.value.toUpperCase())} aria-label="Turma" style={{ width: 40, border: 0, background: 'transparent', outline: 0, fontWeight: 600, color: 'var(--texto)' }} placeholder="—" /></label>
        <label className="f-campo">Situação: <select value={situacao} onChange={e => definir('situacao', e.target.value)} aria-label="Situação"><option value="">Todas</option>{(Object.keys(ROTULO_SITUACAO_ALUNO) as SituacaoAluno[]).map(s => <option key={s} value={s}>{ROTULO_SITUACAO_ALUNO[s]}</option>)}</select></label>
        <button type="button" className={`f-campo ${todosAnos ? 'ativo' : ''}`} onClick={() => definir('todos', todosAnos ? '' : '1')}>{todosAnos ? 'Todos os anos' : `Ano letivo ${ano ?? ''}`}</button>
        <button type="submit" className="sr-only">Buscar</button>
      </form>

      <Card semCorpo rodape={dados && dados.total > 0 ? <>
        <span>Mostrando {(dados.pagina - 1) * dados.tamanho + 1}–{Math.min(dados.total, dados.pagina * dados.tamanho)} de {dados.total}</span>
        <span style={{ marginLeft: 'auto' }} className="acoes">
          <Botao pequeno disabled={pagina <= 1} onClick={() => { const p = new URLSearchParams(params); p.set('pagina', String(pagina - 1)); setParams(p); }}>Anterior</Botao>
          <span>Página {pagina} de {totalPaginas}</span>
          <Botao pequeno disabled={pagina >= totalPaginas} onClick={() => { const p = new URLSearchParams(params); p.set('pagina', String(pagina + 1)); setParams(p); }}>Próxima</Botao>
        </span>
      </> : undefined}>
        {carregando && !dados ? <Carregando /> : (
          <Tabela<AlunoLista>
            linhas={dados?.alunos || []}
            chave={a => a.id}
            vazio={<ListaVazia contexto={dados?.contexto} ano={ano} todosAnos={todosAnos} podeEditar={podeEditar}
              temFiltro={!!(q || serie || turma || situacao)} verTodos={() => definir('todos', '1')} irParaAno={setAno} />}
            colunas={[
              { chave: 'nome', rotulo: 'Aluno', principal: true, render: a => <><Link className="nome-cel" to={`/app/alunos/${a.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{a.nome}</Link><span className="sub">nasc. {fmtData(a.data_nascimento)} · RA {a.ra || '—'}</span></> },
              { chave: 'cod', rotulo: 'Código', render: a => a.codigo_activesoft || <Tag>manual</Tag> },
              { chave: 'serie', rotulo: 'Série / turma', render: a => a.matricula ? <>{a.matricula.serie}{a.matricula.turma ? ` ${a.matricula.turma}` : ''}<span className="sub">{a.matricula.curso} · {a.matricula.ano}</span></> : <span className="cel-sub">sem matrícula</span> },
              { chave: 'sit', rotulo: 'Situação', render: a => <Tag tipo={a.situacao === 'ativo' ? 'ok' : a.situacao === 'concluinte' ? 'info' : 'neutro'} ponto>{ROTULO_SITUACAO_ALUNO[a.situacao]}</Tag> },
              { chave: 'fim', rotulo: 'Resultado', render: a => a.matricula ? <span className="cel-sub">{ROTULO_SITUACAO_MATRICULA[a.matricula.situacao_final]}</span> : '—' },
              { chave: 'acoes', rotulo: 'Ações', acoes: true, render: a => <Link className="btn btn-sm" to={`/app/alunos/${a.id}`}>Abrir</Link> }
            ]}
          />
        )}
      </Card>

      <Modal aberto={!!novo} titulo="Novo aluno (cadastro manual)" descricao="Para quem não está no Activesoft. Os demais dados entram na ficha." aoFechar={() => setNovo(null)}
        rodape={<><Botao onClick={() => setNovo(null)}>Cancelar</Botao><Botao variante="primario" carregando={salvando} onClick={criar} icone="check">Cadastrar</Botao></>}>
        {novo ? <div className="form-grade">
          <CampoTexto className="col-2" rotulo="Nome completo" name="nome" value={novo.nome} onChange={e => setNovo(n => n && ({ ...n, nome: e.target.value }))} erros={campos} obrigatorio autoFocus />
          <CampoTexto rotulo="Data de nascimento" name="data_nascimento" type="date" value={novo.data_nascimento} onChange={e => setNovo(n => n && ({ ...n, data_nascimento: e.target.value }))} erros={campos} />
          <CampoTexto rotulo="CPF" name="cpf" inputMode="numeric" value={novo.cpf} onChange={e => setNovo(n => n && ({ ...n, cpf: e.target.value }))} erros={campos} />
          <CampoTexto rotulo="Município de nascimento" name="municipio_nascimento" value={novo.municipio_nascimento} onChange={e => setNovo(n => n && ({ ...n, municipio_nascimento: e.target.value }))} erros={campos} />
          <CampoTexto rotulo="UF" name="uf_nascimento" maxLength={2} value={novo.uf_nascimento} onChange={e => setNovo(n => n && ({ ...n, uf_nascimento: e.target.value.toUpperCase() }))} erros={campos} />
          <CampoTexto rotulo="RA" name="ra" value={novo.ra} onChange={e => setNovo(n => n && ({ ...n, ra: e.target.value }))} erros={campos} />
        </div> : null}
      </Modal>
    </div>
  );
}

export { CampoSelect };

/**
 * Estado vazio que explica a causa em vez de só constatar o efeito. O caso
 * que mais confunde: importou-se 2025, o seletor do topo está em 2026, e a
 * lista aparece vazia mesmo com os alunos no banco. Aqui a tela diz isso e
 * oferece o atalho para o ano certo.
 */
function ListaVazia({ contexto, ano, todosAnos, podeEditar, temFiltro, verTodos, irParaAno }: {
  contexto?: { total_geral: number; anos_com_matricula: number[] };
  ano: number | null; todosAnos: boolean; podeEditar: boolean; temFiltro: boolean;
  verTodos: () => void; irParaAno: (a: number) => void;
}) {
  const anosComDados = contexto?.anos_com_matricula || [];
  const escondidosPeloAno = !temFiltro && !todosAnos && !!ano && !!contexto?.total_geral;

  if (escondidosPeloAno) {
    const sugerido = anosComDados[0];
    return (
      <EstadoVazio icone="calendario"
        titulo={`Nenhuma matrícula em ${ano} — mas há ${contexto!.total_geral} aluno(s) cadastrado(s)`}
        descricao={anosComDados.length
          ? `A lista é filtrada pelo ano letivo escolhido no topo da tela. Estes alunos têm matrícula em ${anosComDados.join(', ')}.`
          : 'Os alunos foram cadastrados, mas nenhum tem matrícula em ano letivo nenhum. Importe as matrículas ou lance os anos na ficha de cada um.'}
        acoes={<>
          {sugerido ? <Botao variante="primario" icone="calendario" onClick={() => irParaAno(sugerido)}>Ver {sugerido}</Botao> : null}
          <Botao onClick={verTodos}>Ver todos os anos</Botao>
          {podeEditar ? <BotaoLink to="/app/importacoes" icone="importar">Importar matrículas de {ano}</BotaoLink> : null}
        </>} />
    );
  }

  return (
    <EstadoVazio icone="alunos"
      titulo={temFiltro ? 'Nenhum aluno com esses filtros' : !todosAnos && ano ? `Nenhum aluno com matrícula em ${ano}` : 'Nenhum aluno cadastrado'}
      descricao={temFiltro ? 'Ajuste os filtros ou desmarque o ano letivo.'
        : !todosAnos && ano ? 'O ano letivo selecionado no topo filtra a lista. Veja todos os anos ou importe as matrículas deste ano.'
        : 'Os alunos entram pela importação do Activesoft (ou por arquivo CSV). Anos anteriores em outra escola são lançados na ficha.'}
      acoes={<>
        {!todosAnos && ano ? <Botao onClick={verTodos}>Ver todos os anos</Botao> : null}
        {podeEditar ? <BotaoLink to="/app/importacoes" variante="primario" icone="importar">Ir para importação</BotaoLink> : null}
      </>} />
  );
}
