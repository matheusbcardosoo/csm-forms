// Cliente HTTP mínimo: cookies httpOnly cuidam da sessão, então basta
// `credentials: 'same-origin'`. Erros da API viram ErroApi com status,
// mensagem e (em 422) a lista de campos inválidos.

export interface CampoInvalido { campo: string; mensagem: string }

export class ErroApi extends Error {
  status: number;
  campos: CampoInvalido[];
  constructor(status: number, mensagem: string, campos: CampoInvalido[] = []) {
    super(mensagem);
    this.status = status;
    this.campos = campos;
  }
}

type Metodo = 'GET' | 'POST' | 'PUT' | 'DELETE';

async function requisicao<T>(metodo: Metodo, url: string, corpo?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: metodo,
    credentials: 'same-origin',
    headers: corpo !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined
  });

  if (res.status === 401) {
    // Sessão caiu: avisa o app para voltar ao login sem perder a rota.
    window.dispatchEvent(new CustomEvent('sessao:expirou'));
  }

  const texto = await res.text();
  let dados: unknown = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch { dados = { error: texto }; }

  if (!res.ok) {
    const d = (dados || {}) as { error?: string; campos?: CampoInvalido[]; detalhe?: string };
    throw new ErroApi(res.status, d.error || `Erro ${res.status}`, d.campos || []);
  }
  return dados as T;
}

export const api = {
  get: <T>(url: string) => requisicao<T>('GET', url),
  post: <T>(url: string, corpo?: unknown) => requisicao<T>('POST', url, corpo ?? {}),
  put: <T>(url: string, corpo?: unknown) => requisicao<T>('PUT', url, corpo ?? {}),
  del: <T>(url: string) => requisicao<T>('DELETE', url)
};

export function mensagemErro(err: unknown, padrao = 'Algo deu errado. Tente novamente.'): string {
  if (err instanceof ErroApi) return err.message || padrao;
  if (err instanceof Error) return err.message || padrao;
  return padrao;
}
