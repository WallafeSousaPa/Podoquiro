import { redirect } from "next/navigation";

/** Agendar e Confirmar foram unificados em Agendamentos (/atendimentos/confirmar). */
export default function AgendarAtendimentoPage() {
  redirect("/atendimentos/confirmar");
}
