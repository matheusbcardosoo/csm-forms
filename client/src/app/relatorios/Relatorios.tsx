// /app/relatorios — o que a secretaria e a direção perguntam no fim do
// mês (F7 incremento D): o que foi emitido, o que a importação trouxe e
// o que está esperando decisão.
//
// Cada aba baixa em CSV, porque o destino desses números costuma ser a
// planilha da direção — não adianta só mostrar na tela.
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { baixarArquivo, mensagemErro } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { useToast } from '@/hooks/useToast';
import { Aviso, Botao, Cabecalho, Card, Carregando, EstadoVazio, Kpi, Tabela, Tag, fmtData, fmtDataHora } from '@/componentes/ui';

type Aba = 'documentos' | 'importacoes' | 'divergencias';
const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'documentos', rotulo: 'Documentos emitidos' },
  { id: 'importacoes', rotulo: 'Importações' },
  { id: 'divergencias', rotulo: 'Divergências em aberto' }
];

interface DocLinha {
  id: string; aluno: string; ra: string; curso: string; tipo: string; via: number;
  registro: string; status: string; emitido_em: string | null; emitido_por: string;
  cancelado_em: string | null; motivo_cancelamento: string;
}
interface ImpLinha {
  id: string; origem: string; tipo: string; modo: string; status: string; ano: number | null;
  agendada: boolean; iniciado_por: string; lidos: number; criados: number; atualizados: number;
  com_divergencia: number; pendentes_mapeamento: number; erros: number; erro: string | null; quando: string;
}
interface DivLinha {
  id: string; importacao_id: string; entidade: string; aluno: string; ra: string; descricao: string;
  campo: string; valor_local: string; valor_origem: string; quando: string | null;
}

/** Primeiro dia do mês corrente — o período que quase sempre se quer. */
function inicioDoMes(): string {
  const h = new Date();
  return new Date(h.getFullYear(), h.getMonth(), 1).toISOString().slice(0, 10);
}
const hoje = () => new Date().toISOString().slice(0, 10);

