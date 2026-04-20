/** Remove acentos e caracteres inválidos para nome de arquivo. */
export function sanitizarNomePacienteArquivo(nome: string): string {
  const s = nome
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return s.slice(0, 80) || "paciente";
}

const EXT_POR_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/heic": ".heic",
  "image/heif": ".heif",
};

export function extensaoPorMime(mime: string): string {
  const m = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  return EXT_POR_MIME[m] ?? ".jpg";
}

/**
 * Nome final no bucket: {paciente}_{idAgendamento}_{índice}{ext}
 * Caminho completo: {idEmpresa}/{nomeArquivo}
 */
export function montarCaminhoFotoProntuario(
  idEmpresa: number,
  nomePaciente: string,
  idAgendamento: number,
  indice: number,
  mime: string,
): { pathRelativo: string; nomeArquivo: string } {
  const base = sanitizarNomePacienteArquivo(nomePaciente);
  const ext = extensaoPorMime(mime);
  const nomeArquivo = `${base}_${idAgendamento}_${indice}${ext}`;
  const pathRelativo = `${idEmpresa}/${nomeArquivo}`;
  return { pathRelativo, nomeArquivo };
}
