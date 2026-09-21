// /app/historicos — documentos gerados (RF-HIST-12). Filtra por status,
// tipo e busca; cada linha abre a pré-visualização.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRecurso } from '@/hooks/useRecurso';
import { Aviso, BotaoLink, Cabecalho, Card, Carregando, EstadoVazio, Kpi, Tabela, Tag, fmtData, fmtDataHora } from '@/componentes/ui';
import { Icone } from '@/componentes/Icones';
import { ROTULO_STATUS_HISTORICO, ROTULO_TIPO_HISTORICO, type HistoricoLista, type StatusHistorico, type TipoHistorico } from '@shared/types/historico';

const COR_STATUS: Record<StatusHistorico, 'ok' | 'aviso' | 'info' | 'neutro' | 'erro'> = {
  rascunho: 'aviso', conferido: 'info', emitido: 'ok', cancelado: 'erro'
};

export function Historicos() {
  const [status, setStatus] = useState('');
  const [tipo, setTipo] = useState('');
  const [busca, setBusca] = useState('');

  const url = useMemo(() => {
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (tipo) p.set('tipo', tipo);
    if (busca.trim()) p.set('q', busca.trim());
    const qs = p.toString();
    return `/api/historicos${qs ? `?${qs}` : ''}`;
  }, [status, tipo, busca]);

  const { dados, carregando, erro } = useRecurso<HistoricoLista[]>(url);
  const linhas = dados || [];

  const mes = new Date().toISOString().slice(0, 7);
  const emitidosNoMes = linhas.filter(h => h.status === 'emitido' && (h.emitido_em || '').startsWith(mes)).length;
  const rascunhos = linhas.filter(h => h.status === 'rascunho').length;

  return (
    <div className="wrap">
      <Cabecalho titulo="Históricos escolares" descricao="Documentos gerados, com status, número de registro e 2ª via"
        acoes={<>
          <BotaoLink to="/app/historicos/lote" icone="grade">Gerar em lote</BotaoLink>
          <BotaoLink to="/app/alunos" variante="primario" icone="alunos">Gerar para um aluno</BotaoLink>
        </>} />

      <div className="grade g4" style={{ marginBottom: 16 }}>
        <Kpi rotulo="Documentos" valor={linhas.length} detalhe="nos filtros atuais" />
        <Kpi rotulo="Emitidos no mês" valor={emitidosNoMes} tipo="ok" />
        <Kpi rotulo="Em rascunho" valor={rascunhos} tipo={rascunhos ? 'aviso' : 'neutro'} detalhe="aguardando conferência" />
        <Kpi rotulo="Cancelados" valor={linhas.filter(h => h.status === 'cancelado').length} tipo="neutro" />
      </div>

      <div className="filtros">
        <label className="f-campo" style={{ flex: '1 1 220px', maxWidth: 360 }}>
          <Icone nome="buscar" style={{ width: 14, height: 14 }} />
          <input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Aluno, RA ou nº de registro" aria-label="Buscar documento"
            style={{ border: 0, background: 'transparent', outline: 0, flex: 1, minWidth: 0, color: 'var(--texto)' }} />
        </label>
        <label className="f-campo">Status: <select value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Todos</option>
          {(Object.keys(ROTULO_STATUS_HISTORICO) as StatusHistorico[]).map(s => <option key={s} value={s}>{ROTULO_STATUS_HISTORICO[s]}</option>)}
        </select></label>
        <label className="f-campo">Tipo: <select value={tipo} onChange={e => setTipo(e.target.value)}>
          <option value="">Todos</option>
          {(Object.keys(ROTULO_TIPO_HISTORICO) as TipoHistorico[]).map(t => <option key={t} value={t}>{ROTULO_TIPO_HISTORICO[t]}</option>)}
        </select></label>
      </div>

      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      <Card semCorpo>
        {carregando && !dados ? <Carregando /> : (
          <Tabela<HistoricoLista>
            linhas={linhas}
            chave={h => h.id}
            vazio={<EstadoVazio icone="documento" titulo="Nenhum histórico encontrado"
              descricao="O documento nasce na ficha do aluno: abra o aluno e use “Gerar histórico”. O assistente confere os dados, monta a grade e leva à pré-visualização."
              acoes={<BotaoLink to="/app/alunos" variante="primario" icone="alunos">Ir para Alunos</BotaoLink>} />}
            colunas={[
              { chave: 'aluno', rotulo: 'Aluno', principal: true, render: h => <>
                <Link className="nome-cel" to={`/app/historicos/${h.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{h.aluno?.nome || '—'}</Link>
                <span className="sub">{ROTULO_TIPO_HISTORICO[h.tipo]} · {h.curso?.nome}{h.via > 1 ? ` · ${h.via}ª via` : ''}</span>
              </> },
              { chave: 'registro', rotulo: 'Registro', render: h => h.numero_registro != null
                ? <b>{h.numero_registro}/{h.ano_registro}</b>
                : <span className="cel-sub">—</span> },
              { chave: 'sed', rotulo: 'SED', render: h => h.numero_registro_gdae ? <span style={{ fontSize: 12 }}>{h.numero_registro_gdae}</span> : <span className="cel-sub">—</span> },
              { chave: 'status', rotulo: 'Status', render: h => <Tag tipo={COR_STATUS[h.status]} ponto>{ROTULO_STATUS_HISTORICO[h.status]}</Tag> },
              { chave: 'quando', rotulo: 'Emitido em', render: h => h.emitido_em ? fmtData(h.emitido_em) : <span className="cel-sub">criado {fmtDataHora(h.criado_em)}</span> },
              { chave: 'a', rotulo: 'Ações', acoes: true, render: h => <Link className="btn btn-sm" to={`/app/historicos/${h.id}`}>Abrir</Link> }
            ]}
          />
        )}
      </Card>

      <div style={{ marginTop: 14 }}>
        <Aviso tipo="aviso"><b>Guarda da v1 (RF-VER-11).</b> Pedido que cai num ano letivo sem currículo cadastrado tem a emissão bloqueada com aviso — nunca sai documento com a grade de hoje para um aluno de outra época.</Aviso>
      </div>
    </div>
  );
}
