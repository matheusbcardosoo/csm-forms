import { useCallback, useEffect, useRef, useState } from 'react';
import { api, mensagemErro } from '@/api/cliente';

/**
 * Carrega um recurso da API e expõe {dados, carregando, erro, recarregar,
 * definir}. `definir` permite atualização otimista local após um POST/PUT
 * sem refazer o GET.
 */
export function useRecurso<T>(url: string | null) {
  const [dados, setDados] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(!!url);
  const [erro, setErro] = useState<string | null>(null);
  const versao = useRef(0);

  const recarregar = useCallback(async () => {
    if (!url) { setDados(null); setCarregando(false); return; }
    const v = ++versao.current;
    setCarregando(true);
    setErro(null);
    try {
      const r = await api.get<T>(url);
      if (v === versao.current) setDados(r);
    } catch (e) {
      if (v === versao.current) setErro(mensagemErro(e));
    } finally {
      if (v === versao.current) setCarregando(false);
    }
  }, [url]);

  useEffect(() => { recarregar(); }, [recarregar]);

  return { dados, carregando, erro, recarregar, definir: setDados };
}
