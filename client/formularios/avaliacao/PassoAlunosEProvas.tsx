// Porta wizard-avaliacao.js inteiro (alunos dinâmicos, provas dinâmicas
// por aluno com limite de 3, pills de segmento/motivo, box do PIX, upload
// de anexo por grupo de data com preview e compressão). Estado 100%
// controlado, levantado pro AssistenteAvaliacao.

import { isFullName, toTitleCase, capFirst } from '../comum/validadores';
import { compressImageFile, validarAnexoArquivo } from './arquivo';
import type { AlunoForm, ProvaForm, AnexoPorData } from './tipos';

const MAX_PROVAS_POR_ALUNO = 3;
const TURMAS = [
  'Educação Infantil - Maternal', 'Educação Infantil - Jardim I', 'Educação Infantil - Jardim II',
  'Fundamental I - 1º ano', 'Fundamental I - 2º ano', 'Fundamental I - 3º ano', 'Fundamental I - 4º ano', 'Fundamental I - 5º ano',
  'Fundamental II - 6º ano', 'Fundamental II - 7º ano', 'Fundamental II - 8º ano', 'Fundamental II - 9º ano',
  'Ensino Médio - 1ª série', 'Ensino Médio - 2ª série', 'Ensino Médio - 3ª série'
];

export interface ErrosPassoAlunos {
  // chave: `${alunoId}:nome` | `${alunoId}:turma` | `${provaId}:disciplina` |
  // `${provaId}:data` | `${provaId}:segmento` | `${provaId}:motivo` |
  // `${alunoId}:anexo:${data}`
  chaves: Set<string>;
}

function novoId(): string {
  return crypto.randomUUID();
}

function gruposPorData(provas: ProvaForm[]): string[] {
  const datas = new Set<string>();
  provas.forEach(p => { if (p.data) datas.add(p.data); });
  return [...datas].sort();
}

export function novoAluno(): AlunoForm {
  return { id: novoId(), nome: '', turma: '', provas: [{ id: novoId(), disciplina: '', data: '', segmento: null, motivo: null, observacoes: '' }] };
}

export function validarPassoAlunos(alunos: AlunoForm[], anexos: Map<string, AnexoPorData[]>): Set<string> {
  const chaves = new Set<string>();
  alunos.forEach(aluno => {
    if (!isFullName(aluno.nome)) chaves.add(`${aluno.id}:nome`);
    if (!aluno.turma) chaves.add(`${aluno.id}:turma`);
    aluno.provas.forEach(prova => {
      if (!prova.disciplina.trim()) chaves.add(`${prova.id}:disciplina`);
      if (!prova.data) chaves.add(`${prova.id}:data`);
      if (!prova.segmento) chaves.add(`${prova.id}:segmento`);
      if (!prova.motivo) chaves.add(`${prova.id}:motivo`);
    });
    const datas = gruposPorData(aluno.provas);
    const anexosDoAluno = anexos.get(aluno.id) || [];
    datas.forEach((data, i) => {
      const obrigatorio = i === 0;
      const anexo = anexosDoAluno.find(a => a.data === data);
      const erro = validarAnexoArquivo(anexo?.arquivoOriginal ?? null, obrigatorio);
      if (erro) chaves.add(`${aluno.id}:anexo:${data}`);
    });
  });
  return chaves;
}

