// Fábrica do adaptador ativo. IMPORTACAO_ADAPTADOR = activesoft | arquivo | mock.
// "arquivo" só existe por requisição (o CSV vem no corpo); o adaptador
// configurado no ambiente é o padrão para importações sem arquivo.
import type { AdaptadorAcademico } from './tipos';
import { AdaptadorMock } from './mock';
import { AdaptadorArquivo, type ArquivosImportacao } from './arquivo';
import { AdaptadorActivesoftApi, configDoAmbiente } from './cliente';

export type NomeAdaptador = 'activesoft' | 'arquivo' | 'mock';

export function adaptadorPadrao(): NomeAdaptador {
  const v = (process.env.IMPORTACAO_ADAPTADOR || 'mock').toLowerCase();
  return v === 'activesoft' || v === 'arquivo' ? v : 'mock';
}

export function criarAdaptador(nome: NomeAdaptador, arquivos?: ArquivosImportacao): AdaptadorAcademico {
  if (nome === 'arquivo') return new AdaptadorArquivo(arquivos || {});
  if (nome === 'activesoft') return new AdaptadorActivesoftApi(configDoAmbiente(process.env));
  return new AdaptadorMock();
}

export type { AdaptadorAcademico } from './tipos';
export { buscarTudo } from './tipos';
export { COLUNAS_MODELO } from './arquivo';
