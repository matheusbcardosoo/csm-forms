// /app/alunos/:id — ficha (04-telas §3.3): cabeçalho fixo + abas
// Dados · Trajetória · Notas · Históricos.
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, ErroApi, mensagemErro, type CampoInvalido } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { useSessao } from '@/hooks/useSessao';
import { useToast } from '@/hooks/useToast';
import { Aviso, Botao, BotaoLink, CampoArea, CampoSelect, CampoTexto, Card, Carregando, EstadoVazio, Modal, Tabela, Tag, fmtData, fmtDataHora, iniciais } from '@/componentes/ui';
import { ROTULO_STATUS_HISTORICO, ROTULO_TIPO_HISTORICO, type HistoricoLista, type StatusHistorico } from '@shared/types/historico';
import { Icone } from '@/componentes/Icones';
import { CAMPOS_OBRIGATORIOS_HISTORICO, ROTULO_ORIGEM, ROTULO_SITUACAO_ALUNO, ROTULO_SITUACAO_MATRICULA, ROTULO_SITUACAO_NOTA, type Aluno, type AlunoDetalhe, type Auditoria, type GradeNotas, type MatriculaDetalhe, type SituacaoAluno, type SituacaoMatricula, type SituacaoNota } from '@shared/types/aluno';
import type { Curso, EstabelecimentoExterno, Serie } from '@shared/types/curriculo';

type Aba = 'dados' | 'trajetoria' | 'notas' | 'historicos';

export function AlunoFicha() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const aba = (params.get('aba') as Aba) || 'dados';
  const { podeEditar } = useSessao();
  const { dados, carregando, erro, recarregar } = useRecurso<AlunoDetalhe>(`/api/alunos/${id}`);

  if (carregando && !dados) return <div className="wrap"><Carregando /></div>;
  if (erro || !dados) return <div className="wrap"><Aviso tipo="erro">{erro || 'Aluno não encontrado.'}</Aviso></div>;

  const { aluno, matriculas, validacao } = dados;
  const atual = [...matriculas].reverse()[0] || null;
  const bloqueios = validacao.filter(v => v.nivel === 'bloqueia');
  const irPara = (a: Aba) => { const p = new URLSearchParams(params); p.set('aba', a); setParams(p); };

  return (
    <div className="wrap">
      <Link className="cab-voltar" to="/app/alunos"><Icone nome="setaEsq" />Alunos</Link>
      <div className="ficha-cab">
        <div className="ficha-av">{iniciais(aluno.nome)}</div>
        <div className="ficha-id">
          <h1>{aluno.nome}</h1>
          <div className="ficha-meta">
            <span>{aluno.codigo_activesoft ? `Código ${aluno.codigo_activesoft}` : 'Cadastro manual'}</span>
            {atual ? <><span>·</span><span>{atual.serie.nome}{atual.turma ? ` ${atual.turma}` : ''} · {atual.curso.nome} · {atual.ano_letivo.ano}</span></> : null}
            <span>·</span><span>RA {aluno.ra || '—'}</span>
            <Tag tipo={aluno.situacao === 'ativo' ? 'ok' : aluno.situacao === 'concluinte' ? 'info' : 'neutro'} ponto>{ROTULO_SITUACAO_ALUNO[aluno.situacao]}</Tag>
            {bloqueios.length ? <Tag tipo="aviso" ponto>{bloqueios.length} pendência(s)</Tag> : <Tag tipo="ok" ponto>Pronto para histórico</Tag>}
          </div>
        </div>
        <div className="acoes">
          {podeEditar ? <Botao icone="editar" onClick={() => irPara('dados')}>Editar dados</Botao> : null}
          {podeEditar ? <BotaoLink to={`/app/alunos/${aluno.id}/historico/novo`} variante="destaque" icone="documento">Gerar histórico</BotaoLink> : null}
        </div>
      </div>

      <nav className="abas" role="tablist">
        {([['dados', 'Dados'], ['trajetoria', 'Trajetória'], ['notas', 'Notas'], ['historicos', 'Históricos']] as [Aba, string][]).map(([k, r]) => (
          <button key={k} type="button" role="tab" className="aba" aria-selected={aba === k} onClick={() => irPara(k)}>{r}{k !== 'historicos' && validacao.some(v => v.aba === k && v.nivel === 'bloqueia') ? ' •' : ''}</button>
        ))}
      </nav>

      {validacao.length && aba !== 'historicos' ? (
        <div style={{ marginBottom: 14 }}>
          <Aviso tipo={bloqueios.length ? 'aviso' : 'info'}>
            <b>Conferência para o histórico (RF-ALU-08).</b>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {validacao.filter(v => v.aba === aba || (!v.aba)).map(v => <li key={v.codigo + (v.matricula_id || '')}>{v.nivel === 'bloqueia' ? '⛔ ' : '⚠ '}{v.mensagem}</li>)}
              {validacao.filter(v => v.aba && v.aba !== aba).length ? <li style={{ color: 'var(--texto-3)' }}>+ {validacao.filter(v => v.aba && v.aba !== aba).length} em outras abas</li> : null}
            </ul>
          </Aviso>
        </div>
      ) : null}

      {aba === 'dados' ? <AbaDados aluno={aluno} podeEditar={podeEditar} aoSalvar={recarregar} /> : null}
      {aba === 'trajetoria' ? <AbaTrajetoria aluno={aluno} matriculas={matriculas} podeEditar={podeEditar} aoMudar={recarregar} aoVerNotas={m => { const p = new URLSearchParams(params); p.set('aba', 'notas'); p.set('matricula', m.id); setParams(p); }} /> : null}
      {aba === 'notas' ? <AbaNotas alunoId={aluno.id} matriculas={matriculas} podeEditar={podeEditar} aoMudar={recarregar} /> : null}
      {aba === 'historicos' ? <AbaHistoricos aluno={aluno} podeEditar={podeEditar} /> : null}
    </div>
  );
}

