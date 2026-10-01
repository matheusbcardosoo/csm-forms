// /app/carteirinhas/:pastaId/:subpastaId (08-carteirinhas §7.4): inscritos,
// conferência, prévia (carteirinhas | ficha) e emissão.
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ErroApi, mensagemErro, type CampoInvalido } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { useToast } from '@/hooks/useToast';
import { Aviso, Botao, CampoSelect, CampoTexto, Card, Carregando, Confirmar, EstadoVazio, Modal, Tabela, Tag, fmtDataHora } from '@/componentes/ui';
import { Icone } from '@/componentes/Icones';
import { FotoAluno } from '@/componentes/FotoAluno';
import { PreviaCarteirinhas } from '@/componentes/PreviaCarteirinhas';
import { PreviaFichaInscricao } from '@/componentes/PreviaFichaInscricao';
import { ROTULO_DOCUMENTO, ROTULO_PENDENCIA, type DocCarteirinhas, type DocFichaInscricao, type InscritoDetalhe, type SubpastaDetalhe as TSubpastaDetalhe } from '@shared/types/carteirinha';
import { ModalImprimir, useEscalaParaCaber } from './comum';
import { ModalAdicionarAlunos } from './ModalAdicionarAlunos';

type Resposta = TSubpastaDetalhe & { diretores: { id: string; nome: string }[] };
type Doc = 'carteirinhas' | 'ficha';

