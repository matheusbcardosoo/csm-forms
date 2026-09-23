// /app/config/componentes (RF-VER-06): catálogo de IDENTIDADE entre
// versões — liga "Ciências" (2016) a "Ciências da Natureza" (2023). O nome
// impresso vive em cada versão curricular, não aqui.
import { useMemo, useState } from 'react';
import { api, ErroApi, mensagemErro, type CampoInvalido } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { useSessao } from '@/hooks/useSessao';
import { useToast } from '@/hooks/useToast';
import { Aviso, Botao, Cabecalho, CampoCheck, CampoTexto, Card, Carregando, Confirmar, EstadoVazio, Modal, Tabela, Tag } from '@/componentes/ui';
import { Icone } from '@/componentes/Icones';
import type { Componente, UsoComponente } from '@shared/types/curriculo';

export function Componentes() {
  const { ehAdmin } = useSessao();
  const toast = useToast();
  const { dados, carregando, erro, recarregar } = useRecurso<Componente[]>('/api/cadastros/componentes');
  const [editando, setEditando] = useState<Partial<Componente> | null>(null);
  const [campos, setCampos] = useState<CampoInvalido[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [filtro, setFiltro] = useState('');
  const [excluir, setExcluir] = useState<{ c: Componente; uso: UsoComponente | null } | null>(null);

  const lista = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    return (dados || []).filter(c => !f || c.nome_canonico.toLowerCase().includes(f) || (c.sigla || '').toLowerCase().includes(f));
  }, [dados, filtro]);

  async function salvar() {
    if (!editando) return;
    setSalvando(true); setCampos([]);
    try {
      if (editando.id) await api.put(`/api/cadastros/componentes/${editando.id}`, editando);
      else await api.post('/api/cadastros/componentes', editando);
      toast.ok('Componente salvo.'); setEditando(null); recarregar();
    } catch (err) { if (err instanceof ErroApi && err.campos.length) setCampos(err.campos); toast.erro(mensagemErro(err)); }
    finally { setSalvando(false); }
  }

  /** Abre a confirmação já com o mapa de uso: ninguém apaga identidade de componente às cegas. */
  async function pedirExclusao(c: Componente) {
    setExcluir({ c, uso: null });
    try { setExcluir({ c, uso: await api.get<UsoComponente>(`/api/cadastros/componentes/${c.id}/uso`) }); }
    catch (err) { toast.erro(mensagemErro(err)); setExcluir(null); }
  }

  async function confirmarExclusao() {
    if (!excluir?.uso?.podeExcluir) return;
    setSalvando(true);
    try {
      const r = await api.del<{ linhas: number }>(`/api/cadastros/componentes/${excluir.c.id}`);
      toast.ok(`"${excluir.c.nome_canonico}" excluído${r.linhas ? ` · ${r.linhas} linha(s) de rascunho removida(s)` : ''}.`);
      setExcluir(null); recarregar();
    } catch (err) { toast.erro(mensagemErro(err)); }
    finally { setSalvando(false); }
  }

  return (
    <div className="wrap-estreito">
      <Cabecalho titulo="Componentes curriculares" descricao="Identidade estável de cada componente entre versões — o nome que sai no papel é definido em cada currículo"
        acoes={ehAdmin ? <Botao variante="primario" icone="mais" onClick={() => { setEditando({ nome_canonico: '', sigla: '', ativo: true }); setCampos([]); }}>Novo componente</Botao> : undefined} />
      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      <div className="filtros">
        <label className="f-campo" style={{ flex: 1, maxWidth: 360 }}>
          <Icone nome="buscar" style={{ width: 14, height: 14 }} />
          <input type="search" placeholder="Filtrar por nome ou sigla" value={filtro} onChange={e => setFiltro(e.target.value)} style={{ border: 0, background: 'transparent', outline: 0, flex: 1, minWidth: 0, color: 'var(--texto)' }} aria-label="Filtrar componentes" />
        </label>
        <span className="cel-sub">{lista.length} de {dados?.length ?? 0}</span>
      </div>

      <Card semCorpo>
        {carregando && !dados ? <Carregando /> : (
          <Tabela<Componente>
            linhas={lista}
            chave={c => c.id}
            classeLinha={c => c.ativo ? undefined : 'linha-inativa'}
            vazio={<EstadoVazio icone="grade" titulo={filtro ? 'Nenhum componente com esse filtro' : 'Nenhum componente cadastrado'} descricao="Cadastre os componentes ao montar o primeiro currículo — a tela de versão cria aqui o que faltar." />}
            colunas={[
              { chave: 'nome', rotulo: 'Nome canônico', principal: true, render: c => <span className="nome-cel">{c.nome_canonico}</span> },
              { chave: 'sigla', rotulo: 'Sigla', render: c => c.sigla || '—' },
              { chave: 'status', rotulo: 'Status', render: c => c.ativo ? <Tag tipo="ok" ponto>Ativo</Tag> : <Tag ponto>Inativo</Tag> },
              { chave: 'acoes', rotulo: 'Ações', acoes: true, render: c => ehAdmin ? <>
                <Botao pequeno onClick={() => { setEditando({ ...c }); setCampos([]); }}>Editar</Botao>
                <Botao pequeno variante="perigo" className="btn-ico" aria-label={`Excluir ${c.nome_canonico}`} onClick={() => pedirExclusao(c)}><Icone nome="lixeira" /></Botao>
              </> : null }
            ]}
          />
        )}
      </Card>

      <div style={{ marginTop: 14 }}>
        <Aviso><b>Para que serve.</b> Quando um histórico cruza duas versões do currículo, é a identidade do componente que faz "Ciências" e "Ciências da Natureza" ocuparem <b>uma linha só</b>, com as notas de todos os anos.</Aviso>
      </div>

      <Confirmar aberto={!!excluir} titulo={`Excluir "${excluir?.c.nome_canonico || ''}"?`} rotuloConfirmar="Excluir" perigo
        carregando={salvando} aoFechar={() => setExcluir(null)} aoConfirmar={confirmarExclusao}
        descricao={!excluir ? '' : !excluir.uso ? 'Conferindo onde ele está em uso…' : (
          <span>
            {!excluir.uso.linhas.length && !excluir.uso.mapeamentos.length
              ? <>Não está em uso em nenhum currículo nem mapeamento. A exclusão é limpa.</>
              : <>
                  {excluir.uso.linhas.length ? <>
                    <b>Está em {excluir.uso.linhas.length} linha(s) de currículo:</b>
                    <span style={{ display: 'block', margin: '6px 0', maxHeight: 150, overflow: 'auto', fontSize: 12.5 }}>
                      {excluir.uso.linhas.map((l, i) => (
                        <span key={i} style={{ display: 'block' }}>
                          {l.curso} · {l.versao} <Tag tipo={l.status === 'rascunho' ? 'aviso' : 'ok'}>{l.status}</Tag> · {l.serie} · {l.nome_impresso}
                        </span>
                      ))}
                    </span>
                  </> : null}
                  {excluir.uso.mapeamentos.length ? <>
                    <b>{excluir.uso.mapeamentos.length} código(s) da origem apontam para ele:</b>{' '}
                    {excluir.uso.mapeamentos.map(m => m.codigo_origem).join(', ')}. Eles voltam a ficar sem destino.
                  </> : null}
                </>}
            {excluir.uso.motivo
              ? <span style={{ display: 'block', marginTop: 10, color: 'var(--erro)' }}><b>Não dá para excluir.</b> {excluir.uso.motivo}</span>
              : excluir.uso.linhas.length
                ? <span style={{ display: 'block', marginTop: 10 }}>As {excluir.uso.linhas.length} linha(s) acima são de rascunho e <b>serão removidas junto</b>. Isto não se desfaz.</span>
                : null}
          </span>
        )} />

      <Modal aberto={!!editando} titulo={editando?.id ? 'Editar componente' : 'Novo componente'} aoFechar={() => setEditando(null)} tamanho="sm"
        rodape={<><Botao onClick={() => setEditando(null)}>Cancelar</Botao><Botao variante="primario" carregando={salvando} onClick={salvar} icone="check">Salvar</Botao></>}>
        {editando ? (
          <div className="form-grade">
            <CampoTexto className="col-2" rotulo="Nome canônico" dica="Nome de referência, não necessariamente o impresso" name="nome_canonico" value={editando.nome_canonico || ''} onChange={e => setEditando(f => ({ ...f, nome_canonico: e.target.value }))} erros={campos} obrigatorio autoFocus />
            <CampoTexto rotulo="Sigla" name="sigla" placeholder="MAT" value={editando.sigla || ''} onChange={e => setEditando(f => ({ ...f, sigla: e.target.value }))} erros={campos} />
            <div><CampoCheck rotulo="Ativo" checked={editando.ativo !== false} onChange={e => setEditando(f => ({ ...f, ativo: e.target.checked }))} /></div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
