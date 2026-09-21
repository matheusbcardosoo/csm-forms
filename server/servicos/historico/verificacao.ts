// Código de verificação de autenticidade do documento (RF-HIST-14).
// Desenho em docs/superpowers/specs/2026-09-21-f7-refino-design.md §3.2.
import { randomBytes } from 'node:crypto';
import { desenharQR } from '../../../shared/qr';
import type { VerificacaoDocumento } from '../../../shared/types/historico';

const ALFABETO = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const TAMANHO = 22;

/**
 * 22 caracteres base62 ≈ 131 bits de espaço, sorteados de
 * `randomBytes` — não de `Math.random`, que é previsível e aqui o
 * segredo é justamente a imprevisibilidade: o código é a única coisa
 * que impede alguém de listar os documentos que a escola emitiu.
 *
 * O descarte de bytes ≥ 248 existe para não enviesar: 256 não é
 * múltiplo de 62, então o resto puro tornaria as 8 primeiras letras do
 * alfabeto um pouco mais prováveis que as demais.
 */
export function gerarCodigo(): string {
  let codigo = '';
  while (codigo.length < TAMANHO) {
    for (const byte of randomBytes(TAMANHO)) {
      if (byte >= 248) continue;
      codigo += ALFABETO[byte % 62];
      if (codigo.length === TAMANHO) break;
    }
  }
  return codigo;
}

/**
 * Endereço que o QR carrega. Sem `APP_BASE_URL` configurado não há URL
 * absoluta possível, e um QR com endereço relativo não leva a lugar
 * nenhum quando lido pela câmera — então não se desenha QR nenhum.
 */
export function urlVerificacao(codigo: string): string | null {
  const base = (process.env.APP_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!base) return null;
  return `${base}/verificar/${codigo}`;
}

/** O bloco pronto para os dois renderizadores desenharem, ou nada. */
export function verificacaoDoDocumento(codigo: string | null | undefined): VerificacaoDocumento | null {
  if (!codigo) return null;
  const url = urlVerificacao(codigo);
  if (!url) return null;
  return { codigo, url, qr: desenharQR(url) };
}

/**
 * "MATHEUS CARDOSO DA SILVA" → "Matheus C. da S."
 *
 * O primeiro nome por extenso e as iniciais do resto: o suficiente para
 * conferir contra o papel, insuficiente para servir de consulta de
 * aluno. Partículas ("da", "de", "dos") ficam inteiras porque abreviá-las
 * não esconde nada e só deixa a linha ilegível.
 *
 * Mora aqui, e não na rota, para poder ser exercitado sem subir Express
 * nem cliente de banco — é uma decisão de privacidade, e decisão de
 * privacidade que não dá para testar sozinha acaba não sendo testada.
 */
const PARTICULAS = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);

export function nomeParcial(nome: string): string {
  const partes = (nome || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '—';
  const primeiro = partes[0].charAt(0).toUpperCase() + partes[0].slice(1).toLowerCase();
  const resto = partes.slice(1).map(p => {
    const minusculo = p.toLowerCase();
    return PARTICULAS.has(minusculo) ? minusculo : `${p.charAt(0).toUpperCase()}.`;
  });
  return [primeiro, ...resto].join(' ');
}
