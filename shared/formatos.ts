/**
 * Formatos de campo brasileiros — CPF, CNPJ, CEP, telefone.
 *
 * Vive em shared/ porque servidor e painel precisam exatamente dos
 * mesmos: o painel para mascarar enquanto se digita, o servidor para
 * formatar o que vai impresso no histórico. Um CPF que entrou pela
 * importação do Activesoft como "12345678901" não pode sair assim num
 * documento permanente, e máscara de digitação não alcança o que já
 * está no banco — por isso a montagem do documento formata de novo.
 *
 * Regra que vale para todos: **nunca corromper o que não se reconhece.**
 * Valor com contagem de dígitos fora do esperado volta como veio. Um CPF
 * com 10 dígitos aparece sem máscara e a conferência do histórico
 * continua acusando que ele está errado — que é o comportamento certo.
 * Mascarar à força esconderia o defeito justamente onde ele importa.
 *
 * RG e RA ficam deliberadamente de fora. RG não tem formato nacional
 * (cada estado compõe dígitos e letras do seu jeito) e mascarar o de
 * quem veio de outro estado é corromper o dado. RA idem: a composição
 * varia e o que está no cadastro veio do Activesoft ou da própria
 * secretaria, já na forma que eles usam.
 */

export type Formato = 'cpf' | 'cnpj' | 'cep' | 'telefone';

export function apenasDigitos(valor: string | null | undefined): string {
  return (valor || '').replace(/\D+/g, '');
}

/**
 * Aplica um padrão com `#` no lugar de cada dígito ("###.###.###-##"),
 * parando onde os dígitos acabam. Não completa com zero nem inventa
 * separador à frente do que foi digitado: "123" vira "123", não
 * "123.___.___-__".
 */
function aplicarPadrao(padrao: string, digitos: string): string {
  let saida = '';
  let i = 0;
  for (const c of padrao) {
    if (i >= digitos.length) break;
    if (c === '#') { saida += digitos[i]; i++; } else { saida += c; }
  }
  return saida;
}

const PADRAO: Record<Formato, string> = {
  cpf: '###.###.###-##',
  cnpj: '##.###.###/####-##',
  cep: '#####-###',
  telefone: '' // telefone tem dois padrões, resolvidos em formatarTelefone
};

/** Quantos dígitos o formato aceita — usado como limite na digitação. */
const DIGITOS: Record<Formato, number> = { cpf: 11, cnpj: 14, cep: 8, telefone: 11 };

export function formatarCPF(valor: string | null | undefined): string {
  const d = apenasDigitos(valor);
  return d.length === 11 ? aplicarPadrao(PADRAO.cpf, d) : (valor || '').trim();
}

export function formatarCNPJ(valor: string | null | undefined): string {
  const d = apenasDigitos(valor);
  return d.length === 14 ? aplicarPadrao(PADRAO.cnpj, d) : (valor || '').trim();
}

export function formatarCEP(valor: string | null | undefined): string {
  const d = apenasDigitos(valor);
  return d.length === 8 ? aplicarPadrao(PADRAO.cep, d) : (valor || '').trim();
}

/**
 * Fixo com 10 dígitos, celular com 11. Número com DDI 55 na frente é
 * reconhecido e o DDI fica visível — quem cadastrou com +55 quis o +55.
 */
export function formatarTelefone(valor: string | null | undefined): string {
  const bruto = (valor || '').trim();
  let d = apenasDigitos(bruto);
  let ddi = '';
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) { ddi = '+55 '; d = d.slice(2); }
  if (d.length === 10) return `${ddi}${aplicarPadrao('(##) ####-####', d)}`;
  if (d.length === 11) return `${ddi}${aplicarPadrao('(##) #####-####', d)}`;
  return bruto;
}

/**
 * CIN e CPF compartilham o número — a CIN nasceu justamente para unificar
 * os documentos sob o CPF. Então o que tem 11 dígitos sai com máscara de
 * CPF, e o resto sai como está.
 */
export function formatarDocumentoPessoal(valor: string | null | undefined): string {
  return formatarCPF(valor);
}

const FORMATADOR: Record<Formato, (v: string | null | undefined) => string> = {
  cpf: formatarCPF, cnpj: formatarCNPJ, cep: formatarCEP, telefone: formatarTelefone
};

/** Formata para exibição/impressão. Não reconheceu, devolve como veio. */
export function formatar(formato: Formato, valor: string | null | undefined): string {
  return FORMATADOR[formato](valor);
}

/**
 * Máscara progressiva, para usar a cada tecla: formata o que já foi
 * digitado sem esperar o campo ficar completo.
 *
 * Não precisa saber o valor anterior para o backspace funcionar, e é de
 * propósito: como `aplicarPadrao` para no último dígito e nunca deixa
 * separador sobrando ("123" é "123", não "123."), apagar um caractere
 * sempre apaga um dígito. Máscara que completa com separador à frente
 * precisa adivinhar o que a pessoa quis apagar; esta não precisa.
 */
export function mascarar(formato: Formato, valor: string): string {
  const d = apenasDigitos(valor).slice(0, DIGITOS[formato]);
  if (!d) return '';

  if (formato === 'telefone') {
    // enquanto não se sabe se é fixo ou celular, o 11º dígito decide
    const padrao = d.length > 10 ? '(##) #####-####' : '(##) ####-####';
    return aplicarPadrao(padrao, d);
  }
  return aplicarPadrao(PADRAO[formato], d);
}

/** Tamanho máximo do campo já formatado — para o `maxLength` do input. */
export function tamanhoMaximo(formato: Formato): number {
  return formato === 'telefone' ? '(##) #####-####'.length : PADRAO[formato].length;
}
