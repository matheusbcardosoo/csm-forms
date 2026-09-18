// /app/config/cursos (RF-BASE-07, RF-BASE-01, RF-BASE-06): curso é o que
// nomeia o documento; cada curso tem suas séries e seu sistema de avaliação.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ErroApi, mensagemErro, type CampoInvalido } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { useSessao } from '@/hooks/useSessao';
import { useToast } from '@/hooks/useToast';
import { Aviso, Botao, Cabecalho, CampoArea, CampoCheck, CampoSelect, CampoTexto, Card, Carregando, EstadoVazio, Modal, Tag } from '@/componentes/ui';
import { Icone } from '@/componentes/Icones';
import { ROTULO_ETAPA, ROTULO_SISTEMA, type Curso, type EtapaEnsino, type Serie, type SistemaAvaliacao, type TipoSistemaAvaliacao } from '@shared/types/curriculo';

interface Resposta { cursos: Curso[]; series: Serie[]; sistemas: SistemaAvaliacao[] }

const NOVO_CURSO: Partial<Curso> = { etapa: 'em', nome: '', razao_aula_hora: 0.75, texto_promocao: '', ativo: true };

export function Cursos() {
  const { ehAdmin } = useSessao();
  const toast = useToast();
  const { dados, carregando, erro, recarregar } = useRecurso<Resposta>('/api/cadastros/cursos');
  const [curso, setCurso] = useState<Partial<Curso> | null>(null);
  const [serie, setSerie] = useState<(Partial<Serie> & { curso_id: string }) | null>(null);
  const [sistema, setSistema] = useState<(Partial<SistemaAvaliacao> & { curso_id: string; nomeCurso: string }) | null>(null);
  const [campos, setCampos] = useState<CampoInvalido[]>([]);
  const [salvando, setSalvando] = useState(false);

  async function executar(fn: () => Promise<unknown>, msg: string, fechar: () => void) {
    setSalvando(true); setCampos([]);
    try { await fn(); toast.ok(msg); fechar(); recarregar(); }
    catch (err) { if (err instanceof ErroApi && err.campos.length) setCampos(err.campos); toast.erro(mensagemErro(err)); }
    finally { setSalvando(false); }
  }

  const salvarCurso = () => curso && executar(
    () => curso.id ? api.put(`/api/cadastros/cursos/${curso.id}`, curso) : api.post('/api/cadastros/cursos', curso),
    'Curso salvo.', () => setCurso(null));

  const salvarSerie = () => serie && executar(
    () => serie.id ? api.put(`/api/cadastros/series/${serie.id}`, serie) : api.post(`/api/cadastros/cursos/${serie.curso_id}/series`, serie),
    'Série salva.', () => setSerie(null));

  const salvarSistema = () => sistema && executar(
    () => api.put(`/api/cadastros/cursos/${sistema.curso_id}/sistema-avaliacao`, sistema),
    'Sistema de avaliação salvo.', () => setSistema(null));

  const cursos = dados?.cursos || [];

  return (
    <div className="wrap">
      <Cabecalho titulo="Cursos e séries" descricao="O curso nomeia o documento: “Histórico Escolar - Ensino Médio Bilíngue”. Cada curso tem suas séries e seu critério de promoção."
        acoes={ehAdmin ? <Botao variante="primario" icone="mais" onClick={() => { setCurso({ ...NOVO_CURSO }); setCampos([]); }}>Novo curso</Botao> : undefined} />
      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}
      {carregando && !dados ? <Carregando /> : null}

      {dados && cursos.length === 0 ? (
        <Card semCorpo><EstadoVazio icone="livro" titulo="Nenhum curso cadastrado" descricao="Comece pelo curso atual, ex.: Ensino Médio Bilíngue (etapa Ensino Médio), e depois cadastre as séries." acoes={ehAdmin ? <Botao variante="primario" icone="mais" onClick={() => setCurso({ ...NOVO_CURSO })}>Novo curso</Botao> : undefined} /></Card>
      ) : null}

      <div className="pilha">
        {cursos.map(c => {
          const series = (dados?.series || []).filter(s => s.curso_id === c.id).sort((a, b) => a.ordem - b.ordem || a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));
          const sist = (dados?.sistemas || []).find(s => s.curso_id === c.id);
          return (
            <Card key={c.id} className={c.ativo ? '' : 'linha-inativa'} semCorpo
              titulo={<span className="linha-h">{c.nome} {c.ativo ? null : <Tag ponto>Inativo</Tag>}</span>}
              descricao={`${ROTULO_ETAPA[c.etapa]} · razão aula/hora ${String(c.razao_aula_hora).replace('.', ',')}${sist ? ` · ${ROTULO_SISTEMA[sist.tipo]}${sist.media_aprovacao != null ? ` · média ${String(sist.media_aprovacao).replace('.', ',')}` : ''}${sist.frequencia_minima != null ? ` · frequência ${sist.frequencia_minima}%` : ''}` : ' · sistema de avaliação não definido'}`}
              acoes={<>
                <Link className="btn btn-sm" to={`/app/config/curriculos?curso=${c.id}`}><Icone nome="grade" />Currículos</Link>
                {ehAdmin ? <>
                  <Botao pequeno onClick={() => { setSistema({ curso_id: c.id, nomeCurso: c.nome, tipo: 'nota_0_10', frequencia_minima: 75, ...(sist || {}) }); setCampos([]); }}>Avaliação</Botao>
                  <Botao pequeno onClick={() => { setCurso({ ...c }); setCampos([]); }} icone="editar">Editar</Botao>
                </> : null}
              </>}>
              <div className="card-corpo" style={{ paddingTop: 12 }}>
                <div className="linha-h">
                  {series.length === 0 ? <span className="cel-sub">Nenhuma série cadastrada.</span> : null}
                  {series.map(s => (
                    <button type="button" key={s.id} className={`chip-serie ${s.ativo ? '' : 'linha-inativa'}`} disabled={!ehAdmin} onClick={() => { setSerie({ ...s, curso_id: c.id }); setCampos([]); }} title={ehAdmin ? 'Editar série' : undefined}>
                      <b>{s.codigo}</b> {s.nome}
                    </button>
                  ))}
                  {ehAdmin ? <Botao pequeno variante="fantasma" icone="mais" onClick={() => { setSerie({ curso_id: c.id, codigo: String(series.length + 1), nome: '', ativo: true }); setCampos([]); }}>Série</Botao> : null}
                </div>
                {c.texto_promocao ? <p className="cel-sub" style={{ marginTop: 10, lineHeight: 1.5 }}><b>Critério de promoção:</b> {c.texto_promocao}</p> : null}
              </div>
            </Card>
          );
        })}
      </div>

      <div style={{ marginTop: 14 }}>
        <Aviso><b>Mudou o nome ou o número das séries</b> (1º grau → EF 8 séries → EF 9 anos)? É <b>curso novo</b>. Mudaram só os componentes (BNCC, Novo Ensino Médio)? É <b>versão nova</b> do currículo.</Aviso>
      </div>

      {/* ----- modal curso ----- */}
      <Modal aberto={!!curso} titulo={curso?.id ? 'Editar curso' : 'Novo curso'} aoFechar={() => setCurso(null)}
        rodape={<><Botao onClick={() => setCurso(null)}>Cancelar</Botao><Botao variante="primario" carregando={salvando} onClick={salvarCurso} icone="check">Salvar</Botao></>}>
        {curso ? (
          <div className="form-grade">
            <CampoTexto className="col-2" rotulo="Nome do curso" dica="Como sai no título: HISTÓRICO ESCOLAR - {NOME}" name="nome" placeholder="Ensino Médio Bilíngue" value={curso.nome || ''} onChange={e => setCurso(f => ({ ...f, nome: e.target.value }))} erros={campos} obrigatorio autoFocus />
            <CampoSelect rotulo="Etapa" name="etapa" value={curso.etapa || 'em'} onChange={e => setCurso(f => ({ ...f, etapa: e.target.value as EtapaEnsino }))} erros={campos}>
              {(Object.keys(ROTULO_ETAPA) as EtapaEnsino[]).map(e => <option key={e} value={e}>{ROTULO_ETAPA[e]}</option>)}
            </CampoSelect>
            <CampoTexto rotulo="Razão aula → hora" dica="0,75 = aula de 45 min (1760 aulas → 1320 h)" name="razao_aula_hora" inputMode="decimal" value={String(curso.razao_aula_hora ?? '').replace('.', ',')} onChange={e => setCurso(f => ({ ...f, razao_aula_hora: e.target.value as unknown as number }))} erros={campos} />
            <CampoArea className="col-2" rotulo={<>Critério de promoção do Regimento <small>— impresso em Observações</small></>} name="texto_promocao" rows={4} value={curso.texto_promocao || ''} onChange={e => setCurso(f => ({ ...f, texto_promocao: e.target.value }))} erros={campos}
              placeholder="Será considerado promovido o aluno que obtiver, nos diferentes conteúdos curriculares, os seguintes resultados: I – frequência igual ou superior a 75% com nota final mínima 6,0 (seis) inteiros no final do ano letivo." />
            <div className="col-2"><CampoCheck rotulo="Curso ativo" checked={curso.ativo !== false} onChange={e => setCurso(f => ({ ...f, ativo: e.target.checked }))} /></div>
          </div>
        ) : null}
      </Modal>

      {/* ----- modal série ----- */}
      <Modal aberto={!!serie} titulo={serie?.id ? 'Editar série' : 'Nova série'} aoFechar={() => setSerie(null)} tamanho="sm"
        rodape={<><Botao onClick={() => setSerie(null)}>Cancelar</Botao><Botao variante="primario" carregando={salvando} onClick={salvarSerie} icone="check">Salvar</Botao></>}>
        {serie ? (
          <div className="form-grade">
            <CampoTexto rotulo="Código" dica="Curto e estável: 1, 2, 3 / 6, 7…" name="codigo" value={serie.codigo || ''} onChange={e => setSerie(f => f && ({ ...f, codigo: e.target.value }))} erros={campos} obrigatorio autoFocus />
            <CampoTexto rotulo="Nome impresso" dica="Como sai na tabela de estabelecimentos" name="nome" placeholder="1ª série · 6º ano" value={serie.nome || ''} onChange={e => setSerie(f => f && ({ ...f, nome: e.target.value }))} erros={campos} obrigatorio />
            <CampoTexto rotulo="Ordem" name="ordem" type="number" inputMode="numeric" value={serie.ordem ?? ''} onChange={e => setSerie(f => f && ({ ...f, ordem: e.target.value as unknown as number }))} erros={campos} />
            <div><CampoCheck rotulo="Série ativa" checked={serie.ativo !== false} onChange={e => setSerie(f => f && ({ ...f, ativo: e.target.checked }))} /></div>
          </div>
        ) : null}
      </Modal>

      {/* ----- modal sistema de avaliação ----- */}
      <Modal aberto={!!sistema} titulo={`Sistema de avaliação — ${sistema?.nomeCurso || ''}`} descricao="Define como as notas deste curso são lidas e a legenda impressa no verso do histórico." aoFechar={() => setSistema(null)}
        rodape={<><Botao onClick={() => setSistema(null)}>Cancelar</Botao><Botao variante="primario" carregando={salvando} onClick={salvarSistema} icone="check">Salvar</Botao></>}>
        {sistema ? (
          <div className="form-grade">
            <CampoSelect rotulo="Tipo" name="tipo" value={sistema.tipo || 'nota_0_10'} onChange={e => setSistema(f => f && ({ ...f, tipo: e.target.value as TipoSistemaAvaliacao }))} erros={campos}>
              {(Object.keys(ROTULO_SISTEMA) as TipoSistemaAvaliacao[]).map(t => <option key={t} value={t}>{ROTULO_SISTEMA[t]}</option>)}
            </CampoSelect>
            <CampoTexto rotulo="Frequência mínima (%)" name="frequencia_minima" inputMode="decimal" value={sistema.frequencia_minima ?? ''} onChange={e => setSistema(f => f && ({ ...f, frequencia_minima: e.target.value as unknown as number }))} erros={campos} />
            {sistema.tipo !== 'conceito' ? (
              <CampoTexto rotulo="Média de aprovação" name="media_aprovacao" inputMode="decimal" value={sistema.media_aprovacao ?? ''} onChange={e => setSistema(f => f && ({ ...f, media_aprovacao: e.target.value as unknown as number }))} erros={campos} />
            ) : (
              <CampoArea className="col-2" rotulo={<>Escala de conceitos <small>— um por linha: CONCEITO = descrição</small></>} name="escala" rows={4}
                value={(sistema.escala_conceitos || []).map(c => `${c.conceito} = ${c.descricao}`).join('\n')}
                onChange={e => setSistema(f => f && ({ ...f, escala_conceitos: e.target.value.split('\n').filter(l => l.trim()).map(l => { const [c, ...d] = l.split('='); return { conceito: c.trim(), descricao: d.join('=').trim() }; }) }))}
                placeholder={'PS = Plenamente satisfatório\nS = Satisfatório\nNS = Não satisfatório'} />
            )}
            <CampoArea className="col-2" rotulo={<>Legenda impressa <small>— verso do documento</small></>} name="legenda" rows={3} value={sistema.legenda || ''} onChange={e => setSistema(f => f && ({ ...f, legenda: e.target.value }))} erros={campos} />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
