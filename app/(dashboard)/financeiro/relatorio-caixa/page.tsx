import { redirect } from "next/navigation";

/** Rota legada: menu movido para Relatórios › Relatório caixa. */
export default function FinanceiroRelatorioCaixaRedirectPage() {
  redirect("/relatorios/caixa");
}
