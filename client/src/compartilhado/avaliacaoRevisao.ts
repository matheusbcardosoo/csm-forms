/**
 * Agrupamento e dedup de anexos usados na revisão de avaliação
 * substitutiva — extraído de client/src/app/formularios/RevisaoResposta.tsx
 * (Incremento A) pra ser reaproveitado também pelo wizard público de
 * avaliação substitutiva (Incremento B), que revisa dados ainda não
 * enviados (anexo = arquivo local), não o formato já salvo no banco.
 */

export interface GrupoPorData<T> {
  data?: string;
  provas: T[];
}

// Agrupa um array de "provas" (ou qualquer coisa com campo `data`) pela
// data — mesma chave de fallback do código original (`_sem-data-N`) pra
// provas sem data preenchida, preservando a ordem de primeira aparição.
export function agruparPorData<T extends { data?: string }>(provas: T[]): GrupoPorData<T>[] {
  const grupos: GrupoPorData<T>[] = [];
  const porData = new Map<string, GrupoPorData<T>>();
  provas.forEach(prova => {
    const chave = prova.data || `_sem-data-${grupos.length}`;
    let grupo = porData.get(chave);
    if (!grupo) {
      grupo = { data: prova.data, provas: [] };
      porData.set(chave, grupo);
      grupos.push(grupo);
    }
    grupo.provas.push(prova);
  });
  return grupos;
}

export interface AnexoUnico<T> {
  nome?: string;
  tipo?: string;
  provaOrigem: T;
}

// Deduplica anexos dentro de um grupo (provas do mesmo dia normalmente
// compartilham o mesmo documento) por nome+tipo. `extrairAnexo` isola o
// formato do anexo, que difere entre o painel (já salvo) e o wizard
// público (arquivo local, antes do envio).
export function anexosUnicosDoGrupo<T>(
  provas: T[],
  extrairAnexo: (prova: T) => { nome?: string; tipo?: string } | null | undefined
): AnexoUnico<T>[] {
  const vistos = new Set<string>();
  const resultado: AnexoUnico<T>[] = [];
  provas.forEach(prova => {
    const anexo = extrairAnexo(prova);
    if (!anexo?.nome) return;
    const chave = `${anexo.nome}|${anexo.tipo}`;
    if (vistos.has(chave)) return;
    vistos.add(chave);
    resultado.push({ nome: anexo.nome, tipo: anexo.tipo, provaOrigem: prova });
  });
  return resultado;
}
