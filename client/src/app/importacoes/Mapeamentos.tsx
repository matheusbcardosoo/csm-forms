// /app/importacoes/mapeamentos — códigos da origem ↔ cadastro local
// (RF-INT-08). Disciplina aponta para um item da versão curricular;
// série para uma série; situação para o valor interno.
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, mensagemErro } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { useToast } from '@/hooks/useToast';
import { Aviso, Botao, Cabecalho, CampoSelect, CampoTexto, Card, Carregando, EstadoVazio, Modal, Tag } from '@/componentes/ui';
import { ROTULO_SITUACAO_MATRICULA, type SituacaoMatricula } from '@shared/types/aluno';
import type { Curso, Serie, VersaoDetalhe, VersaoResumo } from '@shared/types/curriculo';
import type { Mapeamento, TipoMapeamento } from '@shared/types/importacao';

type Linha = Mapeamento & { versao: { id: string; nome: string; curso_id: string } | null; item: { id: string; nome_impresso: string; serie_id: string } | null; sugestao: { id: string; nome_impresso: string; serie_id: string } | null };

export function Mapeamentos() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const versaoFiltro = params.get('versao') || '';
  const soPendentes = params.get('pendentes') === '1';
  const cadastros = useRecurso<{ cursos: Curso[]; series: Serie[] }>('/api/cadastros/cursos');
  const versoes = useRecurso<VersaoResumo[]>('/api/versoes');
  const url = `/api/importacoes/mapeamentos?${versaoFiltro ? `versao=${versaoFiltro}&` : ''}${soPendentes ? 'pendentes=1' : ''}`;
  const { dados, carregando, erro, recarregar } = useRecurso<Linha[]>(url);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [novo, setNovo] = useState<{ tipo: TipoMapeamento; codigo_origem: string; descricao_origem: string; versao_id: string } | null>(null);

  // itens das versões presentes na lista (para o select de disciplina)
  const idsVersoes = useMemo(() => [...new Set((dados || []).map(d => d.versao_id).filter(Boolean))] as string[], [dados]);
  const [itensPorVersao, setItensPorVersao] = useState<Record<string, { id: string; rotulo: string; serie_id: string }[]>>({});
  useMemo(() => {
    for (const vid of idsVersoes) {
      if (itensPorVersao[vid]) continue;
      api.get<VersaoDetalhe>(`/api/versoes/${vid}`).then(v => {
        const itens = v.blocos.flatMap(b => b.agrupamentos.flatMap(ag => ag.itens.map(i => ({ id: i.id, serie_id: i.serie_id, rotulo: `${ag.nome} › ${i.nome_impresso} (${v.series.find(s => s.id === i.serie_id)?.nome || 'série'})` }))));
        setItensPorVersao(p => ({ ...p, [vid]: itens }));
      }).catch(() => {});
    }
  }, [idsVersoes]); // eslint-disable-line react-hooks/exhaustive-deps

  async function salvar(m: Linha, patch: Partial<Mapeamento>) {
    setOcupado(m.id);
    try { await api.put(`/api/importacoes/mapeamentos/${m.id}`, patch); toast.ok('Mapeamento salvo.'); recarregar(); }
    catch (err) { toast.erro(mensagemErro(err)); }
    finally { setOcupado(null); }
  }

  async function criar() {
    if (!novo) return;
    setOcupado('novo');
    try { await api.post('/api/importacoes/mapeamentos', { ...novo, versao_id: novo.tipo === 'disciplina' ? novo.versao_id : null, confirmado: false }); toast.ok('Código cadastrado — defina o destino.'); setNovo(null); recarregar(); }
    catch (err) { toast.erro(mensagemErro(err)); }
    finally { setOcupado(null); }
  }

  const series = (cadastros.dados?.series || []).sort((a, b) => a.ordem - b.ordem);
  const nomeSerie = (id: string | null) => series.find(s => s.id === id)?.nome || '';
  const definir = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p); };

  return (
    <div className="wrap">
      <Cabecalho voltar={{ to: '/app/importacoes', rotulo: 'Importações' }} titulo="Mapeamento de códigos" descricao="Códigos do Activesoft (ou do arquivo) ↔ cadastro local. Disciplina é mapeada por versão curricular; série e situação valem para todas."
        acoes={<Botao variante="primario" icone="mais" onClick={() => setNovo({ tipo: 'disciplina', codigo_origem: '', descricao_origem: '', versao_id: (versoes.dados || []).find(v => v.status === 'vigente')?.id || '' })}>Cadastrar código</Botao>} />
      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      <div className="filtros">
        <label className="f-campo">Currículo: <select value={versaoFiltro} onChange={e => definir('versao', e.target.value)} aria-label="Versão curricular"><option value="">Todos</option>{(versoes.dados || []).map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}</select></label>
        <button type="button" className={`f-campo ${soPendentes ? 'ativo' : ''}`} onClick={() => definir('pendentes', soPendentes ? '' : '1')}>Somente pendentes</button>
        <span className="cel-sub">{dados?.length ?? 0} código(s)</span>
      </div>

      <Card semCorpo rodape={<span>Ao duplicar uma versão curricular, os mapeamentos de disciplina são herdados apontando para os itens novos. Códigos cujo item foi extinto voltam como pendência.</span>}>
        {carregando && !dados ? <Carregando /> : !dados?.length ? <EstadoVazio icone="grade" titulo="Nenhum código" descricao="Os códigos aparecem aqui na primeira importação (como pendências) ou podem ser cadastrados à mão." /> : (
          <div className="tab-box"><table className="responsiva">
            <thead><tr><th>Tipo</th><th>Código na origem</th><th>Currículo</th><th>Destino</th><th className="num">Afetados</th><th>Status</th></tr></thead>
            <tbody>{dados.map(m => (
              <tr key={m.id} className={m.confirmado ? '' : ''} style={!m.confirmado ? { background: 'var(--aviso-bg)' } : undefined}>
                <td data-rotulo="Tipo">{m.tipo}</td>
                <td data-rotulo="Código" className="cel-principal"><code>{m.codigo_origem}</code>{m.descricao_origem ? <span className="sub">{m.descricao_origem}</span> : null}{m.observacao ? <span className="sub" style={{ color: 'var(--aviso)' }}>{m.observacao}</span> : null}</td>
                <td data-rotulo="Currículo" className="cel-sub">{m.versao?.nome || (m.tipo === 'disciplina' ? '—' : 'todos')}</td>
                <td data-rotulo="Destino">
                  {m.tipo === 'disciplina' ? (
                    <select value={m.versao_item_id || ''} disabled={ocupado === m.id || !m.versao_id} onChange={e => salvar(m, { versao_item_id: e.target.value || null, confirmado: !!e.target.value })} aria-label={`Destino de ${m.codigo_origem}`} style={{ maxWidth: 320, width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid var(--linha-forte)', background: 'var(--superficie)', color: 'var(--texto)', fontSize: 12.5 }}>
                      <option value="">— escolher item —</option>
                      {m.sugestao && !m.versao_item_id ? <option value={m.sugestao.id}>★ Sugestão: {m.sugestao.nome_impresso} ({nomeSerie(m.sugestao.serie_id)})</option> : null}
                      {(itensPorVersao[m.versao_id || ''] || (m.item ? [{ id: m.item.id, rotulo: m.item.nome_impresso, serie_id: m.item.serie_id }] : [])).map(i => <option key={i.id} value={i.id}>{i.rotulo}</option>)}
                    </select>
                  ) : m.tipo === 'serie' ? (
                    <select value={m.destino_valor || ''} disabled={ocupado === m.id} onChange={e => salvar(m, { destino_valor: e.target.value || null, confirmado: !!e.target.value })} aria-label={`Série para ${m.codigo_origem}`} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--linha-forte)', background: 'var(--superficie)', color: 'var(--texto)', fontSize: 12.5 }}>
                      <option value="">— escolher série —</option>{series.map(s => <option key={s.id} value={s.id}>{s.nome} — {cadastros.dados?.cursos.find(c => c.id === s.curso_id)?.nome}</option>)}
                    </select>
                  ) : m.tipo === 'situacao' ? (
                    <select value={m.destino_valor || ''} disabled={ocupado === m.id} onChange={e => salvar(m, { destino_valor: e.target.value || null, confirmado: !!e.target.value })} aria-label={`Situação para ${m.codigo_origem}`} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--linha-forte)', background: 'var(--superficie)', color: 'var(--texto)', fontSize: 12.5 }}>
                      <option value="">— escolher —</option>{(Object.keys(ROTULO_SITUACAO_MATRICULA) as SituacaoMatricula[]).map(s => <option key={s} value={s}>{ROTULO_SITUACAO_MATRICULA[s]}</option>)}
                    </select>
                  ) : (
                    <input value={m.destino_valor || ''} disabled={ocupado === m.id} onBlur={e => { if (e.target.value !== (m.destino_valor || '')) salvar(m, { destino_valor: e.target.value || null, confirmado: !!e.target.value }); }} onChange={() => {}} aria-label={`Destino de ${m.codigo_origem}`} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--linha-forte)', background: 'var(--superficie)', color: 'var(--texto)', fontSize: 12.5 }} />
                  )}
                </td>
                <td data-rotulo="Afetados" className="num">{m.registros_afetados}</td>
                <td data-rotulo="Status">{m.confirmado ? <Tag tipo="ok" ponto>Confirmado</Tag> : <Tag tipo="aviso" ponto>Pendente</Tag>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>

      <Modal aberto={!!novo} titulo="Cadastrar código da origem" aoFechar={() => setNovo(null)} tamanho="sm"
        rodape={<><Botao onClick={() => setNovo(null)}>Cancelar</Botao><Botao variante="primario" carregando={ocupado === 'novo'} onClick={criar} icone="check">Cadastrar</Botao></>}>
        {novo ? <div className="form-grade">
          <CampoSelect rotulo="Tipo" value={novo.tipo} onChange={e => setNovo(n => n && ({ ...n, tipo: e.target.value as TipoMapeamento }))}><option value="disciplina">Disciplina</option><option value="serie">Série</option><option value="situacao">Situação</option><option value="turma">Turma</option></CampoSelect>
          <CampoTexto rotulo="Código na origem" value={novo.codigo_origem} onChange={e => setNovo(n => n && ({ ...n, codigo_origem: e.target.value }))} obrigatorio />
          <CampoTexto className="col-2" rotulo="Descrição na origem" value={novo.descricao_origem} onChange={e => setNovo(n => n && ({ ...n, descricao_origem: e.target.value }))} />
          {novo.tipo === 'disciplina' ? <CampoSelect className="col-2" rotulo="Versão curricular" value={novo.versao_id} onChange={e => setNovo(n => n && ({ ...n, versao_id: e.target.value }))} obrigatorio><option value="">Selecione</option>{(versoes.dados || []).map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}</CampoSelect> : null}
        </div> : null}
      </Modal>
    </div>
  );
}
