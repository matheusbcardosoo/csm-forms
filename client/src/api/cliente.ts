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

/**
 * Baixa um arquivo binário (ex.: PDF) preservando o nome sugerido pelo
 * servidor via Content-Disposition. Diferente de `api.get`, que sempre
 * espera JSON — aqui a resposta é um blob.
 *
 * `corpo` existe para o download em lote, que manda a lista de
 * documentos: seriam 60 UUIDs na query string, e o servidor tem mais o
 * que fazer do que reparsear isso.
 */
export async function baixarArquivo(url: string, nomePadrao: string, corpo?: unknown): Promise<void> {
  const res = corpo === undefined
    ? await fetch(url, { credentials: 'same-origin' })
    : await fetch(url, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo)
      });
  if (res.status === 401) window.dispatchEvent(new CustomEvent('sessao:expirou'));
  if (!res.ok) {
    const texto = await res.text().catch(() => '');
    let mensagem = `Erro ${res.status}`;
    try {
      const d = JSON.parse(texto) as { error?: string };
      if (d.error) mensagem = d.error;
    } catch { /* corpo não é JSON */ }
    throw new ErroApi(res.status, mensagem);
  }
  const blob = await res.blob();
  const disposicao = res.headers.get('Content-Disposition') || '';
  const combinado = disposicao.match(/filename="?([^";]+)"?/);
  const nome = combinado ? combinado[1] : nomePadrao;
  const urlObjeto = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = urlObjeto;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(urlObjeto);
}
