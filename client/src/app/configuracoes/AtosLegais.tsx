// /app/config/atos-legais (RF-INST-04): cada ato vira uma linha do
// cabeçalho, na ordem da tabela. Número opcional (05-modelo §1.1).
import { useState } from 'react';
import { api, ErroApi, mensagemErro, type CampoInvalido } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { useSessao } from '@/hooks/useSessao';
import { useToast } from '@/hooks/useToast';
import { Aviso, Botao, Cabecalho, CampoCheck, CampoSelect, CampoTexto, Card, Carregando, Confirmar, EstadoVazio, Modal, Tabela, Tag, fmtData } from '@/componentes/ui';
import { CabecalhoDocumento } from '@/componentes/CabecalhoDocumento';
import { Icone } from '@/componentes/Icones';
import { linhaAto, ROTULO_TIPO_ATO, type AtoLegal, type Instituicao, type TipoAtoLegal } from '@shared/types/instituicao';
import type { Curso } from '@shared/types/curriculo';

interface Resposta { instituicao: Instituicao | null; atos: AtoLegal[] }
type Form = Partial<AtoLegal>;

const NOVO: Form = { tipo: 'autorizacao', rotulo: '', instrumento: 'Portaria', numero: '', data_ato: '', veiculo_publicacao: 'DOE', data_publicacao: '', texto_impresso: '', curso_id: null, ativo: true };

