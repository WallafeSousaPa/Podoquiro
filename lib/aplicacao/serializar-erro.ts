/** Serializa contexto + exceção/erro para gravação em `aplicacao_erro_log.detalhe_tecnico`. */
export function serializarContextoErro(
  contexto: Record<string, unknown>,
  err?: unknown,
): string {
  const out: Record<string, unknown> = { ...contexto };
  if (err instanceof Error) {
    out.exception_name = err.name;
    out.exception_message = err.message;
    out.exception_stack = err.stack;
  } else if (err !== undefined) {
    out.exception = err;
  }
  try {
    return JSON.stringify(out, null, 2);
  } catch {
    return JSON.stringify({ contexto, note: "Falha ao serializar exceção." });
  }
}
