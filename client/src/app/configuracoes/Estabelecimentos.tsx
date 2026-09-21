// /app/config/estabelecimentos (RF-BASE-04): escolas de origem para anos
// cursados fora do São Marcos. Secretaria também pode cadastrar.
import { useMemo, useState } from 'react';
import { api, ErroApi, mensagemErro, type CampoInvalido } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { useSessao } from '@/hooks/useSessao';
import { useToast } from '@/hooks/useToast';
import { Aviso, Botao, Cabecalho, CampoCheck, CampoTexto, Card, Carregando, EstadoVazio, Modal, Tabela, Tag } from '@/componentes/ui';
import { Icone } from '@/componentes/Icones';
import { formatarCNPJ } from '@shared/formatos';
import type { EstabelecimentoExterno } from '@shared/types/curriculo';

export function Estabelecimentos() {
  const { podeEditar } = useSessao();
  const toast = useToast();
  const { dados, carregando, erro, recarregar } = useRecurso<EstabelecimentoExterno[]>('/api/cadastros/estabelecimentos');
  const [editando, setEditando] = useState<Partial<EstabelecimentoExterno> | null>(null);
  const [campos, setCampos] = useState<CampoInvalido[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [filtro, setFiltro] = useState('');

  const lista = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    return (dados || []).filter(e => !f || e.nome.toLowerCase().includes(f) || (e.municipio || '').toLowerCase().includes(f));
  }, [dados, filtro]);

  async function salvar() {
    if (!editando) return;
    setSalvando(true); setCampos([]);
    try {
      if (editando.id) await api.put(`/api/cadastros/estabelecimentos/${editando.id}`, editando);
      else await api.post('/api/cadastros/estabelecimentos', editando);
      toast.ok('Estabelecimento salvo.'); setEditando(null); recarregar();
    } catch (err) { if (err instanceof ErroApi && err.campos.length) setCampos(err.campos); toast.erro(mensagemErro(err)); }
    finally { setSalvando(false); }
  }

  const def = (k: keyof EstabelecimentoExterno) => (e: { target: { value: string } }) => setEditando(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="wrap-estreito">
      <Cabecalho titulo="Outras escolas" descricao="Estabelecimentos de ensino onde alunos cursaram anos anteriores — saem na tabela de estabelecimentos do histórico"
        acoes={podeEditar ? <Botao variante="primario" icone="mais" onClick={() => { setEditando({ nome: '', municipio: '', uf: 'SP', ativo: true }); setCampos([]); }}>Adicionar escola</Botao> : undefined} />
      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      <div className="filtros">
        <label className="f-campo" style={{ flex: 1, maxWidth: 360 }}>
          <Icone nome="buscar" style={{ width: 14, height: 14 }} />
          <input type="search" placeholder="Filtrar por nome ou município" value={filtro} onChange={e => setFiltro(e.target.value)} style={{ border: 0, background: 'transparent', outline: 0, flex: 1, minWidth: 0, color: 'var(--texto)' }} aria-label="Filtrar escolas" />
        </label>
      </div>

      <Card semCorpo>
        {carregando && !dados ? <Carregando /> : (
          <Tabela<EstabelecimentoExterno>
            linhas={lista}
            chave={e => e.id}
            classeLinha={e => e.ativo ? undefined : 'linha-inativa'}
            vazio={<EstadoVazio icone="escola" titulo="Nenhuma escola cadastrada" descricao="Cadastre conforme aparecerem alunos com anos cursados em outra instituição." />}
            colunas={[
              { chave: 'nome', rotulo: 'Escola', principal: true, render: e => <><span className="nome-cel">{e.nome}</span><span className="sub">{[e.municipio, e.uf].filter(Boolean).join(' / ') || '—'}</span></> },
              { chave: 'inep', rotulo: 'INEP', render: e => e.codigo_inep || '—' },
              { chave: 'cnpj', rotulo: 'CNPJ', render: e => formatarCNPJ(e.cnpj) || '—' },
              { chave: 'status', rotulo: 'Status', render: e => e.ativo ? <Tag tipo="ok" ponto>Ativo</Tag> : <Tag ponto>Inativo</Tag> },
              { chave: 'acoes', rotulo: 'Ações', acoes: true, render: e => podeEditar ? <Botao pequeno onClick={() => { setEditando({ ...e }); setCampos([]); }}>Editar</Botao> : null }
            ]}
          />
        )}
      </Card>

      <Modal aberto={!!editando} titulo={editando?.id ? 'Editar escola' : 'Nova escola'} aoFechar={() => setEditando(null)}
        rodape={<><Botao onClick={() => setEditando(null)}>Cancelar</Botao><Botao variante="primario" carregando={salvando} onClick={salvar} icone="check">Salvar</Botao></>}>
        {editando ? (
          <div className="form-grade">
            <CampoTexto className="col-2" rotulo="Nome" dica="Como sai no histórico, ex.: E.E. Prof. Antônio Silva" name="nome" value={editando.nome || ''} onChange={def('nome')} erros={campos} obrigatorio autoFocus />
            <CampoTexto rotulo="Município" name="municipio" value={editando.municipio || ''} onChange={def('municipio')} erros={campos} />
            <CampoTexto rotulo="UF" name="uf" maxLength={2} value={editando.uf || ''} onChange={def('uf')} erros={campos} />
            <CampoTexto rotulo="Código INEP" name="codigo_inep" inputMode="numeric" value={editando.codigo_inep || ''} onChange={def('codigo_inep')} erros={campos} />
            <CampoTexto rotulo="CNPJ" name="cnpj" formato="cnpj" value={editando.cnpj || ''} onChange={def('cnpj')} erros={campos} />
            <div className="col-2"><CampoCheck rotulo="Ativo" checked={editando.ativo !== false} onChange={e => setEditando(f => ({ ...f, ativo: e.target.checked }))} /></div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
