import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '@/api/cliente';
import type { EstadoSessao, Papel, Perfil } from '@shared/types/usuario';

interface ContextoSessao {
  carregando: boolean;
  estado: EstadoSessao;
  perfil: Perfil | null;
  papel: Papel | null;
  temPapel: (...papeis: Papel[]) => boolean;
  podeEditar: boolean;   // admin ou secretaria
  ehAdmin: boolean;
  recarregar: () => Promise<void>;
  entrar: (email: string, senha: string) => Promise<EstadoSessao>;
  trocarSenha: (senha: string) => Promise<void>;
  sair: () => Promise<void>;
}

const Ctx = createContext<ContextoSessao | null>(null);

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [estado, setEstado] = useState<EstadoSessao>({ loggedIn: false });

  const recarregar = useCallback(async () => {
    try {
      const s = await api.get<EstadoSessao>('/api/auth/session');
      setEstado(s);
    } catch {
      setEstado({ loggedIn: false });
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { recarregar(); }, [recarregar]);

  useEffect(() => {
    const aoExpirar = () => setEstado({ loggedIn: false });
    window.addEventListener('sessao:expirou', aoExpirar);
    return () => window.removeEventListener('sessao:expirou', aoExpirar);
  }, []);

  const entrar = useCallback(async (email: string, senha: string) => {
    const r = await api.post<{ success: boolean; mustChangePassword: boolean; authorized: boolean; perfil: Perfil | null }>(
      '/api/auth/login', { email, password: senha }
    );
    const novo: EstadoSessao = { loggedIn: true, mustChangePassword: r.mustChangePassword, authorized: r.authorized, perfil: r.perfil };
    setEstado(novo);
    return novo;
  }, []);

  const trocarSenha = useCallback(async (senha: string) => {
    await api.post('/api/auth/change-password', { password: senha });
    await recarregar();
  }, [recarregar]);

  const sair = useCallback(async () => {
    try { await api.post('/api/auth/logout'); } catch { /* cookies já limpos */ }
    setEstado({ loggedIn: false });
  }, []);

  const valor = useMemo<ContextoSessao>(() => {
    const perfil = estado.loggedIn && estado.authorized ? estado.perfil || null : null;
    const papel = perfil?.papel || null;
    return {
      carregando, estado, perfil, papel,
      temPapel: (...papeis) => !!papel && papeis.includes(papel),
      podeEditar: papel === 'admin' || papel === 'secretaria',
      ehAdmin: papel === 'admin',
      recarregar, entrar, trocarSenha, sair
    };
  }, [carregando, estado, recarregar, entrar, trocarSenha, sair]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useSessao(): ContextoSessao {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSessao() fora de <ProvedorSessao>');
  return c;
}
