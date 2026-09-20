import { isFullName, toTitleCase, capFirst } from '../comum/validadores';

export interface ExtrasForm {
  bairro: string; motivo: string;
  indicado: 'sim' | 'nao' | null; indicacaoNome: string; observacoes: string;
}

export function validarPassoComplementares(extras: ExtrasForm): Set<string> {
  const chaves = new Set<string>();
  if (!extras.indicado) chaves.add('indicado');
  if (extras.indicado === 'sim' && !isFullName(extras.indicacaoNome)) chaves.add('indicacao-nome');
  return chaves;
}

export function PassoComplementares({ extras, setExtras, erros }: {
  extras: ExtrasForm; setExtras: (v: ExtrasForm) => void; erros: Set<string>;
}) {
  return (
    <>
      <div className="field-group">
        <label>Bairro onde reside <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(opcional)</span></label>
        <input type="text" value={extras.bairro} placeholder="Ex: Centro, Jardim Universo..."
          onChange={e => setExtras({ ...extras, bairro: e.target.value })}
          onBlur={e => setExtras({ ...extras, bairro: toTitleCase(e.target.value) })} />
      </div>

      <div className="field-group">
        <label>Qual o principal motivo que o trouxe até o Colégio São Marcos? <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(opcional)</span></label>
        <textarea value={extras.motivo} placeholder="Conte um pouco sobre o que motivou a busca pelo colégio"
          onChange={e => setExtras({ ...extras, motivo: e.target.value })}
          onBlur={e => setExtras({ ...extras, motivo: capFirst(e.target.value) })} />
      </div>

      <div className={`field-group${erros.has('indicado') ? ' invalid' : ''}`}>
        <span className="field-legend">Foi indicado por alguém?</span>
        <div className="choice-group">
          {(['sim', 'nao'] as const).map(v => (
            <button key={v} type="button" className={`choice-pill${extras.indicado === v ? ' selected' : ''}`}
              onClick={() => setExtras({ ...extras, indicado: v, indicacaoNome: v === 'sim' ? extras.indicacaoNome : '' })}>
              <span className="check">✓</span> {v === 'sim' ? 'Sim' : 'Não'}
            </button>
          ))}
        </div>
        <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> Selecione uma opção.</div>
      </div>

      {extras.indicado === 'sim' && (
        <div className={`field-group${erros.has('indicacao-nome') ? ' invalid' : ''}`}>
          <label>Nome de quem indicou</label>
          <input type="text" value={extras.indicacaoNome} placeholder="Nome completo da pessoa que indicou"
            onChange={e => setExtras({ ...extras, indicacaoNome: e.target.value })}
            onBlur={e => setExtras({ ...extras, indicacaoNome: toTitleCase(e.target.value) })} />
          <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> Informe o nome completo (nome e sobrenome).</div>
        </div>
      )}

      <div className="field-group">
        <label>Observações <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(opcional)</span></label>
        <textarea value={extras.observacoes} placeholder="Se quiser, deixe alguma observação adicional"
          onChange={e => setExtras({ ...extras, observacoes: e.target.value })}
          onBlur={e => setExtras({ ...extras, observacoes: capFirst(e.target.value) })} />
      </div>
    </>
  );
}
