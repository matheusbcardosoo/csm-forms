// /app/historicos/lote — geração de históricos para uma turma inteira
// (RF-HIST-13). Três passos numa tela só: conferir a turma, criar os
// rascunhos, emitir e baixar.
//
// A tela é deliberadamente sequencial: cada passo só aparece quando o
// anterior aconteceu. Emissão em lote consome número de registro, que
// não volta — não é ação para ficar disponível antes da conferência.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, baixarArquivo, mensagemErro } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { useAnoLetivo } from '@/hooks/useAnoLetivo';
import { useToast } from '@/hooks/useToast';
import { Aviso, Botao, Cabecalho, Card, Carregando, EstadoVazio, Kpi, Tabela, Tag } from '@/componentes/ui';
import { metaTipo, TIPOS_HISTORICO, type TipoHistorico } from '@shared/types/historico';
import type { Curso, Serie } from '@shared/types/curriculo';

interface Candidato {
  aluno: { id: string; nome: string; ra: string | null };
  turma: string | null;
  matricula_ids: string[];
  anos: number[];
  bloqueios: { codigo: string; mensagem: string }[];
  alertas: number;
  ja_tem: { id: string; status: string; registro: string | null } | null;
}
interface Preparo {
  candidatos: Candidato[];
  resumo: { total: number; prontos: number; bloqueados: number; ja_emitidos: number };
}
interface Criacao { criados: { aluno_id: string; historico_id: string }[]; falhas: { aluno_id: string; erro: string }[] }
interface Emissao {
  emitidos: { id: string; aluno: string; registro: string }[];
  falhas: { id: string; aluno: string; erro: string }[];
}

