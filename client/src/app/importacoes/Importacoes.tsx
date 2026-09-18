// /app/importacoes — lista de importações + nova importação (04-telas §3.6):
// "Simular primeiro" é o botão primário; "Importar agora" o secundário.
import { useState } from 'react';
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
