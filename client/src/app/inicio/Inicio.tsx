// /app — Início (04-telas §3.1): indicadores + "Precisa de atenção".
import { Link } from 'react-router-dom';
import { useRecurso } from '@/hooks/useRecurso';
import { useSessao } from '@/hooks/useSessao';
import { useAnoLetivo } from '@/hooks/useAnoLetivo';
import { Aviso, BotaoLink, Cabecalho, Card, Carregando, EstadoVazio, Kpi } from '@/componentes/ui';
import { Icone } from '@/componentes/Icones';

interface Painel {
  anoLetivoAtual: number;
  indicadores: {
    alunosAtivos: number | null; emitidosNoMes: number | null; divergenciasAbertas: number | null; rascunhosParados: number | null;
    cursosAtivos: number; versoesVigentes: number; versoesRascunho: number; signatariosAtivos: number; atosLegais: number; usuariosAtivos: number | null;
  };
  pendencias: { tipo: 'erro' | 'aviso' | 'info'; titulo: string; detalhe: string; rota: string; acao: string }[];
  instituicao: { nome_fantasia: string } | null;
}

export function Inicio() {
  const { perfil, temPapel } = useSessao();
  const { ano } = useAnoLetivo();
  const { dados, carregando, erro } = useRecurso<Painel>('/api/painel/inicio');
  const primeiroNome = (perfil?.nome || '').split(' ')[0];

  return (
    <div className="wrap">
      <Cabecalho
        titulo={primeiroNome ? `Olá, ${primeiroNome}` : 'Início'}
        descricao={`Ano letivo de ${ano ?? dados?.anoLetivoAtual ?? new Date().getFullYear()} · Secretaria Digital, fases 0–2 em operação`}
        acoes={temPapel('admin', 'secretaria') ? <>
          <BotaoLink to="/app/importacoes" icone="importar">Importar do Activesoft</BotaoLink>
          <BotaoLink to="/app/historicos" variante="primario" icone="mais">Novo histórico</BotaoLink>
        </> : undefined}
      />

      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      <div className="grade g4" style={{ marginBottom: 16 }}>
        <Kpi rotulo="Alunos ativos" valor={dados?.indicadores.alunosAtivos ?? null} detalhe="Chega com a importação (fase 3)" />
        <Kpi rotulo="Emitidos no mês" valor={dados?.indicadores.emitidosNoMes ?? null} detalhe="Emissão de histórico (fase 5)" tipo="ok" />
        <Kpi rotulo="Divergências abertas" valor={dados?.indicadores.divergenciasAbertas ?? null} detalhe="Reimportação (fase 3)" tipo="aviso" />
        <Kpi rotulo="Currículos vigentes" valor={dados ? dados.indicadores.versoesVigentes : carregando ? '…' : 0}
          detalhe={dados ? `${dados.indicadores.cursosAtivos} curso(s) · ${dados.indicadores.versoesRascunho} rascunho(s)` : undefined} tipo="neutro" />
      </div>

      <div className="grade g2">
        <Card titulo="Precisa de atenção" descricao="Itens que travam a configuração ou a emissão de documento" semCorpo>
          {carregando && !dados ? <Carregando /> : null}
          {dados && dados.pendencias.length === 0 ? (
            <EstadoVazio icone="check" titulo="Nada pendente" descricao="A configuração institucional está completa para as fases em operação." />
          ) : null}
          {dados?.pendencias.map((p, i) => (
            <div className="pend" key={i}>
              <div className={`pend-ico p-${p.tipo}`}><Icone nome={p.tipo === 'erro' ? 'alerta' : p.tipo === 'aviso' ? 'relogio' : 'info'} /></div>
              <div className="pend-txt"><strong>{p.titulo}</strong><span>{p.detalhe}</span></div>
              {temPapel('admin') ? <Link className="btn btn-sm" to={p.rota}>{p.acao}</Link> : null}
            </div>
          ))}
        </Card>

        <div className="pilha">
          <Card titulo="Configuração" descricao="O que já está cadastrado" semCorpo>
            <div className="tab-box"><table>
              <tbody>
                <Linha rotulo="Instituição" valor={dados?.instituicao?.nome_fantasia || '—'} to="/app/config/instituicao" />
                <Linha rotulo="Atos legais no cabeçalho" valor={dados ? String(dados.indicadores.atosLegais) : '…'} to="/app/config/atos-legais" />
                <Linha rotulo="Signatários ativos" valor={dados ? String(dados.indicadores.signatariosAtivos) : '…'} to="/app/config/signatarios" />
                <Linha rotulo="Cursos ativos" valor={dados ? String(dados.indicadores.cursosAtivos) : '…'} to="/app/config/cursos" />
                <Linha rotulo="Versões curriculares vigentes" valor={dados ? String(dados.indicadores.versoesVigentes) : '…'} to="/app/config/curriculos" />
                {dados?.indicadores.usuariosAtivos != null ? <Linha rotulo="Usuários ativos" valor={String(dados.indicadores.usuariosAtivos)} to="/app/config/usuarios" /> : null}
              </tbody>
            </table></div>
          </Card>

          <Aviso>
            <b>Escopo da v1.</b> O painel atende alunos cuja trajetória está no Activesoft. As fases 3 a 5 (importação, ficha do aluno e emissão do histórico) entram sobre esta base — a configuração feita aqui é o que elas vão imprimir.
          </Aviso>
        </div>
      </div>
    </div>
  );
}

function Linha({ rotulo, valor, to }: { rotulo: string; valor: string; to: string }) {
  return (
    <tr>
      <td className="cel-sub">{rotulo}</td>
      <td className="nome-cel">{valor}</td>
      <td className="cel-acoes"><Link className="btn btn-sm btn-fantasma" to={to}>Abrir</Link></td>
    </tr>
  );
}
