// /app/importacoes/:id — relatório (04-telas §3.7): contadores, abas
// Divergências (comparador lado a lado, ação por linha e em lote),
// Pendências de mapeamento, Registros e Erros.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, mensagemErro } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { useToast } from '@/hooks/useToast';
import { Aviso, Botao, BotaoLink, Cabecalho, Card, Carregando, EstadoVazio, Kpi, Tag, fmtDataHora } from '@/componentes/ui';
import { ROTULO_TIPO_IMPORTACAO, type Divergencia, type Importacao, type LinhaRelatorio, type Mapeamento, type ResolucaoDivergencia } from '@shared/types/importacao';

interface Resposta { importacao: Importacao; divergencias: Divergencia[]; pendencias: (Mapeamento & { versao: { id: string; nome: string } | null; sugestao: { id: string; nome_impresso: string } | null })[] }
type Aba = 'divergencias' | 'pendencias' | 'registros' | 'erros';

const ROTULO_ACAO: Record<LinhaRelatorio['acao'], string> = { criar: 'Criado', atualizar: 'Atualizado', ignorar: 'Ignorado', divergencia: 'Divergência', pendencia: 'Sem mapeamento', erro: 'Erro' };

function valorTexto(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'object') { const o = v as Record<string, unknown>; const k = Object.keys(o)[0]; return k ? valorTexto(o[k]) : '—'; }
  if (typeof v === 'number') return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  return String(v);
}