export function SubpastaDetalhe() {
  const { pastaId = '', subpastaId = '' } = useParams();
  const navegar = useNavigate();
  const toast = useToast();
  const { dados, carregando, erro, recarregar } = useRecurso<Resposta>(`/api/carteirinhas/subpastas/${subpastaId}`);
  const [doc, setDoc] = useState<Doc>('carteirinhas');
  const [diretor, setDiretor] = useState('');
  const previa = useRecurso<DocCarteirinhas | DocFichaInscricao>(dados ? `/api/carteirinhas/subpastas/${subpastaId}/previa?doc=${doc}${diretor ? `&diretor=${diretor}` : ''}&v=${dados.inscritos.length}-${dados.subpasta.atualizado_em}-${dados.pasta.atualizado_em}` : null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [adicionar, setAdicionar] = useState(false);
  const [editar, setEditar] = useState<{ nome: string; professor_responsavel: string } | null>(null);
  const [campos, setCampos] = useState<CampoInvalido[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [imprimir, setImprimir] = useState<{ documento: 'carteirinhas' | 'ficha'; url: string; nome: string } | null>(null);
  const [remover, setRemover] = useState<string[] | null>(null);
  const [excluir, setExcluir] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const escala = useEscalaParaCaber(caixa, doc === 'ficha' ? 297 : 210, 0.75);

  const inscritosIds = useMemo(() => new Set((dados?.inscritos || []).map(i => i.aluno_id)), [dados]);

  if (carregando && !dados) return <div className="wrap"><Carregando /></div>;
  if (erro || !dados) return <div className="wrap"><Aviso tipo="erro">{erro || 'Subpasta não encontrada.'}</Aviso></div>;

  const { pasta, subpasta, inscritos, conferencia, emissoes } = dados;
  const bloqueada = conferencia.bloqueios.length > 0;
  const manual = subpasta.ordenacao === 'manual';
  const nomeArq = `${pasta.nome} ${subpasta.nome}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const selecionados = inscritos.filter(i => marcados.has(i.aluno_id)).map(i => i.aluno_id);

  async function executar(chave: string, fn: () => Promise<unknown>, ok?: string) {
    setOcupado(chave);
    try { await fn(); if (ok) toast.ok(ok); recarregar(); }
    catch (err) { toast.erro(mensagemErro(err)); }
    finally { setOcupado(null); }
  }

  function mover(indice: number, delta: -1 | 1) {
    const ids = inscritos.map(i => i.aluno_id);
    const alvo = indice + delta;
    if (alvo < 0 || alvo >= ids.length) return;
    [ids[indice], ids[alvo]] = [ids[alvo], ids[indice]];
    executar('ordem', () => api.put(`/api/carteirinhas/subpastas/${subpasta.id}/ordem`, { aluno_ids: ids }));
  }

  async function salvarSubpasta(corpo: Record<string, unknown>, ok: string) {
    setOcupado('editar'); setCampos([]);
    try { await api.put(`/api/carteirinhas/subpastas/${subpasta.id}`, corpo); toast.ok(ok); setEditar(null); recarregar(); }
    catch (err) { if (err instanceof ErroApi && err.campos.length) setCampos(err.campos); toast.erro(mensagemErro(err)); }
    finally { setOcupado(null); }
  }

  const imprimirCarteirinhas = (ids?: string[]) => setImprimir({
    documento: 'carteirinhas',
    url: `/api/carteirinhas/subpastas/${subpasta.id}/carteirinhas.pdf${ids?.length ? `?alunos=${ids.join(',')}` : ''}`,
    nome: `carteirinhas-${nomeArq}.pdf`
  });

  return (
    <div className="wrap">
      <Link className="cab-voltar" to={`/app/carteirinhas/${pasta.id}`}><Icone nome="setaEsq" />{pasta.nome}</Link>
      <div className="cab">
        <div>
          <h1>{subpasta.nome}</h1>
          <p>{inscritos.length} inscrito(s){subpasta.professor_responsavel ? ` · Prof. ${subpasta.professor_responsavel}` : ''} · <button type="button" className="link" onClick={() => { setEditar({ nome: subpasta.nome, professor_responsavel: subpasta.professor_responsavel || '' }); setCampos([]); }}>editar</button></p>
        </div>
        <div className="acoes">
          <Botao icone="mais" onClick={() => setAdicionar(true)}>Adicionar alunos</Botao>
          <Botao variante="primario" icone="cartao" disabled={bloqueada || !inscritos.length} title={bloqueada ? 'Complete a pasta antes' : undefined} onClick={() => imprimirCarteirinhas()}>Carteirinhas</Botao>
          <Botao variante="destaque" icone="documento" onClick={() => setImprimir({ documento: 'ficha', url: `/api/carteirinhas/subpastas/${subpasta.id}/ficha.pdf${diretor ? `?diretor=${diretor}` : ''}`, nome: `ficha-inscricao-${nomeArq}.pdf` })}>Ficha de inscrição</Botao>
        </div>
      </div>

      <div className="conf conf-previa">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          {bloqueada ? (
            <Aviso tipo="erro"><b>As carteirinhas não podem ser emitidas ainda.</b>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{conferencia.bloqueios.map(b => <li key={b}>{b}</li>)}</ul>
              <Link to={`/app/carteirinhas/${pasta.id}`} style={{ fontWeight: 600, color: 'inherit' }}>Ir para a pasta</Link>
            </Aviso>
          ) : null}
          {conferencia.avisos.sem_foto || conferencia.avisos.sem_ra || conferencia.avisos.sem_cpf || conferencia.avisos.sem_nascimento ? (
            <Aviso tipo="aviso"><b>Conferência:</b> {[
              conferencia.avisos.sem_foto && `${conferencia.avisos.sem_foto} sem foto`,
              conferencia.avisos.sem_ra && `${conferencia.avisos.sem_ra} sem R.A.`,
              conferencia.avisos.sem_cpf && `${conferencia.avisos.sem_cpf} sem CPF válido (só na ficha)`,
              conferencia.avisos.sem_nascimento && `${conferencia.avisos.sem_nascimento} sem nascimento`
            ].filter(Boolean).join(' · ')}. Não impede a emissão: o campo sai com “—” e a foto, com o quadro “sem foto”.</Aviso>
          ) : inscritos.length ? <Aviso tipo="ok">Todos os inscritos têm foto, R.A., CPF e data de nascimento.</Aviso> : null}

          <Card semCorpo titulo="Inscritos" descricao={manual ? 'Ordem manual — é a numeração da ficha' : 'Ordem alfabética — é a numeração da ficha'}
            acoes={inscritos.length > 1 ? (
              <Botao pequeno variante="fantasma" carregando={ocupado === 'editar'} onClick={() => salvarSubpasta({ ordenacao: manual ? 'alfabetica' : 'manual' }, manual ? 'Ordem alfabética.' : 'Ordem manual: use as setas.')}>
                {manual ? 'Voltar à ordem alfabética' : 'Ordenar à mão'}
              </Botao>
            ) : undefined}>
            {selecionados.length ? (
              <div className="barra-selecao">
                <span><b>{selecionados.length}</b> selecionado(s)</span>
                <Botao pequeno icone="cartao" disabled={bloqueada} onClick={() => imprimirCarteirinhas(selecionados)}>Carteirinhas só destes</Botao>
                <Botao pequeno variante="perigo" icone="lixeira" onClick={() => setRemover(selecionados)}>Remover da subpasta</Botao>
              </div>
            ) : null}
            <Tabela<InscritoDetalhe>
              linhas={inscritos}
              chave={i => i.aluno_id}
              selecao={{ marcados, aoMudar: setMarcados, rotulo: i => `Selecionar ${i.nome}` }}
              vazio={<EstadoVazio icone="alunos" titulo="Ninguém inscrito ainda" descricao="Adicione os alunos desta turma do evento. Dá para filtrar por série e turma e marcar todos de uma vez."
                acoes={<Botao variante="primario" icone="mais" onClick={() => setAdicionar(true)}>Adicionar alunos</Botao>} />}
              colunas={[
                { chave: 'n', rotulo: '#', className: 'num', render: i => <b>{String(i.numero).padStart(2, '0')}</b> },
                {
                  chave: 'aluno', rotulo: 'Aluno', principal: true, render: i => (
                    <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                      <FotoAluno aluno={{ id: i.aluno_id, nome: i.nome, foto_path: i.foto_path, foto_atualizada_em: i.foto_atualizada_em }} className="ficha-av mini" />
                      <span style={{ minWidth: 0 }}><Link className="nome-cel" to={`/app/alunos/${i.aluno_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{i.nome}</Link>
                        <span className="sub">{i.codigo_activesoft ? `Código ${i.codigo_activesoft}` : 'manual'}{i.ra ? ` · RA ${i.ra}` : ''}</span></span>
                    </span>
                  )
                },
                { chave: 'turma', rotulo: 'Série / turma', render: i => i.serie_turma || <span className="cel-sub">—</span> },
                {
                  chave: 'pend', rotulo: 'Pendências', render: i => i.pendencias.length
                    ? <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>{i.pendencias.map(p => <Link key={p} to={`/app/alunos/${i.aluno_id}?aba=dados`} style={{ textDecoration: 'none' }}><Tag tipo="aviso">{ROTULO_PENDENCIA[p]}</Tag></Link>)}</span>
                    : <Tag tipo="ok">ok</Tag>
                },
                {
                  chave: 'acoes', rotulo: 'Ações', acoes: true, render: i => {
                    const k = inscritos.indexOf(i);
                    return <>
                      {manual ? <>
                        <Botao pequeno variante="fantasma" className="btn-ico" aria-label={`Subir ${i.nome}`} disabled={k === 0 || !!ocupado} onClick={() => mover(k, -1)}><Icone nome="cima" /></Botao>
                        <Botao pequeno variante="fantasma" className="btn-ico" aria-label={`Descer ${i.nome}`} disabled={k === inscritos.length - 1 || !!ocupado} onClick={() => mover(k, 1)}><Icone nome="baixo" /></Botao>
                      </> : null}
                      <Botao pequeno variante="fantasma" className="btn-ico" aria-label={`Remover ${i.nome} da subpasta`} onClick={() => setRemover([i.aluno_id])}><Icone nome="lixeira" /></Botao>
                    </>;
                  }
                }
              ]}
            />
          </Card>

          {emissoes.length ? (
            <Card titulo="Emissões" descricao="Quem gerou o quê. O PDF não é guardado: reimprimir sai com o dado atual.">
              <ul className="lista-curta">
                {emissoes.slice(0, 8).map(e => <li key={e.id}><span>{ROTULO_DOCUMENTO[e.documento]} · {e.quantidade} aluno(s){e.escopo === 'selecao' ? ' (seleção)' : e.escopo === 'avulsa' ? ' (avulsa)' : e.escopo === 'pasta' ? ' (pasta)' : ''}</span><span className="cel-sub">{fmtDataHora(e.emitido_em)} · {e.emitido_por}</span></li>)}
              </ul>
            </Card>
          ) : null}
        </div>

        <aside className="conf-lado" style={{ minWidth: 0 }}>
          <Card semCorpo titulo="Prévia" descricao="O mesmo que sai no PDF"
            acoes={<div className="abas" role="tablist" style={{ margin: 0, border: 0 }}>
              {(['carteirinhas', 'ficha'] as Doc[]).map(d => <button key={d} type="button" role="tab" className="aba" aria-selected={doc === d} onClick={() => setDoc(d)}>{d === 'ficha' ? 'Ficha' : 'Carteirinhas'}</button>)}
            </div>}>
            <div className="card-corpo" style={{ background: 'var(--superficie-2)', maxHeight: '75vh', overflowY: 'auto' }} ref={caixa}>
              {doc === 'ficha' && dados.diretores.length > 1 ? (
                <div style={{ marginBottom: 10 }}>
                  <CampoSelect rotulo="Diretor(a) que assina" value={diretor} onChange={e => setDiretor(e.target.value)}>
                    <option value="">{dados.diretores[0].nome} (primeiro ativo)</option>
                    {dados.diretores.slice(1).map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                  </CampoSelect>
                </div>
              ) : null}
              {/* ao trocar de aba, o recurso ainda guarda o documento da outra até o novo chegar:
                  decide pelo formato do objeto, não pela aba */}
              {previa.erro ? <Aviso tipo="erro">{previa.erro}</Aviso>
                : doc === 'ficha' && previa.dados && 'folhas' in previa.dados ? <PreviaFichaInscricao doc={previa.dados} escala={escala} />
                : doc === 'carteirinhas' && previa.dados && 'cartoes' in previa.dados ? (
                  previa.dados.cartoes.length
                    ? <PreviaCarteirinhas doc={previa.dados} escala={escala} />
                    : <EstadoVazio icone="cartao" titulo="Sem cartões para mostrar" descricao="Inscreva alunos para ver a prévia." />
                ) : <Carregando />}
            </div>
          </Card>
        </aside>
      </div>

      <ModalAdicionarAlunos aberto={adicionar} subpastaId={subpasta.id} subpastaNome={subpasta.nome} jaInscritos={inscritosIds}
        aoFechar={() => setAdicionar(false)} aoAdicionar={() => { setAdicionar(false); recarregar(); }} />

      <Modal aberto={!!editar} titulo="Editar subpasta" tamanho="sm" aoFechar={() => setEditar(null)}
        rodape={<>
          <Botao variante="perigo" icone="lixeira" onClick={() => { setEditar(null); setExcluir(true); }} style={{ marginRight: 'auto' }}>Excluir</Botao>
          <Botao onClick={() => setEditar(null)}>Cancelar</Botao>
          <Botao variante="primario" icone="check" carregando={ocupado === 'editar'} onClick={() => editar && salvarSubpasta(editar, 'Subpasta atualizada.')}>Salvar</Botao>
        </>}>
        {editar ? <div className="form-grade" style={{ gridTemplateColumns: '1fr' }}>
          <CampoTexto rotulo="Nome" name="nome" obrigatorio value={editar.nome} erros={campos} onChange={e => setEditar(s => s && ({ ...s, nome: e.target.value }))} dica="Sai no cartão, na faixa azul, e no título da ficha." />
          <CampoTexto rotulo="Professor(a) responsável" name="professor_responsavel" value={editar.professor_responsavel} erros={campos} onChange={e => setEditar(s => s && ({ ...s, professor_responsavel: e.target.value }))} dica="Sai impresso na ficha de inscrição. Em branco, a ficha traz a linha para preencher à mão." />
        </div> : null}
      </Modal>

      <Confirmar aberto={!!remover} titulo={remover?.length === 1 ? 'Remover o aluno da subpasta?' : `Remover ${remover?.length} alunos da subpasta?`} perigo rotuloConfirmar="Remover" carregando={ocupado === 'remover'}
        descricao="Sai só desta subpasta: as outras inscrições do aluno continuam. A numeração da ficha se reorganiza."
        aoFechar={() => setRemover(null)}
        aoConfirmar={() => executar('remover', async () => {
          for (const id of remover || []) await api.del(`/api/carteirinhas/subpastas/${subpasta.id}/inscritos/${id}`);
          setRemover(null); setMarcados(new Set());
        }, 'Removido(s) da subpasta.')} />

      <Confirmar aberto={excluir} titulo="Excluir a subpasta?" perigo rotuloConfirmar="Excluir" carregando={ocupado === 'excluir'}
        descricao={`A subpasta e a lista de ${inscritos.length} inscrito(s) são apagadas. Os alunos continuam no cadastro e nas outras subpastas. O registro das emissões já feitas é mantido.`}
        aoFechar={() => setExcluir(false)}
        aoConfirmar={async () => {
          setOcupado('excluir');
          try { await api.del(`/api/carteirinhas/subpastas/${subpasta.id}`); toast.ok('Subpasta excluída.'); navegar(`/app/carteirinhas/${pastaId}`); }
          catch (err) { toast.erro(mensagemErro(err)); setExcluir(false); }
          finally { setOcupado(null); }
        }} />

      {imprimir ? <ModalImprimir aberto documento={imprimir.documento} url={imprimir.url} nomeArquivo={imprimir.nome} aoFechar={() => setImprimir(null)} aoBaixar={recarregar} /> : null}
    </div>
  );
}
