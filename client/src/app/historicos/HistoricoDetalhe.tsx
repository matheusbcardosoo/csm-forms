// /app/historicos/:id — pré-visualização e edição (04-telas §3.5). A tela
// central do sistema: à esquerda o documento renderizado em tamanho real
// com o CSS do PDF (RNF-04), à direita o painel que edita. Emitido, o
// painel vira somente leitura e o documento passa a ser o snapshot.
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, baixarArquivo, ErroApi, mensagemErro } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { useSessao } from '@/hooks/useSessao';
import { useToast } from '@/hooks/useToast';
import { Aviso, Botao, CampoArea, CampoSelect, CampoTexto, Card, Carregando, Confirmar, Modal, Tag, fmtData, fmtDataHora } from '@/componentes/ui';
import { Icone } from '@/componentes/Icones';
import { PreviaDocumento } from '@/componentes/PreviaDocumento';
import type { Auditoria } from '@shared/types/aluno';
import {
  ROTULO_STATUS_HISTORICO, ROTULO_TIPO_HISTORICO, TIPOS_HISTORICO, metaTipo,
  type HistoricoDetalhe as Detalhe, type StatusHistorico, type TipoHistorico
} from '@shared/types/historico';

const COR_STATUS: Record<StatusHistorico, 'ok' | 'aviso' | 'info' | 'erro'> = {
  rascunho: 'aviso', conferido: 'info', emitido: 'ok', cancelado: 'erro'
};

interface Formulario {
  tipo: TipoHistorico;
  matricula_ids: string[];
  observacoes: string;
  signatario_diretor_id: string;
  signatario_secretario_id: string;
  numero_registro_gdae: string;
  livro: string;
  folha: string;
}

