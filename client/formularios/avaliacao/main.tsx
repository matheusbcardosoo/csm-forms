import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AssistenteAvaliacao } from './AssistenteAvaliacao';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AssistenteAvaliacao />
  </StrictMode>
);
