function escaparHtml(valor: string): string {
  return valor.replace(/[&<>"]/g, (c) => {
    if (c === "&") return "&amp;";
    if (c === "<") return "&lt;";
    if (c === ">") return "&gt;";
    return "&quot;";
  });
}

const CSS_IMPRESSAO = `
  @page { size: A4; margin: 12mm 12mm 16mm; }
  @page contrato { size: A4; margin: 8mm 10mm 10mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    font-family: "Segoe UI", Arial, sans-serif;
    color: #2b2430;
    font-size: 11px;
    line-height: 1.45;
  }
  .capa {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 0 12px;
    margin: 0 0 14px;
    border-bottom: 4px solid #de765b;
  }
  .capa img { width: 72px; height: 72px; object-fit: contain; }
  .olho {
    margin: 0;
    color: #de765b;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .capa h1 {
    margin: 1px 0 0;
    color: #4f1964;
    font-size: 26px;
    font-weight: 700;
    letter-spacing: 0.02em;
    line-height: 1;
  }
  .doc {
    margin: 4px 0 0;
    color: #351043;
    font-size: 13px;
    font-weight: 600;
  }
  .ficha-print section {
    break-inside: avoid;
    border: 1px solid #eadff0;
    border-radius: 8px;
    padding: 8px 10px 6px;
    margin: 0 0 8px;
    background: #fff;
  }
  .ficha-print h6,
  .ficha-print .text-primary {
    color: #4f1964 !important;
    background: #f7f1f9;
    border: 0;
    border-left: 4px solid #de765b;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    margin: 0 0 8px;
    padding: 5px 8px;
  }
  .ficha-print .row { display: flex; flex-wrap: wrap; margin: 0 -6px; }
  .ficha-print .col-md-6,
  .ficha-print .col-sm-6 { width: 50%; padding: 0 6px 6px; }
  .ficha-print .col-md-4 { width: 33.33%; padding: 0 6px 6px; }
  .ficha-print .col-12,
  .ficha-print .col-md-8 { width: 100%; padding: 0 6px 6px; }
  .ficha-print .text-muted, .ficha-print .small { color: #7d6a86; font-size: 9px; letter-spacing: 0.03em; text-transform: uppercase; }
  .ficha-print .font-weight-bold { color: #351043; }
  .ficha-marca {
    display: inline-block;
    min-width: 28px;
    padding: 0 6px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
    text-align: center;
  }
  .ficha-marca-sim { background: #f3e6f6; color: #4f1964; }
  .ficha-marca-nao { background: #f4f1f5; color: #9a8aa3; }
  .ficha-print table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  .ficha-print th {
    background: #4f1964;
    color: #fff;
    font-size: 10px;
    text-align: left;
  }
  .ficha-print td, .ficha-print th { border: 1px solid #eadff0; padding: 4px 6px; vertical-align: top; }
  .ficha-print tr:nth-child(even) td { background: #fbf7fc; }
  .ficha-print hr { border: 0; border-top: 1px solid #eadff0; margin: 10px 0; }
  .ficha-print .shadow-sm, .ficha-print .border.rounded { box-shadow: none !important; }
  .rodape {
    margin-top: 12px;
    border-top: 2px solid #4f1964;
    padding-top: 6px;
    display: flex;
    justify-content: space-between;
    color: #7d6a86;
    font-size: 9px;
  }
  .ficha-print .contrato-doc { font-size: 12px; line-height: 1.55; text-align: justify; color: #2b2430; }
  .ficha-print .contrato-doc h2 {
    text-align: center;
    color: #4f1964;
    font-size: 15px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    margin: 0 0 12px;
    background: none;
    border: 0;
    padding: 0;
  }
  .ficha-print .contrato-doc h3 { color: #4f1964; font-size: 12px; margin: 12px 0 4px; text-align: left; }
  .ficha-print .contrato-doc p, .ficha-print .contrato-doc li { margin: 0 0 6px; }
  .ficha-print .contrato-valor { border-bottom: 1px solid #de765b; font-weight: 700; color: #351043; }
  .ficha-print .contrato-local { margin-top: 16px; text-align: left; font-weight: 700; }
  .ficha-print .contrato-assinaturas { display: flex; gap: 24px; margin-top: 18px; text-align: center; break-inside: avoid; page-break-inside: avoid; }
  .ficha-print .contrato-assinaturas > div { flex: 1; }
  .ficha-print .contrato-rubrica { height: 42px; display: flex; align-items: flex-end; justify-content: center; }
  .ficha-print .contrato-rubrica img { max-height: 42px; max-width: 180px; object-fit: contain; }
  .ficha-print .contrato-linha { border-top: 1px solid #351043; margin: 2px 12px 4px; }
  .ficha-print .contrato-papel { color: #7d6a86; font-size: 9px; letter-spacing: 0.06em; text-transform: uppercase; }
  body.impressao-contrato { font-size: 13px; line-height: 1.45; page: contrato; }
  body.impressao-contrato .capa { gap: 14px; padding-bottom: 10px; margin-bottom: 12px; }
  body.impressao-contrato .capa img { width: 64px; height: 64px; }
  body.impressao-contrato .capa h1 { font-size: 24px; }
  body.impressao-contrato .doc { font-size: 13px; margin-top: 3px; }
  body.impressao-contrato .ficha-print .contrato-doc { font-size: 13px; line-height: 1.45; }
  body.impressao-contrato .ficha-print .contrato-doc h2 { font-size: 16px; margin: 0 0 10px; }
  body.impressao-contrato .ficha-print .contrato-doc h3 { font-size: 13.5px; margin: 12px 0 4px; }
  body.impressao-contrato .ficha-print .contrato-doc p,
  body.impressao-contrato .ficha-print .contrato-doc li { margin: 0 0 6px; }
  body.impressao-contrato .ficha-print .contrato-doc ul { margin: 2px 0 8px; padding-left: 18px; }
  body.impressao-contrato .ficha-print .contrato-local { margin-top: 16px; }
  body.impressao-contrato .ficha-print .contrato-assinaturas { margin-top: 8px; gap: 28px; }
  body.impressao-contrato .ficha-print .contrato-linha { margin: 2px 12px 4px; }
  body.impressao-contrato .rodape { margin-top: 14px; break-before: avoid; page-break-before: avoid; }
`;

