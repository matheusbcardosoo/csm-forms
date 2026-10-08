// /app/carteirinhas/:pastaId (08-carteirinhas §7.3): subpastas da pasta,
// emissão da pasta inteira, editar, arquivar, duplicar.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ErroApi, mensagemErro, type CampoInvalido } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { useToast } from '@/hooks/useToast';
import { Aviso, Botao, Cabecalho, CampoCheck, CampoTexto, Card, Carregando, Confirmar, EstadoVazio, Modal, Tabela, fmtDataHora } from '@/componentes/ui';
import { Icone } from '@/componentes/Icones';
import { ROTULO_DOCUMENTO, type CarteirinhaPasta, type PastaDetalhe as TPastaDetalhe, type SubpastaResumo } from '@shared/types/carteirinha';
import { fmtValidade, ModalImprimir, ModalPasta, TagsPendencias, urlLogoPasta } from './comum';

export function PastaDetalhe() {
  const { pastaId = '' } = useParams();
  const navegar = useNavigate();
  const toast = useToast();
  const { dados, carregando, erro, recarregar } = useRecurso<TPastaDetalhe>(`/api/carteirinhas/pastas/${pastaId}`);
  const [editar, setEditar] = useState(false);
  const [subpasta, setSubpasta] = useState<{ nome: string; professor_responsavel: string } | null>(null);
  const [campos, setCampos] = useState<CampoInvalido[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [imprimir, setImprimir] = useState<{ documento: 'carteirinhas' | 'ficha' | 'zip'; url: string; nome: string } | null>(null);
  const [excluir, setExcluir] = useState(false);
  const [duplicar, setDuplicar] = useState<{ nome: string; com_inscritos: boolean } | null>(null);
  // padrão: quem está em várias subpastas recebe um cartão só, no fim
  const [juntarRepetidos, setJuntarRepetidos] = useState(true);

  if (carregando && !dados) return <div className="wrap"><Carregando /></div>;
  if (erro || !dados) return <div className="wrap"><Aviso tipo="erro">{erro || 'Pasta não encontrada.'}</Aviso></div>;

  const { pasta, subpastas, totais } = dados;
  const logo = urlLogoPasta(pasta);
  const incompleta = !pasta.validade || !pasta.logo_evento_path;
  // a soma por subpasta passa do total de alunos distintos quando alguém está em mais de uma
  const temRepetidos = subpastas.reduce((n, s) => n + s.inscritos, 0) > totais.inscritos;

  async function executar(chave: string, fn: () => Promise<unknown>, ok?: string) {
    setOcupado(chave);
    try { await fn(); if (ok) toast.ok(ok); recarregar(); }
    catch (err) { toast.erro(mensagemErro(err)); }
    finally { setOcupado(null); }
  }

  async function criarSubpasta() {
    if (!subpasta) return;
    setOcupado('subpasta'); setCampos([]);
    try {
      const nova = await api.post<{ id: string }>(`/api/carteirinhas/pastas/${pasta.id}/subpastas`, subpasta);
      setSubpasta(null);
      navegar(`/app/carteirinhas/${pasta.id}/${nova.id}`);
    } catch (err) {
      if (err instanceof ErroApi && err.campos.length) setCampos(err.campos);
      toast.erro(mensagemErro(err));
    } finally { setOcupado(null); }
  }

  function mover(indice: number, delta: -1 | 1) {
    const ids = subpastas.map(s => s.id);
    const alvo = indice + delta;
    if (alvo < 0 || alvo >= ids.length) return;
    [ids[indice], ids[alvo]] = [ids[alvo], ids[indice]];
    executar('ordem', () => api.put(`/api/carteirinhas/pastas/${pasta.id}/ordem`, { ids }));
  }

  const nomeBase = pasta.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return (
    <div className="wrap">
      <Cabecalho
        voltar={{ to: pasta.arquivada ? '/app/carteirinhas/arquivadas' : '/app/carteirinhas', rotulo: pasta.arquivada ? 'Pastas arquivadas' : 'Carteirinhas' }}
        titulo={<span style={{ display: 'inline-flex', gap: 12, alignItems: 'center' }}>
          <span className="pasta-logo">{logo ? <img src={logo} alt="" /> : <Icone nome="pasta" />}</span>{pasta.nome}
        </span>}
        descricao={<>{pasta.validade ? `Válida até ${fmtValidade(pasta.validade)}` : 'Sem validade'} · {subpastas.length} subpasta(s) · {totais.inscritos} aluno(s){pasta.arquivada ? ' · arquivada' : ''}{pasta.descricao ? ` · ${pasta.descricao}` : ''}</>}
        acoes={<>
          <Botao icone="editar" onClick={() => setEditar(true)}>Editar pasta</Botao>
          {!pasta.arquivada ? <Botao variante="primario" icone="mais" onClick={() => { setSubpasta({ nome: '', professor_responsavel: '' }); setCampos([]); }}>Nova subpasta</Botao> : null}
        </>} />

      {incompleta ? (
        <div style={{ marginBottom: 14 }}>
          <Aviso tipo="erro"><b>Falta {[!pasta.validade && 'a validade', !pasta.logo_evento_path && 'a logo do evento'].filter(Boolean).join(' e ')}.</b> As carteirinhas não são emitidas assim, porque todo cartão sairia incompleto. A ficha de inscrição já pode ser gerada. <button type="button" className="link" onClick={() => setEditar(true)}>Editar pasta</button></Aviso>
        </div>
      ) : null}

      <Card titulo="Subpastas" descricao="Cada subpasta é uma turma do evento e gera um PDF de carteirinhas e uma ficha de inscrição" semCorpo
        acoes={subpastas.length ? <>
          <Botao pequeno icone="documento" onClick={() => setImprimir({ documento: 'ficha', url: `/api/carteirinhas/pastas/${pasta.id}/fichas.pdf`, nome: `fichas-inscricao-${nomeBase}.pdf` })}>Fichas da pasta (PDF)</Botao>
          <Botao pequeno icone="zip" disabled={incompleta || !totais.inscritos} title={incompleta ? 'Complete validade e logo da pasta' : undefined}
            onClick={() => setImprimir({ documento: 'zip', url: `/api/carteirinhas/pastas/${pasta.id}/carteirinhas.zip`, nome: `carteirinhas-${nomeBase}.zip` })}>Carteirinhas da pasta (ZIP)</Botao>
        </> : undefined}>
        <Tabela<SubpastaResumo>
          linhas={subpastas}
          chave={s => s.id}
          vazio={<EstadoVazio icone="pasta" titulo="Nenhuma subpasta" descricao="Crie uma subpasta para cada turma do evento — Sub 12 Vôlei, Sub 14 Futsal… — e inscreva os alunos nela."
            acoes={!pasta.arquivada ? <Botao variante="primario" icone="mais" onClick={() => setSubpasta({ nome: '', professor_responsavel: '' })}>Nova subpasta</Botao> : undefined} />}
          colunas={[
            { chave: 'nome', rotulo: 'Subpasta', principal: true, render: s => <Link className="nome-cel" to={`/app/carteirinhas/${pasta.id}/${s.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{s.nome}</Link> },
            { chave: 'inscritos', rotulo: 'Inscritos', render: s => s.inscritos },
            { chave: 'prof', rotulo: 'Professor(a)', render: s => s.professor_responsavel || <span className="cel-sub">—</span> },
            { chave: 'pend', rotulo: 'Pendências', render: s => <TagsPendencias c={s} /> },
            { chave: 'emissao', rotulo: 'Última emissão', render: s => s.ultima_emissao ? <>{fmtDataHora(s.ultima_emissao.emitido_em)}<span className="sub">{ROTULO_DOCUMENTO[s.ultima_emissao.documento]} · {s.ultima_emissao.emitido_por}</span></> : <span className="cel-sub">—</span> },
            {
              chave: 'acoes', rotulo: 'Ações', acoes: true, render: s => {
                const i = subpastas.indexOf(s);
                return <>
                  <Botao pequeno variante="fantasma" className="btn-ico" aria-label={`Subir ${s.nome}`} disabled={i === 0 || !!ocupado} onClick={() => mover(i, -1)}><Icone nome="cima" /></Botao>
                  <Botao pequeno variante="fantasma" className="btn-ico" aria-label={`Descer ${s.nome}`} disabled={i === subpastas.length - 1 || !!ocupado} onClick={() => mover(i, 1)}><Icone nome="baixo" /></Botao>
                  <Link className="btn btn-sm" to={`/app/carteirinhas/${pasta.id}/${s.id}`}>Abrir</Link>
                </>;
              }
            }
          ]}
        />
      </Card>

      <div className="acoes" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
        <Botao pequeno icone="copiar" onClick={() => setDuplicar({ nome: pasta.nome.replace(/\d{4}/, a => String(Number(a) + 1)), com_inscritos: false })}>Duplicar pasta</Botao>
        <Botao pequeno icone="pasta" carregando={ocupado === 'arquivar'}
          onClick={() => executar('arquivar', () => api.put(`/api/carteirinhas/pastas/${pasta.id}`, { arquivada: !pasta.arquivada }), pasta.arquivada ? 'Pasta reaberta.' : 'Pasta arquivada.')}>
          {pasta.arquivada ? 'Reabrir pasta' : 'Arquivar pasta'}
        </Botao>
        {!subpastas.length ? <Botao pequeno variante="perigo" icone="lixeira" onClick={() => setExcluir(true)}>Excluir pasta</Botao> : null}
      </div>

      <ModalPasta aberto={editar} pasta={pasta} aoFechar={() => setEditar(false)} aoSalvar={() => { setEditar(false); recarregar(); }} />

      <Modal aberto={!!subpasta} titulo="Nova subpasta" descricao="A turma do evento. O nome sai impresso no cartão, na faixa azul." tamanho="sm" aoFechar={() => setSubpasta(null)}
        rodape={<><Botao onClick={() => setSubpasta(null)}>Cancelar</Botao><Botao variante="primario" icone="check" carregando={ocupado === 'subpasta'} onClick={criarSubpasta}>Criar subpasta</Botao></>}>
        {subpasta ? <div className="form-grade" style={{ gridTemplateColumns: '1fr' }}>
          <CampoTexto rotulo="Nome" name="nome" obrigatorio autoFocus placeholder="ex.: Sub 12 Vôlei" value={subpasta.nome} erros={campos} onChange={e => setSubpasta(s => s && ({ ...s, nome: e.target.value }))} />
          <CampoTexto rotulo={<>Professor(a) responsável <small>· opcional, sai na ficha</small></>} name="professor_responsavel" value={subpasta.professor_responsavel} erros={campos} onChange={e => setSubpasta(s => s && ({ ...s, professor_responsavel: e.target.value }))} />
        </div> : null}
      </Modal>

      <Modal aberto={!!duplicar} titulo="Duplicar pasta" descricao="Copia a pasta com as subpastas, a logo e a validade — para a edição do ano seguinte." tamanho="sm" aoFechar={() => setDuplicar(null)}
        rodape={<><Botao onClick={() => setDuplicar(null)}>Cancelar</Botao><Botao variante="primario" icone="copiar" carregando={ocupado === 'duplicar'}
          onClick={async () => {
            setOcupado('duplicar');
            try { const nova = await api.post<CarteirinhaPasta>(`/api/carteirinhas/pastas/${pasta.id}/duplicar`, duplicar); toast.ok('Pasta duplicada. Revise a validade.'); setDuplicar(null); navegar(`/app/carteirinhas/${nova.id}`); }
            catch (err) { toast.erro(mensagemErro(err)); }
            finally { setOcupado(null); }
          }}>Duplicar</Botao></>}>
        {duplicar ? <div className="form-grade" style={{ gridTemplateColumns: '1fr' }}>
          <CampoTexto rotulo="Nome da nova pasta" value={duplicar.nome} autoFocus onChange={e => setDuplicar(d => d && ({ ...d, nome: e.target.value }))} />
          <CampoCheck rotulo="Levar também os alunos inscritos" checked={duplicar.com_inscritos} onChange={e => setDuplicar(d => d && ({ ...d, com_inscritos: e.target.checked }))} />
          <Aviso tipo="aviso">A validade é copiada como está ({pasta.validade ? fmtValidade(pasta.validade) : 'sem validade'}). Confira antes de emitir.</Aviso>
        </div> : null}
      </Modal>

      <Confirmar aberto={excluir} titulo="Excluir a pasta?" perigo rotuloConfirmar="Excluir" carregando={ocupado === 'excluir'}
        descricao="A pasta está vazia e será apagada, com a logo. Isto não tem volta."
        aoFechar={() => setExcluir(false)}
        aoConfirmar={async () => {
          setOcupado('excluir');
          try { await api.del(`/api/carteirinhas/pastas/${pasta.id}`); toast.ok('Pasta excluída.'); navegar('/app/carteirinhas'); }
          catch (err) { toast.erro(mensagemErro(err)); setExcluir(false); }
          finally { setOcupado(null); }
        }} />

      {imprimir ? <ModalImprimir aberto documento={imprimir.documento} nomeArquivo={imprimir.nome} aoFechar={() => setImprimir(null)} aoBaixar={recarregar}
        url={temRepetidos && juntarRepetidos ? `${imprimir.url}?repetidos=1` : imprimir.url}
        extra={temRepetidos ? <div style={{ marginTop: 12 }}>
          <CampoCheck checked={juntarRepetidos} onChange={e => setJuntarRepetidos(e.target.checked)}
            rotulo={<>Alunos em mais de uma subpasta nas últimas folhas <small>· uma vez só, com o título “Subpasta A | Subpasta B”{imprimir.documento === 'zip' ? ', num PDF à parte no ZIP' : ''}</small></>} />
        </div> : undefined} /> : null}
    </div>
  );
}
