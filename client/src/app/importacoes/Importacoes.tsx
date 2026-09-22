// /app/importacoes — lista de importações + nova importação (04-telas §3.6):
// "Simular primeiro" é o botão primário; "Importar agora" o secundário.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ErroApi, mensagemErro, type CampoInvalido } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { useToast } from '@/hooks/useToast';
import { useAnoLetivo } from '@/hooks/useAnoLetivo';
import { Aviso, Botao, BotaoLink, Cabecalho, CampoSelect, CampoTexto, Card, Carregando, EstadoVazio, Modal, Tabela, Tag, fmtDataHora } from '@/componentes/ui';
import { Icone } from '@/componentes/Icones';
import { ROTULO_TIPO_IMPORTACAO, type Capacidades, type Importacao, type ModoImportacao, type TipoImportacao } from '@shared/types/importacao';

interface InfoAdaptador { nome: 'activesoft' | 'arquivo' | 'mock'; rotulo: string; capacidades: Capacidades; conexao: { ok: boolean; detalhe?: string }; colunasModelo: Record<'alunos' | 'matriculas' | 'notas', readonly string[]> }

const ROTULO_CAP: { chave: keyof Capacidades; rotulo: string }[] = [
  { chave: 'cargaHoraria', rotulo: 'Carga horária por componente' }, { chave: 'situacaoFinal', rotulo: 'Situação final da matrícula' },
  { chave: 'faltas', rotulo: 'Faltas' }, { chave: 'documentosAluno', rotulo: 'Documentos do aluno' }, { chave: 'delta', rotulo: 'Só alterados desde a última vez' }, { chave: 'paginacao', rotulo: 'Paginação' }
];

