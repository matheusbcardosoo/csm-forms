// /app/config/anos-letivos (RF-INST-08).
import { useState } from 'react';
import { api, ErroApi, mensagemErro, type CampoInvalido } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { useSessao } from '@/hooks/useSessao';
import { useToast } from '@/hooks/useToast';
import { useAnoLetivo } from '@/hooks/useAnoLetivo';
import { Aviso, Botao, Cabecalho, CampoSelect, CampoTexto, Card, Carregando, EstadoVazio, Modal, Tabela, Tag, fmtData } from '@/componentes/ui';
import type { AnoLetivo } from '@shared/types/instituicao';

type Form = Partial<AnoLetivo>;

export function AnosLetivos() {
  const { ehAdmin } = useSessao();
  const toast = useToast();
  const { recarregar: recarregarGlobal } = useAnoLetivo();
  const { dados, carregando, erro, recarregar } = useRecurso<AnoLetivo[]>('/api/anos-letivos');
  const [editando, setEditando] = useState<Form | null>(null);
  const [campos, setCampos] = useState<CampoInvalido[]>([]);
  const [salvando, setSalvando] = useState(false);

  const proximo = dados?.length ? Math.max(...dados.map(a => a.ano)) + 1 : new Date().getFullYear();

  async function salvar() {
    if (!editando) return;
    setSalvando(true); setCampos([]);
    try {
      if (editando.id) await api.put(`/api/anos-letivos/${editando.id}`, editando);
      else await api.post('/api/anos-letivos', editando);
      toast.ok('Ano letivo salvo.');
      setEditando(null);
      recarregar(); recarregarGlobal();
    } catch (err) {
      if (err instanceof ErroApi && err.campos.length) setCampos(err.campos);
      toast.erro(mensagemErro(err));
    } finally { setSalvando(false); }
  }

  const def = (k: keyof AnoLetivo) => (e: { target: { value: string } }) => setEditando(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="wrap-estreito">
      <Cabecalho titulo="Anos letivos" descricao="Importações e vigências curriculares são sempre relativas a um ano letivo"
        acoes={ehAdmin ? <Botao variante="primario" icone="mais" onClick={() => { setEditando({ ano: proximo, situacao: 'aberto' }); setCampos([]); }}>Adicionar ano</Botao> : undefined} />
      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      <Card semCorpo>
        {carregando && !dados ? <Carregando /> : (
          <Tabela<AnoLetivo>
            linhas={dados || []}
            chave={a => a.id}
            vazio={<EstadoVazio icone="calendario" titulo="Nenhum ano letivo" acoes={ehAdmin ? <Botao variante="primario" icone="mais" onClick={() => setEditando({ ano: proximo, situacao: 'aberto' })}>Adicionar</Botao> : undefined} />}
            colunas={[
              { chave: 'ano', rotulo: 'Ano', principal: true, render: a => <span className="nome-cel" style={{ fontSize: 15 }}>{a.ano}</span> },
              { chave: 'inicio', rotulo: 'Início', render: a => fmtData(a.data_inicio) },
              { chave: 'fim', rotulo: 'Fim', render: a => fmtData(a.data_fim) },
              { chave: 'dias', rotulo: 'Dias letivos', className: 'num', render: a => a.dias_letivos ?? '—' },
              { chave: 'sit', rotulo: 'Situação', render: a => a.situacao === 'aberto' ? <Tag tipo="ok" ponto>Aberto</Tag> : <Tag ponto>Encerrado</Tag> },
              { chave: 'acoes', rotulo: 'Ações', acoes: true, render: a => ehAdmin ? <Botao pequeno onClick={() => { setEditando({ ...a }); setCampos([]); }}>Editar</Botao> : null }
            ]}
          />
        )}
      </Card>

      <Modal aberto={!!editando} titulo={editando?.id ? `Ano letivo de ${editando.ano}` : 'Novo ano letivo'} aoFechar={() => setEditando(null)} tamanho="sm"
        rodape={<><Botao onClick={() => setEditando(null)}>Cancelar</Botao><Botao variante="primario" carregando={salvando} onClick={salvar} icone="check">Salvar</Botao></>}>
        {editando ? (
          <div className="form-grade">
            <CampoTexto rotulo="Ano" name="ano" type="number" inputMode="numeric" min={1900} max={2200} value={editando.ano ?? ''} onChange={def('ano')} erros={campos} obrigatorio disabled={!!editando.id} autoFocus />
            <CampoSelect rotulo="Situação" name="situacao" value={editando.situacao || 'aberto'} onChange={def('situacao')} erros={campos}>
              <option value="aberto">Aberto</option><option value="encerrado">Encerrado</option>
            </CampoSelect>
            <CampoTexto rotulo="Início" name="data_inicio" type="date" value={editando.data_inicio || ''} onChange={def('data_inicio')} erros={campos} />
            <CampoTexto rotulo="Fim" name="data_fim" type="date" value={editando.data_fim || ''} onChange={def('data_fim')} erros={campos} />
            <CampoTexto rotulo="Dias letivos" name="dias_letivos" type="number" inputMode="numeric" min={0} max={366} value={editando.dias_letivos ?? ''} onChange={def('dias_letivos')} erros={campos} />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
