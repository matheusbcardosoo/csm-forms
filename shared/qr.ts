/**
 * QR do documento (RF-HIST-14).
 *
 * Devolve o desenho como um único `path` de SVG em vez de um `<svg>`
 * pronto, porque quem desenha são dois renderizadores diferentes — o
 * componente React da pré-visualização e o template EJS do PDF — e eles
 * precisam produzir exatamente o mesmo pixel (RNF-04). Entregando o
 * caminho, cada um monta seu `<svg>` no seu idioma e o conteúdo é o
 * mesmo por construção.
 *
 * Gerado localmente, sem serviço externo de QR: o PDF é renderizado por
 * um Puppeteer que não tem rede garantida, e o CSP dos formulários já
 * não permite script nem imagem de fora.
 */
import qrcode from 'qrcode-generator';

export interface DesenhoQR {
  /** Lado do QR em módulos, incluindo a margem obrigatória. */
  lado: number;
  /** Atributo `d` de um <path> preto sobre fundo branco. */
  caminho: string;
}

/**
 * Margem obrigatória do padrão (quiet zone): sem ela a câmera não
 * separa o código do resto do papel. São 4 módulos de cada lado.
 */
const MARGEM = 4;

/**
 * Correção de erro média (15%). O documento pode ser dobrado, carimbado
 * ou fotocopiado antes de alguém apontar a câmera; L economizaria
 * módulos e perderia justamente nesses casos.
 */
const CORRECAO = 'M' as const;

export function desenharQR(texto: string): DesenhoQR {
  const qr = qrcode(0, CORRECAO);
  qr.addData(texto);
  qr.make();

  const modulos = qr.getModuleCount();
  const lado = modulos + MARGEM * 2;

  // um "M x,y h1 v1 h-1 z" por módulo escuro: fica num path só, o que
  // mantém o SVG pequeno o bastante para ser embutido no HTML do PDF
  const partes: string[] = [];
  for (let linha = 0; linha < modulos; linha++) {
    for (let coluna = 0; coluna < modulos; coluna++) {
      if (qr.isDark(linha, coluna)) {
        partes.push(`M${coluna + MARGEM} ${linha + MARGEM}h1v1h-1z`);
      }
    }
  }
  return { lado, caminho: partes.join('') };
}
