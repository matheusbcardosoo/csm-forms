// Porta o `<section data-step="success">`. O link "Voltar ao início"
// recarrega a própria página (`window.location.pathname`), nunca navega
// pra outro lugar — mesmo comportamento de hoje.

export function TelaSucesso({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div className="success-box">
      <div className="success-icon">✓</div>
      <h2 className="wizard-title">{titulo}</h2>
      <p className="wizard-desc">{descricao}</p>
      <a href={window.location.pathname} className="btn btn-primary">Voltar ao início</a>
    </div>
  );
}