function documentoImpressao(node: HTMLElement, titulo: string, rodape: string): string {
  const tituloSeguro = escaparHtml(titulo);
  const contrato = Boolean(node.querySelector(".contrato-doc") || node.classList.contains("contrato-doc"));
  const logo = new URL("/IconePodoquiro.png", window.location.origin).href;
  const quando = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${tituloSeguro}</title>
  <style>${CSS_IMPRESSAO}</style>
</head>
<body class="${contrato ? "impressao-contrato" : ""}">
  <header class="capa">
    <img src="${logo}" alt="Podoquiro" />
    <div>
      <p class="olho">Clínica de Podologia</p>
      <h1>Podoquiro</h1>
      <p class="doc">${tituloSeguro}</p>
    </div>
  </header>
  <main class="ficha-print">
    ${node.innerHTML}
  </main>
  <footer class="rodape">
    <span>${escaparHtml(rodape)}</span>
    <span>Impresso em ${quando}</span>
  </footer>
</body>
</html>`;
}

function escreverDocumento(doc: Document, html: string) {
  doc.open();
  doc.write(html);
  doc.close();
}

/** Abre a visualização da ficha e chama a impressão do navegador (Salvar como PDF). */
export function imprimirHtml(
  node: HTMLElement,
  titulo: string,
  opcoes?: { rodape?: string },
): void {
  const html = documentoImpressao(node, titulo, opcoes?.rodape ?? "Podoquiro · Documento clínico");
  const janela = window.open("", "_blank");
  if (janela) {
    escreverDocumento(janela.document, html);
    janela.opener = null;
    window.setTimeout(() => {
      janela.focus();
      janela.print();
    }, 300);
    return;
  }

  document.getElementById("impressao-ficha-enfermagem")?.remove();
  const iframe = document.createElement("iframe");
  iframe.id = "impressao-ficha-enfermagem";
  iframe.title = titulo;
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  const destino = iframe.contentWindow;
  if (!doc || !destino) {
    iframe.remove();
    window.alert("Não foi possível abrir a página de impressão.");
    return;
  }
  escreverDocumento(doc, html);
  window.setTimeout(() => {
    destino.focus();
    destino.print();
  }, 300);
}
