// /app/config/curriculos (06-versionamento): linhagem de versões por
// curso, com duplicação e vigência por (ano letivo, série).
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, mensagemErro } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { useSessao } from '@/hooks/useSessao';
import { useToast } from '@/hooks/useToast';
import { useAnoLetivo } from '@/hooks/useAnoLetivo';
import { Aviso, Botao, BotaoLink, Cabecalho, CampoSelect, CampoTexto, Card, Carregando, EstadoVazio, Modal, Tabela, Tag } from '@/componentes/ui';
import { Icone } from '@/componentes/Icones';
import { ROTULO_STATUS_VERSAO, type Curso, type Serie, type VersaoResumo, type VigenciaCurricular } from '@shared/types/curriculo';

interface Cadastros { cursos: Curso[]; series: Serie[] }

interface RelatorioGrade {
  versao: { id: string; nome: string } | null;
  criouVersao: boolean;
  linhasCriadas: { serie: string; nome_impresso: string; carga_horaria: number | null; codigo_origem: string; componente_novo: boolean }[];
  linhasExistentes: number;
  componentesCriados: string[];
  mapeamentosCriados: number;
  seriesSemDestino: { codigo_origem: string; descricao: string | null; registros: number }[];
  avisos: string[];
}

export function Curriculos() {
  const { ehAdmin } = useSessao();
  const toast = useToast();
  const { registros: anosLetivos } = useAnoLetivo();
  const [params, setParams] = useSearchParams();
  const cadastros = useRecurso<Cadastros>('/api/cadastros/cursos');
  const cursos = cadastros.dados?.cursos || [];
  const cursoId = params.get('curso') || cursos[0]?.id || '';

  useEffect(() => { if (!params.get('curso') && cursos[0]) setParams({ curso: cursos[0].id }, { replace: true }); }, [cursos, params, setParams]);

  const versoes = useRecurso<VersaoResumo[]>(cursoId ? `/api/versoes?curso=${cursoId}` : null);
  const vigencia = useRecurso<VigenciaCurricular[]>(cursoId ? `/api/versoes/vigencia/${cursoId}` : null);
  const curso = cursos.find(c => c.id === cursoId) || null;
  const series = useMemo(() => (cadastros.dados?.series || []).filter(s => s.curso_id === cursoId && s.ativo).sort((a, b) => a.ordem - b.ordem), [cadastros.dados, cursoId]);

  const [novo, setNovo] = useState<{ nome: string; base_legal: string } | null>(null);
  const [duplicar, setDuplicar] = useState<{ origem: VersaoResumo; nome: string } | null>(null);
  const [daOrigem, setDaOrigem] = useState<{ anoLetivo: string; nomeVersao: string } | null>(null);
  const [previa, setPrevia] = useState<RelatorioGrade | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const vigente = (versoes.dados || []).find(v => v.status === 'vigente') || null;

  async function criar() {
    if (!novo || !cursoId) return;
    setOcupado(true);
    try {
      const v = await api.post<{ id: string }>('/api/versoes', { curso_id: cursoId, ...novo });
      toast.ok('Versão criada em rascunho.'); setNovo(null); versoes.recarregar();
      window.location.hash = '';
      window.setTimeout(() => { window.location.assign(`/app/config/curriculos/${v.id}`); }, 0);
    } catch (err) { toast.erro(mensagemErro(err)); }
    finally { setOcupado(false); }
  }

  async function confirmarDuplicar() {
    if (!duplicar) return;
    setOcupado(true);
    try {
      const r = await api.post<{ id: string }>(`/api/versoes/${duplicar.origem.id}/duplicar`, { nome: duplicar.nome });
      toast.ok('Versão duplicada. Ajuste só o que a reforma mudou.'); setDuplicar(null);
      window.location.assign(`/app/config/curriculos/${r.id}`);
    } catch (err) { toast.erro(mensagemErro(err)); }
    finally { setOcupado(false); }
  }

  async function montarDaOrigem(modo: 'simulacao' | 'efetiva') {
    if (!daOrigem || !cursoId) return;
    setOcupado(true);
    try {
      const r = await api.post<RelatorioGrade>('/api/importacoes/grade', {
        cursoId, anoLetivo: Number(daOrigem.anoLetivo), nomeVersao: daOrigem.nomeVersao || undefined, modo
      });
      if (modo === 'simulacao') { setPrevia(r); return; }
      toast.ok(`${r.linhasCriadas.length} disciplina(s) na grade${r.componentesCriados.length ? `, ${r.componentesCriados.length} componente(s) novo(s)` : ''}. Organize nos blocos e publique.`);
      setDaOrigem(null); setPrevia(null); versoes.recarregar();
      if (r.versao) window.location.assign(`/app/config/curriculos/${r.versao.id}`);
    } catch (err) { toast.erro(mensagemErro(err)); }
    finally { setOcupado(false); }
  }

  async function definirVigencia(ano_letivo_id: string, serie_id: string, versao_id: string) {
    try {
      await api.put('/api/versoes/vigencia', { ano_letivo_id, serie_id, versao_id: versao_id || null });
      vigencia.recarregar();
    } catch (err) { toast.erro(mensagemErro(err)); }
  }

  const anosOrdenados = [...anosLetivos].sort((a, b) => b.ano - a.ano);

  return (
    <div className="wrap">
      <Cabecalho titulo="Versões curriculares" descricao={curso ? `${curso.nome} · a estrutura que o histórico imprime, congelada por período` : 'A estrutura que o histórico imprime, congelada por período'}
        acoes={ehAdmin && cursoId ? <>
          <Botao icone="mais" onClick={() => setNovo({ nome: '', base_legal: '' })}>Versão em branco</Botao>
          <Botao icone="importar" onClick={() => { setPrevia(null); setDaOrigem({ anoLetivo: String(anosOrdenados[0]?.ano || new Date().getFullYear()), nomeVersao: '' }); }}>Montar a partir do Activesoft</Botao>
          <Botao variante="primario" icone="copiar" disabled={!vigente} onClick={() => vigente && setDuplicar({ origem: vigente, nome: `${vigente.nome} (revisão ${new Date().getFullYear()})` })}>Duplicar versão vigente</Botao>
        </> : undefined} />

      {cadastros.erro ? <Aviso tipo="erro">{cadastros.erro}</Aviso> : null}
      {cadastros.dados && cursos.length === 0 ? (
        <Card semCorpo><EstadoVazio icone="livro" titulo="Cadastre um curso primeiro" descricao="Versões curriculares pertencem a um curso." acoes={<BotaoLink to="/app/config/cursos" variante="primario">Cursos e séries</BotaoLink>} /></Card>
      ) : null}

      {cursos.length ? (
        <div className="filtros">
          <label className="f-campo">Curso: <select value={cursoId} onChange={e => setParams({ curso: e.target.value })} aria-label="Curso">{cursos.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
          <span className="cel-sub">{series.length} série(s) ativa(s)</span>
        </div>
      ) : null}

      {cursoId ? (
        <>
          <div style={{ marginBottom: 14 }}>
            <Aviso><b>Versão em uso não se edita — duplica-se.</b> O histórico é retrospectivo: um aluno de 2019 recebe hoje um documento com os nomes de 2019. Quando uma reforma muda ou extingue componentes, você cria uma versão nova e a antiga continua servindo os históricos daquele período.</Aviso>
          </div>

          <Card titulo="Linhagem" descricao="Versões deste curso · o acervo cresce sob demanda" semCorpo
            rodape={<><span>Vigência por <b>ano letivo + série</b> — uma reforma escalonada pode ter 1ª série numa versão e 3ª série em outra no mesmo ano.</span></>}>
            {versoes.carregando && !versoes.dados ? <Carregando /> : (
              <Tabela<VersaoResumo>
                linhas={versoes.dados || []}
                chave={v => v.id}
                vazio={<EstadoVazio icone="grade" titulo="Nenhuma versão para este curso" descricao="A grade pode vir pronta do Activesoft: as disciplinas de cada série, a carga horária e o código de origem de cada uma. Você organiza nos blocos e publica. Ou monte à mão, do zero." acoes={ehAdmin ? <><Botao variante="primario" icone="importar" onClick={() => { setPrevia(null); setDaOrigem({ anoLetivo: String(anosOrdenados[0]?.ano || new Date().getFullYear()), nomeVersao: '' }); }}>Montar a partir do Activesoft</Botao><Botao icone="mais" onClick={() => setNovo({ nome: '', base_legal: '' })}>Versão em branco</Botao></> : undefined} />}
                colunas={[
                  { chave: 'nome', rotulo: 'Versão', principal: true, render: v => <><Link className="nome-cel" to={`/app/config/curriculos/${v.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>{v.nome}</Link><span className="sub">{v.duplicada_de_id ? 'duplicada de outra versão' : 'versão inicial'}</span></> },
                  { chave: 'vig', rotulo: 'Vigência', render: v => v.ano_inicio ? `${v.ano_inicio} — ${v.ano_fim ?? 'atual'}` : 'a definir' },
                  { chave: 'base', rotulo: 'Base legal', className: 'cel-sub', render: v => v.base_legal || '—' },
                  { chave: 'itens', rotulo: 'Itens', className: 'num', render: v => v.total_itens },
                  { chave: 'status', rotulo: 'Status', render: v => <Tag tipo={v.status === 'vigente' ? 'ok' : v.status === 'rascunho' ? 'aviso' : 'neutro'} ponto>{ROTULO_STATUS_VERSAO[v.status]}</Tag> },
                  { chave: 'acoes', rotulo: 'Ações', acoes: true, render: v => <>
                    {ehAdmin && v.status !== 'rascunho' ? <Botao pequeno variante="fantasma" icone="copiar" onClick={() => setDuplicar({ origem: v, nome: `${v.nome} (cópia)` })}>Duplicar</Botao> : null}
                    <Link className={`btn btn-sm ${v.status === 'rascunho' && ehAdmin ? 'btn-1' : ''}`} to={`/app/config/curriculos/${v.id}`}>{v.status === 'rascunho' && ehAdmin ? 'Editar' : 'Abrir'}</Link>
                  </> }
                ]}
              />
            )}
          </Card>

          {series.length && (versoes.dados?.length || 0) > 0 ? (
            <div style={{ marginTop: 16 }}>
              <Card titulo="Vigência por ano letivo e série" descricao="Qual versão vale para cada (ano, série). Publicar uma versão preenche o ano de início; ajuste aqui reformas escalonadas." semCorpo>
                <div className="tab-box"><table>
                  <thead><tr><th>Ano letivo</th>{series.map(s => <th key={s.id}>{s.nome}</th>)}</tr></thead>
                  <tbody>
                    {anosOrdenados.map(a => (
                      <tr key={a.id}>
                        <td className="nome-cel">{a.ano}</td>
                        {series.map(s => {
                          const atual = (vigencia.dados || []).find(v => v.ano_letivo_id === a.id && v.serie_id === s.id)?.versao_id || '';
                          return (
                            <td key={s.id}>
                              {ehAdmin ? (
                                <select value={atual} onChange={e => definirVigencia(a.id, s.id, e.target.value)} aria-label={`Versão para ${a.ano}, ${s.nome}`}
                                  style={{ width: '100%', minWidth: 140, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--linha-forte)', background: atual ? 'var(--superficie)' : 'var(--aviso-bg)', color: 'var(--texto)', fontSize: 12.5 }}>
                                  <option value="">— sem currículo —</option>
                                  {(versoes.dados || []).filter(v => v.status !== 'rascunho').map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                                </select>
                              ) : (
                                atual ? (versoes.dados || []).find(v => v.id === atual)?.nome : <Tag tipo="aviso">sem currículo</Tag>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table></div>
                <div className="card-rodape"><Icone nome="alerta" style={{ width: 14, height: 14, color: 'var(--aviso)' }} /> Ano/série sem currículo bloqueia a emissão do histórico daquele período (RF-VER-11) — em vez de sair com a grade errada.</div>
              </Card>
            </div>
          ) : null}
        </>
      ) : null}

      <Modal aberto={!!novo} titulo="Nova versão curricular" descricao="Nasce em rascunho, vazia. Prefira duplicar a vigente quando a mudança for uma reforma." aoFechar={() => setNovo(null)} tamanho="sm"
        rodape={<><Botao onClick={() => setNovo(null)}>Cancelar</Botao><Botao variante="primario" carregando={ocupado} onClick={criar} icone="check">Criar</Botao></>}>
        {novo ? <div className="form-grade">
          <CampoTexto className="col-2" rotulo="Nome" placeholder="Novo Ensino Médio 2022" value={novo.nome} onChange={e => setNovo(n => n && ({ ...n, nome: e.target.value }))} obrigatorio autoFocus />
          <CampoTexto className="col-2" rotulo="Base legal" placeholder="Resolução CNE/CEB nº 3/2018" value={novo.base_legal} onChange={e => setNovo(n => n && ({ ...n, base_legal: e.target.value }))} />
        </div> : null}
      </Modal>

      <Modal aberto={!!duplicar} titulo={`Duplicar "${duplicar?.origem.nome || ''}"`} descricao="Copia blocos, agrupamentos, itens, totais e os mapeamentos do Activesoft. A nova versão nasce em rascunho." aoFechar={() => setDuplicar(null)} tamanho="sm"
        rodape={<><Botao onClick={() => setDuplicar(null)}>Cancelar</Botao><Botao variante="primario" carregando={ocupado} onClick={confirmarDuplicar} icone="copiar">Duplicar</Botao></>}>
        {duplicar ? <CampoTexto rotulo="Nome da nova versão" value={duplicar.nome} onChange={e => setDuplicar(d => d && ({ ...d, nome: e.target.value }))} obrigatorio autoFocus /> : null}
      </Modal>

      <Modal aberto={!!daOrigem} titulo="Montar a grade a partir do Activesoft"
        descricao="Lê as notas do ano na origem e monta com elas as disciplinas de cada série, com carga horária e o código de origem de cada uma. Grava sempre em rascunho — versão publicada é somente leitura."
        aoFechar={() => { setDaOrigem(null); setPrevia(null); }}
        rodape={<>
          <Botao onClick={() => { setDaOrigem(null); setPrevia(null); }}>Cancelar</Botao>
          {previa ? <Botao variante="primario" icone="check" carregando={ocupado} onClick={() => montarDaOrigem('efetiva')}>Montar a grade</Botao>
                  : <Botao variante="primario" icone="importar" carregando={ocupado} onClick={() => montarDaOrigem('simulacao')}>Conferir antes</Botao>}
        </>}>
        {daOrigem ? (
          <div className="pilha">
            <div className="form-grade">
              <CampoSelect rotulo="Ano letivo" value={daOrigem.anoLetivo} onChange={e => { setPrevia(null); setDaOrigem(d => d && ({ ...d, anoLetivo: e.target.value })); }}>
                {anosOrdenados.map(a2 => <option key={a2.id} value={a2.ano}>{a2.ano}</option>)}
              </CampoSelect>
              <CampoTexto rotulo={<>Nome da versão <small>— em branco, usa "Grade do Activesoft {daOrigem.anoLetivo}"</small></>} value={daOrigem.nomeVersao} onChange={e => setDaOrigem(d => d && ({ ...d, nomeVersao: e.target.value }))} />
            </div>

            {!previa ? (
              <Aviso>O que vem da origem são disciplinas soltas: ela não tem os blocos e agrupamentos que o histórico imprime. As linhas entram em <b>"A classificar"</b> e você as organiza antes de publicar.</Aviso>
            ) : (
              <>
                <Aviso tipo={previa.linhasCriadas.length ? 'ok' : 'aviso'}>
                  {previa.linhasCriadas.length
                    ? <><b>{previa.linhasCriadas.length} disciplina(s) entrariam</b> {previa.criouVersao ? <>numa versão nova, <b>{previa.versao?.nome}</b></> : <>no rascunho <b>{previa.versao?.nome}</b></>}
                        {previa.linhasExistentes ? <> · {previa.linhasExistentes} já estavam lá</> : null}
                        {previa.componentesCriados.length ? <> · {previa.componentesCriados.length} componente(s) novo(s) no cadastro</> : null}
                        {previa.mapeamentosCriados ? <> · {previa.mapeamentosCriados} código(s) da origem passariam a apontar sozinhos</> : null}</>
                    : <><b>Nada a acrescentar.</b> {previa.linhasExistentes ? `As ${previa.linhasExistentes} disciplina(s) da origem já estão na grade.` : ''}</>}
                </Aviso>

                {previa.componentesCriados.length ? (
                  <Aviso tipo="aviso">
                    <b>Componentes que nascem agora, com o nome que a origem usa:</b> {previa.componentesCriados.join(' · ')}.
                    Renomeie no currículo antes de publicar se o nome impresso no histórico tiver de ser outro.
                  </Aviso>
                ) : null}

                {previa.linhasCriadas.length ? (
                  <div className="tab-box" style={{ maxHeight: 260, overflow: 'auto' }}>
                    <table className="responsiva">
                      <thead><tr><th>Série</th><th>Disciplina</th><th className="num">Carga</th><th>Código na origem</th></tr></thead>
                      <tbody>{previa.linhasCriadas.map((l, i) => (
                        <tr key={i}>
                          <td data-rotulo="Série">{l.serie}</td>
                          <td data-rotulo="Disciplina" className="nome-cel">{l.nome_impresso}{l.componente_novo ? <span className="sub">componente novo</span> : null}</td>
                          <td data-rotulo="Carga" className="num">{l.carga_horaria ?? '—'}</td>
                          <td data-rotulo="Código"><code>{l.codigo_origem}</code></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : null}

                {previa.avisos.map((a2, i) => <Aviso key={i} tipo="aviso">{a2}</Aviso>)}
              </>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
