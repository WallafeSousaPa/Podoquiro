/** Ex.: 060101 → 06.01 */
export function formatCodigoLc116Exibicao(codigo6: string | null | undefined): string | null {
  const d = (codigo6 ?? "").replace(/\D/g, "");
  if (d.length !== 6) return codigo6?.trim() || null;
  return `${d.slice(0, 2)}.${d.slice(2, 4)}`;
}

/** Ex.: 869090400 → 8690-9/04-00 */
export function formatCnaeExibicao(cnae: string | null | undefined): string | null {
  const d = (cnae ?? "").replace(/\D/g, "");
  if (d.length !== 9) return cnae?.trim() || null;
  return `${d.slice(0, 4)}-${d[4]}/${d.slice(5, 7)}-${d.slice(7, 9)}`;
}

export type AtividadeEmissaoNfse = {
  codigoLc116: string | null;
  codigoExibicao: string | null;
  cnae: string | null;
  cnaeExibicao: string | null;
  codigoEnviadoApi: string | null;
};

type PayloadEnvio = {
  servico?: { codigo?: string; descricao?: string };
  _podoquiro?: {
    codigoServicoLc116?: string;
    cnaeEsperado?: string;
    dataEmissaoRpsEnviada?: string;
    dataBrasil?: string;
  };
  dataEmissao?: string;
  competencia?: string;
};

export function atividadeDePayloadEnvio(payload: unknown): Partial<AtividadeEmissaoNfse> {
  if (!payload || typeof payload !== "object") return {};
  const p = payload as PayloadEnvio;
  const codigo =
    p._podoquiro?.codigoServicoLc116?.trim() ||
    p.servico?.codigo?.trim() ||
    null;
  const cnae = p._podoquiro?.cnaeEsperado?.trim() || null;
  return {
    codigoLc116: codigo,
    codigoExibicao: formatCodigoLc116Exibicao(codigo),
    cnae,
    cnaeExibicao: formatCnaeExibicao(cnae),
    codigoEnviadoApi: p.servico?.codigo?.trim() || codigo,
  };
}

export function montarAtividadeEmissao(
  codigoServico: string | null | undefined,
  cnae: string | null | undefined,
): AtividadeEmissaoNfse {
  const codigo = codigoServico?.trim() || null;
  const cnaeNorm = cnae?.replace(/\D/g, "") || null;
  return {
    codigoLc116: codigo,
    codigoExibicao: formatCodigoLc116Exibicao(codigo),
    cnae: cnaeNorm,
    cnaeExibicao: formatCnaeExibicao(cnaeNorm),
    codigoEnviadoApi: codigo,
  };
}

export function atividadeDeEmissaoRow(row: {
  codigo_servico?: string | null;
  cnae?: string | null;
  payload_envio?: unknown;
}): AtividadeEmissaoNfse {
  const doPayload = atividadeDePayloadEnvio(row.payload_envio);
  const codigo = row.codigo_servico?.trim() || doPayload.codigoLc116 || null;
  const cnae = row.cnae?.trim() || doPayload.cnae || null;
  return montarAtividadeEmissao(codigo, cnae);
}
