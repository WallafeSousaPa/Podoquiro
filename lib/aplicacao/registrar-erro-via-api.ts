/** Registra erro do cliente via `/api/aplicacao/registrar-erro` (sessão obrigatória). */
export async function registrarErroViaApi(payload: {
  origem: string;
  mensagem_curta: string;
  detalhe: string;
  id_paciente?: number | null;
}): Promise<number | null> {
  const res = await fetch("/api/aplicacao/registrar-erro", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j = (await res.json().catch(() => ({}))) as { codigo_erro?: number };
  const id = j.codigo_erro;
  return id != null && Number.isFinite(id) && id > 0 ? id : null;
}
