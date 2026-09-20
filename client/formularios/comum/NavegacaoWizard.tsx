// Porta o `<div class="wizard-nav">` + o botão "Próximo"/"Enviar" com
// spinner de `nextBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...'`.

export function NavegacaoWizard({ podeVoltar, aoVoltar, rotuloProximo, carregando, aoProximo }: {
  podeVoltar: boolean;
  aoVoltar: () => void;
  rotuloProximo: string;
  carregando: boolean;
  aoProximo: () => void;
}) {
  return (
    <div className="wizard-nav" id="wizard-nav">
      <button type="button" className="btn btn-secondary" id="back-btn" style={{ visibility: podeVoltar ? 'visible' : 'hidden' }} onClick={aoVoltar} disabled={carregando}>
        Voltar
      </button>
      <button type="button" className="btn btn-primary" id="next-btn" onClick={aoProximo} disabled={carregando}>
        {carregando ? <><i className="fa-solid fa-spinner fa-spin"></i> Enviando...</> : rotuloProximo}
      </button>
    </div>
  );
}
