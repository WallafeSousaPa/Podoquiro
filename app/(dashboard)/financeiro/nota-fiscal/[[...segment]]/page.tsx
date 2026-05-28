import { redirect } from "next/navigation";

/** Rotas antigas Financeiro → Nota Fiscal (Notaas/NF-e) — redireciona para o menu atual. */
export default function FinanceiroNotaFiscalLegadoRedirectPage() {
  redirect("/nota-fiscal/emissao");
}
