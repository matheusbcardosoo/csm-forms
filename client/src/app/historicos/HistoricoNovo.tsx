// /app/alunos/:id/historico/novo — assistente de geração (04-telas §3.4).
// Quatro passos: tipo · anos do documento · conferência · signatários e
// observações. Ao concluir, cria o histórico em rascunho e leva à
// pré-visualização, que é onde a edição de verdade acontece.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ErroApi, mensagemErro } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { useToast } from '@/hooks/useToast';
import { Aviso, Botao, BotaoLink, Cabecalho, CampoArea, CampoSelect, Card, Carregando, EstadoVazio, Tag } from '@/componentes/ui';
import { Icone } from '@/componentes/Icones';
import { ROTULO_SITUACAO_MATRICULA, type SituacaoMatricula } from '@shared/types/aluno';
import { ROTULO_TIPO_HISTORICO, TIPOS_HISTORICO, metaTipo, type Historico, type PreparoHistorico, type TipoHistorico } from '@shared/types/historico';

const PASSOS = ['Tipo', 'Anos do documento', 'Conferência', 'Assinaturas e observações'];

export function HistoricoNovo() {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const toast = useToast();
  const { dados, carregando, erro } = useRecurso<PreparoHistorico>(`/api/historicos/preparar/${id}`);

  const [passo, setPasso] = useState(0);
  const [tipo, setTipo] = useState<TipoHistorico>('conclusao_em');
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [diretor, setDiretor] = useState('');
  const [secretario, setSecretario] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [sed, setSed] = useState('');
  const [salvando, setSalvando] = useState(false);

  const matriculas = useMemo(() => dados?.matriculas || [], [dados]);

  // Sugestão de partida: todos os anos marcados e o tipo deduzido da
  // etapa do ano mais recente (é o que a secretaria pede em 9 de 10 casos).
  useEffect(() => {
    if (!matriculas.length) return;
    setSelecionados(matriculas.map(m => m.id));
    const ultima = matriculas[matriculas.length - 1];
    setTipo(ultima.etapa === 'em' ? 'conclusao_em' : ultima.etapa === 'ef_finais' ? 'conclusao_ef' : 'transferencia');
  }, [matriculas]);

  useEffect(() => {
    const s = dados?.signatarios || [];
    setDiretor(d => d || s.find(x => x.cargo === 'diretor')?.id || '');
    setSecretario(v => v || s.find(x => x.cargo === 'secretario')?.id || '');
  }, [dados]);

  if (carregando && !dados) return <div className="wrap"><Carregando /></div>;
  if (erro || !dados) return <div className="wrap"><Aviso tipo="erro">{erro || 'Aluno não encontrado.'}</Aviso></div>;

  const escolhidas = matriculas.filter(m => selecionados.includes(m.id));
  const meta = metaTipo(tipo);

  // Conferência do passo 3: o que impede e o que só alerta. A conferência
  // definitiva é a do servidor, na pré-visualização — esta antecipa o
  // problema antes de criar o rascunho.
  const bloqueios: string[] = [];
  const alertas: string[] = [];
  if (!escolhidas.length) bloqueios.push('Selecione ao menos um ano letivo.');
  for (const m of escolhidas) {
    const rot = `${m.ano} · ${m.serie}`;
    if (m.sem_curriculo) bloqueios.push(`${rot}: nenhum currículo cadastrado para o período (RF-VER-11). Cadastre a versão vigente daquele ano em Currículos.`);
    else if (m.total_itens && m.total_notas < m.total_itens) bloqueios.push(`${rot}: ${m.total_itens - m.total_notas} componente(s) sem nota.`);
    if (m.situacao_final === 'em_curso' && meta.certificado) bloqueios.push(`${rot}: situação final ainda "em curso" — conclusão exige o ano encerrado.`);
    else if (m.situacao_final === 'em_curso') alertas.push(`${rot}: situação final ainda "em curso".`);
    if (m.externa) alertas.push(`${rot}: ano cursado em outra escola (${m.estabelecimento || 'estabelecimento não informado'}).`);
  }
  for (const v of dados.validacao) (v.nivel === 'bloqueia' ? bloqueios : alertas).push(v.mensagem);
  if (meta.certificado && !dados.aluno.ra) bloqueios.push('Aluno sem RA — obrigatório no certificado de conclusão.');
  if (!dados.signatarios.some(s => s.cargo === 'diretor') || !dados.signatarios.some(s => s.cargo === 'secretario')) {
    bloqueios.push('Faltam signatários ativos (diretor e secretário). Cadastre em Configuração › Signatários.');
  }

  const cursos = [...new Map(escolhidas.map(m => [m.curso_id, m.curso])).entries()];

  async function criar() {
    setSalvando(true);
    try {
      const h = await api.post<Historico>('/api/historicos', {
        aluno_id: id, tipo, matricula_ids: selecionados,
        observacoes: observacoes.trim() || undefined,
        signatario_diretor_id: diretor || null,
        signatario_secretario_id: secretario || null,
        numero_registro_gdae: sed.trim() || null
      });
      toast.ok('Rascunho criado. Confira o documento antes de emitir.');
      navegar(`/app/historicos/${h.id}`);
    } catch (err) {
      if (err instanceof ErroApi && err.campos.length) toast.erro(err.campos[0].mensagem);
      else toast.erro(mensagemErro(err));
    } finally { setSalvando(false); }
  }

  const podeAvancar = passo === 1 ? selecionados.length > 0 : passo === 2 ? bloqueios.length === 0 : true;

  return (
    <div className="wrap wrap-estreito">
      <Cabecalho titulo="Gerar histórico" descricao={`${dados.aluno.nome}${dados.aluno.ra ? ` · RA ${dados.aluno.ra}` : ''}`}
        voltar={{ to: `/app/alunos/${id}`, rotulo: 'Voltar à ficha' }} />

      <div className="passos">
        {PASSOS.map((p, i) => (
          <div key={p} className={`passo ${i === passo ? 'atual' : i < passo ? 'feito' : ''}`}>
            <b>{i < passo ? '✓' : i + 1}</b>{p}
          </div>
        ))}
      </div>

      {!matriculas.length ? (
        <Card semCorpo><EstadoVazio icone="calendario" titulo="Sem trajetória escolar"
          descricao="Este aluno não tem nenhum ano letivo registrado. Importe as matrículas ou lance os anos cursados na ficha."
          acoes={<BotaoLink to={`/app/alunos/${id}?aba=trajetoria`} variante="primario">Abrir trajetória</BotaoLink>} /></Card>
      ) : (
        <>
          {/* ---------- 1. Tipo ---------- */}
          {passo === 0 ? (
            <Card titulo="Que documento é este?" descricao="O tipo define o bloco de certificado e as exigências da emissão.">
              <div className="pilha">
                {TIPOS_HISTORICO.map(t => (
                  <label key={t.tipo} className={`opcao-card ${tipo === t.tipo ? 'marcada' : ''}`}>
                    <input type="radio" name="tipo" checked={tipo === t.tipo} onChange={() => setTipo(t.tipo)} />
                    <div>
                      <b>{t.rotulo}</b>
                      <span>{t.descricao}</span>
                    </div>
                    {t.certificado ? <Tag tipo="info">com certificado</Tag> : null}
                  </label>
                ))}
              </div>
            </Card>
          ) : null}

          {/* ---------- 2. Anos ---------- */}
          {passo === 1 ? (
            <Card titulo="Quais anos entram no documento" descricao="Todos marcados por padrão. As colunas da grade saem nesta ordem.">
              <div className="pilha">
                {matriculas.map(m => {
                  const marcado = selecionados.includes(m.id);
                  return (
                    <label key={m.id} className={`opcao-card ${marcado ? 'marcada' : ''}`}>
                      <input type="checkbox" checked={marcado}
                        onChange={() => setSelecionados(s => marcado ? s.filter(x => x !== m.id) : [...s, m.id])} />
                      <div>
                        <b>{m.ano} · {m.serie}</b>
                        <span>{m.curso}{m.externa ? ` · ${m.estabelecimento || 'outra escola'}` : ''} · {ROTULO_SITUACAO_MATRICULA[m.situacao_final as SituacaoMatricula] || m.situacao_final}</span>
                      </div>
                      {m.sem_curriculo ? <Tag tipo="erro">sem currículo</Tag>
                        : m.total_itens && m.total_notas < m.total_itens ? <Tag tipo="aviso">{m.total_itens - m.total_notas} sem nota</Tag>
                        : <Tag tipo="ok">{m.total_notas} nota(s)</Tag>}
                    </label>
                  );
                })}
              </div>
              {cursos.length > 1 ? (
                <div style={{ marginTop: 12 }}>
                  <Aviso tipo="aviso"><b>Anos de cursos diferentes.</b> O título do documento usa o curso do ano mais recente ({cursos[cursos.length - 1][1]}). Se não for isso, gere documentos separados.</Aviso>
                </div>
              ) : null}
            </Card>
          ) : null}

          {/* ---------- 3. Conferência ---------- */}
          {passo === 2 ? (
            <Card titulo="Conferência (RF-ALU-08)" descricao="O que falta para o documento sair correto.">
              {!bloqueios.length && !alertas.length ? (
                <div className="linha-h" style={{ color: 'var(--ok)' }}><Icone nome="check" />Tudo conferido — nenhum impedimento.</div>
              ) : (
                <div className="pilha">
                  {bloqueios.length ? (
                    <Aviso tipo="erro">
                      <b>Impede a emissão</b>
                      <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{bloqueios.map((b, i) => <li key={i}>{b}</li>)}</ul>
                      <p style={{ marginTop: 8 }}>Resolva na <Link to={`/app/alunos/${id}?aba=notas`}>ficha do aluno</Link> ou em <Link to="/app/config/curriculos">Currículos</Link> e volte aqui.</p>
                    </Aviso>
                  ) : null}
                  {alertas.length ? (
                    <Aviso tipo="aviso">
                      <b>Vale conferir</b>
                      <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{alertas.map((a, i) => <li key={i}>{a}</li>)}</ul>
                    </Aviso>
                  ) : null}
                </div>
              )}
            </Card>
          ) : null}

          {/* ---------- 4. Assinaturas e observações ---------- */}
          {passo === 3 ? (
            <Card titulo="Assinaturas e observações" descricao="Dá para ajustar tudo depois, na pré-visualização.">
              <div className="form-grade">
                <CampoSelect rotulo="Secretário(a)" value={secretario} onChange={e => setSecretario(e.target.value)}>
                  <option value="">— usar o primeiro ativo —</option>
                  {dados.signatarios.filter(s => s.cargo === 'secretario').map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </CampoSelect>
                <CampoSelect rotulo="Diretor(a)" value={diretor} onChange={e => setDiretor(e.target.value)}>
                  <option value="">— usar o primeiro ativo —</option>
                  {dados.signatarios.filter(s => s.cargo === 'diretor' || s.cargo === 'vice_diretor').map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </CampoSelect>
                {meta.certificado ? (
                  <div className="campo col-2">
                    <label htmlFor="sed">Registro / Visto Confere (SED) <small>· obrigatório para emitir</small></label>
                    <input id="sed" value={sed} onChange={e => setSed(e.target.value)} inputMode="numeric" placeholder="ex.: 000000000000" />
                    <div className="dica">Número de publicação copiado do fluxo de Concluintes da SED (RF-HIST-15). Pode ficar em branco agora e ser preenchido antes de emitir.</div>
                  </div>
                ) : null}
                <CampoArea className="col-2" rotulo="Observações" rows={5} value={observacoes} onChange={e => setObservacoes(e.target.value)}
                  placeholder="Deixe em branco para o sistema preencher com o critério de promoção do curso."
                  dica="Uma observação por linha. Os textos-padrão ficam disponíveis na pré-visualização." />
                {dados.modelos_observacao.length ? (
                  <div className="col-2">
                    <div className="cel-sub" style={{ marginBottom: 6 }}>Inserir texto-padrão:</div>
                    <div className="linha-h" style={{ gap: 6 }}>
                      {dados.modelos_observacao.map(m => (
                        <Botao key={m.id} pequeno icone="mais" onClick={() => setObservacoes(o => (o ? `${o}\n` : '') + m.texto)}>{m.titulo}</Botao>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}

          <div className="barra-fixa">
            <span className="estado">{ROTULO_TIPO_HISTORICO[tipo]} · {escolhidas.length} ano(s)</span>
            <Botao onClick={() => setPasso(p => Math.max(0, p - 1))} disabled={passo === 0}>Voltar</Botao>
            {passo < PASSOS.length - 1
              ? <Botao variante="primario" icone="seta" disabled={!podeAvancar} onClick={() => setPasso(p => p + 1)}>Continuar</Botao>
              : <Botao variante="primario" icone="check" carregando={salvando} disabled={!!bloqueios.length} onClick={criar}>Criar rascunho</Botao>}
          </div>
        </>
      )}
    </div>
  );
}