export function Importacoes() {
  const toast = useToast();
  const navegar = useNavigate();
  const { ano } = useAnoLetivo();
  const adaptador = useRecurso<InfoAdaptador>('/api/importacoes/adaptador');
  const lista = useRecurso<Importacao[]>('/api/importacoes');
  const [nova, setNova] = useState<{ tipo: TipoImportacao; anoLetivo: string; serieCodigoOrigem: string; turma: string; alunoCodigoOrigem: string; usarArquivo: boolean; arquivos: { alunos?: string; matriculas?: string; notas?: string }; nomes: Record<string, string> } | null>(null);
  const [campos, setCampos] = useState<CampoInvalido[]>([]);
  const [executando, setExecutando] = useState<ModoImportacao | null>(null);

  async function executar(modo: ModoImportacao) {
    if (!nova) return;
    setExecutando(modo); setCampos([]);
    try {
      const r = await api.post<{ id: string }>('/api/importacoes', { tipo: nova.tipo, modo, anoLetivo: nova.anoLetivo, serieCodigoOrigem: nova.serieCodigoOrigem, turma: nova.turma, alunoCodigoOrigem: nova.alunoCodigoOrigem, arquivos: nova.usarArquivo ? nova.arquivos : undefined });
      toast.ok(modo === 'simulacao' ? 'Simulação concluída — nada foi gravado.' : 'Importação concluída.');
      setNova(null);
      navegar(`/app/importacoes/${r.id}`);
    } catch (err) { if (err instanceof ErroApi && err.campos.length) setCampos(err.campos); toast.erro(mensagemErro(err)); }
    finally { setExecutando(null); }
  }

  const lerArquivo = (chave: 'alunos' | 'matriculas' | 'notas') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setNova(n => n && ({ ...n, arquivos: { ...n.arquivos, [chave]: String(r.result) }, nomes: { ...n.nomes, [chave]: f.name } }));
    r.readAsText(f, 'utf-8');
  };

  const abrirNova = () => { setNova({ tipo: 'completo', anoLetivo: String(ano || new Date().getFullYear()), serieCodigoOrigem: '', turma: '', alunoCodigoOrigem: '', usarArquivo: adaptador.dados?.nome === 'arquivo' || !adaptador.dados?.conexao.ok, arquivos: {}, nomes: {} }); setCampos([]); };

  return (
    <div className="wrap">
      <Cabecalho titulo="Importação" descricao="Alunos, matrículas e notas — com simulação, relatório e divergências"
        acoes={<><BotaoLink to="/app/importacoes/mapeamentos" icone="grade">Mapeamentos</BotaoLink><Botao variante="primario" icone="importar" onClick={abrirNova}>Nova importação</Botao></>} />

      <div className="grade g2" style={{ marginBottom: 16 }}>
        <Card titulo="Origem configurada" descricao="Adaptador ativo no servidor (IMPORTACAO_ADAPTADOR)">
          {adaptador.carregando && !adaptador.dados ? <Carregando /> : adaptador.dados ? <>
            <div className="linha-h" style={{ marginBottom: 10 }}>
              <b>{adaptador.dados.rotulo}</b>
              {adaptador.dados.conexao.ok ? <Tag tipo="ok" ponto>Conectado</Tag> : <Tag tipo="aviso" ponto>Indisponível</Tag>}
            </div>
            {adaptador.dados.conexao.detalhe ? <p className="cel-sub" style={{ marginBottom: 10 }}>{adaptador.dados.conexao.detalhe}</p> : null}
            <div style={{ fontSize: 12.5 }}>
              {ROTULO_CAP.map(c => <div key={c.chave} className="linha-h" style={{ gap: 6, marginBottom: 3 }}><Icone nome={adaptador.dados!.capacidades[c.chave] ? 'check' : 'fechar'} style={{ width: 12, height: 12, color: adaptador.dados!.capacidades[c.chave] ? 'var(--ok)' : 'var(--texto-3)' }} />{c.rotulo}</div>)}
            </div>
          </> : adaptador.erro ? <Aviso tipo="erro">{adaptador.erro}</Aviso> : null}
        </Card>
        <div className="pilha">
          <Aviso><b>Como funciona.</b> Escolhe-se ano letivo, série/turma e o que importar. <b>Simular primeiro</b> mostra o que entraria sem gravar nada; <b>Importar agora</b> grava e gera o relatório.</Aviso>
          <Aviso><b>Regra central (RF-INT-06).</b> Uma nota corrigida à mão nunca é sobrescrita em silêncio: vira divergência com os dois valores lado a lado e a decisão é humana.</Aviso>
          <Aviso tipo="info"><b>Sem a API ainda?</b> Envie arquivos CSV com as colunas do contrato canônico. Modelos: <a href="/api/importacoes/csv-modelo/alunos">alunos</a> · <a href="/api/importacoes/csv-modelo/matriculas">matrículas</a> · <a href="/api/importacoes/csv-modelo/notas">notas</a>.</Aviso>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <CartaoAgendamento ano={ano} aoRodar={() => lista.recarregar()} />
      </div>

      <Card titulo="Importações" descricao="Mais recentes primeiro" semCorpo>
        {lista.carregando && !lista.dados ? <Carregando /> : (
          <Tabela<Importacao>
            linhas={lista.dados || []}
            chave={i => i.id}
            vazio={<EstadoVazio icone="importar" titulo="Nenhuma importação ainda" descricao="Comece por uma simulação: ela mostra o que seria criado, atualizado ou ficaria pendente de mapeamento." acoes={<Botao variante="primario" icone="importar" onClick={abrirNova}>Nova importação</Botao>} />}
            colunas={[
              { chave: 'q', rotulo: 'Importação', principal: true, render: i => <><Link className="nome-cel" to={`/app/importacoes/${i.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{ROTULO_TIPO_IMPORTACAO[i.tipo]} · {i.parametros.anoLetivo}{i.parametros.serieCodigoOrigem ? ` · ${i.parametros.serieCodigoOrigem}` : ''}{i.parametros.turma ? ` ${i.parametros.turma}` : ''}</Link><span className="sub">{i.parametros.adaptador} · {fmtDataHora(i.iniciado_em)} · {i.iniciado_por}</span></> },
              { chave: 'modo', rotulo: 'Modo', render: i => i.modo === 'simulacao' ? <Tag tipo="info">Simulação</Tag> : <Tag>Efetiva</Tag> },
              { chave: 'lidos', rotulo: 'Lidos', className: 'num', render: i => i.lidos },
              { chave: 'grav', rotulo: 'Criados / atualizados', className: 'num', render: i => `${i.criados} / ${i.atualizados}` },
              { chave: 'div', rotulo: 'Divergências', className: 'num', render: i => i.com_divergencia ? <Tag tipo="aviso">{i.com_divergencia}</Tag> : 0 },
              { chave: 'pend', rotulo: 'Sem mapeamento', className: 'num', render: i => i.pendentes_mapeamento ? <Tag tipo="erro">{i.pendentes_mapeamento}</Tag> : 0 },
              { chave: 'status', rotulo: 'Status', render: i => <Tag tipo={i.status === 'concluida' ? 'ok' : i.status === 'erro' ? 'erro' : 'aviso'} ponto>{i.status}</Tag> },
              { chave: 'a', rotulo: 'Ações', acoes: true, render: i => <Link className="btn btn-sm" to={`/app/importacoes/${i.id}`}>Relatório</Link> }
            ]}
          />
        )}
      </Card>

      <Modal aberto={!!nova} titulo="Nova importação" descricao="Simule primeiro. A simulação devolve contagens, pendências de mapeamento e divergências previstas sem gravar nada." aoFechar={() => setNova(null)}
        rodape={<>
          <Botao onClick={() => setNova(null)}>Cancelar</Botao>
          <Botao carregando={executando === 'efetiva'} disabled={!!executando} onClick={() => executar('efetiva')}>Importar agora</Botao>
          <Botao variante="primario" carregando={executando === 'simulacao'} disabled={!!executando} icone="olho" onClick={() => executar('simulacao')}>Simular primeiro</Botao>
        </>}>
        {nova ? <div className="form-grade">
          <div className="col-2 f-campo" style={{ justifyContent: 'space-between' }}>
            <span>Origem: <b>{nova.usarArquivo ? 'Arquivo CSV' : adaptador.dados?.rotulo || '…'}</b></span>
            <button type="button" className="btn btn-sm" onClick={() => setNova(n => n && ({ ...n, usarArquivo: !n.usarArquivo }))}>{nova.usarArquivo ? 'Usar origem configurada' : 'Enviar arquivos CSV'}</button>
          </div>
          <CampoSelect rotulo="O que importar" name="tipo" value={nova.tipo} onChange={e => setNova(n => n && ({ ...n, tipo: e.target.value as TipoImportacao }))} erros={campos}>
            {(Object.keys(ROTULO_TIPO_IMPORTACAO) as TipoImportacao[]).map(t => <option key={t} value={t}>{ROTULO_TIPO_IMPORTACAO[t]}</option>)}
          </CampoSelect>
          <CampoTexto rotulo="Ano letivo" name="anoLetivo" type="number" inputMode="numeric" value={nova.anoLetivo} onChange={e => setNova(n => n && ({ ...n, anoLetivo: e.target.value }))} erros={campos} obrigatorio />
          <CampoTexto rotulo={<>Série <small>— código na origem, opcional</small></>} name="serieCodigoOrigem" placeholder="ex.: EM3" value={nova.serieCodigoOrigem} onChange={e => setNova(n => n && ({ ...n, serieCodigoOrigem: e.target.value }))} erros={campos} />
          <CampoTexto rotulo={<>Turma <small>— opcional</small></>} name="turma" placeholder="A" value={nova.turma} onChange={e => setNova(n => n && ({ ...n, turma: e.target.value.toUpperCase() }))} erros={campos} />
          <CampoTexto className="col-2" rotulo={<>Um aluno só <small>— código na origem, opcional</small></>} name="alunoCodigoOrigem" value={nova.alunoCodigoOrigem} onChange={e => setNova(n => n && ({ ...n, alunoCodigoOrigem: e.target.value }))} erros={campos} />
          {nova.usarArquivo ? (['alunos', 'matriculas', 'notas'] as const).map(k => (
            <div className="campo" key={k}>
              <label htmlFor={`csv-${k}`}>CSV de {k}</label>
              <input id={`csv-${k}`} type="file" accept=".csv,text/csv" onChange={lerArquivo(k)} />
              <div className="dica">{nova.nomes[k] || `Colunas: ${(adaptador.dados?.colunasModelo[k] || []).slice(0, 4).join(', ')}…`}</div>
            </div>
          )) : null}
        </div> : null}
      </Modal>
    </div>
  );
}

const DIAS_SEMANA = [
  { n: 1, r: 'seg' }, { n: 2, r: 'ter' }, { n: 3, r: 'qua' }, { n: 4, r: 'qui' },
  { n: 5, r: 'sex' }, { n: 6, r: 'sáb' }, { n: 0, r: 'dom' }
];

interface Agendamento {
  ativo: boolean; hora: string; dias_semana: number[]; tipo: TipoImportacao;
  ultima_execucao: string | null; atualizado_por: string | null;
  ultimo_resultado: { quando: string; ano: number; ok: boolean; importacao_id?: string; criados?: number; atualizados?: number; pendentes?: number; erros?: number; erro?: string } | null;
}

/**
 * Importação agendada (RF-INT-10). O "Rodar agora" não é conveniência:
 * é como se descobre que a origem está fora do ar sem esperar até as
 * três da manhã para o silêncio contar.
 */
function CartaoAgendamento({ ano, aoRodar }: { ano: number | null; aoRodar: () => void }) {
  const toast = useToast();
  const { dados, erro, recarregar } = useRecurso<Agendamento | null>('/api/importacoes/agendamento');
  const [form, setForm] = useState<Agendamento | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const atual = form || dados;

  useEffect(() => { setForm(null); }, [dados]);
  if (erro) return <Card titulo="Importação agendada"><Aviso tipo="erro">{erro}</Aviso></Card>;
  if (!atual) return <Card titulo="Importação agendada"><Carregando /></Card>;

  const mudar = <C extends keyof Agendamento>(campo: C, valor: Agendamento[C]) => setForm({ ...atual, [campo]: valor });
  const sujo = !!form;

  async function salvar() {
    setOcupado('salvar');
    try {
      await api.put('/api/importacoes/agendamento', {
        ativo: atual!.ativo, hora: atual!.hora, dias_semana: atual!.dias_semana, tipo: atual!.tipo
      });
      toast.ok(atual!.ativo ? `Agendada para ${atual!.hora}.` : 'Agendamento desligado.');
      await recarregar();
    } catch (err) { toast.erro(mensagemErro(err)); }
    finally { setOcupado(null); }
  }

  async function rodarAgora() {
    setOcupado('rodar');
    try {
      const r = await api.post<{ ok: boolean; criados?: number; atualizados?: number; erro?: string }>('/api/importacoes/agendamento/executar', { anoLetivo: ano || new Date().getFullYear() });
      if (r.ok) toast.ok(`Importação concluída: ${r.criados} criado(s), ${r.atualizados} atualizado(s).`);
      else toast.erro(r.erro || 'A importação falhou.');
      await recarregar();
      aoRodar();
    } catch (err) { toast.erro(mensagemErro(err)); }
    finally { setOcupado(null); }
  }

  const resultado = atual.ultimo_resultado;
  return (
    <Card titulo="Importação agendada" descricao="Roda sozinha, em modo efetivo, no horário de São Paulo"
      acoes={<Botao pequeno carregando={ocupado === 'rodar'} icone="importar" onClick={rodarAgora}>Rodar agora</Botao>}>
      <div className="linha-h" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <label className="linha-h" style={{ gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={atual.ativo} onChange={e => mudar('ativo', e.target.checked)} style={{ accentColor: 'var(--azul)' }} />
          Ligada
        </label>
        <label className="f-campo">Horário: <input type="time" value={atual.hora} onChange={e => mudar('hora', e.target.value)}
          style={{ border: 0, background: 'transparent', outline: 0, color: 'var(--texto)' }} /></label>
        <label className="f-campo">Importar: <select value={atual.tipo} onChange={e => mudar('tipo', e.target.value as TipoImportacao)}>
          {(Object.keys(ROTULO_TIPO_IMPORTACAO) as TipoImportacao[]).map(t => <option key={t} value={t}>{ROTULO_TIPO_IMPORTACAO[t]}</option>)}
        </select></label>
      </div>

      <div className="linha-h" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {DIAS_SEMANA.map(d => (
          <label key={d.n} className={`opcao-card compacta ${atual.dias_semana.includes(d.n) ? 'marcada' : ''}`} style={{ padding: '4px 9px' }}>
            <input type="checkbox" checked={atual.dias_semana.includes(d.n)}
              onChange={e => mudar('dias_semana', e.target.checked
                ? [...atual.dias_semana, d.n].sort()
                : atual.dias_semana.filter(x => x !== d.n))} />
            <span style={{ fontSize: 12 }}>{d.r}</span>
          </label>
        ))}
      </div>

      <p className="cel-sub" style={{ margin: 0 }}>
        Importa o <b>ano corrente</b> — é o que a API do Activesoft expõe (03-integracao §8). Código de série ou disciplina
        que o sistema não casa sozinho continua virando pendência: escolher destino ambíguo é decisão humana, inclusive de madrugada.
      </p>

      {resultado ? (
        <div style={{ marginTop: 10, fontSize: 12.5 }}>
          <b>Última execução:</b> {fmtDataHora(resultado.quando)} ({resultado.ano}) —{' '}
          {resultado.ok
            ? <>{resultado.criados} criado(s), {resultado.atualizados} atualizado(s), {resultado.pendentes} pendência(s){resultado.erros ? <>, <span style={{ color: 'var(--erro)' }}>{resultado.erros} erro(s)</span></> : null}{resultado.importacao_id ? <> · <Link to={`/app/importacoes/${resultado.importacao_id}`}>ver relatório</Link></> : null}</>
            : <span style={{ color: 'var(--erro)' }}>falhou: {resultado.erro}</span>}
        </div>
      ) : null}

      {sujo ? (
        <div className="acoes" style={{ marginTop: 12 }}>
          <Botao variante="primario" icone="check" carregando={ocupado === 'salvar'} onClick={salvar}>Salvar agendamento</Botao>
          <Botao onClick={() => setForm(null)}>Descartar</Botao>
        </div>
      ) : null}
    </Card>
  );
}
