// Porta o `#policy-modal` + `public/js/policy-modal.js` (abrir, fechar por
// X/botão/backdrop/ESC). O texto legal em si (diferente por formulário)
// vem via `children`.

import { useEffect, type ReactNode } from 'react';

export function PoliticaModal({ aberto, aoFechar, titulo, children }: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar(); };
    document.addEventListener('keydown', aoTeclar);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = '';
    };
  }, [aberto, aoFechar]);

  return (
    <div id="policy-modal" className={`modal${aberto ? '' : ' hidden'}`}>
      <div className="modal-backdrop" onClick={aoFechar}></div>
      <div className="modal-content">
        <div className="modal-header">
          <h2>{titulo}</h2>
          <button type="button" className="modal-close" aria-label="Fechar" onClick={aoFechar}>
            <i className="fa-solid fa-times"></i>
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={aoFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