export function AtosLegais() {
  const { ehAdmin } = useSessao();
  const toast = useToast();
  const { dados, carregando, erro, recarregar } = useRecurso<Resposta>('/api/instituicao');
  const cursos = useRecurso<{ cursos: Curso[] }>('/api/cadastros/cursos');
  const [editando, setEditando] = useState<Form | null>(null);
  const [campos, setCampos] = useState<CampoInvalido[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [excluir, setExcluir] = useState<AtoLegal | null>(null);

  const atos = [...(dados?.atos || [])].sort((a, b) => a.ordem - b.ordem);

  async function salvar() {
    if (!editando) return;
    setSalvando(true); setCampos([]);
    try {
      if (editando.id) await api.put(`/api/instituicao/atos/${editando.id}`, editando);
      else await api.post('/api/instituicao/atos', editando);
      toast.ok('Ato legal salvo.');
      setEditando(null);
      recarregar();
    } catch (err) {
      if (err instanceof ErroApi && err.campos.length) setCampos(err.campos);
      toast.erro(mensagemErro(err));
    } finally { setSalvando(false); }
  }

  async function confirmarExclusao() {
    if (!excluir) return;
    setSalvando(true);
    try { await api.del(`/api/instituicao/atos/${excluir.id}`); toast.ok('Ato removido.'); setExcluir(null); recarregar(); }
    catch (err) { toast.erro(mensagemErro(err)); }
    finally { setSalvando(false); }
  }

  async function mover(ato: AtoLegal, dir: -1 | 1) {
    const i = atos.findIndex(a => a.id === ato.id);
    const j = i + dir;
    if (j < 0 || j >= atos.length) return;
    const nova = [...atos];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    try {
      await api.put('/api/instituicao/atos', nova.map((a, ordem) => ({ id: a.id, ordem })));
      recarregar();
    } catch (err) { toast.erro(mensagemErro(err)); }
  }

  const def = (k: keyof AtoLegal) => (e: { target: { value: string } }) => setEditando(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="wrap">
      <Cabecalho titulo="Atos legais" descricao="Autorização de funcionamento, reconhecimento, programas — cada um vira uma linha do cabeçalho do histórico"
        acoes={ehAdmin ? <Botao variante="primario" icone="mais" onClick={() => { setEditando({ ...NOVO }); setCampos([]); }}>Adicionar ato</Botao> : undefined} />
      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      <div className="conf">
        <Card semCorpo rodape={<span>Cada ato vira <b>uma linha de texto</b> no cabeçalho, na ordem desta tabela. O número é opcional — os atos atuais do colégio identificam-se pela data.</span>}>
          {carregando && !dados ? <Carregando /> : (
            <Tabela<AtoLegal>
              linhas={atos}
              chave={a => a.id}
              classeLinha={a => a.ativo ? undefined : 'linha-inativa'}
              vazio={<EstadoVazio icone="selo" titulo="Nenhum ato cadastrado" descricao="Comece pela autorização de funcionamento — é a primeira linha depois da mantenedora." acoes={ehAdmin ? <Botao variante="primario" icone="mais" onClick={() => setEditando({ ...NOVO })}>Adicionar ato</Botao> : undefined} />}
              colunas={[
                { chave: 'linha', rotulo: 'Linha impressa', principal: true, render: a => <><span className="nome-cel">{linhaAto(a)}</span><span className="sub">{ROTULO_TIPO_ATO[a.tipo]}{a.curso_id ? ` · ${cursos.dados?.cursos.find(c => c.id === a.curso_id)?.nome || 'curso'}` : ' · todos os cursos'}</span></> },
                { chave: 'numero', rotulo: 'Número', render: a => a.numero || <Tag>sem número</Tag> },
                { chave: 'data', rotulo: 'Data do ato', render: a => fmtData(a.data_ato) },
                { chave: 'pub', rotulo: 'Publicação', render: a => `${a.veiculo_publicacao} ${fmtData(a.data_publicacao)}` },
                { chave: 'status', rotulo: 'Status', render: a => a.ativo ? <Tag tipo="ok" ponto>Ativo</Tag> : <Tag ponto>Inativo</Tag> },
                { chave: 'acoes', rotulo: 'Ações', acoes: true, render: a => ehAdmin ? <>
                  <Botao pequeno variante="fantasma" className="btn-ico" aria-label="Mover para cima" onClick={() => mover(a, -1)}><Icone nome="cima" /></Botao>
                  <Botao pequeno variante="fantasma" className="btn-ico" aria-label="Mover para baixo" onClick={() => mover(a, 1)}><Icone nome="baixo" /></Botao>
                  <Botao pequeno onClick={() => { setEditando({ ...a }); setCampos([]); }}>Editar</Botao>
                  <Botao pequeno variante="perigo" className="btn-ico" aria-label="Remover" onClick={() => setExcluir(a)}><Icone nome="lixeira" /></Botao>
                </> : null }
              ]}
            />
          )}
        </Card>

        <aside className="conf-lado">
          <Card titulo="Como sai no documento" semCorpo>
            <div className="card-corpo" style={{ background: 'var(--superficie-2)', borderRadius: '0 0 var(--r-lg) var(--r-lg)' }}>
              <CabecalhoDocumento instituicao={dados?.instituicao || null} atos={editando && !editando.id ? [...atos, { ...(editando as AtoLegal), id: 'novo', ordem: 999, ativo: true }] : atos.map(a => editando?.id === a.id ? { ...a, ...(editando as AtoLegal) } : a)} compacto />
            </div>
          </Card>
        </aside>
      </div>

      <Modal aberto={!!editando} titulo={editando?.id ? 'Editar ato legal' : 'Novo ato legal'} descricao="A linha impressa é montada a partir destes campos. Se o formato padrão não servir, preencha o texto livre."
        aoFechar={() => setEditando(null)}
        rodape={<><Botao onClick={() => setEditando(null)}>Cancelar</Botao><Botao variante="primario" carregando={salvando} onClick={salvar} icone="check">Salvar</Botao></>}>
        {editando ? (
          <div className="form-grade">
            <CampoSelect rotulo="Tipo" name="tipo" value={editando.tipo || 'autorizacao'} onChange={def('tipo')} erros={campos}>
              {(Object.keys(ROTULO_TIPO_ATO) as TipoAtoLegal[]).map(t => <option key={t} value={t}>{ROTULO_TIPO_ATO[t]}</option>)}
            </CampoSelect>
            <CampoSelect rotulo="Aplica-se a" name="curso_id" value={editando.curso_id || ''} onChange={def('curso_id')} erros={campos} dica="Programa de um curso específico (ex.: bilíngue) ou todos.">
              <option value="">Todos os cursos</option>
              {(cursos.dados?.cursos || []).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </CampoSelect>
            <CampoTexto className="col-2" rotulo="Rótulo" name="rotulo" placeholder="Autorização de Funcionamento · Ensino Bilíngue" value={editando.rotulo || ''} onChange={def('rotulo')} erros={campos} obrigatorio autoFocus />
            <CampoTexto rotulo="Instrumento" name="instrumento" placeholder="Portaria" value={editando.instrumento || ''} onChange={def('instrumento')} erros={campos} />
            <CampoTexto rotulo="Número" name="numero" placeholder="opcional" value={editando.numero || ''} onChange={def('numero')} erros={campos} />
            <CampoTexto rotulo="Data do ato" name="data_ato" type="date" value={editando.data_ato || ''} onChange={def('data_ato')} erros={campos} />
            <CampoTexto rotulo="Órgão emissor" name="orgao_emissor" placeholder="opcional" value={editando.orgao_emissor || ''} onChange={def('orgao_emissor')} erros={campos} />
            <CampoTexto rotulo="Veículo de publicação" name="veiculo_publicacao" placeholder="DOE" value={editando.veiculo_publicacao || ''} onChange={def('veiculo_publicacao')} erros={campos} />
            <CampoTexto rotulo="Data de publicação" name="data_publicacao" type="date" value={editando.data_publicacao || ''} onChange={def('data_publicacao')} erros={campos} />
            <CampoTexto className="col-2" rotulo={<>Texto livre <small>— substitui a linha gerada</small></>} name="texto_impresso" value={editando.texto_impresso || ''} onChange={def('texto_impresso')} erros={campos} placeholder={linhaAto(editando as AtoLegal) || 'ex.: Autorização de Funcionamento - Portaria de 16-03-2012 - DOE 28-03-2012'} />
            <div className="col-2"><CampoCheck rotulo="Ativo (aparece no cabeçalho)" checked={editando.ativo !== false} onChange={e => setEditando(f => ({ ...f, ativo: e.target.checked }))} /></div>
            <div className="col-2 nota-lateral">Prévia: <b>{linhaAto(editando as AtoLegal) || '—'}</b></div>
          </div>
        ) : null}
      </Modal>

      <Confirmar aberto={!!excluir} titulo="Remover este ato?" descricao={excluir ? `"${linhaAto(excluir)}" deixa de aparecer no cabeçalho. Se preferir manter o registro, edite e desmarque "Ativo".` : ''}
        rotuloConfirmar="Remover" perigo carregando={salvando} aoFechar={() => setExcluir(null)} aoConfirmar={confirmarExclusao} />
    </div>
  );
}
