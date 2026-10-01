// Adicionar alunos a uma subpasta em lote (RF-CART-03, §7.4): a busca da
// lista de alunos, com série, turma escolar e ano letivo. Quem já está
// inscrito aparece marcado e travado.
import { useEffect, useMemo, useState } from 'react';
import { api, mensagemErro } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { useAnoLetivo } from '@/hooks/useAnoLetivo';
import { useToast } from '@/hooks/useToast';
import { Botao, Carregando, EstadoVazio, Modal, Tabela, Tag, fmtData } from '@/componentes/ui';
import { Icone } from '@/componentes/Icones';
import type { AlunoLista } from '@shared/types/aluno';
import type { Curso, Serie } from '@shared/types/curriculo';

interface Resposta { alunos: AlunoLista[]; total: number; pagina: number; tamanho: number }

export function ModalAdicionarAlunos({ aberto, subpastaId, subpastaNome, jaInscritos, aoFechar, aoAdicionar }: {
  aberto: boolean; subpastaId: string; subpastaNome: string; jaInscritos: Set<string>; aoFechar: () => void; aoAdicionar: () => void;
}) {
  const toast = useToast();
  const { anos, ano: anoGlobal } = useAnoLetivo();
  const cadastros = useRecurso<{ cursos: Curso[]; series: Serie[] }>(aberto ? '/api/cadastros/cursos' : null);
  const [busca, setBusca] = useState('');
  const [q, setQ] = useState('');
  const [ano, setAno] = useState<string>('');
  const [serie, setSerie] = useState('');
  const [turma, setTurma] = useState('');
  const [pagina, setPagina] = useState(1);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState<'todos' | 'salvar' | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setBusca(''); setQ(''); setSerie(''); setTurma(''); setPagina(1); setMarcados(new Set());
    setAno(anoGlobal ? String(anoGlobal) : '');
  }, [aberto, anoGlobal]);

  const filtro = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (ano) p.set('ano', ano);
    if (serie) p.set('serie', serie);
    if (turma) p.set('turma', turma);
    return p;
  }, [q, ano, serie, turma]);
  const url = aberto ? `/api/alunos?${filtro.toString()}&pagina=${pagina}` : null;
  const { dados, carregando } = useRecurso<Resposta>(url);
  useEffect(() => setPagina(1), [filtro]);

  const series = (cadastros.dados?.series || []).filter(s => s.ativo).sort((a, b) => a.ordem - b.ordem);
  const totalPaginas = dados ? Math.max(1, Math.ceil(dados.total / dados.tamanho)) : 1;

  /** "Selecionar todos os N do filtro": percorre as páginas da busca. */
  async function selecionarTodos() {
    if (!dados) return;
    setOcupado('todos');
    try {
      const proximo = new Set(marcados);
      for (let p = 1; p <= totalPaginas; p++) {
        const r = await api.get<Resposta>(`/api/alunos?${filtro.toString()}&pagina=${p}`);
        for (const a of r.alunos) if (!jaInscritos.has(a.id)) proximo.add(a.id);
      }
      setMarcados(proximo);
    } catch (err) { toast.erro(mensagemErro(err)); }
    finally { setOcupado(null); }
  }

  async function adicionar() {
    setOcupado('salvar');
    try {
      const r = await api.post<{ adicionados: number; ja_estavam: number }>(`/api/carteirinhas/subpastas/${subpastaId}/inscritos`, { aluno_ids: [...marcados] });
      toast.ok(`${r.adicionados} aluno(s) inscrito(s)${r.ja_estavam ? ` · ${r.ja_estavam} já estavam` : ''}.`);
      aoAdicionar();
    } catch (err) { toast.erro(mensagemErro(err)); }
    finally { setOcupado(null); }
  }

  const campo = { border: 0, background: 'transparent', outline: 0, color: 'var(--texto)' } as const;

  return (
    <Modal aberto={aberto} tamanho="lg" titulo={`Adicionar alunos · ${subpastaNome}`} aoFechar={aoFechar}
      descricao="Busque e marque. Um aluno pode estar em várias subpastas, mas uma vez só em cada."
      rodape={<>
        <span className="cel-sub" style={{ marginRight: 'auto' }}>{marcados.size} selecionado(s)</span>
        <Botao onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="primario" icone="mais" disabled={!marcados.size} carregando={ocupado === 'salvar'} onClick={adicionar}>Inscrever {marcados.size || ''}</Botao>
      </>}>
      <form className="filtros" onSubmit={e => { e.preventDefault(); setQ(busca.trim()); }}>
        <label className="f-campo" style={{ flex: '1 1 200px' }}>
          <Icone nome="buscar" style={{ width: 14, height: 14 }} />
          <input type="search" value={busca} onChange={e => setBusca(e.target.value)} onBlur={() => setQ(busca.trim())} placeholder="Nome, código ou RA" aria-label="Buscar aluno" style={{ ...campo, flex: 1, minWidth: 0 }} />
        </label>
        <label className="f-campo">Ano: <select value={ano} onChange={e => setAno(e.target.value)} aria-label="Ano letivo"><option value="">Todos</option>{anos.map(a => <option key={a} value={a}>{a}</option>)}</select></label>
        <label className="f-campo">Série: <select value={serie} onChange={e => setSerie(e.target.value)} aria-label="Série"><option value="">Todas</option>{series.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></label>
        <label className="f-campo">Turma: <input value={turma} onChange={e => setTurma(e.target.value.toUpperCase())} aria-label="Turma escolar" placeholder="—" style={{ ...campo, width: 40, fontWeight: 600 }} /></label>
        <button type="submit" className="sr-only">Buscar</button>
      </form>

      {carregando && !dados ? <Carregando /> : (
        <>
          {dados && dados.total > 0 ? (
            <div className="barra-selecao">
              <span><b>{dados.total}</b> aluno(s) no filtro</span>
              <Botao pequeno carregando={ocupado === 'todos'} onClick={selecionarTodos}>Selecionar todos os {dados.total} do filtro</Botao>
              {marcados.size ? <Botao pequeno variante="fantasma" onClick={() => setMarcados(new Set())}>Limpar seleção</Botao> : null}
            </div>
          ) : null}
          <Tabela<AlunoLista>
            linhas={dados?.alunos || []}
            chave={a => a.id}
            selecao={{
              marcados: new Set([...marcados, ...(dados?.alunos || []).filter(a => jaInscritos.has(a.id)).map(a => a.id)]),
              aoMudar: s => setMarcados(new Set([...s].filter(id => !jaInscritos.has(id)))),
              bloqueada: a => jaInscritos.has(a.id),
              rotulo: a => `Selecionar ${a.nome}`
            }}
            vazio={<EstadoVazio icone="alunos" titulo="Nenhum aluno com esses filtros" descricao="Tire o ano letivo ou a série para ver mais." />}
            colunas={[
              { chave: 'nome', rotulo: 'Aluno', principal: true, render: a => <><span className="nome-cel">{a.nome}</span><span className="sub">nasc. {fmtData(a.data_nascimento)} · RA {a.ra || '—'}</span></> },
              { chave: 'serie', rotulo: 'Série / turma', render: a => a.matricula ? <>{a.matricula.serie}{a.matricula.turma ? ` ${a.matricula.turma}` : ''}<span className="sub">{a.matricula.ano}</span></> : <span className="cel-sub">sem matrícula</span> },
              { chave: 'st', rotulo: 'Situação', render: a => jaInscritos.has(a.id) ? <Tag tipo="info" ponto>já inscrito</Tag> : null }
            ]}
          />
          {totalPaginas > 1 ? (
            <div className="acoes" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
              <Botao pequeno disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)}>Anterior</Botao>
              <span className="cel-sub">Página {pagina} de {totalPaginas}</span>
              <Botao pequeno disabled={pagina >= totalPaginas} onClick={() => setPagina(p => p + 1)}>Próxima</Botao>
            </div>
          ) : null}
        </>
      )}
    </Modal>
  );
}
