import { toTitleCase, toCityState } from '../comum/validadores';

export function PassoEscola({ nome, setNome, cidade, setCidade, erros }: {
  nome: string; setNome: (v: string) => void;
  cidade: string; setCidade: (v: string) => void;
  erros: Set<string>;
}) {
  return (
    <>
      <div className={`field-group${erros.has('escola-nome') ? ' invalid' : ''}`}>
        <label>Nome da escola</label>
        <input type="text" value={nome} placeholder="Ex: Colégio Exemplo" onChange={e => setNome(e.target.value)}
          onBlur={e => setNome(e.target.value.trim() ? toTitleCase(e.target.value) : e.target.value)} />
        <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> Informe o nome da escola.</div>
      </div>
      <div className={`field-group${erros.has('escola-cidade') ? ' invalid' : ''}`}>
        <label>Cidade / Estado</label>
        <input type="text" value={cidade} placeholder="Ex: São Paulo / SP" onChange={e => setCidade(e.target.value)}
          onBlur={e => setCidade(toCityState(e.target.value))} />
        <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> Informe a cidade e o estado.</div>
      </div>
    </>
  );
}
