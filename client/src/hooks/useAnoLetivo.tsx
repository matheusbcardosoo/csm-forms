// Seletor de ano letivo global do topo (04-telas §2): filtra alunos,
// matriz e importações. Persistido por navegador.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '@/api/cliente';
import { useSessao } from './useSessao';
import type { AnoLetivo } from '@shared/types/instituicao';

interface Ctx { anos: number[]; registros: AnoLetivo[]; ano: number | null; setAno: (a: number) => void; recarregar: () => Promise<void> }
const C = createContext<Ctx | null>(null);

export function ProvedorAnoLetivo({ children }: { children: ReactNode }) {
  const { perfil } = useSessao();
  const [registros, setRegistros] = useState<AnoLetivo[]>([]);
  const [ano, setAnoEstado] = useState<number | null>(() => {
    try { const v = localStorage.getItem('csm-ano'); return v ? Number(v) : null; } catch { return null; }
  });

  const recarregar = async () => {
    if (!perfil) return;
    try {
      const lista = await api.get<AnoLetivo[]>('/api/anos-letivos');
      setRegistros(lista);
      const anos = lista.map(a => a.ano);
      if (!anos.length) { setAnoEstado(a => a ?? new Date().getFullYear()); return; }
      setAnoEstado(atual => (atual && anos.includes(atual)) ? atual : (anos.includes(new Date().getFullYear()) ? new Date().getFullYear() : anos[0]));
    } catch { setAnoEstado(a => a ?? new Date().getFullYear()); }
  };

  useEffect(() => { recarregar(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [perfil?.email]);

  const setAno = (a: number) => { setAnoEstado(a); try { localStorage.setItem('csm-ano', String(a)); } catch { /* */ } };

  const valor = useMemo<Ctx>(() => ({ anos: registros.map(r => r.ano), registros, ano, setAno, recarregar }), [registros, ano]); // eslint-disable-line react-hooks/exhaustive-deps
  return <C.Provider value={valor}>{children}</C.Provider>;
}

export function useAnoLetivo(): Ctx {
  const c = useContext(C);
  if (!c) throw new Error('useAnoLetivo() fora de <ProvedorAnoLetivo>');
  return c;
}