export function ImportacaoDetalhe() {
  const { id = '' } = useParams();
  const toast = useToast();
  const { dados, carregando, erro, recarregar } = useRecurso<Resposta>(`/api/importacoes/${id}`);
  const [aba, setAba] = useState<Aba | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [filtroAcao, setFiltroAcao] = useState<LinhaRelatorio['acao'] | ''>('');

  if (carregando && !dados) return <div className="wrap"><Carregando /></div>;
  if (erro || !dados) return <div className="wrap"><Aviso tipo="erro">{erro || 'Importação não encontrada.'}</Aviso></div>;

  const { importacao: imp, divergencias, pendencias } = dados;
  const rel = imp.relatorio;
  const pendentes = divergencias.filter(d => d.resolucao === 'pendente');
  const erros = (rel?.linhas || []).filter(l => l.acao === 'erro');
  const abaAtual: Aba = aba || (pendentes.length ? 'divergencias' : pendencias.length ? 'pendencias' : 'registros');
  const simulacao = imp.modo === 'simulacao';

  async function resolver(ids: string[], resolucao: ResolucaoDivergencia) {
    setOcupado(ids.join(','));
    try {
      if (ids.length === 1) await api.post(`/api/importacoes/divergencias/${ids[0]}/resolver`, { resolucao });
      else { const r = await api.post<{ resolvidas: number; falhas: string[] }>('/api/importacoes/divergencias/resolver-lote', { ids, resolucao }); if (r.falhas.length) toast.erro(`${r.falhas.length} falha(s): ${r.falhas[0]}`); }
      toast.ok(ids.length === 1 ? 'Divergência resolvida.' : `${ids.length} divergências resolvidas.`);
      recarregar();
    } catch (err) { toast.erro(mensagemErro(err)); }
    finally { setOcupado(null); }
  }

  const rotuloRes: Record<ResolucaoDivergencia, string> = { pendente: 'Pendente', manter_local: 'Mantido local', aceitar_origem: 'Origem aceita', ignorada: 'Ignorada' };

  return (
    <div className="wrap">
      <Cabecalho voltar={{ to: '/app/importacoes', rotulo: 'Importações' }}
        titulo={<span className="linha-h">{ROTULO_TIPO_IMPORTACAO[imp.tipo]} · {imp.parametros.anoLetivo}{imp.parametros.serieCodigoOrigem ? ` · ${imp.parametros.serieCodigoOrigem}` : ''}{imp.parametros.turma ? ` ${imp.parametros.turma}` : ''} {simulacao ? <Tag tipo="info">Simulação</Tag> : null} <Tag tipo={imp.status === 'concluida' ? 'ok' : imp.status === 'erro' ? 'erro' : 'aviso'} ponto>{imp.status}</Tag></span>}
        descricao={`${imp.parametros.adaptador || imp.origem} · iniciada por ${imp.iniciado_por} em ${fmtDataHora(imp.iniciado_em)}${imp.concluido_em ? ` · concluída ${fmtDataHora(imp.concluido_em)}` : ''}`}
        acoes={<><BotaoLink to="/app/importacoes/mapeamentos" icone="grade">Mapeamentos</BotaoLink><BotaoLink to="/app/importacoes" variante="primario" icone="importar">Nova importação</BotaoLink></>} />

      {imp.erro ? <div style={{ marginBottom: 14 }}><Aviso tipo="erro"><b>A importação parou.</b> {imp.erro}</Aviso></div> : null}
      {simulacao ? <div style={{ marginBottom: 14 }}><Aviso><b>Simulação:</b> nenhum aluno, matrícula ou nota foi gravado. Só as pendências de mapeamento ficaram registradas, para você resolvê-las antes de importar de verdade.</Aviso></div> : null}

      <div className="grade g4" style={{ marginBottom: 16 }}>
        <Kpi rotulo="Lidos" valor={imp.lidos} detalhe="registros da origem" />
        <Kpi rotulo={simulacao ? 'Seriam gravados' : 'Gravados'} valor={imp.criados + imp.atualizados} detalhe={`${imp.criados} criados · ${imp.atualizados} atualizados · ${imp.ignorados} sem mudança`} tipo="ok" />
        <Kpi rotulo="Divergências" valor={imp.com_divergencia} detalhe={simulacao ? 'previstas' : `${pendentes.length} aguardando decisão`} tipo="aviso" />
        <Kpi rotulo="Sem mapeamento" valor={imp.pendentes_mapeamento} detalhe={`${pendencias.length} código(s) pendente(s) · ${imp.erros} erro(s)`} tipo="erro" />
      </div>

      {rel?.avisos.length ? <div className="pilha" style={{ marginBottom: 14 }}>{[...new Set(rel.avisos)].map((a, i) => <Aviso key={i} tipo="aviso">{a}</Aviso>)}</div> : null}

      <nav className="abas" role="tablist">
        {([['divergencias', `Divergências (${simulacao ? rel?.divergenciasPrevistas?.length || 0 : divergencias.length})`], ['pendencias', `Pendências de mapeamento (${pendencias.length})`], ['registros', `Registros (${rel?.linhas.length || 0})`], ['erros', `Erros (${erros.length})`]] as [Aba, string][]).map(([k, r]) => (
          <button key={k} type="button" role="tab" className="aba" aria-selected={abaAtual === k} onClick={() => setAba(k)}>{r}</button>
        ))}
      </nav>

      {abaAtual === 'divergencias' ? (
        simulacao ? (
          <Card semCorpo>{rel?.divergenciasPrevistas?.length ? <div className="tab-box"><table className="responsiva"><thead><tr><th>Registro</th><th>Campo</th><th>Valor local (editado)</th><th>Valor na origem</th></tr></thead>
            <tbody>{rel.divergenciasPrevistas.map((d, i) => <tr key={i}><td data-rotulo="Registro" className="nome-cel">{d.descricao}</td><td data-rotulo="Campo">{d.campo}</td><td data-rotulo="Local">{valorTexto(d.valor_local)}</td><td data-rotulo="Origem">{valorTexto(d.valor_origem)}</td></tr>)}</tbody></table></div>
            : <EstadoVazio icone="check" titulo="Nenhuma divergência prevista" descricao="Nada editado à mão conflita com a origem." />}</Card>
        ) : (
          <>
            {pendentes.length ? <div style={{ marginBottom: 14 }}><Aviso><b>Por que estas linhas pararam aqui.</b> O valor local foi editado à mão e o valor na origem também mudou desde a última importação. Como o documento é permanente, o sistema não escolhe sozinho.
              <div className="acoes" style={{ marginTop: 10 }}>
                <Botao pequeno carregando={ocupado === 'lote-local'} onClick={() => resolver(pendentes.map(d => d.id), 'manter_local')}>Manter todos os locais</Botao>
                <Botao pequeno carregando={ocupado === 'lote-origem'} onClick={() => resolver(pendentes.map(d => d.id), 'aceitar_origem')}>Aceitar toda a origem</Botao>
              </div></Aviso></div> : null}
            {!divergencias.length ? <Card semCorpo><EstadoVazio icone="check" titulo="Nenhuma divergência" descricao="Nada editado à mão conflitou com a origem." /></Card> : null}
            {divergencias.map(d => (
              <div className="diverg" key={d.id}>
                <div className="diverg-cab">
                  {d.aluno_id ? <Link to={`/app/alunos/${d.aluno_id}?aba=notas`} style={{ color: 'inherit' }}><b>{d.descricao}</b></Link> : <b>{d.descricao}</b>}
                  <Tag tipo={d.resolucao === 'pendente' ? 'aviso' : d.resolucao === 'ignorada' ? 'neutro' : 'ok'} ponto>{rotuloRes[d.resolucao]}</Tag>
                </div>
                <div className="diverg-cols">
                  <div className="dv dv-esq"><div className="dv-rot">Valor local (editado)</div><div className="dv-val">{valorTexto(d.valor_local)}</div>
                    <small>{d.contexto?.editado_por ? <>Editado por {d.contexto.editado_por}{d.contexto.editado_em ? ` em ${fmtDataHora(d.contexto.editado_em)}` : ''}<br /></> : null}{d.contexto?.motivo ? <>Motivo: “{d.contexto.motivo}”</> : null}</small></div>
                  <div className="dv"><div className="dv-rot">Valor na origem</div><div className="dv-val">{valorTexto(d.valor_origem)}</div>
                    <small>Sincronizado em {fmtDataHora(imp.concluido_em || imp.iniciado_em)}{d.contexto?.valor_origem_anterior != null ? <><br />Valor anterior na origem: {valorTexto(d.contexto.valor_origem_anterior)}</> : null}</small></div>
                </div>
                {d.resolucao === 'pendente' ? <div className="diverg-acoes">
                  <Botao pequeno carregando={ocupado === d.id} onClick={() => resolver([d.id], 'ignorada')}>Ignorar</Botao>
                  <Botao pequeno carregando={ocupado === d.id} onClick={() => resolver([d.id], 'manter_local')}>Manter local ({valorTexto(d.valor_local)})</Botao>
                  <Botao pequeno variante="primario" carregando={ocupado === d.id} onClick={() => resolver([d.id], 'aceitar_origem')}>Aceitar origem ({valorTexto(d.valor_origem)})</Botao>
                </div> : <div className="diverg-acoes"><span className="cel-sub">{rotuloRes[d.resolucao]} por {d.resolvido_por} em {fmtDataHora(d.resolvido_em)}</span></div>}
              </div>
            ))}
          </>
        )
      ) : null}

      {abaAtual === 'pendencias' ? (
        <Card titulo="Pendências de mapeamento" descricao="Código da origem sem correspondência confirmada no cadastro local — as notas/matrículas afetadas não foram gravadas" semCorpo
          rodape={<span>Confirme o destino de cada código em <Link to="/app/importacoes/mapeamentos">Mapeamentos</Link> e repita a importação. A sugestão é por semelhança de nome — a confirmação é humana, porque um mapeamento errado sai impresso num documento permanente.</span>}>
          {!pendencias.length ? <EstadoVazio icone="check" titulo="Nenhum código pendente" /> : (
            <div className="tab-box"><table className="responsiva">
              <thead><tr><th>Tipo</th><th>Código na origem</th><th>Descrição na origem</th><th>Currículo</th><th className="num">Registros afetados</th><th>Sugestão</th><th></th></tr></thead>
              <tbody>{pendencias.map(p => (
                <tr key={p.id}>
                  <td data-rotulo="Tipo">{p.tipo}</td>
                  <td data-rotulo="Código"><code>{p.codigo_origem}</code></td>
                  <td data-rotulo="Descrição">{p.descricao_origem || '—'}</td>
                  <td data-rotulo="Currículo" className="cel-sub">{p.versao?.nome || '—'}</td>
                  <td data-rotulo="Registros" className="num">{p.registros_afetados}</td>
                  <td data-rotulo="Sugestão">{p.sugestao ? <Tag tipo="info">{p.sugestao.nome_impresso}</Tag> : p.destino_valor ? <Tag tipo="info">sugerido</Tag> : <Tag>nenhuma</Tag>}</td>
                  <td className="cel-acoes"><Link className="btn btn-sm btn-1" to={`/app/importacoes/mapeamentos?pendentes=1${p.versao ? `&versao=${p.versao.id}` : ''}`}>Mapear</Link></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
      ) : null}

      {(abaAtual === 'registros' || abaAtual === 'erros') ? (
        <Card titulo={abaAtual === 'erros' ? 'Erros' : 'Registros processados'} descricao={abaAtual === 'erros' ? 'Registros que não puderam ser processados — corrija a causa e repita' : `Amostra de até ${rel?.linhas.length || 0} linhas do relatório`} semCorpo
          acoes={abaAtual === 'registros' ? <select className="f-campo" value={filtroAcao} onChange={e => setFiltroAcao(e.target.value as LinhaRelatorio['acao'] | '')} aria-label="Filtrar por ação"><option value="">Todas as ações</option>{(Object.keys(ROTULO_ACAO) as LinhaRelatorio['acao'][]).map(a => <option key={a} value={a}>{ROTULO_ACAO[a]}</option>)}</select> : undefined}>
          {(() => {
            const linhas = (abaAtual === 'erros' ? erros : (rel?.linhas || []).filter(l => !filtroAcao || l.acao === filtroAcao));
            return !linhas.length ? <EstadoVazio icone={abaAtual === 'erros' ? 'check' : 'info'} titulo={abaAtual === 'erros' ? 'Nenhum erro' : 'Nenhum registro nesta seleção'} /> : (
              <div className="tab-box"><table className="responsiva">
                <thead><tr><th>Entidade</th><th>Ação</th><th>Chave na origem</th><th>Registro</th><th>Detalhe</th></tr></thead>
                <tbody>{linhas.map((l, i) => (
                  <tr key={i}>
                    <td data-rotulo="Entidade">{l.entidade}</td>
                    <td data-rotulo="Ação"><Tag tipo={l.acao === 'criar' ? 'ok' : l.acao === 'atualizar' ? 'info' : l.acao === 'erro' ? 'erro' : l.acao === 'ignorar' ? 'neutro' : 'aviso'}>{ROTULO_ACAO[l.acao]}</Tag></td>
                    <td data-rotulo="Chave"><code>{l.chave}</code></td>
                    <td data-rotulo="Registro" className="nome-cel">{l.descricao}</td>
                    <td data-rotulo="Detalhe" className="cel-sub">{l.detalhe || '—'}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            );
          })()}
        </Card>
      ) : null}
    </div>
  );
}
