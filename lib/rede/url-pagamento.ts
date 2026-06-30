import { headers } from "next/headers";

/** URL absoluta para link de pagamento público (WhatsApp). */
export async function urlPublicaPagamentoTaxa(token: string): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  if (host) {
    return `${proto}://${host}/pagamento/taxa-agendamento/${token}`;
  }
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (base) return `${base}/pagamento/taxa-agendamento/${token}`;
  return `/pagamento/taxa-agendamento/${token}`;
}

export function urlPublicaPagamentoTaxaSync(token: string, origin?: string | null): string {
  const base = origin?.replace(/\/$/, "") || process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (base) return `${base}/pagamento/taxa-agendamento/${token}`;
  return `/pagamento/taxa-agendamento/${token}`;
}
