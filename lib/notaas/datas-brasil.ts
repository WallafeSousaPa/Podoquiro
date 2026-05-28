/** Data civil atual em America/Sao_Paulo (YYYY-MM-DD). */
export function dataHojeBrasilIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

/** Competência atual em America/Sao_Paulo (YYYY-MM). */
export function competenciaBrasilAtual(): string {
  return dataHojeBrasilIso().slice(0, 7);
}

/** Data civil atual em UTC (YYYY-MM-DD). */
export function dataHojeUtcIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(new Date());
}

/**
 * Data de emissão do RPS para DSF/ABRASF (Belém) — só a data civil em BRT.
 * A Notaas pode ignorar este campo; quando ignorado, E16 ocorre se UTC já for o dia seguinte.
 */
export function dataEmissaoRpsBrasilAbrasf(): string {
  return dataHojeBrasilIso();
}

export type AvisoFusoHorarioEmissaoNfse = {
  bloqueada: boolean;
  dataBrasil: string;
  dataUtc: string;
  mensagem: string | null;
};

/** Bloqueia emissão quando UTC está em dia civil à frente de Brasília (causa E16 na Notaas/DSF). */
export function avisoFusoHorarioEmissaoNfse(): AvisoFusoHorarioEmissaoNfse {
  const dataBrasil = dataHojeBrasilIso();
  const dataUtc = dataHojeUtcIso();
  if (dataUtc <= dataBrasil) {
    return { bloqueada: false, dataBrasil, dataUtc, mensagem: null };
  }
  const horaBr = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
  return {
    bloqueada: true,
    dataBrasil,
    dataUtc,
    mensagem:
      `Horário ${horaBr} (Brasília): a Notaas grava o RPS com data UTC (${dataUtc}), mas a prefeitura de Belém ainda considera ${dataBrasil} — erro E16. ` +
      "Emita após 00:00 BRT ou pela manhã. O Podoquiro já envia dataEmissao em horário de Brasília; a correção definitiva é na Notaas.",
  };
}

/** Valida YYYY-MM informado manualmente (não preenche padrão — use o da Notaas se omitido). */
export function normalizarCompetenciaNfse(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  if (!/^\d{4}-\d{2}$/.test(t)) return null;
  const [, mes] = t.split("-").map(Number);
  if (!mes || mes < 1 || mes > 12) return null;
  if (t > competenciaBrasilAtual()) return null;
  return t;
}
