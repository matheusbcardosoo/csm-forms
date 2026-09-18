import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { ProvedorSessao } from '@/hooks/useSessao';
import { ProvedorToast } from '@/hooks/useToast';
import { roteador } from '@/rotas';
import '@/estilos/global.css';

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <ProvedorToast>
      <ProvedorSessao>
        <RouterProvider router={roteador} />
      </ProvedorSessao>
    </ProvedorToast>
  </StrictMode>
);
