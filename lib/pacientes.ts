export const PACIENTE_GENEROS = [
  "Masculino",
  "Feminino",
  "Não-binário",
  "Outro",
  "Prefiro não responder",
] as const;

export const PACIENTE_ESTADOS_CIVIS = [
  "Solteiro",
  "Casado",
  "Divorciado",
  "Viuvo",
  "Outro",
] as const;

export type PacienteGenero = (typeof PACIENTE_GENEROS)[number];
export type PacienteEstadoCivil = (typeof PACIENTE_ESTADOS_CIVIS)[number];

export function normalizeCpfDigits(raw: string | null | undefined): string {
  if (raw == null || typeof raw !== "string") return "";
  return raw.replace(/\D/g, "");
}

export function isCpfLengthOk(digits: string): boolean {
  return /^\d{11}$/.test(digits);
}

export function nomeExibicaoPaciente(row: {
  nome_completo: string | null;
  nome_social: string | null;
}): string {
  const nc = row.nome_completo?.trim();
  if (nc) return nc;
  return row.nome_social?.trim() ?? "";
}
