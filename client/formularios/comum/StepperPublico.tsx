// Porta o HTML do `<div class="stepper">` / `updateProgress()` de
// wizard.js / wizard-avaliacao.js — casco visual compartilhado pelos
// wizards públicos (avaliação substitutiva, visita).

export interface PassoStepper { icone: string; nome: string }

export function StepperPublico({ passos, passoAtual, mostrarLabelPasso }: {
  passos: PassoStepper[];
  passoAtual: number;
  mostrarLabelPasso?: boolean;
}) {
  const totalPassos = passos.length;
  return (
    <>
      <div className="stepper" id="stepper" role="list" aria-label="Progresso do formulário">
        {passos.map((p, i) => {
          const n = i + 1;
          return (
            <div key={p.nome} style={{ display: 'contents' }}>
              <div className={`step-node${n < passoAtual ? ' completed' : ''}${n === passoAtual ? ' active' : ''}`} data-step={n} role="listitem">
                <div className="step-circle"><i className={`fa-solid ${p.icone}`}></i></div>
                <span className="step-name">{p.nome}</span>
              </div>
              {n < totalPassos && (
                <div className={`step-connector${passoAtual > n ? ' filled' : ''}`} data-connector={n}>
                  <span className="step-connector-fill"></span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {mostrarLabelPasso && <div className="wizard-step-label">Passo {Math.min(passoAtual, totalPassos)}/{totalPassos}</div>}
    </>
  );
}
