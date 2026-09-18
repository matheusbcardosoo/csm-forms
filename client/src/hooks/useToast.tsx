import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Icone } from '@/componentes/Icones';

type Tipo = 'ok' | 'erro' | 'info';
interface Toast { id: number; tipo: Tipo; texto: string }

interface ContextoToast {
  avisar: (texto: string, tipo?: Tipo) => void;
  ok: (texto: string) => void;
  erro: (texto: string) => void;
}

const Ctx = createContext<ContextoToast | null>(null);
let seq = 0;

export function ProvedorToast({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<Toast[]>([]);

  const remover = useCallback((id: number) => setLista(l => l.filter(t => t.id !== id)), []);

  const avisar = useCallback((texto: string, tipo: Tipo = 'info') => {
    const id = ++seq;
    setLista(l => [...l.slice(-3), { id, tipo, texto }]);
    window.setTimeout(() => remover(id), tipo === 'erro' ? 7000 : 4000);
  }, [remover]);

  const valor = useMemo<ContextoToast>(() => ({
    avisar,
    ok: t => avisar(t, 'ok'),
    erro: t => avisar(t, 'erro')
  }), [avisar]);

  return (
    <Ctx.Provider value={valor}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {lista.map(t => (
          <div key={t.id} className={`toast ${t.tipo}`}>
            <Icone nome={t.tipo === 'ok' ? 'check' : t.tipo === 'erro' ? 'alerta' : 'info'} />
            <span>{t.texto}</span>
            <button type="button" aria-label="Fechar aviso" onClick={() => remover(t.id)}><Icone nome="fechar" /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ContextoToast {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast() fora de <ProvedorToast>');
  return c;
}
