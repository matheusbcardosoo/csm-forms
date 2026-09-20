// Porta fileToBase64 e compressImageFile de public/js/wizard-avaliacao.js
// — específico deste wizard, não compartilhado, já que só ele lida com
// upload de arquivo.

const ANEXO_COMPRESSAO_LIMIAR_BYTES = 1.2 * 1024 * 1024;
const ANEXO_COMPRESSAO_MAX_DIMENSAO = 1600;
const ANEXO_COMPRESSAO_QUALIDADE = 0.75;

function withJpegExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  return base + '.jpg';
}

// Comprime anexos-foto grandes (atestado fotografado pelo celular costuma
// vir em 3-8MB) antes de converter pra base64. PDF e HEIC seguem sem
// recompressão (canvas não decodifica HEIC de forma confiável, e
// recomprimir PDF client-side não é viável).
export function compressImageFile(file: File): Promise<File> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/') || file.type === 'image/heic') {
      resolve(file);
      return;
    }
    if (file.size <= ANEXO_COMPRESSAO_LIMIAR_BYTES) {
      resolve(file);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const maiorLado = Math.max(width, height);
      if (maiorLado > ANEXO_COMPRESSAO_MAX_DIMENSAO) {
        const escala = ANEXO_COMPRESSAO_MAX_DIMENSAO / maiorLado;
        width = Math.round(width * escala);
        height = Math.round(height * escala);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob || blob.size >= file.size) {
          resolve(file);
          return;
        }
        resolve(new File([blob], withJpegExtension(file.name), { type: 'image/jpeg' }));
      }, 'image/jpeg', ANEXO_COMPRESSAO_QUALIDADE);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const ANEXO_TAMANHO_MAX_BYTES = 8 * 1024 * 1024;
export const ANEXO_TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

export function validarAnexoArquivo(file: File | null, obrigatorio: boolean): string | null {
  if (!file) return obrigatorio ? 'Anexe o documento antes de continuar.' : null;
  if (!ANEXO_TIPOS_ACEITOS.includes(file.type)) return 'Tipo de arquivo não suportado. Envie uma imagem (JPG/PNG) ou PDF.';
  if (file.size > ANEXO_TAMANHO_MAX_BYTES) return 'Arquivo muito grande (máximo de 8MB).';
  return null;
}
