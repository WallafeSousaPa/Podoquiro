/** Extrai mensagem legível de respostas Focus NFe (emitir/consultar/cancelar NFS-e). */
export function mensagemErroFocusNfse(body: unknown): string | null {
  if (typeof body === "string" && body.trim()) {
    return mensagemErroXmlTribNfse(body) ?? body.trim();
  }
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;

  if (typeof o.mensagem === "string" && o.mensagem.trim()) {
    return mensagemErroXmlTribNfse(o.mensagem) ?? o.mensagem.trim();
  }

  const erros = o.erros;
  if (!Array.isArray(erros) || erros.length === 0) return null;

  const parts = erros
    .map((e) => {
      if (!e || typeof e !== "object") return String(e);
      const item = e as { codigo?: string; mensagem?: string; correcao?: string };
      const bruto = [item.codigo, item.mensagem, item.correcao].filter(Boolean).join(" ");
      const xmlTrib = mensagemErroXmlTribNfse(bruto);
      if (xmlTrib) return xmlTrib;
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
