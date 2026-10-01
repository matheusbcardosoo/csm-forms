// Redimensionamento de imagem no navegador, antes do upload
// (08-carteirinhas §6.3). Uma foto de celular tem 2 a 4 MB; 40 delas em
// data URL derrubam o Chromium do PDF. Reduzir aqui, uma vez, na entrada,
// dispensa uma dependência nativa (sharp) no servidor.
//
// Também é o que converte SVG em PNG: o navegador rasteriza o vetor no
// canvas e o que sobe é bitmap. SVG de terceiros dentro do HTML do PDF é
// vetor de script — o servidor recusa qualquer coisa que não seja
// JPEG/PNG/WebP pelos bytes, então este passo não é opcional.

export interface ImagemPronta { base64: string; dataUrl: string; largura: number; altura: number }

function carregar(arquivo: File): Promise<HTMLImageElement> {
  return new Promise((ok, falha) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); falha(new Error('Não foi possível ler a imagem. Use JPG, PNG, WebP ou SVG.')); };
    img.src = url;
  });
}

function exportar(canvas: HTMLCanvasElement, tipo: 'image/jpeg' | 'image/png', qualidade?: number): ImagemPronta {
  const dataUrl = canvas.toDataURL(tipo, qualidade);
  return { dataUrl, base64: dataUrl.slice(dataUrl.indexOf(',') + 1), largura: canvas.width, altura: canvas.height };
}

/**
 * Foto 3×4: recorte central na proporção 3:4 e redução para até
 * 600 × 800 px, JPEG q=0,82 (60–90 KB; impressa a 25 × 33 mm dá mais de
 * 600 dpi). É o "enquadramento simples" do RF-FOTO-07.
 */
export async function prepararFoto3x4(arquivo: File): Promise<ImagemPronta> {
  const img = await carregar(arquivo);
  const w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h) throw new Error('Imagem vazia.');
  const alvo = 3 / 4;
  let sw = w, sh = h, sx = 0, sy = 0;
  if (w / h > alvo) { sw = Math.round(h * alvo); sx = Math.round((w - sw) / 2); }
  else { sh = Math.round(w / alvo); sy = Math.round((h - sh) / 4); } // corta mais embaixo: o rosto fica no terço de cima
  const escala = Math.min(1, 600 / sw);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * escala);
  canvas.height = Math.round(sh * escala);
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return exportar(canvas, 'image/jpeg', 0.82);
}

/** Logo: cabe em 1200 px no lado maior, PNG para manter a transparência. */
export async function prepararLogo(arquivo: File): Promise<ImagemPronta> {
  const img = await carregar(arquivo);
  // SVG sem width/height chega com 0 ou 150 px; desenha num tamanho útil
  const ehSvg = arquivo.type === 'image/svg+xml' || /\.svg$/i.test(arquivo.name);
  let w = img.naturalWidth || 1200, h = img.naturalHeight || 1200;
  if (ehSvg && Math.max(w, h) < 1200) { const k = 1200 / Math.max(w, h); w *= k; h *= k; }
  const escala = Math.min(1, 1200 / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * escala));
  canvas.height = Math.max(1, Math.round(h * escala));
  const g = canvas.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, canvas.width, canvas.height);
  return exportar(canvas, 'image/png');
}
