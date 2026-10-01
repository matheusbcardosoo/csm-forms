// Geometria da folha de cartões (08-carteirinhas §3.4), compartilhada pela
// pré-visualização e pelo template do PDF: as marcas saem da mesma conta
// nas duas pontas. Tudo em mm, origem no canto superior esquerdo do A4.
//
// Tiras de 190 × 60 mm, empilhadas e encostadas a partir de (10, 28,5):
// os cortes são compartilhados entre tiras vizinhas. As marcas ficam só
// nas margens, por fora da área útil — nenhuma risca a face impressa.

export const FOLHA = { largura: 210, altura: 297, margemX: 10, margemY: 28.5, face: { largura: 95, altura: 60 } } as const;

export interface Marca { tipo: 'h' | 'v' | 'dobra'; x: number; y: number; comprimento: number }

const AFASTAMENTO = 2;   // distância entre a marca e a borda da tira
const TAMANHO = 6;       // comprimento do traço de corte

export function marcasDaFolha(tiras: number): Marca[] {
  if (tiras <= 0) return [];
  const { margemX: x0, margemY: y0, face } = FOLHA;
  const x1 = x0 + face.largura * 2;
  const yFim = y0 + face.altura * tiras;
  const meio = x0 + face.largura;
  const marcas: Marca[] = [];
  // cortes horizontais: um em cima de cada tira e um embaixo da última
  for (let i = 0; i <= tiras; i++) {
    const y = y0 + face.altura * i;
    marcas.push({ tipo: 'h', x: x0 - AFASTAMENTO - TAMANHO, y, comprimento: TAMANHO });
    marcas.push({ tipo: 'h', x: x1 + AFASTAMENTO, y, comprimento: TAMANHO });
  }
  // cortes verticais: laterais da pilha, acima e abaixo
  for (const x of [x0, x1]) {
    marcas.push({ tipo: 'v', x, y: y0 - AFASTAMENTO - TAMANHO, comprimento: TAMANHO });
    marcas.push({ tipo: 'v', x, y: yFim + AFASTAMENTO, comprimento: TAMANHO });
  }
  // dobra: no eixo da tira, tracejado e só nas margens
  marcas.push({ tipo: 'dobra', x: meio, y: y0 - AFASTAMENTO - 8, comprimento: 8 });
  marcas.push({ tipo: 'dobra', x: meio, y: yFim + AFASTAMENTO, comprimento: 8 });
  return marcas;
}

/** Estilo inline de uma marca (o mesmo nas duas pontas). */
export function estiloMarca(m: Marca): Record<string, string> {
  return m.tipo === 'h'
    ? { left: `${m.x}mm`, top: `${m.y - 0.1}mm`, width: `${m.comprimento}mm` }
    : { left: `${m.x - 0.1}mm`, top: `${m.y}mm`, height: `${m.comprimento}mm` };
}

/** Onde escrever "dobre aqui": acima da marca de dobra de cima. */
export function posicaoRotuloDobra(): { left: string; top: string } {
  return { left: `${FOLHA.margemX + FOLHA.face.largura}mm`, top: `${FOLHA.margemY - 2 - 8 - 3}mm` };
}

export function emGrupos<T>(itens: T[], tamanho: number): T[][] {
  const grupos: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) grupos.push(itens.slice(i, i + tamanho));
  return grupos;
}

export const INSTRUCAO_IMPRESSAO = 'Imprima em tamanho real (100%) · recorte nas marcas dos cantos · dobre na linha tracejada do meio';
