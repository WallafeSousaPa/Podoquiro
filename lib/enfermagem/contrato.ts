import { assinaturaImagem } from "@/lib/assinatura-imagem";

export type ContratoEnfermagem = {
  enfermeira_nome: string;
  enfermeira_endereco: string;
  enfermeira_cpf: string;
  paciente_nome: string;
  paciente_estado_civil: string;
  paciente_profissao: string;
  paciente_rua: string;
  paciente_bairro: string;
  paciente_cidade: string;
  paciente_uf: string;
  paciente_cpf: string;
  valor_primeira_consulta: string;
  valor_pacote: string;
  data_inicio: string;
  data_fim: string;
  local_assinatura: string;
  data_assinatura: string;
  assinatura_enfermeira: string;
  assinatura_paciente: string;
};

export const CONTRATO_VAZIO: ContratoEnfermagem = {
  enfermeira_nome: "",
  enfermeira_endereco: "",
  enfermeira_cpf: "",
  paciente_nome: "",
  paciente_estado_civil: "",
  paciente_profissao: "",
  paciente_rua: "",
  paciente_bairro: "",
  paciente_cidade: "",
  paciente_uf: "",
  paciente_cpf: "",
  valor_primeira_consulta: "",
  valor_pacote: "",
  data_inicio: "",
  data_fim: "",
  local_assinatura: "",
  data_assinatura: "",
  assinatura_enfermeira: "",
  assinatura_paciente: "",
};

const LIMITES: Record<keyof ContratoEnfermagem, number> = {
  enfermeira_nome: 160,
  enfermeira_endereco: 300,
  enfermeira_cpf: 20,
  paciente_nome: 160,
  paciente_estado_civil: 60,
  paciente_profissao: 80,
  paciente_rua: 200,
  paciente_bairro: 80,
  paciente_cidade: 80,
  paciente_uf: 2,
  paciente_cpf: 20,
  valor_primeira_consulta: 40,
  valor_pacote: 40,
  data_inicio: 10,
  data_fim: 10,
  local_assinatura: 80,
  data_assinatura: 10,
  assinatura_enfermeira: 0,
  assinatura_paciente: 0,
};

function texto(valor: unknown, max: number): string {
  if (typeof valor !== "string") return "";
  return valor.replace(/\s+/g, " ").trim().slice(0, max);
}

function dataIso(valor: unknown): string {
  const t = texto(valor, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : "";
}

export function hojeIsoSaoPaulo(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

export function isoMaisUmAno(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  const dt = new Date(Date.UTC(y + 1, m - 1, d));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function formatarDataContrato(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso.trim();
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const ORDEM_ERROS: (keyof ContratoEnfermagem)[] = [
  "enfermeira_nome",
  "paciente_nome",
  "valor_primeira_consulta",
  "valor_pacote",
  "data_inicio",
  "data_fim",
  "local_assinatura",
  "data_assinatura",
];

export function errosCamposContrato(
  dados: ContratoEnfermagem,
): Partial<Record<keyof ContratoEnfermagem, string>> {
  const erros: Partial<Record<keyof ContratoEnfermagem, string>> = {};
  if (!dados.enfermeira_nome) erros.enfermeira_nome = "Informe o nome da enfermeira.";
  if (!dados.paciente_nome) erros.paciente_nome = "Informe o nome do paciente.";
  if (!dados.valor_primeira_consulta) {
    erros.valor_primeira_consulta = "Informe o valor da primeira consulta.";
  }
  if (!dados.valor_pacote) erros.valor_pacote = "Informe o valor do pacote de curativos.";
  if (!dados.data_inicio) erros.data_inicio = "Informe o início da vigência.";
  if (!dados.data_fim) erros.data_fim = "Informe o fim da vigência.";
  else if (dados.data_inicio && dados.data_fim < dados.data_inicio) {
    erros.data_fim = "O fim da vigência precisa ser depois do início.";
  }
  if (!dados.local_assinatura) erros.local_assinatura = "Informe o local da assinatura.";
  if (!dados.data_assinatura) erros.data_assinatura = "Informe a data da assinatura.";
  return erros;
}

export function sanitizarContrato(
  bruto: unknown,
):
  | { ok: true; dados: ContratoEnfermagem }
  | {
      ok: false;
      erro: string;
      campo: keyof ContratoEnfermagem;
      erros: Partial<Record<keyof ContratoEnfermagem, string>>;
      dados: ContratoEnfermagem;
    } {
  const src = bruto && typeof bruto === "object" ? (bruto as Record<string, unknown>) : {};
  const dados = { ...CONTRATO_VAZIO };
  (Object.keys(CONTRATO_VAZIO) as (keyof ContratoEnfermagem)[]).forEach((chave) => {
    if (chave === "assinatura_enfermeira" || chave === "assinatura_paciente") return;
    if (chave === "data_inicio" || chave === "data_fim" || chave === "data_assinatura") {
      dados[chave] = dataIso(src[chave]);
      return;
    }
    if (chave === "paciente_uf") {
      dados[chave] = texto(src[chave], 2).toUpperCase();
      return;
    }
    dados[chave] = texto(src[chave], LIMITES[chave]);
  });
  dados.assinatura_paciente = assinaturaImagem(src.assinatura_paciente);
  dados.assinatura_enfermeira = assinaturaImagem(src.assinatura_enfermeira);

  const erros = errosCamposContrato(dados);
  const campo = ORDEM_ERROS.find((chave) => erros[chave]);
  if (campo) return { ok: false, erro: erros[campo] ?? "Preencha os campos obrigatórios.", campo, erros, dados };
  return { ok: true, dados };
}

/** Usa a assinatura já gravada no contrato. Se não houver, usa a do usuário que o registrou. */
export function comAssinaturaEnfermeira(
  dados: ContratoEnfermagem,
  assinaturaUsuario: unknown,
): ContratoEnfermagem {
  if (dados.assinatura_enfermeira) return dados;
  const imagem = assinaturaImagem(assinaturaUsuario);
  if (!imagem) return dados;
  return { ...dados, assinatura_enfermeira: imagem };
}
