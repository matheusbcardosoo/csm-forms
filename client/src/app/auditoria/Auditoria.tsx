// /app/auditoria — versão inicial (só admin): as últimas alterações
// registradas, mais recentes primeiro. A versão completa (filtro por
// pessoa e período, exportação) vem depois.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, mensagemErro } from '@/api/cliente';
import { Aviso, Botao, Cabecalho, Card, Carregando, EstadoVazio, Tabela, Tag, fmtDataHora } from '@/componentes/ui';

interface LinhaAuditoria {
  id: string;
  entidade: string;
  entidade_id: string | null;
  aluno_id: string | null;
  aluno: { nome: string } | null;
  acao: string;
  campo: string | null;
  valor_anterior: unknown;
  valor_novo: unknown;
  motivo: string | null;
  usuario_email: string | null;
  criado_em: string;
}

const ROTULO_ENTIDADE: Record<string, string> = {
  aluno: 'Aluno', matricula: 'Matrícula', nota: 'Nota', historico: 'Histórico', importacao: 'Importação', usuario: 'Usuário'
};
const ROTULO_ACAO: Record<string, string> = {
  criar: 'Criou', editar: 'Editou', excluir: 'Excluiu', emitir: 'Emitiu', cancelar: 'Cancelou', importar: 'Importou', resolver: 'Resolveu'
};

/**
 * jsonb de antes/depois em texto curto: {"nota": 7} → "nota: 7". Quando a
 * única chave é o próprio campo da linha ({"foto": "manual"} com campo
 * "foto"), mostra só o valor — o nome do campo já está na frente.
 */
function resumo(v: unknown, campo: string | null): string {
  if (v === null || v === undefined) return '—';
  if (typeof v !== 'object') return String(v);
  const chaves = Object.keys(v as Record<string, unknown>);
  if (campo && chaves.length === 1 && chaves[0] === campo) return resumo((v as Record<string, unknown>)[campo] ?? null, null);
  const pares = Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${x === null ? '—' : typeof x === 'object' ? JSON.stringify(x) : String(x)}`);
  return pares.join(' · ') || '—';
}

export function Auditoria() {
  const [entidade, setEntidade] = useState('');
  const [linhas, setLinhas] = useState<LinhaAuditoria[]>([]);
  const [temMais, setTemMais] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar(desde = 0) {
    setCarregando(true); setErro(null);
    try {
      const q = new URLSearchParams();
      if (entidade) q.set('entidade', entidade);
      if (desde) q.set('desde', String(desde));
      const r = await api.get<{ linhas: LinhaAuditoria[]; temMais: boolean }>(`/api/auditoria?${q}`);
      setLinhas(atual => desde ? [...atual, ...r.linhas] : r.linhas);
      setTemMais(r.temMais);
    } catch (e) { setErro(mensagemErro(e)); }
    finally { setCarregando(false); }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carregar(); }, [entidade]);

  return (
    <div className="wrap">
      <Cabecalho titulo="Auditoria" descricao="Quem alterou o quê, e quando — registro permanente, sem edição" />
      <div style={{ marginBottom: 14 }}>
        <Aviso><b>Versão inicial.</b> Mostra as alterações mais recentes, com filtro por tipo. Filtros por pessoa e período e a exportação chegam numa próxima etapa.</Aviso>
      </div>

      <div className="filtros">
        <label className="f-campo">Tipo: <select value={entidade} onChange={e => setEntidade(e.target.value)}>
          <option value="">Todos</option>
          {Object.entries(ROTULO_ENTIDADE).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
        </select></label>
      </div>

      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      <Card semCorpo>
        {carregando && !linhas.length ? <Carregando /> : (
          <Tabela<LinhaAuditoria>
            linhas={linhas}
            chave={l => l.id}
            vazio={<EstadoVazio icone="relogio" titulo="Nenhuma alteração registrada" descricao={entidade ? 'Nada deste tipo ainda. Tente "Todos".' : undefined} />}
            colunas={[
              { chave: 'quando', rotulo: 'Quando', className: 'cel-sub', render: l => <span style={{ whiteSpace: 'nowrap' }}>{fmtDataHora(l.criado_em)}</span> },
              { chave: 'quem', rotulo: 'Quem', render: l => l.usuario_email || <span className="cel-sub">sistema</span> },
              { chave: 'oque', rotulo: 'O quê', principal: true, render: l => <>
                <span className="nome-cel">{ROTULO_ACAO[l.acao] || l.acao} <Tag>{ROTULO_ENTIDADE[l.entidade] || l.entidade}</Tag></span>
                {l.aluno_id ? <span className="sub"><Link to={`/app/alunos/${l.aluno_id}`}>{l.aluno?.nome || 'Aluno'}</Link></span> : null}
              </> },
              { chave: 'detalhe', rotulo: 'Detalhe', render: l => <span className="cel-sub" style={{ whiteSpace: 'normal' }}>
                {l.campo ? <b>{l.campo}: </b> : null}
                {l.valor_anterior !== null && l.valor_anterior !== undefined ? <>{resumo(l.valor_anterior, l.campo)} → </> : null}
                {resumo(l.valor_novo, l.campo)}
                {l.motivo ? <><br />Motivo: {l.motivo}</> : null}
              </span> }
            ]}
          />
        )}
      </Card>

      {temMais ? (
        <div style={{ marginTop: 14, textAlign: 'center' }}>
          <Botao carregando={carregando} onClick={() => carregar(linhas.length)}>Carregar mais</Botao>
        </div>
      ) : null}
    </div>
  );
}