export function HistoricoLote() {
  const { anos, ano: anoGlobal } = useAnoLetivo();
  const toast = useToast();
  const cadastros = useRecurso<{ cursos: Curso[]; series: Serie[] }>('/api/cadastros/cursos');

  const [ano, setAno] = useState<number | ''>(anoGlobal || '');
  const [serieId, setSerieId] = useState('');
  const [turma, setTurma] = useState('');
  const [tipo, setTipo] = useState<TipoHistorico>('conclusao_em');

  const [ocupado, setOcupado] = useState<string | null>(null);
  const [preparo, setPreparo] = useState<Preparo | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [criacao, setCriacao] = useState<Criacao | null>(null);
  const [sed, setSed] = useState<Record<string, string>>({});
  const [emissao, setEmissao] = useState<Emissao | null>(null);

  // o ano do seletor do topo chega por requisição, depois do primeiro
  // render — sem isto o campo fica em "Escolha" mesmo com um ano ativo
  useEffect(() => { setAno(atual => atual || anoGlobal || ''); }, [anoGlobal]);

  const series = useMemo(() => (cadastros.dados?.series || []).filter(s => s.ativo !== false), [cadastros.dados]);
  const meta = metaTipo(tipo);
  const podeConferir = !!ano && !!serieId;

  // trocar o filtro invalida o que já foi conferido: manter a lista de
  // uma turma na tela enquanto os campos apontam para outra é como se
  // perde documento no aluno errado
  function mudarFiltro(fn: () => void) {
    fn();
    setPreparo(null); setMarcados(new Set()); setCriacao(null); setEmissao(null); setSed({});
  }

  async function conferir() {
    setOcupado('conferir');
    try {
      const r = await api.post<Preparo>('/api/historicos/lote/preparar', { ano, serie_id: serieId, turma: turma.trim() || undefined, tipo });
      setPreparo(r);
      setMarcados(new Set(r.candidatos.filter(c => !c.bloqueios.length && !c.ja_tem).map(c => c.aluno.id)));
      setCriacao(null); setEmissao(null);
      if (!r.candidatos.length) toast.erro('Nenhum aluno nessa turma.');
    } catch (err) { toast.erro(mensagemErro(err)); }
    finally { setOcupado(null); }
  }

  async function criar() {
    if (!preparo) return;
    const alvos = preparo.candidatos.filter(c => marcados.has(c.aluno.id));
    setOcupado('criar');
    try {
      const r = await api.post<Criacao>('/api/historicos/lote/criar', {
        tipo, alunos: alvos.map(c => ({ aluno_id: c.aluno.id, matricula_ids: c.matricula_ids }))
      });
      setCriacao(r);
      toast.ok(`${r.criados.length} rascunho(s) criado(s).${r.falhas.length ? ` ${r.falhas.length} falhou(ram).` : ''}`);
    } catch (err) { toast.erro(mensagemErro(err)); }
    finally { setOcupado(null); }
  }

  async function emitir() {
    if (!criacao?.criados.length) return;
    setOcupado('emitir');
    try {
      const r = await api.post<Emissao>('/api/historicos/lote/emitir', {
        ids: criacao.criados.map(c => c.historico_id),
        sed: meta.certificado ? sed : undefined
      });
      setEmissao(r);
      if (r.falhas.length) toast.erro(`${r.emitidos.length} emitido(s), ${r.falhas.length} com problema.`);
      else toast.ok(`${r.emitidos.length} documento(s) emitido(s).`);
    } catch (err) { toast.erro(mensagemErro(err)); }
    finally { setOcupado(null); }
  }

  async function baixarZip() {
    if (!emissao?.emitidos.length) return;
    setOcupado('zip');
    try {
      await baixarArquivo('/api/historicos/lote/pdf', `historicos-${ano}.zip`, { ids: emissao.emitidos.map(e => e.id) });
    } catch (err) { toast.erro(mensagemErro(err)); }
    finally { setOcupado(null); }
  }

  const nomePorAluno = new Map((preparo?.candidatos || []).map(c => [c.aluno.id, c.aluno.nome]));

  return (
    <div className="wrap">
      <Cabecalho titulo="Históricos em lote" descricao="Para a turma inteira — concluintes no fim do ano, por exemplo"
        acoes={<Link className="btn" to="/app/historicos">Ver documentos</Link>} />

      <Card titulo="1. Escolha a turma" descricao="A conferência roda para cada aluno antes de qualquer coisa ser criada" semCorpo>
        <div className="card-corpo" style={{ paddingTop: 12 }}>
          <div className="filtros" style={{ marginBottom: 0 }}>
            <label className="f-campo">Ano letivo: <select value={ano} onChange={e => mudarFiltro(() => setAno(e.target.value ? Number(e.target.value) : ''))}>
              <option value="">Escolha</option>
              {anos.map(a => <option key={a} value={a}>{a}</option>)}
            </select></label>
            <label className="f-campo">Série: <select value={serieId} onChange={e => mudarFiltro(() => setSerieId(e.target.value))}>
              <option value="">Escolha</option>
              {series.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select></label>
            <label className="f-campo">Turma: <input value={turma} onChange={e => mudarFiltro(() => setTurma(e.target.value))} placeholder="todas"
              style={{ border: 0, background: 'transparent', outline: 0, width: 90, color: 'var(--texto)' }} /></label>
            <label className="f-campo" style={{ flex: '1 1 200px', minWidth: 0, maxWidth: '100%' }}>Documento: <select style={{ minWidth: 0, maxWidth: '100%' }}
              value={tipo} onChange={e => mudarFiltro(() => setTipo(e.target.value as TipoHistorico))}>
              {TIPOS_HISTORICO.map(t => <option key={t.tipo} value={t.tipo}>{t.rotulo}</option>)}
            </select></label>
            <Botao variante="primario" icone="check" disabled={!podeConferir} carregando={ocupado === 'conferir'} onClick={conferir}>Conferir turma</Botao>
          </div>
          <p className="cel-sub" style={{ marginTop: 10 }}>
            {meta.descricao} O documento de cada aluno leva <b>todos os anos</b> da trajetória dele, como no assistente individual.
          </p>
        </div>
      </Card>

      {ocupado === 'conferir' ? <Card semCorpo><Carregando /></Card> : null}

      {preparo ? (
        <>
          <div className="grade g4" style={{ margin: '16px 0' }}>
            <Kpi rotulo="Alunos na turma" valor={preparo.resumo.total} />
            <Kpi rotulo="Prontos" valor={preparo.resumo.prontos} tipo={preparo.resumo.prontos ? 'ok' : 'neutro'} />
            <Kpi rotulo="Bloqueados" valor={preparo.resumo.bloqueados} tipo={preparo.resumo.bloqueados ? 'aviso' : 'neutro'} detalhe="resolva na ficha do aluno" />
            <Kpi rotulo="Já têm o documento" valor={preparo.resumo.ja_emitidos} tipo="neutro" />
          </div>

          <Card titulo="2. Confira e escolha" descricao={`${marcados.size} selecionado(s)`} semCorpo
            acoes={<Botao pequeno variante="primario" icone="documento" disabled={!marcados.size || !!criacao} carregando={ocupado === 'criar'} onClick={criar}>
              Criar {marcados.size} rascunho(s)
            </Botao>}>
            <Tabela<Candidato>
              linhas={preparo.candidatos}
              chave={c => c.aluno.id}
              vazio={<EstadoVazio icone="alunos" titulo="Nenhum aluno nessa turma"
                descricao="Confira ano, série e turma — e se a importação daquele ano já foi feita." />}
              colunas={[
                {
                  chave: 'sel', rotulo: '', render: c => (
                    <input type="checkbox" aria-label={`Selecionar ${c.aluno.nome}`} checked={marcados.has(c.aluno.id)} disabled={!!c.bloqueios.length || !!criacao}
                      onChange={e => setMarcados(atual => {
                        const proximo = new Set(atual);
                        if (e.target.checked) proximo.add(c.aluno.id); else proximo.delete(c.aluno.id);
                        return proximo;
                      })} />
                  )
                },
                {
                  chave: 'aluno', rotulo: 'Aluno', principal: true, render: c => <>
                    <Link className="nome-cel" to={`/app/alunos/${c.aluno.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{c.aluno.nome}</Link>
                    <span className="sub">RA {c.aluno.ra || '—'}{c.turma ? ` · turma ${c.turma}` : ''} · anos {c.anos.join(', ') || '—'}</span>
                  </>
                },
                {
                  chave: 'situacao', rotulo: 'Situação', render: c => c.bloqueios.length
                    ? <Tag tipo="aviso" ponto>{c.bloqueios.length} impedimento(s)</Tag>
                    : c.ja_tem ? <Tag tipo="info" ponto>já tem {c.ja_tem.status}</Tag>
                    : <Tag tipo="ok" ponto>pronto{c.alertas ? ` · ${c.alertas} aviso(s)` : ''}</Tag>
                },
                {
                  chave: 'motivo', rotulo: 'O que impede', render: c => c.bloqueios.length
                    ? <span className="cel-sub">{c.bloqueios[0].mensagem}{c.bloqueios.length > 1 ? ` (+${c.bloqueios.length - 1})` : ''}</span>
                    : c.ja_tem?.registro ? <span className="cel-sub">registro {c.ja_tem.registro}</span>
                    : <span className="cel-sub">—</span>
                }
              ]}
            />
          </Card>
        </>
      ) : null}

      {criacao ? (
        <Card titulo="3. Emitir" descricao="Cada documento é emitido por si — número de registro consumido não volta" semCorpo
          acoes={<Botao pequeno variante="primario" icone="publicar" disabled={!criacao.criados.length || !!emissao} carregando={ocupado === 'emitir'} onClick={emitir}>
            Emitir {criacao.criados.length} documento(s)
          </Botao>}>
          <div className="card-corpo" style={{ paddingTop: 12 }}>
            {criacao.falhas.length ? (
              <Aviso tipo="erro">{criacao.falhas.length} rascunho(s) não puderam ser criados: {criacao.falhas.map(f => `${nomePorAluno.get(f.aluno_id) || f.aluno_id} (${f.erro})`).join('; ')}</Aviso>
            ) : null}

            {meta.certificado ? (
              <>
                <Aviso tipo="aviso">
                  Histórico de conclusão só emite com o <b>número de publicação da SED</b> de cada aluno (RF-HIST-15).
                  É digitação, um por um — não há API. Quem ficar sem número continua rascunho e pode ser emitido depois pela tela do documento.
                </Aviso>
                <div style={{ marginTop: 12 }}>
                  {criacao.criados.map(c => (
                    <div key={c.historico_id} className="linha-h" style={{ justifyContent: 'space-between', gap: 12, padding: '4px 0' }}>
                      <Link to={`/app/historicos/${c.historico_id}`} style={{ fontSize: 13 }}>{nomePorAluno.get(c.aluno_id) || 'aluno'}</Link>
                      <div className="campo" style={{ maxWidth: 190, flex: '0 0 auto' }}>
                        <input aria-label={`Registro / Visto Confere de ${nomePorAluno.get(c.aluno_id) || 'aluno'}`} inputMode="numeric"
                          placeholder="Registro SED" value={sed[c.historico_id] || ''} disabled={!!emissao}
                          onChange={e => setSed(atual => ({ ...atual, [c.historico_id]: e.target.value }))} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="cel-sub" style={{ margin: 0 }}>{criacao.criados.length} rascunho(s) prontos para emissão.</p>
            )}
          </div>
        </Card>
      ) : null}

      {emissao ? (
        <Card titulo="4. Resultado" semCorpo
          acoes={emissao.emitidos.length
            ? <Botao pequeno icone="upload" carregando={ocupado === 'zip'} onClick={baixarZip}>Baixar {emissao.emitidos.length} PDF(s) em ZIP</Botao>
            : undefined}>
          <div className="card-corpo" style={{ paddingTop: 12 }}>
            {emissao.emitidos.length ? (
              <Aviso tipo="ok">
                {emissao.emitidos.length} documento(s) emitido(s) — registros {emissao.emitidos.map(e => e.registro).join(', ')}.
              </Aviso>
            ) : null}
            {emissao.falhas.length ? (
              <div style={{ marginTop: 10 }}>
                <Aviso tipo="erro">
                  {emissao.falhas.length} não foram emitidos e <b>continuam rascunho</b> — dá para resolver o motivo e emitir pela tela de cada um:
                  <div style={{ marginTop: 6, fontSize: 12.5 }}>
                    {emissao.falhas.map(f => (
                      <div key={f.id}><Link to={`/app/historicos/${f.id}`}>{f.aluno || 'documento'}</Link> — {f.erro}</div>
                    ))}
                  </div>
                </Aviso>
              </div>
            ) : null}
            <p className="cel-sub" style={{ marginTop: 10 }}>
              O ZIP gera os PDFs na hora, um a um — com a turma inteira, leva alguns minutos. Cada documento também pode ser baixado pela tela dele.
            </p>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