/* ================= DADOS ================= */
function AbaDados({ aluno, podeEditar, aoSalvar }: { aluno: Aluno; podeEditar: boolean; aoSalvar: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<Partial<Aluno>>(aluno);
  const [motivo, setMotivo] = useState('');
  const [sujo, setSujo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [campos, setCampos] = useState<CampoInvalido[]>([]);
  useEffect(() => { setForm(aluno); setSujo(false); }, [aluno]);

  const def = (k: keyof Aluno) => (e: { target: { value: string } }) => { setForm(f => ({ ...f, [k]: e.target.value })); setSujo(true); };
  const v = (k: keyof Aluno) => (form[k] as string | null | undefined) ?? '';
  const obrigatorio = (k: keyof Aluno) => CAMPOS_OBRIGATORIOS_HISTORICO.some(c => c.campo === k);
  const faltando = (k: keyof Aluno) => obrigatorio(k) && !v(k);

  async function salvar() {
    setSalvando(true); setCampos([]);
    try {
      await api.put(`/api/alunos/${aluno.id}`, { ...form, motivo });
      toast.ok('Dados salvos e registrados na auditoria.'); setSujo(false); setMotivo(''); aoSalvar();
    } catch (err) { if (err instanceof ErroApi && err.campos.length) setCampos(err.campos); toast.erro(mensagemErro(err)); }
    finally { setSalvando(false); }
  }

  const so = !podeEditar;
  const rot = (k: keyof Aluno, r: string) => faltando(k) ? <>{r} <small style={{ color: 'var(--erro)' }}>· falta, bloqueia a emissão</small></> : obrigatorio(k) ? <>{r} <small>· histórico</small></> : r;

  return (
    <Card semCorpo>
      <div className="card-corpo">
        <fieldset disabled={so || salvando} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div className="form-sec"><h3>Identificação</h3><div className="form-grade g3">
            <CampoTexto className="col-2" rotulo={rot('nome', 'Nome completo')} name="nome" value={v('nome')} onChange={def('nome')} erros={campos} />
            <CampoTexto rotulo="Nome social" name="nome_social" value={v('nome_social')} onChange={def('nome_social')} erros={campos} />
            <CampoTexto rotulo={rot('data_nascimento', 'Data de nascimento')} name="data_nascimento" type="date" value={v('data_nascimento')} onChange={def('data_nascimento')} erros={campos} className={faltando('data_nascimento') ? 'invalido' : ''} />
            <CampoSelect rotulo="Sexo" name="sexo" value={v('sexo')} onChange={def('sexo')} erros={campos}><option value="">—</option><option value="F">Feminino</option><option value="M">Masculino</option><option value="outro">Outro</option></CampoSelect>
            <CampoSelect rotulo="Situação" name="situacao" value={v('situacao') || 'ativo'} onChange={def('situacao')} erros={campos}>{(Object.keys(ROTULO_SITUACAO_ALUNO) as SituacaoAluno[]).map(s => <option key={s} value={s}>{ROTULO_SITUACAO_ALUNO[s]}</option>)}</CampoSelect>
          </div></div>
          <div className="form-sec"><h3>Naturalidade</h3><div className="form-grade g3">
            <CampoTexto rotulo={rot('municipio_nascimento', 'Município')} name="municipio_nascimento" value={v('municipio_nascimento')} onChange={def('municipio_nascimento')} erros={campos} className={faltando('municipio_nascimento') ? 'invalido' : ''} />
            <CampoTexto rotulo={rot('uf_nascimento', 'UF')} name="uf_nascimento" maxLength={2} value={v('uf_nascimento')} onChange={def('uf_nascimento')} erros={campos} className={faltando('uf_nascimento') ? 'invalido' : ''} />
            <CampoTexto rotulo={rot('nacionalidade', 'Nacionalidade')} name="nacionalidade" value={v('nacionalidade')} onChange={def('nacionalidade')} erros={campos} className={faltando('nacionalidade') ? 'invalido' : ''} />
            <CampoTexto rotulo="País" name="pais_nascimento" value={v('pais_nascimento')} onChange={def('pais_nascimento')} erros={campos} />
          </div></div>
          <div className="form-sec"><h3>Documentos</h3><p>O histórico imprime CIN/CPF na identificação e o RA só no certificado.</p><div className="form-grade g3">
            <CampoTexto rotulo={<>CPF <small>· histórico</small></>} name="cpf" formato="cpf" value={v('cpf')} onChange={def('cpf')} erros={campos} className={!v('cpf') && !v('cin') ? 'invalido' : ''} />
            <CampoTexto rotulo="CIN" name="cin" value={v('cin')} onChange={def('cin')} erros={campos} />
            <CampoTexto rotulo={<>RA <small>· certificado</small></>} name="ra" value={v('ra')} onChange={def('ra')} erros={campos} />
            <CampoTexto rotulo="RG" name="rg" value={v('rg')} onChange={def('rg')} erros={campos} />
            <CampoTexto rotulo="Órgão emissor" name="rg_orgao" value={v('rg_orgao')} onChange={def('rg_orgao')} erros={campos} />
            <CampoTexto rotulo="UF do RG" name="rg_uf" maxLength={2} value={v('rg_uf')} onChange={def('rg_uf')} erros={campos} />
            <CampoTexto rotulo="Certidão · tipo" name="certidao_tipo" value={v('certidao_tipo')} onChange={def('certidao_tipo')} erros={campos} />
            <CampoTexto rotulo="Termo" name="certidao_termo" value={v('certidao_termo')} onChange={def('certidao_termo')} erros={campos} />
            <CampoTexto rotulo="Livro / folha" name="certidao_livro" value={v('certidao_livro')} onChange={def('certidao_livro')} erros={campos} />
          </div></div>
          <div className="form-sec"><h3>Filiação</h3><div className="form-grade">
            <CampoTexto rotulo="Filiação 1" name="filiacao_1" value={v('filiacao_1')} onChange={def('filiacao_1')} erros={campos} />
            <CampoTexto rotulo="Filiação 2" name="filiacao_2" value={v('filiacao_2')} onChange={def('filiacao_2')} erros={campos} />
          </div></div>
          {!so ? <div className="form-sec"><h3>Registro da alteração</h3><div className="form-grade">
            <CampoTexto className="col-2" rotulo={<>Motivo <small>— opcional, fica na auditoria</small></>} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="ex.: correção de grafia conforme certidão" />
          </div></div> : null}
        </fieldset>
        <p className="cel-sub" style={{ marginTop: 8 }}>Origem: {ROTULO_ORIGEM[aluno.origem]}{aluno.sincronizado_em ? ` · sincronizado em ${fmtDataHora(aluno.sincronizado_em)}` : ''}{aluno.editado ? ` · editado por ${aluno.editado_por} em ${fmtDataHora(aluno.editado_em)}` : ''}</p>
      </div>
      {!so ? <div className="barra-fixa">
        <span className="estado">{sujo ? 'Alterações não salvas' : ''}</span>
        <Botao onClick={() => { setForm(aluno); setSujo(false); }} disabled={!sujo}>Descartar</Botao>
        <Botao variante="primario" carregando={salvando} disabled={!sujo} onClick={salvar} icone="check">Salvar</Botao>
      </div> : null}
    </Card>
  );
}

/* ================= TRAJETÓRIA ================= */
function AbaTrajetoria({ aluno, matriculas, podeEditar, aoMudar, aoVerNotas }: { aluno: Aluno; matriculas: MatriculaDetalhe[]; podeEditar: boolean; aoMudar: () => void; aoVerNotas: (m: MatriculaDetalhe) => void }) {
  const toast = useToast();
  const cadastros = useRecurso<{ cursos: Curso[]; series: Serie[] }>('/api/cadastros/cursos');
  const escolas = useRecurso<EstabelecimentoExterno[]>('/api/cadastros/estabelecimentos');
  const [novo, setNovo] = useState<{ ano: string; serie_id: string; estabelecimento_externo_id: string; turma: string; situacao_final: SituacaoMatricula; carga_horaria_total: string; observacao: string } | null>(null);
  const [edit, setEdit] = useState<{ id: string; rotulo: string; situacao_final: SituacaoMatricula; turma: string; data_saida: string; observacao: string; motivo: string } | null>(null);
  const [campos, setCampos] = useState<CampoInvalido[]>([]);
  const [salvando, setSalvando] = useState(false);

  async function executar(fn: () => Promise<unknown>, ok: string, fechar: () => void) {
    setSalvando(true); setCampos([]);
    try { await fn(); toast.ok(ok); fechar(); aoMudar(); }
    catch (err) { if (err instanceof ErroApi && err.campos.length) setCampos(err.campos); toast.erro(mensagemErro(err)); }
    finally { setSalvando(false); }
  }

  const series = (cadastros.dados?.series || []).filter(s => s.ativo).sort((a, b) => a.ordem - b.ordem);
  const cursoDe = (s: Serie) => cadastros.dados?.cursos.find(c => c.id === s.curso_id)?.nome || '';

  return (
    <div className="pilha">
      {matriculas.length === 0 ? <Card semCorpo><EstadoVazio icone="calendario" titulo="Sem anos letivos" descricao="A trajetória vem da importação. Anos cursados em outra escola são lançados aqui." /></Card> : null}
      {[...matriculas].reverse().map(m => (
        <Card key={m.id} className={m.estabelecimento_externo_id ? 'externo' : ''} semCorpo
          titulo={<span className="linha-h">{m.ano_letivo.ano} · {m.serie.nome}{m.turma ? ` ${m.turma}` : ''} {m.estabelecimento_externo_id ? <Tag tipo="info">outra escola</Tag> : null}</span>}
          descricao={`${m.curso.nome} · ${m.estabelecimento ? `${m.estabelecimento.nome} — ${[m.estabelecimento.municipio, m.estabelecimento.uf].filter(Boolean).join('/')}` : 'Colégio São Marcos'}`}
          acoes={<>
            <Tag tipo={m.situacao_final === 'aprovado' || m.situacao_final === 'aprovado_conselho' ? 'ok' : m.situacao_final === 'reprovado' ? 'erro' : m.situacao_final === 'em_curso' ? 'info' : 'neutro'} ponto>{ROTULO_SITUACAO_MATRICULA[m.situacao_final]}</Tag>
            {podeEditar ? <Botao pequeno onClick={() => { setEdit({ id: m.id, rotulo: `${m.ano_letivo.ano} · ${m.serie.nome}`, situacao_final: m.situacao_final, turma: m.turma || '', data_saida: m.data_saida || '', observacao: m.observacao || '', motivo: '' }); setCampos([]); }}>Editar</Botao> : null}
            <Botao pequeno variante="primario" onClick={() => aoVerNotas(m)}>Notas</Botao>
          </>}>
          <div className="card-corpo" style={{ paddingTop: 12, display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12.5 }}>
            <div><div className="dv-rot cel-sub">Currículo</div>{m.versao ? <b>{m.versao.nome}</b> : m.estabelecimento_externo_id ? <span className="cel-sub">não se aplica</span> : <Tag tipo="erro">sem currículo para o período</Tag>}</div>
            <div><div className="dv-rot cel-sub">Notas</div><b>{m.total_notas}{m.total_itens ? ` de ${m.total_itens}` : ''}</b>{m.notas_editadas ? <span className="cel-sub"> · {m.notas_editadas} editada(s)</span> : null}</div>
            <div><div className="dv-rot cel-sub">Carga horária</div><b>{m.carga_horaria_total ?? '—'}</b></div>
            <div><div className="dv-rot cel-sub">Origem</div><b>{ROTULO_ORIGEM[m.origem]}</b></div>
            {m.observacao ? <div style={{ flex: '1 1 100%' }}><div className="dv-rot cel-sub">Observação</div>{m.observacao}</div> : null}
          </div>
        </Card>
      ))}
      {podeEditar ? <div><Botao icone="mais" onClick={() => { setNovo({ ano: String((matriculas[0]?.ano_letivo.ano || new Date().getFullYear()) - 1), serie_id: '', estabelecimento_externo_id: '', turma: '', situacao_final: 'aprovado', carga_horaria_total: '', observacao: '' }); setCampos([]); }}>Adicionar ano cursado em outra escola</Botao></div> : null}

      <Modal aberto={!!novo} titulo="Ano cursado em outra escola" descricao={`Entra na tabela de estabelecimentos do histórico de ${aluno.nome.split(' ')[0]}. As notas desse ano são lançadas à mão na aba Notas.`} aoFechar={() => setNovo(null)}
        rodape={<><Botao onClick={() => setNovo(null)}>Cancelar</Botao><Botao variante="primario" carregando={salvando} icone="check" onClick={() => novo && executar(() => api.post(`/api/alunos/${aluno.id}/matriculas`, novo), 'Ano adicionado à trajetória.', () => setNovo(null))}>Adicionar</Botao></>}>
        {novo ? <div className="form-grade">
          <CampoTexto rotulo="Ano letivo" name="ano" type="number" inputMode="numeric" value={novo.ano} onChange={e => setNovo(n => n && ({ ...n, ano: e.target.value }))} erros={campos} obrigatorio autoFocus />
          <CampoSelect rotulo="Série" name="serie_id" value={novo.serie_id} onChange={e => setNovo(n => n && ({ ...n, serie_id: e.target.value }))} erros={campos} obrigatorio>
            <option value="">Selecione</option>{series.map(s => <option key={s.id} value={s.id}>{s.nome} — {cursoDe(s)}</option>)}
          </CampoSelect>
          <CampoSelect className="col-2" rotulo="Estabelecimento" name="estabelecimento_externo_id" value={novo.estabelecimento_externo_id} onChange={e => setNovo(n => n && ({ ...n, estabelecimento_externo_id: e.target.value }))} erros={campos} dica={<>Não está na lista? Cadastre em <Link to="/app/config/estabelecimentos">Outras escolas</Link>.</>}>
            <option value="">Colégio São Marcos (este colégio)</option>
            {(escolas.dados || []).filter(e => e.ativo).map(e => <option key={e.id} value={e.id}>{e.nome}{e.municipio ? ` — ${e.municipio}/${e.uf || ''}` : ''}</option>)}
          </CampoSelect>
          <CampoSelect rotulo="Situação final" name="situacao_final" value={novo.situacao_final} onChange={e => setNovo(n => n && ({ ...n, situacao_final: e.target.value as SituacaoMatricula }))} erros={campos}>{(Object.keys(ROTULO_SITUACAO_MATRICULA) as SituacaoMatricula[]).map(s => <option key={s} value={s}>{ROTULO_SITUACAO_MATRICULA[s]}</option>)}</CampoSelect>
          <CampoTexto rotulo="Carga horária total" name="carga_horaria_total" type="number" inputMode="numeric" value={novo.carga_horaria_total} onChange={e => setNovo(n => n && ({ ...n, carga_horaria_total: e.target.value }))} erros={campos} />
          <CampoArea className="col-2" rotulo="Observação" name="observacao" rows={2} value={novo.observacao} onChange={e => setNovo(n => n && ({ ...n, observacao: e.target.value }))} erros={campos} />
        </div> : null}
      </Modal>

      <Modal aberto={!!edit} titulo={`Editar ${edit?.rotulo || ''}`} aoFechar={() => setEdit(null)} tamanho="sm"
        rodape={<><Botao onClick={() => setEdit(null)}>Cancelar</Botao><Botao variante="primario" carregando={salvando} icone="check" onClick={() => edit && executar(() => api.put(`/api/alunos/matriculas/${edit.id}`, { situacao_final: edit.situacao_final, turma: edit.turma, data_saida: edit.data_saida, observacao: edit.observacao, motivo: edit.motivo }), 'Matrícula atualizada.', () => setEdit(null))}>Salvar</Botao></>}>
        {edit ? <div className="form-grade">
          <CampoSelect rotulo="Situação final" name="situacao_final" value={edit.situacao_final} onChange={e => setEdit(x => x && ({ ...x, situacao_final: e.target.value as SituacaoMatricula }))} erros={campos}>{(Object.keys(ROTULO_SITUACAO_MATRICULA) as SituacaoMatricula[]).map(s => <option key={s} value={s}>{ROTULO_SITUACAO_MATRICULA[s]}</option>)}</CampoSelect>
          <CampoTexto rotulo="Turma" name="turma" value={edit.turma} onChange={e => setEdit(x => x && ({ ...x, turma: e.target.value }))} erros={campos} />
          <CampoTexto rotulo="Data de saída" name="data_saida" type="date" value={edit.data_saida} onChange={e => setEdit(x => x && ({ ...x, data_saida: e.target.value }))} erros={campos} />
          <CampoTexto rotulo="Motivo" value={edit.motivo} onChange={e => setEdit(x => x && ({ ...x, motivo: e.target.value }))} placeholder="fica na auditoria" />
          <CampoArea className="col-2" rotulo="Observação" name="observacao" rows={2} value={edit.observacao} onChange={e => setEdit(x => x && ({ ...x, observacao: e.target.value }))} erros={campos} />
        </div> : null}
      </Modal>
    </div>
  );
}

/* ================= HISTÓRICOS ================= */
const COR_STATUS_DOC: Record<StatusHistorico, 'ok' | 'aviso' | 'info' | 'erro'> = {
  rascunho: 'aviso', conferido: 'info', emitido: 'ok', cancelado: 'erro'
};

function AbaHistoricos({ aluno, podeEditar }: { aluno: Aluno; podeEditar: boolean }) {
  const { dados, carregando } = useRecurso<HistoricoLista[]>(`/api/historicos?aluno_id=${aluno.id}`);
  if (carregando && !dados) return <Card semCorpo><Carregando /></Card>;
  return (
    <Card semCorpo titulo="Documentos deste aluno" descricao="Rascunhos, emitidos e 2ª via"
      acoes={podeEditar ? <BotaoLink to={`/app/alunos/${aluno.id}/historico/novo`} variante="primario" pequeno icone="documento">Gerar histórico</BotaoLink> : undefined}>
      <Tabela<HistoricoLista>
        linhas={dados || []}
        chave={h => h.id}
        vazio={<EstadoVazio icone="documento" titulo="Nenhum histórico gerado"
          descricao="O assistente monta a grade a partir da trajetória e das notas, mostra o documento como ele vai sair e só então emite."
          acoes={podeEditar ? <BotaoLink to={`/app/alunos/${aluno.id}/historico/novo`} variante="primario" icone="documento">Gerar histórico</BotaoLink> : undefined} />}
        colunas={[
          { chave: 'tipo', rotulo: 'Documento', principal: true, render: h => <>
            <Link className="nome-cel" to={`/app/historicos/${h.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{ROTULO_TIPO_HISTORICO[h.tipo]}</Link>
            <span className="sub">{h.curso?.nome}{h.via > 1 ? ` · ${h.via}ª via` : ''} · criado {fmtDataHora(h.criado_em)}</span>
          </> },
          { chave: 'registro', rotulo: 'Registro', render: h => h.numero_registro != null ? <b>{h.numero_registro}/{h.ano_registro}</b> : <span className="cel-sub">—</span> },
          { chave: 'status', rotulo: 'Status', render: h => <Tag tipo={COR_STATUS_DOC[h.status]} ponto>{ROTULO_STATUS_HISTORICO[h.status]}</Tag> },
          { chave: 'quando', rotulo: 'Emitido em', render: h => h.emitido_em ? fmtData(h.emitido_em) : <span className="cel-sub">—</span> },
          { chave: 'a', rotulo: 'Ações', acoes: true, render: h => <Link className="btn btn-sm" to={`/app/historicos/${h.id}`}>Abrir</Link> }
        ]}
      />
    </Card>
  );
}

/* ================= NOTAS ================= */
function AbaNotas({ alunoId, matriculas, podeEditar, aoMudar }: { alunoId: string; matriculas: MatriculaDetalhe[]; podeEditar: boolean; aoMudar: () => void }) {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const escolhida = params.get('matricula') || [...matriculas].reverse()[0]?.id || '';
  const { dados: g, carregando, erro, recarregar } = useRecurso<GradeNotas>(escolhida ? `/api/alunos/matriculas/${escolhida}/grade` : null);
  const [edit, setEdit] = useState<{ itemId: string; nome: string; valor: string; conceito: string; faltas: string; situacao: SituacaoNota; motivo: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [verAuditoria, setVerAuditoria] = useState(false);

  const conceito = g?.sistema?.tipo === 'conceito';
  const fmtNota = (n: number | null | undefined) => n == null ? '—' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  async function salvarNota() {
    if (!edit) return;
    setSalvando(true);
    try {
      await api.put(`/api/alunos/matriculas/${escolhida}/notas/${edit.itemId}`, { valor: conceito ? null : edit.valor, conceito: conceito ? edit.conceito : null, faltas: edit.faltas, situacao: edit.situacao, motivo: edit.motivo });
      toast.ok('Nota salva e registrada na auditoria.'); setEdit(null); recarregar(); aoMudar();
    } catch (err) { toast.erro(mensagemErro(err)); }
    finally { setSalvando(false); }
  }

  const linhasGrade = useMemo(() => g ? g.blocos.flatMap(b => b.agrupamentos.flatMap((ag, ai) => ag.itens.map((it, ii) => ({ b, ag, it, primeiroDoBloco: ai === 0 && ii === 0, primeiroDoAgrup: ii === 0, itensBloco: b.agrupamentos.reduce((n, a) => n + a.itens.length, 0), itensAgrup: ag.itens.length })))) : [], [g]);

  if (!matriculas.length) return <Card semCorpo><EstadoVazio icone="grade" titulo="Sem matrícula" descricao="Adicione um ano na trajetória para lançar notas." /></Card>;

  return (
    <div className="pilha">
      <div className="filtros">
        <label className="f-campo">Ano letivo / série: <select value={escolhida} onChange={e => { const p = new URLSearchParams(params); p.set('matricula', e.target.value); setParams(p); }} aria-label="Matrícula">
          {[...matriculas].reverse().map(m => <option key={m.id} value={m.id}>{m.ano_letivo.ano} · {m.serie.nome}{m.turma ? ` ${m.turma}` : ''}{m.estabelecimento_externo_id ? ' · outra escola' : ''}</option>)}
        </select></label>
        {g ? <>
          <div className="f-campo">Curso: <b>{g.matricula.curso.nome}</b></div>
          {g.sistema ? <div className="f-campo">Sistema: <b>{g.sistema.tipo === 'conceito' ? 'Conceito' : g.sistema.tipo === 'nota_0_100' ? 'Nota 0–100' : 'Nota 0–10'}{g.sistema.media_aprovacao != null ? ` · média ${String(g.sistema.media_aprovacao).replace('.', ',')}` : ''}{g.sistema.frequencia_minima != null ? ` · frequência ${g.sistema.frequencia_minima}%` : ''}</b></div> : null}
          <div className="f-campo">Currículo: <b>{g.versao?.nome || 'não cadastrado'}</b></div>
        </> : null}
      </div>
      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}
      {carregando && !g ? <Carregando /> : null}
      {g && !g.versao ? <Aviso tipo="erro"><b>Sem currículo para este período.</b> A grade não tem linhas porque não há versão curricular vigente para {g.matricula.ano_letivo.ano} / {g.matricula.serie.nome}. Cadastre a vigência em <Link to="/app/config/curriculos">Currículos</Link>. Até lá a emissão fica bloqueada (RF-VER-11).</Aviso> : null}
      {g && g.versao ? (
        <Card semCorpo titulo={`Notas finais — ${g.matricula.serie.nome} · ${g.matricula.ano_letivo.ano}`} descricao="As linhas vêm da versão curricular congelada nesta matrícula. Clique numa célula para editar — toda alteração pede motivo e fica registrada."
          acoes={<Botao pequeno icone="relogio" onClick={() => setVerAuditoria(true)}>Histórico de alterações</Botao>}
          rodape={<>
            <span>{g.resumo.com_nota} de {g.resumo.total_itens} componentes com nota</span>
            {g.totais ? <span>Totais do ano: <b>{g.totais.total_aulas_anuais ?? '—'} aulas</b> / <b>{g.totais.total_horas_anuais ?? '—'} h</b></span> : null}
            {g.resumo.ultima_sincronizacao ? <span>Importado em {fmtDataHora(g.resumo.ultima_sincronizacao)}</span> : null}
            {g.resumo.editadas ? <span className="legenda"><Icone nome="editar" style={{ width: 12, height: 12, color: 'var(--edit)' }} /> {g.resumo.editadas} célula(s) editada(s) à mão</span> : null}
            {g.resumo.sem_nota ? <span className="legenda"><Icone nome="alerta" style={{ width: 12, height: 12, color: 'var(--aviso)' }} /> {g.resumo.sem_nota} sem nota — bloqueia a emissão</span> : null}
          </>}>
          <div className="tab-box"><table className="grade-notas">
            <thead><tr><th>Bloco</th><th>Agrupamento</th><th>Componente curricular</th><th className="num">{conceito ? 'Conceito' : 'Nota'}</th><th className="num">Faltas</th><th>Situação</th><th>Origem</th></tr></thead>
            <tbody>
              {linhasGrade.map(({ b, ag, it, primeiroDoBloco, primeiroDoAgrup, itensBloco, itensAgrup }) => {
                const n = it.nota;
                const semNota = !n || (n.valor == null && !n.conceito);
                return (
                  <tr key={it.id} style={n?.editado ? { background: 'var(--edit-bg)' } : semNota ? { background: 'var(--aviso-bg)' } : undefined}>
                    {primeiroDoBloco ? <td rowSpan={itensBloco} style={{ fontSize: 11, color: 'var(--texto-2)', fontWeight: 600, verticalAlign: 'top' }}>{b.nome}</td> : null}
                    {primeiroDoAgrup ? <td rowSpan={itensAgrup} className="cel-sub" style={{ verticalAlign: 'top' }}>{ag.nome}</td> : null}
                    <td className="nome-cel">{it.nome_impresso}</td>
                    <td className="num">
                      <button type="button" className="cel-nota" disabled={!podeEditar} title={podeEditar ? 'Editar' : undefined}
                        onClick={() => setEdit({ itemId: it.id, nome: it.nome_impresso, valor: n?.valor != null ? String(n.valor).replace('.', ',') : '', conceito: n?.conceito || '', faltas: n?.faltas != null ? String(n.faltas) : '', situacao: n?.situacao || 'aprovado', motivo: '' })}
                        style={{ display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end', width: '100%', cursor: podeEditar ? 'pointer' : 'default', font: 'inherit' }}>
                        <b>{conceito ? (n?.conceito || '—') : fmtNota(n?.valor)}</b>
                        {n?.editado ? <Icone nome="editar" style={{ width: 13, height: 13, color: 'var(--edit)' }} /> : semNota ? <Icone nome="alerta" style={{ width: 13, height: 13, color: 'var(--aviso)' }} /> : null}
                      </button>
                    </td>
                    <td className="num">{n?.faltas ?? '—'}</td>
                    <td>{n ? <Tag tipo={n.situacao === 'aprovado' ? 'ok' : n.situacao === 'reprovado' ? 'erro' : n.situacao === 'sem_registro' ? 'aviso' : 'neutro'} ponto>{ROTULO_SITUACAO_NOTA[n.situacao]}</Tag> : <Tag tipo="aviso" ponto>Sem registro</Tag>}</td>
                    <td>{n ? (n.editado ? <Tag tipo="edit">Editado</Tag> : <Tag>{ROTULO_ORIGEM[n.origem]}</Tag>) : <span className="cel-sub">—</span>}</td>
                  </tr>
                );
              })}
              {!linhasGrade.length ? <tr><td colSpan={7} className="cel-sub">A versão curricular não tem itens para esta série.</td></tr> : null}
            </tbody>
          </table></div>
        </Card>
      ) : null}

      <Modal aberto={!!edit} titulo={`Editar nota — ${edit?.nome || ''}`} descricao="A alteração é registrada com autor, data, valor anterior e motivo (RF-ALU-05)." aoFechar={() => setEdit(null)} tamanho="sm"
        rodape={<><Botao onClick={() => setEdit(null)}>Cancelar</Botao><Botao variante="primario" carregando={salvando} icone="check" onClick={salvarNota} disabled={!edit || edit.motivo.trim().length < 5}>Salvar</Botao></>}>
        {edit ? <div className="form-grade">
          {conceito ? (
            <CampoSelect rotulo="Conceito" value={edit.conceito} onChange={e => setEdit(x => x && ({ ...x, conceito: e.target.value }))} autoFocus>
              <option value="">—</option>{(g?.sistema?.escala_conceitos || []).map(c => <option key={c.conceito} value={c.conceito}>{c.conceito} — {c.descricao}</option>)}
            </CampoSelect>
          ) : (
            <CampoTexto rotulo="Nota final" inputMode="decimal" value={edit.valor} onChange={e => setEdit(x => x && ({ ...x, valor: e.target.value }))} placeholder="ex.: 7,5" autoFocus />
          )}
          <CampoTexto rotulo="Faltas" type="number" inputMode="numeric" min={0} value={edit.faltas} onChange={e => setEdit(x => x && ({ ...x, faltas: e.target.value }))} />
          <CampoSelect className="col-2" rotulo="Situação" value={edit.situacao} onChange={e => setEdit(x => x && ({ ...x, situacao: e.target.value as SituacaoNota }))}>{(Object.keys(ROTULO_SITUACAO_NOTA) as SituacaoNota[]).map(s => <option key={s} value={s}>{ROTULO_SITUACAO_NOTA[s]}</option>)}</CampoSelect>
          <CampoArea className="col-2" rotulo="Motivo" rows={2} value={edit.motivo} onChange={e => setEdit(x => x && ({ ...x, motivo: e.target.value }))} placeholder="ex.: correção conforme ata do conselho de classe nº 12/2026" obrigatorio dica="Mínimo de 5 caracteres." />
        </div> : null}
      </Modal>

      <ModalAuditoria aberto={verAuditoria} alunoId={alunoId} aoFechar={() => setVerAuditoria(false)} />
    </div>
  );
}

function ModalAuditoria({ aberto, alunoId, aoFechar }: { aberto: boolean; alunoId: string; aoFechar: () => void }) {
  const { dados, carregando } = useRecurso<Auditoria[]>(aberto ? `/api/alunos/${alunoId}/auditoria` : null);
  const fmt = (v: Record<string, unknown> | null) => v ? Object.entries(v).map(([k, x]) => `${k}: ${x == null ? '—' : String(x)}`).join(' · ') : '—';
  return (
    <Modal aberto={aberto} titulo="Histórico de alterações" descricao="Tudo que foi editado à mão, importado ou resolvido neste aluno." aoFechar={aoFechar} tamanho="lg">
      {carregando && !dados ? <Carregando /> : !dados?.length ? <EstadoVazio icone="relogio" titulo="Nenhuma alteração registrada" /> : (
        <div className="tab-box"><table className="responsiva">
          <thead><tr><th>Quando</th><th>Ação</th><th>O quê</th><th>De → para</th><th>Motivo</th><th>Por</th></tr></thead>
          <tbody>{dados.map(a => (
            <tr key={a.id}>
              <td data-rotulo="Quando" className="cel-sub">{fmtDataHora(a.criado_em)}</td>
              <td data-rotulo="Ação"><Tag tipo={a.acao === 'editar' ? 'edit' : a.acao === 'importar' ? 'info' : 'neutro'}>{a.acao}</Tag></td>
              <td data-rotulo="O quê">{a.entidade}{a.campo ? ` · ${a.campo}` : ''}</td>
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

export { fmtData };