export function HistoricoDetalhe() {
  const { id = '' } = useParams();
  const toast = useToast();
  const { podeEditar } = useSessao();
  const { dados, carregando, erro, definir } = useRecurso<Detalhe>(`/api/historicos/${id}`);

  const [form, setForm] = useState<Formulario | null>(null);
  const [sujo, setSujo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [acao, setAcao] = useState<'emitir' | 'segunda-via' | null>(null);
  const [cancelando, setCancelando] = useState<string | null>(null);
  const [verAuditoria, setVerAuditoria] = useState(false);
  const [escala, setEscala] = useState(0.75);
  const [pagina, setPagina] = useState<'ambas' | 1 | 2>('ambas');
  const [imagens, setImagens] = useState<Record<string, string>>({});

  // recarrega o formulário sempre que o documento muda no servidor
  useEffect(() => {
    if (!dados) return;
    const h = dados.historico;
    setForm({
      tipo: h.tipo,
      matricula_ids: h.matricula_ids,
      observacoes: h.observacoes || '',
      signatario_diretor_id: h.signatario_diretor_id || '',
      signatario_secretario_id: h.signatario_secretario_id || '',
      numero_registro_gdae: h.numero_registro_gdae || '',
      livro: h.livro || '',
      folha: h.folha || ''
    });
    setSujo(false);
  }, [dados]);

  // assinaturas digitalizadas: URL assinada, válida por alguns minutos
  useEffect(() => {
    const caminhos = (dados?.documento.assinaturas || []).map(a => a.assinatura_path).filter((c): c is string => !!c);
    if (!caminhos.length) return;
    let vivo = true;
    Promise.all(caminhos.map(async c => {
      try {
        const r = await api.get<{ url: string }>(`/api/instituicao/arquivo?caminho=${encodeURIComponent(c)}`);
        return [c, r.url] as const;
      } catch { return null; }
    })).then(pares => {
      if (vivo) setImagens(Object.fromEntries(pares.filter(Boolean) as (readonly [string, string])[]));
    });
    return () => { vivo = false; };
  }, [dados]);

  const editavel = !!dados && podeEditar && (dados.historico.status === 'rascunho' || dados.historico.status === 'conferido');

  /**
   * A coluna esquerda acompanha a digitação: observações e número da SED
   * são sobrepostos no documento antes de salvar. As observações
   * automáticas (ex.: a nota de cruzamento de versões, RF-VER-13) são as
   * que o servidor devolveu e não estão no texto salvo — ficam no fim.
   */
  const docPrevia = useMemo(() => {
    if (!dados) return null;
    const doc = dados.documento;
    if (!form || !editavel) return doc;
    const salvas = (dados.historico.observacoes || '').split('\n').map(t => t.trim()).filter(Boolean);
    const automaticas = doc.observacoes.filter(o => !salvas.includes(o));
    const digitadas = form.observacoes.split('\n').map(t => t.trim()).filter(Boolean);
    return { ...doc, observacoes: [...digitadas, ...automaticas], registro_sed: form.numero_registro_gdae.trim() || null };
  }, [dados, form, editavel]);

  if (carregando && !dados) return <div className="wrap"><Carregando /></div>;
  if (erro || !dados || !form || !docPrevia) return <div className="wrap"><Aviso tipo="erro">{erro || 'Histórico não encontrado.'}</Aviso></div>;

  const h = dados.historico;
  const meta = metaTipo(form.tipo);
  const bloqueios = dados.validacao.filter(v => v.nivel === 'bloqueia');
  const alertas = dados.validacao.filter(v => v.nivel === 'alerta');
  const mudar = <K extends keyof Formulario>(k: K, v: Formulario[K]) => { setForm(f => f && ({ ...f, [k]: v })); setSujo(true); };

  async function executar(fn: () => Promise<Detalhe>, ok: string) {
    setSalvando(true);
    try {
      definir(await fn());
      toast.ok(ok);
    } catch (err) {
      if (err instanceof ErroApi && err.campos.length) toast.erro(err.campos[0].mensagem);
      else toast.erro(mensagemErro(err));
    } finally { setSalvando(false); }
  }

  const salvar = () => executar(() => api.put<Detalhe>(`/api/historicos/${id}`, form), 'Rascunho salvo.');
  const baixar = () => baixarArquivo(`/api/historicos/${id}/pdf`, `historico-${dados!.aluno.nome}.pdf`)
    .catch(err => toast.erro(mensagemErro(err, 'Não foi possível gerar o PDF.')));

  return (
    <div className="wrap">
      <Link className="cab-voltar" to="/app/historicos"><Icone nome="setaEsq" />Históricos</Link>

      <div className="ficha-cab">
        <div className="ficha-id">
          <h1>{dados.aluno.nome}</h1>
          <div className="ficha-meta">
            <Tag tipo={COR_STATUS[h.status]} ponto>{ROTULO_STATUS_HISTORICO[h.status]}</Tag>
            <span>{ROTULO_TIPO_HISTORICO[h.tipo]}</span>
            <span>·</span><span>{dados.curso.nome}</span>
            {h.numero_registro != null ? <><span>·</span><span>Registro nº <b>{h.numero_registro}/{h.ano_registro}</b></span></> : null}
            {h.via > 1 ? <Tag tipo="info">{h.via}ª via</Tag> : null}
          </div>
        </div>
        <div className="acoes">
          <Botao pequeno icone="relogio" onClick={() => setVerAuditoria(true)}>Histórico do documento</Botao>
          <Botao pequeno icone="upload" onClick={baixar}>{h.status === 'emitido' ? 'Baixar PDF' : 'Baixar prévia'}</Botao>
        </div>
      </div>

      {h.status === 'cancelado' ? (
        <div style={{ marginBottom: 14 }}>
          <Aviso tipo="erro"><b>Documento cancelado</b> em {fmtDataHora(h.cancelado_em)} por {h.cancelado_por}. Motivo: {h.motivo_cancelamento}</Aviso>
        </div>
      ) : null}

      <div className="previa">
        {/* ---------------- documento ---------------- */}
        <div className="previa-doc">
          <div className="previa-barra">
            <label className="f-campo">Zoom: <select value={escala} onChange={e => setEscala(Number(e.target.value))} aria-label="Zoom">
              <option value={0.5}>50%</option><option value={0.75}>75%</option><option value={1}>100%</option>
            </select></label>
            <label className="f-campo">Página: <select value={String(pagina)} onChange={e => setPagina(e.target.value === 'ambas' ? 'ambas' : Number(e.target.value) as 1 | 2)} aria-label="Página">
              <option value="ambas">Frente e verso</option><option value="1">Frente</option><option value="2">Verso</option>
            </select></label>
            <span className="cel-sub" style={{ marginLeft: 'auto' }}>Mesmo CSS do PDF — o que está aqui é o que imprime.</span>
          </div>
          <div className="palco">
            <PreviaDocumento doc={docPrevia} imagens={imagens} escala={escala} pagina={pagina} />
          </div>
        </div>

        {/* ---------------- painel ---------------- */}
        <div className="previa-painel">
          <Card titulo="Conferência" descricao={bloqueios.length ? `${bloqueios.length} pendência(s) impedem a emissão` : alertas.length ? 'Nenhum impedimento — só avisos' : 'Tudo conferido'} semCorpo>
            <div className="card-corpo" style={{ paddingTop: 12 }}>
              {h.status === 'emitido' ? (
                <p className="cel-sub">Documento emitido em {fmtData(h.emitido_em)} por {h.emitido_por}. O conteúdo está congelado (RF-HIST-06).</p>
              ) : !dados.validacao.length ? (
                <div className="linha-h" style={{ color: 'var(--ok)' }}><Icone nome="check" />Nada pendente.</div>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.55 }}>
                  {bloqueios.map(v => <li key={v.codigo + (v.matricula_id || '')} style={{ color: 'var(--erro)' }}>{v.mensagem}</li>)}
                  {alertas.map(v => <li key={v.codigo + (v.matricula_id || '')} style={{ color: 'var(--texto-2)' }}>{v.mensagem}</li>)}
                </ul>
              )}
            </div>
          </Card>

          <Card titulo="Documento" semCorpo>
            <div className="card-corpo" style={{ paddingTop: 12 }}>
              <div className="form-grade">
                <CampoSelect className="col-2" rotulo="Tipo" value={form.tipo} disabled={!editavel} onChange={e => mudar('tipo', e.target.value as TipoHistorico)}
                  dica={meta.certificado ? 'Com bloco de certificado e número da SED obrigatório.' : 'Sem bloco de certificado.'}>
                  {TIPOS_HISTORICO.map(t => <option key={t.tipo} value={t.tipo}>{t.rotulo}</option>)}
                </CampoSelect>
              </div>
              <div className="form-sec" style={{ marginTop: 14, marginBottom: 0 }}>
                <h3>Anos do documento</h3>
                <div className="pilha" style={{ gap: 6 }}>
                  {dados.matriculas_disponiveis.map(m => {
                    const marcado = form.matricula_ids.includes(m.id);
                    return (
                      <label key={m.id} className={`opcao-card compacta ${marcado ? 'marcada' : ''}`}>
                        <input type="checkbox" checked={marcado} disabled={!editavel}
                          onChange={() => mudar('matricula_ids', marcado ? form.matricula_ids.filter(x => x !== m.id) : [...form.matricula_ids, m.id])} />
                        <div><b>{m.ano} · {m.serie}</b><span>{m.curso}{m.externa ? ' · outra escola' : ''}</span></div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </Card>

          <Card titulo="Observações" descricao="Uma por linha — saem como parágrafos no verso" semCorpo>
            <div className="card-corpo" style={{ paddingTop: 12 }}>
              <CampoArea rotulo="Texto impresso no verso" rows={7} value={form.observacoes} disabled={!editavel} onChange={e => mudar('observacoes', e.target.value)} />
              {editavel && dados.modelos_observacao.length ? (
                <div style={{ marginTop: 8 }}>
                  <div className="cel-sub" style={{ marginBottom: 6 }}>Textos-padrão (RF-HIST-04):</div>
                  <div className="linha-h" style={{ gap: 6 }}>
                    {dados.modelos_observacao.map(m => (
                      <Botao key={m.id} pequeno icone="mais" onClick={() => mudar('observacoes', (form.observacoes ? `${form.observacoes}\n` : '') + m.texto)}>{m.titulo}</Botao>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </Card>

          <Card titulo="Assinaturas" semCorpo>
            <div className="card-corpo" style={{ paddingTop: 12 }}>
              <div className="form-grade">
                <CampoSelect className="col-2" rotulo="Secretário(a)" value={form.signatario_secretario_id} disabled={!editavel} onChange={e => mudar('signatario_secretario_id', e.target.value)}>
                  <option value="">— primeiro ativo —</option>
                  {dados.signatarios.filter(s => s.cargo === 'secretario').map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </CampoSelect>
                <CampoSelect className="col-2" rotulo="Diretor(a)" value={form.signatario_diretor_id} disabled={!editavel} onChange={e => mudar('signatario_diretor_id', e.target.value)}>
                  <option value="">— primeiro ativo —</option>
                  {dados.signatarios.filter(s => s.cargo === 'diretor' || s.cargo === 'vice_diretor').map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </CampoSelect>
              </div>
            </div>
          </Card>

          <Card titulo="Registro" descricao="Numeração interna e publicação da SED" semCorpo>
            <div className="card-corpo" style={{ paddingTop: 12 }}>
              <div className="form-grade">
                <CampoTexto rotulo="Livro" value={form.livro} disabled={!editavel} onChange={e => mudar('livro', e.target.value)} />
                <CampoTexto rotulo="Folha" value={form.folha} disabled={!editavel} onChange={e => mudar('folha', e.target.value)} />
                <CampoTexto className="col-2" rotulo={<>Registro / Visto Confere (SED){meta.certificado ? <small> · obrigatório</small> : null}</>}
                  value={form.numero_registro_gdae} disabled={!editavel} inputMode="numeric" onChange={e => mudar('numero_registro_gdae', e.target.value)}
                  dica="Copiado do fluxo de Concluintes da SED (RF-HIST-15). Sem API — é digitação." />
              </div>
              <p className="cel-sub" style={{ marginTop: 10 }}>
                {h.numero_registro != null ? `Número atribuído na emissão: ${h.numero_registro}/${h.ano_registro}.` : 'O número de registro é atribuído automaticamente na emissão.'}
              </p>
            </div>
          </Card>

          <Card titulo="Verificação de autenticidade" descricao="O QR impresso no rodapé do documento" semCorpo>
            <div className="card-corpo" style={{ paddingTop: 12 }}>
              {h.codigo_verificacao ? (
                <>
                  <p className="cel-sub" style={{ margin: 0 }}>
                    Quem recebe o documento aponta a câmera para o QR e vê que ele é autêntico, sem precisar ligar para a secretaria.
                    A página mostra só o registro, a data e o nome abreviado do aluno.
                  </p>
                  {dados.documento.verificacao ? (
                    <div className="linha-h" style={{ marginTop: 10, gap: 8 }}>
                      <code style={{ fontSize: 12, wordBreak: 'break-all' }}>{dados.documento.verificacao.url}</code>
                      <Botao pequeno icone="copiar" onClick={() => {
                        navigator.clipboard.writeText(dados.documento.verificacao!.url).then(() => toast.ok('Endereço copiado.'), () => toast.erro('Não consegui copiar.'));
                      }}>Copiar</Botao>
                    </div>
                  ) : (
                    <Aviso tipo="aviso">
                      O documento tem código, mas o endereço público do sistema (<code>APP_BASE_URL</code>) não está configurado —
                      sem ele o QR apontaria para lugar nenhum, então não é impresso.
                    </Aviso>
                  )}
                </>
              ) : (
                <>
                  <p className="cel-sub" style={{ margin: 0 }}>
                    Este documento foi emitido antes de o código de verificação existir. Dá para gerar o dele agora, sem reemitir
                    e sem alterar o que foi congelado — o QR passa a sair nas próximas impressões, inclusive nas 2ª vias.
                    O papel já entregue continua sem QR.
                  </p>
                  <div style={{ marginTop: 10 }}>
                    <Botao pequeno icone="mais" carregando={salvando}
                      onClick={() => executar(() => api.post<Detalhe>(`/api/historicos/${id}/codigo-verificacao`), 'Código de verificação gerado.')}>
                      Gerar código
                    </Botao>
                  </div>
                </>
              )}
            </div>
          </Card>

          {dados.vias.length > 1 ? (
            <Card titulo="Vias emitidas" semCorpo>
              <div className="card-corpo" style={{ paddingTop: 12, fontSize: 12.5 }}>
                {dados.vias.map(v => (
                  <div key={v.id} className="linha-h" style={{ justifyContent: 'space-between', padding: '4px 0' }}>
                    <span>{v.via}ª via · {v.emitido_em ? fmtData(v.emitido_em) : '—'}</span>
                    {v.id === h.id ? <Tag tipo="info">esta</Tag> : <Link className="btn btn-sm" to={`/app/historicos/${v.id}`}>Abrir</Link>}
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      </div>

      {/* ---------------- barra de ações ---------------- */}
      {podeEditar ? (
        <div className="barra-fixa">
          <span className="estado">{sujo ? 'Alterações não salvas' : h.status === 'emitido' ? 'Documento congelado' : ''}</span>
          {editavel ? <>
            <Botao onClick={salvar} carregando={salvando} disabled={!sujo} icone="check">Salvar rascunho</Botao>
            {h.status === 'rascunho'
              ? <Botao onClick={() => executar(() => api.post<Detalhe>(`/api/historicos/${id}/conferir`), 'Marcado como conferido.')} carregando={salvando} disabled={sujo || !!bloqueios.length}>Marcar conferido</Botao>
              : <Botao onClick={() => executar(() => api.post<Detalhe>(`/api/historicos/${id}/reabrir`), 'Documento voltou a rascunho.')} carregando={salvando}>Reabrir</Botao>}
            <Botao variante="primario" icone="publicar" disabled={sujo || !!bloqueios.length} onClick={() => setAcao('emitir')}>Emitir</Botao>
          </> : null}
          {h.status === 'emitido' ? <>
            <Botao icone="copiar" onClick={() => setAcao('segunda-via')}>Gerar 2ª via</Botao>
            <Botao variante="perigo" icone="fechar" onClick={() => setCancelando('')}>Cancelar documento</Botao>
          </> : null}
        </div>
      ) : null}

      <Confirmar aberto={acao === 'emitir'} titulo="Emitir o histórico?"
        descricao="A emissão atribui o número de registro, congela o conteúdo num snapshot e gera o PDF. Depois disso o documento não pode mais ser editado — só cancelado ou reemitido em 2ª via."
        rotuloConfirmar="Emitir documento" carregando={salvando}
        aoFechar={() => setAcao(null)}
        aoConfirmar={() => { setAcao(null); executar(() => api.post<Detalhe>(`/api/historicos/${id}/emitir`), 'Documento emitido e numerado.'); }} />

      <Confirmar aberto={acao === 'segunda-via'} titulo="Gerar 2ª via?"
        descricao="A 2ª via reimprime exatamente o documento emitido, com o mesmo número de registro e a marca da via. Nada é recalculado."
        rotuloConfirmar="Gerar 2ª via" carregando={salvando}
        aoFechar={() => setAcao(null)}
        aoConfirmar={() => { setAcao(null); executar(() => api.post<Detalhe>(`/api/historicos/${id}/segunda-via`), '2ª via emitida.'); }} />

      <Modal aberto={cancelando !== null} titulo="Cancelar documento" tamanho="sm"
        descricao="O documento continua arquivado (guarda permanente), mas passa a constar como cancelado. O motivo fica na auditoria."
        aoFechar={() => setCancelando(null)}
        rodape={<>
          <Botao onClick={() => setCancelando(null)}>Voltar</Botao>
          <Botao variante="perigo" carregando={salvando} disabled={(cancelando || '').trim().length < 5}
            onClick={() => { const motivo = cancelando || ''; setCancelando(null); executar(() => api.post<Detalhe>(`/api/historicos/${id}/cancelar`, { motivo }), 'Documento cancelado.'); }}>
            Cancelar documento
          </Botao>
        </>}>
        <CampoArea rotulo="Motivo" rows={3} value={cancelando || ''} onChange={e => setCancelando(e.target.value)}
          placeholder="ex.: erro na nota de Matemática de 2024, documento substituído" obrigatorio dica="Mínimo de 5 caracteres." />
      </Modal>

      <ModalAuditoria aberto={verAuditoria} historicoId={id} aoFechar={() => setVerAuditoria(false)} />
    </div>
  );
}

function ModalAuditoria({ aberto, historicoId, aoFechar }: { aberto: boolean; historicoId: string; aoFechar: () => void }) {
  const { dados, carregando } = useRecurso<Auditoria[]>(aberto ? `/api/historicos/${historicoId}/auditoria` : null);
  const fmt = (v: Record<string, unknown> | null) => v ? Object.entries(v).map(([k, x]) => `${k}: ${x == null ? '—' : String(x)}`).join(' · ') : '—';
  return (
    <Modal aberto={aberto} titulo="Histórico do documento" descricao="Quem gerou, quem conferiu, quem emitiu (RF-HIST-11)." aoFechar={aoFechar} tamanho="lg">
      {carregando && !dados ? <Carregando /> : !dados?.length ? <p className="cel-sub">Nenhum registro ainda.</p> : (
        <div className="tab-box"><table className="responsiva">
          <thead><tr><th>Quando</th><th>Ação</th><th>Campo</th><th>De → para</th><th>Motivo</th><th>Por</th></tr></thead>
          <tbody>{dados.map(a => (
            <tr key={a.id}>
              <td data-rotulo="Quando" className="cel-sub">{fmtDataHora(a.criado_em)}</td>
              <td data-rotulo="Ação"><Tag tipo={a.acao === 'emitir' ? 'ok' : a.acao === 'cancelar' ? 'erro' : a.acao === 'editar' ? 'edit' : 'neutro'}>{a.acao}</Tag></td>
              <td data-rotulo="Campo">{a.campo || '—'}</td>
              <td data-rotulo="De → para" style={{ fontSize: 12 }}>{fmt(a.valor_anterior)} → <b>{fmt(a.valor_novo)}</b></td>
              <td data-rotulo="Motivo" style={{ fontSize: 12 }}>{a.motivo || '—'}</td>
              <td data-rotulo="Por" className="cel-sub">{a.usuario_email || '—'}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </Modal>
  );
}
