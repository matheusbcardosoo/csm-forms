// Portado de public/js/wizard.js (validadores e formatação usados pelos
// dois wizards públicos). Mesma lógica, mesmos regexes — só tipado.

// Exige nome + sobrenome (ao menos 2 palavras com 2+ letras cada, sem números/símbolos).
export function isFullName(value: string): boolean {
  if (!value) return false;
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  const nameRegex = /^[A-Za-zÀ-ÖØ-öø-ÿ'’-]+$/;
  return words.every(w => w.length >= 2 && nameRegex.test(w));
}

// Aceita telefone nacional (DDD + 8 ou 9 dígitos) ou internacional (+ até 15 dígitos).
export function isValidPhone(value: string): boolean {
  if (!value) return false;
  const digits = value.replace(/\D/g, '');
  if (value.trim().startsWith('+')) {
    return digits.length >= 8 && digits.length <= 15;
  }
  return digits.length === 10 || digits.length === 11;
}

export function maskPhoneBR(digitsInput: string): string {
  const digits = digitsInput.slice(0, 11);
  if (!digits.length) return '';
  let out = '(' + digits.slice(0, 2);
  if (digits.length > 2) {
    out += ') ';
    const rest = digits.slice(2);
    if (digits.length > 10) {
      out += rest.slice(0, 5) + (rest.length > 5 ? '-' + rest.slice(5, 9) : '');
    } else {
      out += rest.slice(0, 4) + (rest.length > 4 ? '-' + rest.slice(4, 8) : '');
    }
  }
  return out;
}

export function maskPhoneIntl(digitsInput: string): string {
  const digits = digitsInput.slice(0, 15);
  let out = '+';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && i % 3 === 0) out += ' ';
    out += digits[i];
  }
  return out;
}

// Aplica a máscara nacional ou internacional conforme o valor já digitado
// comece com "+" — usada no onChange dos campos de WhatsApp.
export function maskPhoneAuto(valorAtual: string): string {
  const isIntl = valorAtual.trim().startsWith('+');
  const digits = valorAtual.replace(/\D/g, '');
  return isIntl ? maskPhoneIntl(digits) : maskPhoneBR(digits);
}

const PARTICLES = new Set(['da', 'das', 'de', 'do', 'dos', 'e', 'a', 'o', 'ao', 'i']);

export function toTitleCase(str: string): string {
  if (!str) return '';
  return str.trim().toLowerCase().split(/\s+/).map((w, i) =>
    w && (i === 0 || !PARTICLES.has(w)) ? w[0].toUpperCase() + w.slice(1) : w
  ).join(' ');
}

export function capFirst(str: string): string {
  if (!str) return '';
  const s = str.trim();
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// Title Case "cru" (sem exceção de partículas) — usado pra nome de cidade.
export function toWordTitleCase(str: string): string {
  if (!str) return '';
  return str.trim().toLowerCase().split(/\s+/).map(w =>
    w ? w[0].toUpperCase() + w.slice(1) : w
  ).join(' ');
}

// "Cidade/Estado": aceita "-" ou "/" como separador, remove espaços ao
// redor dele e deixa a sigla do estado em maiúsculo.
export function toCityState(str: string): string {
  if (!str) return '';
  const parts = str.trim().split(/\s*[\/-]\s*/);
  const cidade = toWordTitleCase(parts[0]);
  const estado = parts[1] ? parts[1].trim().toUpperCase() : '';
  return estado ? cidade + '/' + estado : cidade;
}
