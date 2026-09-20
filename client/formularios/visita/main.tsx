import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AssistenteVisita } from './AssistenteVisita';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AssistenteVisita />
  </StrictMode>
);
