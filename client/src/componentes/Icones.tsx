// Ícones em SVG inline (mesmo traço do mockup), sem dependência externa.
import type { SVGProps } from 'react';

const CAMINHOS: Record<string, string> = {
  inicio: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  alunos: 'M9 11.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M17 11.5a2.8 2.8 0 1 0 0-5.6M18 20c0-2.6-1-4.3-2.5-5.2',
  documento: 'M6 3h8l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5',
  importar: 'M12 3v11m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  formulario: 'M4 3h16v18H4zM9 8h6M9 12h6M9 16h3',
  instituicao: 'M3 21h18M5 21V10l7-5 7 5v11M10 21v-5h4v5',
  grade: 'M3 3h18v18H3zM3 9h18M9 9v12',
  calendario: 'M4 5h16v16H4zM4 10h16M8 3v4M16 3v4',
  assinatura: 'M3 17c3-4 5-6 6-4s-1 5 1 5 3-6 5-6 1 4 3 4 2-2 3-3M3 21h18',
  selo: 'M12 3l2.5 2.2 3.3-.5.5 3.3L21 10.5l-2.2 2.5.5 3.3-3.3.5L13.5 19 12 17l-2.5 2.2-.5-3.3-3.3-.5.5-3.3L3 10.5l2.7-2.5-.5-3.3 3.3.5z',
  usuarios: 'M8 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 11a3 3 0 1 0 0-6M22 20c0-2.8-1.5-4.6-3.5-5.2',
  escola: 'M3 21h18M6 21V8l6-4 6 4v13M9 21v-5h6v5M12 11h.01',
  livro: 'M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z',
  buscar: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm9 2-3.5-3.5',
  menu: 'M4 7h16M4 12h16M4 17h16',
  fechar: 'M6 6l12 12M18 6 6 18',
  seta: 'm9 6 6 6-6 6',
  setaBaixo: 'm6 9 6 6 6-6',
  setaEsq: 'm15 6-6 6 6 6',
  mais: 'M12 5v14M5 12h14',
  check: 'm5 12 4 4L19 7',
  alerta: 'M12 9v5m0 3h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8v5m0 3h.01',
  editar: 'M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z',
  lixeira: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  sair: 'M10 17l5-5-5-5M15 12H3M21 3v18',
  cadeado: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  chave: 'M15 9a4 4 0 1 0-3.5 3.96L4 20.5V22h3v-2h2v-2h2l1.5-1.5A4 4 0 0 0 15 9z',
  copiar: 'M8 8h12v12H8zM4 16V4h12',
  relogio: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  externo: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  olho: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  tema: 'M12 3a9 9 0 1 0 0 18V3z',
  publicar: 'M12 19V6m0 0-5 5m5-5 5 5M5 21h14',
  arrastar: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  cima: 'm6 15 6-6 6 6',
  baixo: 'm6 9 6 6 6-6',
  upload: 'M12 16V4m0 0-4 4m4-4 4 4M4 20h16'
};

export type NomeIcone = keyof typeof CAMINHOS;

export function Icone({ nome, ...resto }: { nome: NomeIcone } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...resto}>
      <path d={CAMINHOS[nome] || CAMINHOS.info} />
    </svg>
  );
}
