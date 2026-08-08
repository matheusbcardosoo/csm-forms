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

// Folha A4 (210 x 297mm a 96dpi = 794 x 1123px).
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;

// Abre uma URL interna (/internal/pdf/...) num browser headless e devolve
// o PDF como Buffer. Rotina compartilhada por qualquer PDF da aplicacao —
// tanto o de uma resposta preenchida (renderVisitaPdf) quanto o modelo em
// branco (renderVisitaBlankPdf) passam por aqui, entao os dois saem sempre
// com o mesmo tratamento de fontes/imagens/paginacao.
async function renderInternalPagePdf(url) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // O browser e reaproveitado entre chamadas (getBrowser acima), entao seu
    // HTTP cache tambem persiste entre requisicoes. Gerando o mesmo PDF duas
    // vezes seguidas, a segunda navegacao virava um GET condicional que o
    // servidor respondia com 304 (ETag automatico do Express) — response.ok()
    // da false pra 304 e o goto() abaixo lancava erro mesmo com o conteudo
    // certo em cache.
    await page.setCacheEnabled(false);
    await page.setViewport({ width: A4_WIDTH_PX, height: A4_HEIGHT_PX });
    const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 });
    if (!response || !response.ok()) {
      throw new Error(`Falha ao carregar pagina de PDF (status ${response && response.status()})`);
    }
    await page.waitForFunction('window.__PDF_READY__ === true', { timeout: 15000 });

    // __PDF_READY__ so garante que as imagens (logos) carregaram — as fontes
    // web (Google Fonts / FontAwesome, carregadas via <link> no <head>) podem
    // ainda estar chegando nesse momento. Se a altura for medida antes delas
    // terminarem, o texto reflui pra um line-height maior depois da medicao e
    // o conteudo passa a ultrapassar a altura fixada no PDF — foi isso que
    // jogou a assinatura pra uma segunda pagina em branco.
    await page.evaluate(() => (document.fonts && document.fonts.ready) || null);

    // page.pdf() usa o media type "print" por padrao. O site tem uma regra
    // @media print em public/css/styles.css (body * { visibility: hidden },
    // so mostra .print-document) pensada pra outro fluxo — isso deixava a
    // pagina inteira invisivel no PDF. Forcando "screen" aqui a gente ignora
    // esse @media print e renderiza com o mesmo CSS que aparece normalmente
    // no navegador.
    await page.emulateMediaType('screen');

    // Na maioria dos casos o conteudo cabe dentro do A4, entao o PDF sai no
    // tamanho A4 "de verdade". So quando o conteudo e excepcionalmente longo
    // a altura cresce alem do A4 — preferimos isso a cortar conteudo ou
    // paginar.
    const contentHeightPx = await page.evaluate(() => {
      const root = document.getElementById('pdf-root');
      return Math.ceil(root ? root.scrollHeight : document.body.scrollHeight);
    });
    // +4px de folga contra arredondamento de subpixel entre a medicao e a
    // renderizacao final do PDF — sem isso, uma unica linha de 1px podia
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
    // corrompendo o PDF. Convertendo aqui garante binario real em qualquer
    // lugar que consumir o retorno desta funcao.
    return Buffer.from(pdfBytes);
  } finally {
    await page.close();
  }
}

// Renderiza a rota interna /internal/pdf/visita/:id (views/pdf-visita.ejs).
// Usada tanto pelo botao "Baixar PDF" (rota GET /api/responses/:id/pdf)
// quanto pelo envio automatico ao n8n (lib/n8n.js), garantindo que o
// arquivo seja sempre identico nos dois fluxos.
async function renderVisitaPdf({ baseUrl, visitaId, internalToken }) {
  if (!internalToken) {
    throw new Error('INTERNAL_PDF_SECRET nao configurado no .env');
  }
  const url = `${baseUrl}/internal/pdf/visita/${visitaId}?token=${encodeURIComponent(internalToken)}`;
  return renderInternalPagePdf(url);
}

// Gera o PDF do modelo de ficha de visita EM BRANCO (views/pdf-visita-blank.ejs)
// — sem dados de nenhuma visita especifica. Pensado pra secretaria imprimir
// e deixar disponivel na recepcao, pra quem prefere preencher a mao em vez
// do formulario online. Usa a mesma pipeline de renderInternalPagePdf().
async function renderVisitaBlankPdf({ baseUrl, internalToken }) {
  if (!internalToken) {
    throw new Error('INTERNAL_PDF_SECRET nao configurado no .env');
  }
  const url = `${baseUrl}/internal/pdf/visita-blank?token=${encodeURIComponent(internalToken)}`;
  return renderInternalPagePdf(url);
}

module.exports = { renderVisitaPdf, renderVisitaBlankPdf, getBrowser };
