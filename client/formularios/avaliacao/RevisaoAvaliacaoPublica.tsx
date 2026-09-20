// Porta buildAvaliacaoReviewCards de public/js/review-renderer.js, usando
// agruparPorData/anexosUnicosDoGrupo (Tarefa 3) em vez da lógica de
// agrupamento inline do original. O anexo aqui é local (arquivo ainda não
// enviado): {nome, tipo, url} com url = URL.createObjectURL(...).

import { agruparPorData, anexosUnicosDoGrupo } from '@compartilhado/avaliacaoRevisao';
import type { AlunoForm, ProvaForm } from './tipos';
import type { AnexoPorData } from './tipos';

const SEGMENTO_LABELS: Record<string, string> = { lingua_materna: 'Língua materna', lingua_inglesa: 'Língua inglesa' };
const MOTIVO_LABELS: Record<string, string> = { medico: 'Atestado médico', outro: 'Outro motivo (pagamento de taxa)' };

function fmtDataOnly(value: string): string {
  if (!value) return '-';
  const [y, m, d] = value.split('-');
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

function AnexoPreview({ arquivo }: { arquivo: File | null }) {
  if (!arquivo) return <span className="review-item-value muted">Nenhum documento anexado.</span>;
  const url = URL.createObjectURL(arquivo);
  return (
    <>
      <div className="review-item-full">
        <span className="review-item-label">Arquivo enviado</span>
        <span className="review-item-value">{arquivo.name}</span>
      </div>
      {arquivo.type.startsWith('image/')
        ? <img src={url} alt="Documento anexado" style={{ display: 'block', maxWidth: '100%', maxHeight: 320, borderRadius: 8, margin: '10px auto 0' }} />
        : arquivo.type === 'application/pdf'
          ? <iframe src={url} title="Documento anexado (PDF)" style={{ width: '100%', height: 340, border: '1px solid var(--border-color, #e4e8ee)', borderRadius: 8, marginTop: 10 }} />
          : null}
    </>
  );
}

export function RevisaoAvaliacaoPublica({ alunos, anexosPorAlunoEData }: {
  alunos: AlunoForm[];
  anexosPorAlunoEData: Map<string, AnexoPorData[]>; // chave: aluno.id
}) {
  return (
    <>
      {alunos.map((aluno, alunoIdx) => {
        const grupos = agruparPorData(aluno.provas);
        const anexosDoAluno = anexosPorAlunoEData.get(aluno.id) || [];
        let contador = 0;

        return (
          <div key={aluno.id} className="review-card">
            <div className="review-card-header">
              <div className="review-card-icon"><i className="fa-solid fa-user-graduate"></i></div>
              <h3>Aluno {alunoIdx + 1}{aluno.nome ? ` — ${aluno.nome}` : ''}</h3>
              <button type="button" className="review-edit-btn" data-goto="1"><i className="fa-solid fa-pen"></i> Editar</button>
            </div>
            <div className="review-card-body">
              <div className="review-grid">
                <div className="review-item review-item-full"><span className="review-item-label">Nome completo</span><span className="review-item-value">{aluno.nome || '-'}</span></div>
                <div className="review-item"><span className="review-item-label">Turma</span><span className="review-item-value">{aluno.turma || '-'}</span></div>
              </div>

              {grupos.map((grupo, gi) => {
                const anexoDoGrupo = anexosDoAluno.find(a => a.data === grupo.data);
                const anexosUnicos = anexosUnicosDoGrupo<ProvaForm>(grupo.provas, () =>
                  anexoDoGrupo?.arquivoPreparado ? { nome: anexoDoGrupo.arquivoPreparado.name, tipo: anexoDoGrupo.arquivoPreparado.type } : null
                );
                const disciplinasGrupo = grupo.provas.map(p => p.disciplina).filter(Boolean).join(', ');
                const sufixo = (grupo.data ? ` — ${fmtDataOnly(grupo.data)}` : '') + (disciplinasGrupo ? ` (${disciplinasGrupo})` : '');

                return (
                  <div key={gi}>
                    {grupo.provas.map(prova => {
                      contador += 1;
                      return (
                        <div key={prova.id} className="review-student">
                          <div className="review-student-header"><i className="fa-solid fa-file-pen"></i> Avaliação {contador}</div>
                          <div className="review-grid">
                            <div className="review-item review-item-full"><span className="review-item-label">Disciplina</span><span className="review-item-value">{prova.disciplina || '-'}</span></div>
                            <div className="review-item"><span className="review-item-label">Segmento</span><span className="review-item-value">{prova.segmento ? SEGMENTO_LABELS[prova.segmento] : '-'}</span></div>
                            <div className="review-item"><span className="review-item-label">Data da avaliação perdida</span><span className="review-item-value">{prova.data ? fmtDataOnly(prova.data) : '-'}</span></div>
                            <div className="review-item"><span className="review-item-label">Motivo</span><span className="review-item-value">{prova.motivo ? MOTIVO_LABELS[prova.motivo] : '-'}</span></div>
                            <div className="review-item review-item-full"><span className="review-item-label">Observações</span><span className="review-item-value">{prova.observacoes || '-'}</span></div>
                          </div>
                        </div>
                      );
                    })}
                    <div className="review-item-full" style={{ marginTop: 8 }}>
                      <span className="review-item-label">Documento anexado{sufixo}</span>
                      {anexosUnicos.length
                        ? <AnexoPreview arquivo={anexoDoGrupo?.arquivoPreparado ?? null} />
                        : <AnexoPreview arquivo={null} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}
