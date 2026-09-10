/** Proposta comercial A4 (HTML) da saída de venda — apenas no browser. */

export type PreOrcamentoItem = {
  produto: string;
  sku: string | null;
  un_medida: string;
  qtd: number;
  v_un: number;
  v_desc: number;
  v_total: number;
};

export type PreOrcamentoSaida = {
  id: string;
  data_saida: string;
  emit_nome: string | null;
  emit_fantasia: string | null;
  emit_cnpj: string | null;
  emit_endereco: string | null;
  emit_numero: string | null;
  emit_complemento: string | null;
  emit_bairro: string | null;
  emit_municipio: string | null;
  emit_uf: string | null;
  emit_cep: string | null;
  dest_nome: string | null;
  dest_doc: string | null;
  dest_tipo: "CPF" | "CNPJ" | null;
  dest_ie: string | null;
  dest_endereco: string | null;
  dest_numero: string | null;
  dest_complemento: string | null;
  dest_bairro: string | null;
  dest_municipio: string | null;
  dest_uf: string | null;
  dest_cep: string | null;
  dest_email: string | null;
  dest_fone: string | null;
  itens: PreOrcamentoItem[];
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function soDigitos(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

function fmtDoc(doc: string | null, tipo: "CPF" | "CNPJ" | null): string {
  const d = soDigitos(doc);
  if (tipo === "CPF" || d.length === 11) {
    if (d.length !== 11) return doc?.trim() || "";
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  return doc?.trim() || "";
}

function fmtCep(cep: string | null): string {
  const d = soDigitos(cep);
  if (d.length !== 8) return (cep ?? "").trim();
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function fmtFone(fone: string | null): string {
  const d = soDigitos(fone);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return (fone ?? "").trim();
}

function fmtNum(n: number, frac = 2): string {
  if (!Number.isFinite(n)) return (0).toLocaleString("pt-BR", { minimumFractionDigits: frac, maximumFractionDigits: frac });
  return n.toLocaleString("pt-BR", { minimumFractionDigits: frac, maximumFractionDigits: frac });
}

function fmtData(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function numeroPreOrcamento(id: string): string {
  const hex = id.replace(/-/g, "").slice(-6);
  const n = Number.parseInt(hex, 16);
  return Number.isFinite(n) ? String(n) : id.slice(0, 8);
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function linhaEndereco(params: {
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
}): string {
  const partes = [
    params.endereco?.trim(),
    params.numero?.trim() ? `Nº ${params.numero.trim()}` : null,
    params.complemento?.trim(),
    params.bairro?.trim(),
  ].filter(Boolean);
  return partes.join(", ");
}

function linhaCidade(cep: string | null, municipio: string | null, uf: string | null): string {
  const cepF = fmtCep(cep);
  const mun = (municipio ?? "").trim();
  const ufF = (uf ?? "").trim().toUpperCase();
  const cidade = [mun, ufF].filter(Boolean).join(", ");
  if (cepF && cidade) return `${cepF} - ${cidade}`;
  return cepF || cidade;
}

export function montarHtmlPreOrcamento(d: PreOrcamentoSaida): string {
  const numero = numeroPreOrcamento(d.id);
  const logoSrc =
    typeof window !== "undefined"
      ? `${window.location.origin}/PodoquiroLogoHome.jpeg`
      : "/PodoquiroLogoHome.jpeg";

  const emitNome =
    d.emit_nome?.trim() || d.emit_fantasia?.trim() || "Podoquiro";
  const emitFantasia = d.emit_fantasia?.trim();
  const emitEnd = linhaEndereco({
    endereco: d.emit_endereco,
    numero: d.emit_numero,
    complemento: d.emit_complemento,
    bairro: d.emit_bairro,
  });
  const emitCid = linhaCidade(d.emit_cep, d.emit_municipio, d.emit_uf);
  const emitCnpj = fmtDoc(d.emit_cnpj, "CNPJ");

  const destNome = d.dest_nome?.trim() || "Comprador";
  const destDocLabel = d.dest_tipo === "CNPJ" ? "CNPJ" : "CPF";
  const destDoc = fmtDoc(d.dest_doc, d.dest_tipo);
  const destEnd = linhaEndereco({
    endereco: d.dest_endereco,
    numero: d.dest_numero,
    complemento: d.dest_complemento,
    bairro: d.dest_bairro,
  });
  const destCid = linhaCidade(d.dest_cep, d.dest_municipio, d.dest_uf);
  const destFone = fmtFone(d.dest_fone);
  const destEmail = d.dest_email?.trim() || "";
  const destContato = [destFone ? `Fone: ${destFone}` : null, destEmail]
    .filter(Boolean)
    .join(", ");

  const linhas = d.itens.map((it) => {
    const qtd = Number(it.qtd) || 0;
    const vUn = Number(it.v_un) || 0;
    const vDesc = Math.max(0, Number(it.v_desc) || 0);
    const bruto = roundMoney(qtd * vUn);
    const total = roundMoney(Number(it.v_total) || Math.max(0, bruto - vDesc));
    const pct = bruto > 0 ? roundMoney((Math.min(vDesc, bruto) / bruto) * 100) : 0;
    const precoUn = qtd > 0 ? roundMoney(total / qtd) : 0;
    return {
      produto: it.produto,
      sku: it.sku?.trim() || "—",
      un: (it.un_medida || "UN").trim() || "UN",
      qtd,
      vUn,
      pct,
      precoUn,
      total,
      desc: Math.min(vDesc, bruto),
    };
  });

  const nItens = linhas.length;
  const somaQtd = linhas.reduce((s, l) => s + l.qtd, 0);
  const descTotal = roundMoney(linhas.reduce((s, l) => s + l.desc, 0));
  const totalItens = roundMoney(linhas.reduce((s, l) => s + l.total, 0));
  const rowsHtml = linhas
    .map(
      (l) => `
            <tr>
                <td class="text-left">${esc(l.produto)}</td>
                <td class="text-center">${esc(l.sku)}</td>
                <td class="text-center">${esc(l.un)}</td>
                <td class="text-right">${fmtNum(l.qtd)}</td>
                <td class="text-right">${fmtNum(l.vUn)}</td>
                <td class="text-right">${fmtNum(l.pct)}</td>
                <td class="text-right">${fmtNum(l.precoUn)}</td>
                <td class="text-right">${fmtNum(l.total)}</td>
            </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Proposta Nº ${esc(numero)}</title>
    <style>
        @page {
            size: A4;
            margin: 12mm 15mm 12mm 15mm;
        }

        * {
            box-sizing: border-box;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 9.5pt;
            color: #111111;
        }

        body {
            margin: 0;
            padding: 0;
            background-color: #ffffff;
        }

        .header-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 5px;
        }

        .header-table td {
            vertical-align: middle;
            padding: 0;
        }

        .logo-container {
            width: 45%;
        }

        .logo-container img {
            max-height: 58px;
            max-width: 180px;
            object-fit: contain;
        }

        .company-info {
            width: 55%;
            text-align: right;
            font-size: 8pt;
            line-height: 1.25;
            color: #333;
        }

        .company-info strong {
            font-size: 8.5pt;
        }

        .document-title {
            text-align: center;
            font-size: 14pt;
            font-weight: bold;
            margin: 15px 0 10px 0;
        }

        .info-section {
            width: 100%;
            margin-bottom: 12px;
            border-collapse: collapse;
        }

        .customer-box {
            border: 1px solid #444444;
            padding: 6px 8px;
            font-size: 8.5pt;
            line-height: 1.35;
        }

        .meta-table {
            width: 100%;
            border-collapse: collapse;
        }

        .meta-table td {
            border: 1px solid #444444;
            padding: 6px 8px;
            font-size: 9pt;
        }

        .meta-table td.label-cell {
            font-weight: bold;
            width: 55%;
        }

        .meta-table td.value-cell {
            text-align: left;
            width: 45%;
        }

        .section-header {
            font-weight: bold;
            font-size: 9pt;
            margin-bottom: 4px;
        }

        table.data-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 10px;
        }

        table.data-table th, table.data-table td {
            border: 1px solid #444444;
            padding: 3px 5px;
            font-size: 8.5pt;
            vertical-align: middle;
        }

        table.data-table th {
            background-color: #f2f2f2;
            font-weight: bold;
            text-align: center;
        }

        .text-left { text-align: left; }
        .text-center { text-align: center; }
        .text-right { text-align: right; }

        table.summary-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 15px;
        }

        table.summary-table th, table.summary-table td {
            border: 1px solid #444444;
            padding: 4px 5px;
            font-size: 8.5pt;
            text-align: right;
        }

        table.summary-table th {
            background-color: #ffffff;
            font-weight: bold;
            text-align: right;
        }

        .footer-signature {
            font-size: 8.5pt;
            line-height: 1.4;
            margin-top: 10px;
        }

        @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
    </style>
</head>
<body>
    <table class="header-table">
        <tr>
            <td class="logo-container">
                <img src="${esc(logoSrc)}" alt="Podoquiro">
            </td>
            <td class="company-info">
                <strong>${esc(emitNome)}</strong>${
                  emitFantasia && emitFantasia !== emitNome
                    ? `<br>${esc(emitFantasia)}`
                    : ""
                }<br>
                ${emitEnd ? `${esc(emitEnd)}<br>` : ""}${
                  emitCid ? `${esc(emitCid)}<br>` : ""
                }${emitCnpj ? `CNPJ: ${esc(emitCnpj)}` : ""}
            </td>
        </tr>
    </table>

    <div class="document-title">
        Proposta Nº ${esc(numero)}
    </div>

    <table class="info-section">
        <tr>
            <td style="width: 65%; vertical-align: top; padding-right: 15px;">
                <div class="customer-box">
                    <strong>Para</strong>
                    <div style="margin-top: 4px;">
                        ${esc(destNome)}<br>
                        ${destDoc ? `${esc(destDocLabel)}: ${esc(destDoc)}${d.dest_ie?.trim() ? `, IE: ${esc(d.dest_ie.trim())}` : ""}<br>` : ""}
                        ${destEnd ? `${esc(destEnd)}<br>` : ""}${
                          destCid ? `${esc(destCid)}<br>` : ""
                        }${destContato ? esc(destContato) : ""}
                    </div>
                </div>
            </td>
            <td style="width: 35%; vertical-align: top;">
                <table class="meta-table">
                    <tr>
                        <td class="label-cell">Número da Proposta</td>
                        <td class="value-cell">${esc(numero)}</td>
                    </tr>
                    <tr>
                        <td class="label-cell">Data</td>
                        <td class="value-cell">${esc(fmtData(d.data_saida))}</td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>

    <div class="section-header">Itens da proposta comercial</div>
    <table class="data-table">
        <thead>
            <tr>
                <th class="text-left" style="width: 38%;">Descrição do produto/serviço</th>
                <th class="text-center" style="width: 11%;">Código</th>
                <th class="text-center" style="width: 5%;">Un</th>
                <th class="text-right" style="width: 8%;">Qtd.</th>
                <th class="text-right" style="width: 9%;">Preço lista.</th>
                <th class="text-right" style="width: 9%;">Desconto %</th>
                <th class="text-right" style="width: 9%;">Preço un.</th>
                <th class="text-right" style="width: 11%;">Preço total</th>
            </tr>
        </thead>
        <tbody>
            ${rowsHtml}
        </tbody>
    </table>

    <table class="summary-table">
        <thead>
            <tr>
                <th style="width: 14%;">Nº de Itens</th>
                <th style="width: 16%;">Soma das Qtdes</th>
                <th style="width: 18%;">Desconto total dos itens</th>
                <th style="width: 18%;">Total dos itens</th>
                <th style="width: 14%;">Frete</th>
                <th style="width: 20%;">Total da proposta</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>${fmtNum(nItens)}</td>
                <td>${fmtNum(somaQtd, somaQtd % 1 === 0 ? 0 : 2)}</td>
                <td>${fmtNum(descTotal)}</td>
                <td>${fmtNum(totalItens)}</td>
                <td>0,00</td>
                <td><strong>${fmtNum(totalItens)}</strong></td>
            </tr>
        </tbody>
    </table>

    <div class="footer-signature">
        Atenciosamente,<br>
        Departamento de vendas
    </div>
</body>
</html>`;
}

export function gerarPreOrcamentoSaidaUrl(d: PreOrcamentoSaida): string {
  const html = montarHtmlPreOrcamento(d);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  return URL.createObjectURL(blob);
}
