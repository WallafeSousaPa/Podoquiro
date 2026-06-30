function apenasDigitosTel(tel: string): string {
  return tel.replace(/\D/g, "");
}

/** wa.me a partir do telefone do cadastro (DDD + BR 55 quando aplicável). */
export function urlWhatsAppPaciente(tel: string | null | undefined): string | null {
  if (tel == null || !String(tel).trim()) return null;
  const d = apenasDigitosTel(String(tel));
  if (d.length === 0) return null;
  if (d.startsWith("55") && d.length >= 12) return `https://wa.me/${d}`;
  if (d.length >= 10 && d.length <= 11) return `https://wa.me/55${d}`;
  if (d.length >= 8) return `https://wa.me/${d}`;
  return null;
}

/** Mensagem padrão para confirmar horário (data e hora de início do agendamento). */
export function montarMensagemWhatsappConfirmacaoHorario(args: {
  nomePaciente: string;
  nomeEmpresa: string;
  inicioLocal: string;
  linkPagamento?: string | null;
}): string {
  const nomeP = args.nomePaciente.trim() || "paciente";
  const emp = args.nomeEmpresa.trim() || "nossa clínica";
  let dataFmt = "";
  let horaInicio = "—";
  if (args.inicioLocal.trim()) {
    const d = new Date(args.inicioLocal);
    if (!Number.isNaN(d.getTime())) {
      const raw = d.toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      dataFmt = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "";
      horaInicio = d.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }
  let msg = `Olá, Sr(a) ${nomeP}, aqui é da ${emp}, gostaria de confirmar seu horário de ${dataFmt || "—"} às ${horaInicio}.`;
  const link = args.linkPagamento?.trim();
  if (link) {
    msg += `\n\nPara confirmar, efetue o pagamento da taxa de agendamento pelo link:\n${link}`;
  }
  return msg;
}

export function urlWhatsAppComTexto(waBase: string, texto: string): string {
  return `${waBase}?text=${encodeURIComponent(texto)}`;
}