export function PassoAlunosEProvas({ alunos, setAlunos, anexos, setAnexos, erros }: {
  alunos: AlunoForm[];
  setAlunos: (fn: (atual: AlunoForm[]) => AlunoForm[]) => void;
  anexos: Map<string, AnexoPorData[]>;
  setAnexos: (fn: (atual: Map<string, AnexoPorData[]>) => Map<string, AnexoPorData[]>) => void;
  erros: Set<string>;
}) {
  function atualizarAluno(id: string, mudar: (a: AlunoForm) => AlunoForm) {
    setAlunos(atual => atual.map(a => a.id === id ? mudar(a) : a));
  }

  function atualizarProva(alunoId: string, provaId: string, mudar: (p: ProvaForm) => ProvaForm) {
    atualizarAluno(alunoId, a => ({ ...a, provas: a.provas.map(p => p.id === provaId ? mudar(p) : p) }));
  }

  function removerAnexosOrfaos(alunoId: string, provasAtuais: ProvaForm[]) {
    const datasValidas = new Set(gruposPorData(provasAtuais));
    setAnexos(atual => {
      const copia = new Map(atual);
      const lista = (copia.get(alunoId) || []).filter(a => datasValidas.has(a.data));
      copia.set(alunoId, lista);
      return copia;
    });
  }

  async function selecionarAnexo(alunoId: string, data: string, file: File | null) {
    if (!file) {
      setAnexos(atual => {
        const copia = new Map(atual);
        copia.set(alunoId, (copia.get(alunoId) || []).filter(a => a.data !== data));
        return copia;
      });
      return;
    }
    setAnexos(atual => {
      const copia = new Map(atual);
      const lista = (copia.get(alunoId) || []).filter(a => a.data !== data);
      lista.push({ data, arquivoOriginal: file, arquivoPreparado: file });
      copia.set(alunoId, lista);
      return copia;
    });
    const preparado = await compressImageFile(file);
    setAnexos(atual => {
      const copia = new Map(atual);
      const lista = (copia.get(alunoId) || []).map(a => a.data === data ? { ...a, arquivoPreparado: preparado } : a);
      copia.set(alunoId, lista);
      return copia;
    });
  }

  return (
    <>
      {alunos.map((aluno, alunoIdx) => {
        const datas = gruposPorData(aluno.provas);
        const anexosDoAluno = anexos.get(aluno.id) || [];
        return (
          <div key={aluno.id} className="student-block aluno-block">
            <div className="student-block-header">
              <span>Aluno {alunoIdx + 1}</span>
              {alunos.length > 1 && (
                <button type="button" className="remove-student-btn remove-aluno-btn" onClick={() => setAlunos(atual => atual.filter(a => a.id !== aluno.id))}>
                  <i className="fa-solid fa-circle-minus"></i> Remover aluno
                </button>
              )}
            </div>

            <div className={`field-group${erros.has(`${aluno.id}:nome`) ? ' invalid' : ''}`}>
              <label>Nome completo do aluno</label>
              <input type="text" value={aluno.nome} placeholder="Nome completo do aluno"
                onChange={e => atualizarAluno(aluno.id, a => ({ ...a, nome: e.target.value }))}
                onBlur={e => atualizarAluno(aluno.id, a => ({ ...a, nome: toTitleCase(e.target.value) }))} />
              <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> Informe o nome completo (nome e sobrenome).</div>
            </div>

            <div className={`field-group${erros.has(`${aluno.id}:turma`) ? ' invalid' : ''}`}>
              <label>Turma</label>
              <select value={aluno.turma} onChange={e => atualizarAluno(aluno.id, a => ({ ...a, turma: e.target.value }))}>
                <option value="">Selecione</option>
                {TURMAS.map(t => <option key={t}>{t}</option>)}
              </select>
              <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> Selecione a turma do aluno.</div>
            </div>

            <div className="provas-container">
              {aluno.provas.map((prova, provaIdx) => (
                <div key={prova.id} className="prova-block">
                  <div className="prova-block-header">
                    <span>Avaliação {provaIdx + 1}</span>
                    {aluno.provas.length > 1 && (
                      <button type="button" className="remove-prova-btn" onClick={() => {
                        const provasNovas = aluno.provas.filter(p => p.id !== prova.id);
                        atualizarAluno(aluno.id, a => ({ ...a, provas: provasNovas }));
                        removerAnexosOrfaos(aluno.id, provasNovas);
                      }}>
                        <i className="fa-solid fa-circle-minus"></i> Remover
                      </button>
                    )}
                  </div>

                  <div className="field-row">
                    <div className={`field-group${erros.has(`${prova.id}:disciplina`) ? ' invalid' : ''}`}>
                      <label>Disciplina</label>
                      <input type="text" value={prova.disciplina} placeholder="Ex: Matemática"
                        onChange={e => atualizarProva(aluno.id, prova.id, p => ({ ...p, disciplina: e.target.value }))}
                        onBlur={e => atualizarProva(aluno.id, prova.id, p => ({ ...p, disciplina: toTitleCase(e.target.value) }))} />
                      <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> Informe a disciplina da avaliação.</div>
                    </div>
                    <div className={`field-group${erros.has(`${prova.id}:data`) ? ' invalid' : ''}`}>
                      <label>Data da avaliação perdida</label>
                      <input type="date" value={prova.data} onChange={e => {
                        const provasNovas = aluno.provas.map(p => p.id === prova.id ? { ...p, data: e.target.value } : p);
                        atualizarAluno(aluno.id, a => ({ ...a, provas: provasNovas }));
                        removerAnexosOrfaos(aluno.id, provasNovas);
                      }} />
                      <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> Informe a data da avaliação perdida.</div>
                    </div>
                  </div>

                  <div className={`field-group${erros.has(`${prova.id}:segmento`) ? ' invalid' : ''}`}>
                    <span className="field-legend">Segmento</span>
                    <div className="choice-group prova-segmento-choice">
                      {(['lingua_materna', 'lingua_inglesa'] as const).map(v => (
                        <button key={v} type="button" className={`choice-pill${prova.segmento === v ? ' selected' : ''}`}
                          onClick={() => atualizarProva(aluno.id, prova.id, p => ({ ...p, segmento: v }))}>
                          <span className="check">✓</span> {v === 'lingua_materna' ? 'Língua materna' : 'Língua inglesa'}
                        </button>
                      ))}
                    </div>
                    <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> Selecione o segmento desta avaliação.</div>
                  </div>

                  <div className={`field-group${erros.has(`${prova.id}:motivo`) ? ' invalid' : ''}`}>
                    <span className="field-legend">Motivo da ausência</span>
                    <div className="choice-group prova-motivo-choice">
                      {(['medico', 'outro'] as const).map(v => (
                        <button key={v} type="button" className={`choice-pill${prova.motivo === v ? ' selected' : ''}`}
                          onClick={() => atualizarProva(aluno.id, prova.id, p => ({ ...p, motivo: v }))}>
                          <span className="check">✓</span> {v === 'medico' ? 'Atestado médico' : 'Outro motivo'}
                        </button>
                      ))}
                    </div>
                    <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> Selecione o motivo da ausência.</div>
                  </div>

                  {prova.motivo === 'medico' && (
                    <div className="field-group">
                      <div className="hint">
                        <i className="fa-solid fa-circle-info"></i> O atestado médico referente a esta data é enviado uma vez só, na seção "Documentos anexados" no fim do bloco deste aluno — mesmo que haja mais de uma avaliação no mesmo dia.
                      </div>
                    </div>
                  )}

                  {prova.motivo === 'outro' && (
                    <div className="field-group">
                      <div className="pix-box">
                        <h4><i className="fa-solid fa-circle-info"></i> Taxa de aplicação da avaliação substitutiva</h4>
                        <p>Para avaliações perdidas por motivos não médicos, é cobrada uma taxa de <strong>R$ 50,00 por prova</strong>. Esse valor cobre o custo de disponibilizar um professor especificamente para elaborar e aplicar a avaliação substitutiva em um novo horário, fora da grade regular de aulas — um trabalho extra que garante que o aluno não perca o conteúdo avaliado. O pagamento é feito por prova, e a aplicação só é agendada após a confirmação do comprovante.</p>
                        <div className="pix-key-row">
                          <div>
                            <span className="pix-key-label">Chave PIX (aleatória)</span>
                            <span className="pix-key-value pix-key-value-copy">681b6f31-5916-4a70-be2c-a7b3f932e453</span>
                          </div>
                          <button type="button" className="btn btn-secondary btn-sm copy-pix-btn" onClick={(e) => {
                            const btn = e.currentTarget;
                            const original = btn.innerHTML;
                            navigator.clipboard.writeText('681b6f31-5916-4a70-be2c-a7b3f932e453')
                              .then(() => { btn.innerHTML = '<i class="fa-solid fa-check"></i> Copiado!'; })
                              .catch(() => { btn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Copie manualmente'; })
                              .finally(() => { setTimeout(() => { btn.innerHTML = original; }, 2200); });
                          }}>
                            <i className="fa-regular fa-copy"></i> Copiar chave
                          </button>
                        </div>
                      </div>
                      <div className="hint" style={{ marginTop: 14 }}>
                        <i className="fa-solid fa-circle-info"></i> O comprovante de pagamento referente a esta data é enviado uma vez só, na seção "Documentos anexados" no fim do bloco deste aluno — mesmo que haja mais de uma avaliação no mesmo dia.
                      </div>
                    </div>
                  )}

                  <div className="field-group">
                    <label>Observações <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(opcional)</span></label>
                    <textarea value={prova.observacoes} placeholder="Se quiser, deixe alguma observação adicional sobre esta avaliação"
                      onChange={e => atualizarProva(aluno.id, prova.id, p => ({ ...p, observacoes: e.target.value }))}
                      onBlur={e => atualizarProva(aluno.id, prova.id, p => ({ ...p, observacoes: capFirst(e.target.value) }))} />
                  </div>
                </div>
              ))}
            </div>

            {aluno.provas.length < MAX_PROVAS_POR_ALUNO ? (
              <button type="button" className="add-student-btn add-prova-btn"
                onClick={() => atualizarAluno(aluno.id, a => ({ ...a, provas: [...a.provas, { id: novoId(), disciplina: '', data: '', segmento: null, motivo: null, observacoes: '' }] }))}>
                + Adicionar avaliação perdida deste aluno
              </button>
            ) : (
              <div className="hint">
                <i className="fa-solid fa-circle-info"></i> Máximo de 3 avaliações por aluno neste requerimento. Se este aluno perdeu mais de 3 avaliações, envie um requerimento separado para as demais.
              </div>
            )}

            <div className="student-block-header" style={{ marginTop: 20 }}><span>Documentos anexados</span></div>
            <div className="anexo-groups-container">
              {datas.length === 0 ? (
                <div className="hint"><i className="fa-solid fa-circle-info"></i> Preencha a data de cada avaliação acima para liberar o envio do(s) documento(s).</div>
              ) : datas.map((data, i) => {
                const obrigatorio = i === 0;
                const anexo = anexosDoAluno.find(a => a.data === data);
                const disciplinas = aluno.provas.filter(p => p.data === data).map(p => p.disciplina).filter(Boolean).join(', ');
                return (
                  <div key={data} className={`field-group anexo-group${erros.has(`${aluno.id}:anexo:${data}`) ? ' invalid' : ''}`}>
                    <label className="anexo-group-label">Documento {i + 1} — {new Date(data + 'T00:00:00').toLocaleDateString('pt-BR')}{disciplinas ? ` (${disciplinas})` : ''}{obrigatorio ? '' : ' — opcional'}</label>
                    <div className="hint anexo-group-hint" style={{ marginBottom: 10 }}>
                      {obrigatorio
                        ? <><i className="fa-solid fa-circle-info"></i> Anexe o atestado médico ou o comprovante de pagamento referente às avaliações desta data.</>
                        : <><i className="fa-solid fa-circle-info"></i> Opcional — só é necessário se você também tiver um documento específico pra esta data.</>}
                    </div>
                    <input type="file" className="anexo-group-input" accept="image/*,application/pdf"
                      onChange={e => selecionarAnexo(aluno.id, data, e.target.files?.[0] ?? null)} />
                    <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> <span>{obrigatorio ? 'Anexe o documento desta data (imagem ou PDF, até 8MB).' : 'Tipo de arquivo não suportado ou arquivo muito grande (máximo de 8MB).'}</span></div>
                    {anexo?.arquivoOriginal && (
                      <div className="anexo-preview">
                        <div className="anexo-preview-name"><i className="fa-solid fa-paperclip"></i> {anexo.arquivoOriginal.name}</div>
                        {anexo.arquivoOriginal.type.startsWith('image/')
                          ? <img src={URL.createObjectURL(anexo.arquivoOriginal)} alt="Pré-visualização do anexo" />
                          : anexo.arquivoOriginal.type === 'application/pdf'
                            ? <iframe src={URL.createObjectURL(anexo.arquivoOriginal)} title="Pré-visualização do anexo (PDF)" />
                            : <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>Pré-visualização não disponível para este tipo de arquivo.</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <button type="button" className="add-student-btn" onClick={() => setAlunos(atual => [...atual, novoAluno()])}>
        + Adicionar mais um aluno
      </button>
    </>
  );
}
