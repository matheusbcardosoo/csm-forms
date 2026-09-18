// /app/config/curriculos (06-versionamento): linhagem de versões por
// curso, com duplicação e vigência por (ano letivo, série).
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, mensagemErro } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { useSessao } from '@/hooks/useSessao';
import { useToast } from '@/hooks/useToast';
import { useAnoLetivo } from '@/hooks/useAnoLetivo';
import { Aviso, Botao, BotaoLink, Cabecalho, CampoTexto, Card, Carregando, EstadoVazio, Modal, Tabela, Tag } from '@/componentes/ui';
import { Icone } from '@/componentes/Icones';
import { ROTULO_STATUS_VERSAO, type Curso, type Serie, type VersaoResumo, type VigenciaCurricular } from '@shared/types/curriculo';

interface Cadastros { cursos: Curso[]; series: Serie[] }

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
                vazio={<EstadoVazio icone="grade" titulo="Nenhuma versão para este curso" descricao="Crie a versão vigente: blocos, agrupamentos, componentes por série e totais anuais. Depois publique-a informando o ano letivo de início." acoes={ehAdmin ? <Botao variante="primario" icone="mais" onClick={() => setNovo({ nome: '', base_legal: '' })}>Criar versão</Botao> : undefined} />}
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
    </div>
  );
}
