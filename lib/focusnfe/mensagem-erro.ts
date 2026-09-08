const MSG_L0017 =
  "L0017: informe o código de tributação municipal (cTribMun) em " +
  "Nota Fiscal › Parâmetros Focus NFe. Em Belém costuma ter 3 dígitos (ex.: 001).";

const MSG_L0022 =
  "L0022: a série da DPS deve ser de 10001 a 49999 (a faixa 1–10000 é da prefeitura). " +
  "O envio agora usa a série 10001. Emita novamente.";

function ehL0017(texto: string): boolean {
  return /L0017/i.test(texto) || /c[oó]digo de tributa[cç][aã]o municipal/i.test(texto);
}

function ehL0022(texto: string): boolean {
  return /L0022/i.test(texto) || /s[eé]rie informada na DPS/i.test(texto);
}

function mensagemLayoutNacional(texto: string): string | null {
  if (ehL0017(texto)) return MSG_L0017;
  if (ehL0022(texto)) return MSG_L0022;
  return null;
}

function listaErros(body: Record<string, unknown>): unknown[] | null {
  if (Array.isArray(body.erros) && body.erros.length > 0) return body.erros;
  const data = body.data;
  if (data && typeof data === "object") {
    const erros = (data as Record<string, unknown>).erros;
    if (Array.isArray(erros) && erros.length > 0) return erros;
  }
  return null;
}

/** Extrai mensagem legível de respostas Focus NFe (emitir/consultar/cancelar NFS-e). */
export function mensagemErroFocusNfse(body: unknown): string | null {
  if (typeof body === "string" && body.trim()) {
    return mensagemLayoutNacional(body) ?? mensagemErroXmlTribNfse(body) ?? body.trim();
  }
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;

  if (typeof o.mensagem === "string" && o.mensagem.trim()) {
    return (
      mensagemLayoutNacional(o.mensagem) ??
      mensagemErroXmlTribNfse(o.mensagem) ??
      o.mensagem.trim()
    );
  }

  const erros = listaErros(o);
  if (!erros) return null;

  const parts = erros
    .map((e) => {
      if (!e || typeof e !== "object") return String(e);
      const item = e as { codigo?: string; mensagem?: string; correcao?: string };
      const bruto = [item.codigo, item.mensagem, item.correcao].filter(Boolean).join(" ");
      const xmlTrib = mensagemErroXmlTribNfse(bruto);
      if (xmlTrib) return xmlTrib;
      const codigo = (item.codigo ?? "").toUpperCase();
      if (codigo === "L0017" || ehL0017(bruto)) return MSG_L0017;
      if (codigo === "L0022" || ehL0022(bruto)) return MSG_L0022;
      const main = [item.codigo, item.mensagem].filter(Boolean).join(": ");
      const correcao = item.correcao?.trim();
      if (correcao) {
        return main ? `${main} — ${correcao}` : correcao;
      }
      return main;
    })
    .filter((p) => p.length > 0);

  return parts.length > 0 ? parts.join(" | ") : null;
}

function mensagemErroXmlTribNfse(texto: string): string | null {
  const t = texto.toLowerCase();
  if (
    t.includes("xmlvalidationerror") &&
    (t.includes("tribfed") || t.includes("tottrib") || t.includes("}trib'"))
  ) {
    return (
      "A prefeitura rejeitou a NFS-e: faltam tributos federais ou o total de tributos no XML. " +
      "Emita novamente; o envio agora inclui esses campos."
    );
  }
  return null;
}

export function mensagemErroFocusNfseOuFallback(
  body: unknown,
  fallback = "A prefeitura rejeitou a autorização da NFS-e.",
): string {
  return mensagemErroFocusNfse(body) ?? fallback;
}