export function Relatorios() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const aba = (params.get('aba') as Aba) || 'documentos';
  const [de, setDe] = useState(inicioDoMes);
  const [ate, setAte] = useState(hoje);
  const [baixando, setBaixando] = useState(false);

  const intervalo = `de=${de}&ate=${ate}`;
  const url = aba === 'divergencias' ? '/api/relatorios/divergencias' : `/api/relatorios/${aba}?${intervalo}`;
  const { dados, carregando, erro } = useRecurso<Record<string, unknown>>(url);

  const resumo = (dados?.resumo || {}) as Record<string, number & Record<string, number>>;
  const linhas = useMemo(() => (dados?.linhas || []) as unknown[], [dados]);

  async function baixar() {
    setBaixando(true);
    try {
      const alvo = aba === 'divergencias' ? '/api/relatorios/divergencias.csv' : `/api/relatorios/${aba}.csv?${intervalo}`;
      await baixarArquivo(alvo, `${aba}.csv`);
    } catch (err) { toast.erro(mensagemErro(err)); }
    finally { setBaixando(false); }
  }

  return (
    <div className="wrap">
      <Cabecalho titulo="Relatórios" descricao="Emissão, importação e o que está esperando decisão"
        acoes={<Botao icone="upload" carregando={baixando} disabled={!linhas.length} onClick={baixar}>Baixar CSV</Botao>} />

      <nav className="abas" role="tablist">
        {ABAS.map(a => (
          <button key={a.id} role="tab" className="aba" aria-selected={aba === a.id}
            onClick={() => setParams(p => { const n = new URLSearchParams(p); n.set('aba', a.id); return n; })}>
            {a.rotulo}
          </button>
        ))}
      </nav>

      {aba !== 'divergencias' ? (
        <div className="filtros">
          <label className="f-campo">De: <input type="date" value={de} max={ate} onChange={e => setDe(e.target.value)}
            style={{ border: 0, background: 'transparent', outline: 0, color: 'var(--texto)' }} /></label>
          <label className="f-campo">Até: <input type="date" value={ate} min={de} onChange={e => setAte(e.target.value)}
            style={{ border: 0, background: 'transparent', outline: 0, color: 'var(--texto)' }} /></label>
        </div>
      ) : null}

      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}
      {carregando && !dados ? <Card semCorpo><Carregando /></Card> : null}

      {dados && aba === 'documentos' ? (
        <>
          <div className="grade g4" style={{ marginBottom: 16 }}>
            <Kpi rotulo="Documentos no período" valor={resumo.total || 0} />
            <Kpi rotulo="Emitidos" valor={resumo.emitidos || 0} tipo="ok" />
            <Kpi rotulo="2ª vias" valor={resumo.segundas_vias || 0} tipo="neutro" />
            <Kpi rotulo="Cancelados" valor={resumo.cancelados || 0} tipo={resumo.cancelados ? 'aviso' : 'neutro'} />
          </div>
          <Card semCorpo titulo="Por documento" descricao={Object.entries(resumo.por_tipo || {}).map(([k, v]) => `${k}: ${v}`).join(' · ') || undefined}>
            <Tabela<DocLinha>
              linhas={linhas as DocLinha[]}
              chave={l => l.id}
              vazio={<EstadoVazio icone="documento" titulo="Nenhum documento no período" descricao="Ajuste as datas acima." />}
              colunas={[
                { chave: 'registro', rotulo: 'Registro', render: l => l.registro ? <b>{l.registro}</b> : <span className="cel-sub">—</span> },
                { chave: 'aluno', rotulo: 'Aluno', principal: true, render: l => <>
                  <Link className="nome-cel" to={`/app/historicos/${l.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{l.aluno}</Link>
                  <span className="sub">{l.tipo}{l.via > 1 ? ` · ${l.via}ª via` : ''} · {l.curso}</span>
                </> },
                { chave: 'status', rotulo: 'Status', render: l => l.status === 'Cancelado'
                  ? <Tag tipo="erro" ponto>Cancelado</Tag> : <Tag tipo="ok" ponto>Emitido</Tag> },
                { chave: 'quando', rotulo: 'Emitido em', render: l => <>{l.emitido_em ? fmtData(l.emitido_em) : '—'}<span className="sub">{l.emitido_por}</span></> }
              ]}
            />
          </Card>
        </>
      ) : null}

      {dados && aba === 'importacoes' ? (
        <>
          <div className="grade g4" style={{ marginBottom: 16 }}>
            <Kpi rotulo="Importações" valor={resumo.total || 0} detalhe={`${resumo.efetivas || 0} efetiva(s)`} />
            <Kpi rotulo="Agendadas" valor={resumo.agendadas || 0} tipo="neutro" detalhe="rodaram sozinhas" />
            <Kpi rotulo="Registros criados" valor={resumo.criados || 0} tipo="ok" detalhe={`${resumo.atualizados || 0} atualizado(s)`} />
            <Kpi rotulo="Com erro" valor={resumo.com_erro || 0} tipo={resumo.com_erro ? 'aviso' : 'neutro'} />
          </div>
          <Card semCorpo>
            <Tabela<ImpLinha>
              linhas={linhas as ImpLinha[]}
              chave={l => l.id}
              vazio={<EstadoVazio icone="importar" titulo="Nenhuma importação no período" descricao="Ajuste as datas acima." />}
              colunas={[
                { chave: 'quando', rotulo: 'Quando', principal: true, render: l => <>
                  <Link className="nome-cel" to={`/app/importacoes/${l.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{fmtDataHora(l.quando)}</Link>
                  <span className="sub">{l.origem} · {l.tipo}{l.ano ? ` · ${l.ano}` : ''} · {l.modo}</span>
                </> },
                { chave: 'disparo', rotulo: 'Disparo', render: l => l.agendada
                  ? <Tag tipo="info" ponto>agendada</Tag>
                  : <span className="cel-sub">{l.iniciado_por || 'manual'}</span> },
                { chave: 'resultado', rotulo: 'Resultado', render: l => <>
                  {l.criados} criados · {l.atualizados} atualizados
                  <span className="sub">{l.pendentes_mapeamento} pendência(s) · {l.com_divergencia} divergência(s)</span>
                </> },
                { chave: 'status', rotulo: 'Status', render: l => l.status === 'erro' || l.erros
                  ? <Tag tipo="erro" ponto>{l.status === 'erro' ? 'erro' : `${l.erros} erro(s)`}</Tag>
                  : <Tag tipo="ok" ponto>ok</Tag> }
              ]}
            />
          </Card>
        </>
      ) : null}

      {dados && aba === 'divergencias' ? (
        <>
          <div className="grade g4" style={{ marginBottom: 16 }}>
            <Kpi rotulo="Divergências em aberto" valor={resumo.total || 0} tipo={resumo.total ? 'aviso' : 'ok'}
              detalhe={resumo.total ? 'esperando decisão' : 'nada pendente'} />
          </div>
          <Card semCorpo titulo="O que a reimportação encontrou diferente" descricao="Resolva na tela da importação em que apareceu">
            <Tabela<DivLinha>
              linhas={linhas as DivLinha[]}
              chave={l => l.id}
              vazio={<EstadoVazio icone="check" titulo="Nenhuma divergência em aberto"
                descricao="Toda diferença entre o dado local e o da origem já foi decidida." />}
              colunas={[
                { chave: 'aluno', rotulo: 'Aluno', principal: true, render: l => <>
                  <span className="nome-cel">{l.aluno || '—'}</span>
                  <span className="sub">{l.entidade} · {l.campo}</span>
                </> },
                { chave: 'descricao', rotulo: 'Divergência', render: l => <span className="cel-sub">{l.descricao}</span> },
                { chave: 'valores', rotulo: 'Local × origem', render: l => <>
                  <span>{l.valor_local || '—'}</span>
                  <span className="sub">origem: {l.valor_origem || '—'}</span>
                </> },
                { chave: 'quando', rotulo: 'Desde', render: l => l.quando
                  ? <Link to={`/app/importacoes/${l.importacao_id}`}>{fmtData(l.quando)}</Link>
                  : <span className="cel-sub">—</span> }
              ]}
            />
          </Card>
        </>
      ) : null}
    </div>
  );
}
