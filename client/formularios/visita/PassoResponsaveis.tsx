import { isFullName, isValidPhone, maskPhoneAuto, toTitleCase } from '../comum/validadores';

export interface ResponsavelForm { nome: string; whatsapp: string; profissao: string }

export function validarPassoResponsaveis(pai: ResponsavelForm, mae: ResponsavelForm): { chaves: Set<string>; nenhumPreenchido: boolean } {
  const chaves = new Set<string>();
  const paiPreenchido = !!(pai.nome.trim() || pai.whatsapp.trim() || pai.profissao.trim());
  const maePreenchido = !!(mae.nome.trim() || mae.whatsapp.trim() || mae.profissao.trim());

  if (!paiPreenchido && !maePreenchido) {
    return { chaves, nenhumPreenchido: true };
  }

  if (paiPreenchido) {
    if (!isFullName(pai.nome)) chaves.add('pai-nome');
    if (!isValidPhone(pai.whatsapp)) chaves.add('pai-whatsapp');
    if (!pai.profissao.trim()) chaves.add('pai-profissao');
  }
  if (maePreenchido) {
    if (!isFullName(mae.nome)) chaves.add('mae-nome');
    if (!isValidPhone(mae.whatsapp)) chaves.add('mae-whatsapp');
    if (!mae.profissao.trim()) chaves.add('mae-profissao');
  }
  return { chaves, nenhumPreenchido: false };
}

function BlocoResponsavel({ titulo, prefixo, valor, setValor, erros }: {
  titulo: string; prefixo: 'pai' | 'mae';
  valor: ResponsavelForm; setValor: (v: ResponsavelForm) => void;
  erros: Set<string>;
}) {
  return (
    <div className="student-block">
      <div className="student-block-header"><span>{titulo}</span></div>
      <div className={`field-group${erros.has(`${prefixo}-nome`) ? ' invalid' : ''}`}>
        <label>Nome completo</label>
        <input type="text" value={valor.nome} placeholder={`Nome completo do ${titulo.toLowerCase()}`}
          onChange={e => setValor({ ...valor, nome: e.target.value })}
          onBlur={e => setValor({ ...valor, nome: toTitleCase(e.target.value) })} />
        <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> Informe o nome completo (nome e sobrenome).</div>
      </div>
      <div className="field-row">
        <div className={`field-group${erros.has(`${prefixo}-whatsapp`) ? ' invalid' : ''}`}>
          <label>WhatsApp</label>
          <input type="tel" inputMode="tel" value={valor.whatsapp} placeholder="(11) 91234-5678 ou +1 234 567 8900"
            onChange={e => setValor({ ...valor, whatsapp: maskPhoneAuto(e.target.value) })} />
          <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> Informe um telefone válido (nacional ou internacional).</div>
        </div>
        <div className={`field-group${erros.has(`${prefixo}-profissao`) ? ' invalid' : ''}`}>
          <label>Profissão</label>
          <input type="text" value={valor.profissao} placeholder="Ex: Engenheiro" onChange={e => setValor({ ...valor, profissao: e.target.value })} />
          <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> Informe a profissão.</div>
        </div>
      </div>
    </div>
  );
}

export function PassoResponsaveis({ pai, setPai, mae, setMae, erros, nenhumPreenchido }: {
  pai: ResponsavelForm; setPai: (v: ResponsavelForm) => void;
  mae: ResponsavelForm; setMae: (v: ResponsavelForm) => void;
  erros: Set<string>; nenhumPreenchido: boolean;
}) {
  return (
    <>
      <BlocoResponsavel titulo="Responsável 1" prefixo="pai" valor={pai} setValor={setPai} erros={erros} />
      <BlocoResponsavel titulo="Responsável 2" prefixo="mae" valor={mae} setValor={setMae} erros={erros} />
      <div className="hint">Preencha ao menos um dos responsáveis com todos os dados solicitados.</div>
      {nenhumPreenchido && (
        <div className="error-banner">
          <i className="fa-solid fa-circle-exclamation"></i>
          Preencha ao menos os dados de um responsável (Responsável 1 ou Responsável 2).
        </div>
      )}
    </>
  );
}
