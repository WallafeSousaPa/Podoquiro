/**
 * Limite de linhas por requisição de importação de agendamentos (planilha).
 * Ajuste conforme timeout do ambiente (ex.: Vercel ~60s); importações muito grandes
 * podem exigir dividir a planilha ou aumentar limite de tempo no servidor.
 */
export const MAX_LINHAS_IMPORTACAO_AGENDAMENTOS = 10_000;
