// /app/config/componentes (RF-VER-06): catálogo de IDENTIDADE entre
// versões — liga "Ciências" (2016) a "Ciências da Natureza" (2023). O nome
// impresso vive em cada versão curricular, não aqui.
import { useMemo, useState } from 'react';
import { api, ErroApi, mensagemErro, type CampoInvalido } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { useSessao } from '@/hooks/useSessao';
import { useToast } from '@/hooks/useToast';
import { Aviso, Botao, Cabecalho, CampoCheck, CampoTexto, Card, Carregando, EstadoVazio, Modal, Tabela, Tag } from '@/componentes/ui';
import { Icone } from '@/componentes/Icones';
import type { Componente } from '@shared/types/curriculo';

export function Componentes() {
  const { ehAdmin } = useSessao();
  const toast = useToast();
  const { dados, carregando, erro, recarregar } = useRecurso<Componente[]>('/api/cadastros/componentes');
  const [editando, setEditando] = useState<Partial<Componente> | null>(null);
  const [campos, setCampos] = useState<CampoInvalido[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [filtro, setFiltro] = useState('');

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
              { chave: 'acoes', rotulo: 'Ações', acoes: true, render: c => ehAdmin ? <Botao pequeno onClick={() => { setEditando({ ...c }); setCampos([]); }}>Editar</Botao> : null }
            ]}
          />
        )}
      </Card>

      <div style={{ marginTop: 14 }}>
        <Aviso><b>Para que serve.</b> Quando um histórico cruza duas versões do currículo, é a identidade do componente que faz "Ciências" e "Ciências da Natureza" ocuparem <b>uma linha só</b>, com as notas de todos os anos.</Aviso>
      </div>

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
