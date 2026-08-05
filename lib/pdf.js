'use strict';
const puppeteer = require('puppeteer');

// Instancia unica do browser headless, reaproveitada entre chamadas
// (abrir/fechar o Chromium inteiro a cada PDF seria caro). Cada
// renderizacao usa sua propria aba (page), fechada ao final.
let browserPromise = null;
function getBrowser() {
  if (!browserPromise) {
    // Em producao (ver Dockerfile) usamos o Chromium do sistema instalado
    // via apt em vez do Chrome baixado pelo proprio Puppeteer — evita
    // depender de acesso de rede ao storage.googleapis.com durante o
    // build e problemas de libc incompativel (Alpine) em imagens Node
    // genericas. Localmente, sem essa env var, cai no Chrome que o
    // `npm install` do Puppeteer ja baixa normalmente.
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
    browserPromise = puppeteer.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
  return browserPromise;
}

// Renderiza a rota interna /internal/pdf/visita/:id (views/pdf-visita.ejs)
// num browser headless e devolve o PDF como Buffer. Essa e a UNICA rotina
// de geracao de PDF da aplicacao — tanto o botao "Baixar PDF" (rota
// GET /api/responses/:id/pdf) quanto o envio automatico pro n8n
// (lib/n8n.js) passam por aqui, garantindo que o arquivo seja sempre
// identico nos dois fluxos.
async function renderVisitaPdf({ baseUrl, visitaId, internalToken }) {
  if (!internalToken) {
    throw new Error('INTERNAL_PDF_SECRET nao configurado no .env');
  }

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 794, height: 1123 }); // A4 a 96dpi
    const url = `${baseUrl}/internal/pdf/visita/${visitaId}?token=${encodeURIComponent(internalToken)}`;
    const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 });
    if (!response || !response.ok()) {
      throw new Error(`Falha ao carregar pagina de PDF (status ${response && response.status()})`);
    }
    await page.waitForFunction('window.__PDF_READY__ === true', { timeout: 15000 });

    // __PDF_READY__ so garante que a logo (imagem) carregou — as fontes web
    // (Google Fonts / FontAwesome, carregadas via <link> no <head>) podem
    // ainda estar chegando nesse momento. Se a altura for medida antes
    // delas terminarem, o texto reflui pra um line-height maior depois da
    // medicao e o conteudo passa a ultrapassar a altura fixada no PDF —
    // foi isso que jogou a assinatura pra uma segunda pagina em branco.
    await page.evaluate(() => (document.fonts && document.fonts.ready) || null);

    // page.pdf() usa o media type "print" por padrao. O site tem uma
    // regra @media print em public/css/styles.css (body * { visibility:
    // hidden }, so mostra .print-document) pensada pra outro fluxo — isso
    // deixava a pagina inteira invisivel no PDF. Forcando "screen" aqui a
    // gente ignora esse @media print e renderiza com o mesmo CSS que
    // aparece normalmente no navegador (o objetivo era manter a
    // estilizacao atual, nao a de impressao).
    await page.emulateMediaType('screen');

    // Folha A4 (210 x 297mm a 96dpi = 794 x 1123px). Na maioria das
    // visitas o conteudo cabe dentro disso, entao o PDF sai no tamanho
    // A4 "de verdade". So quando uma visita tem conteudo excepcionalmente
    // longo (varios irmaos, textos longos em motivo/observacoes) a altura
    // cresce alem do A4 — preferimos isso a cortar conteudo ou paginar,
    // que era o problema original.
    const A4_WIDTH_PX = 794;
    const A4_HEIGHT_PX = 1123;

    const contentHeightPx = await page.evaluate(() => {
      const root = document.getElementById('pdf-root');
      return Math.ceil(root ? root.scrollHeight : document.body.scrollHeight);
    });
    // +4px de folga contra arredondamento de subpixel entre a medicao e
    // a renderizacao final do PDF — sem isso, uma unica linha de 1px podia
    // transbordar pra uma segunda pagina.
    const pdfHeightPx = Math.max(contentHeightPx + 4, A4_HEIGHT_PX);

    const pdfBytes = await page.pdf({
      width: `${A4_WIDTH_PX}px`,
      height: `${pdfHeightPx}px`,
      printBackground: true,
      margin: { top: '0px', bottom: '0px', left: '0px', right: '0px' }
    });
    // Puppeteer 22+ devolve Uint8Array em vez de Buffer. res.send() do
    // Express so trata Buffer de verdade como binario — qualquer outro
    // objeto (Uint8Array incluso) ele serializa como JSON silenciosamente,
    // corrompendo o PDF. Convertendo aqui garante binario real em
    // qualquer lugar que consumir o retorno desta funcao.
    return Buffer.from(pdfBytes);
  } finally {
    await page.close();
  }
}

module.exports = { renderVisitaPdf, getBrowser };
