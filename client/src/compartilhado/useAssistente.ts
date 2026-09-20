import { useState, useCallback } from 'react';

/**
 * Hook de navegação por passos, deliberadamente sem noção de validação de
 * negócio — cada wizard decide quando chamar avancar(), depois de validar
 * o passo atual por conta própria. Reaproveitado pelos dois formulários
 * públicos (visita, avaliação substitutiva) e pensado para também servir
 * o futuro assistente de emissão de histórico (F5,
 * docs/04-telas-e-navegacao.md §3.4), cujo domínio não tem nada em comum
 * com "aluno"/"prova" — por isso o hook não sabe nada sobre isso.
 */
export function useAssistente(totalPassos: number) {
  const [passo, setPasso] = useState(1);

  const podeVoltar = passo > 1;
  const podeAvancar = passo < totalPassos;

  const voltar = useCallback(() => {
    setPasso(p => Math.max(1, p - 1));
  }, []);

  const avancar = useCallback(() => {
    setPasso(p => Math.min(totalPassos, p + 1));
  }, [totalPassos]);

  const irPara = useCallback((novoPasso: number) => {
    setPasso(Math.min(totalPassos, Math.max(1, novoPasso)));
  }, [totalPassos]);

  return { passo, totalPassos, podeVoltar, podeAvancar, voltar, avancar, irPara };
}
