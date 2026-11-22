export const CATEGORIAS_SAIDA_FIXA = [
  "Fixas de Funcionamento",
  "Serviços Fixos",
  "Empréstimos Fixos",
  "Cartões",
  "Pessoal Fixo",
  "Impostos Fixos",
  "Taxas de Máquinas / Bancárias",
] as const;

export const CATEGORIAS_SAIDA_VARIAVEL = [
  "Variável de Serviço",
  "Variável de Insumos",
  "Variável Pessoal",
  "Variável de Uso / Operacional",
  "Obras / Reformas / Equipamentos",
] as const;

export const CATEGORIAS_ENTRADA = [
  "Receita Pix",
  "Receita Crédito",
  "Receita Débito",
  "Receita Dinheiro",
  "Receita Link",
  "Repasse entre lojas",
  "Outras receitas",
] as const;

export type NaturezaLancamento = "fixa" | "variavel" | "entrada";
export type TipoLancamento = "entrada" | "saida";
export type StatusLancamento = "pago" | "pendente";

const FIXA = new Set<string>(CATEGORIAS_SAIDA_FIXA);
const VARIAVEL = new Set<string>(CATEGORIAS_SAIDA_VARIAVEL);
const ENTRADA = new Set<string>(CATEGORIAS_ENTRADA);

export function categoriasDaNatureza(natureza: NaturezaLancamento): readonly string[] {
  if (natureza === "fixa") return CATEGORIAS_SAIDA_FIXA;
  if (natureza === "variavel") return CATEGORIAS_SAIDA_VARIAVEL;
  return CATEGORIAS_ENTRADA;
}

export function categoriaPermitida(natureza: NaturezaLancamento, categoria: string): boolean {
  if (natureza === "fixa") return FIXA.has(categoria);
  if (natureza === "variavel") return VARIAVEL.has(categoria);
  return ENTRADA.has(categoria);
}

/** Categoria de entrada a partir do nome da forma já usada no caixa. */
export function categoriaEntradaPorMeio(nome: string): string {
  const n = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (n.includes("pix")) return "Receita Pix";
  if (n.includes("debito")) return "Receita Débito";
  if (n.includes("credito") || n.includes("cart")) return "Receita Crédito";
  if (n.includes("dinheiro") || n.includes("especie") || n.includes("numerario")) {
    return "Receita Dinheiro";
  }
  if (n.includes("link") || n.includes("asaas")) return "Receita Link";
  return "Outras receitas";
}

const COMPETENCIA_RE = /^(\d{4})-(\d{2})$/;

export function competenciaValida(valor: string): boolean {
  const m = COMPETENCIA_RE.exec(valor);
  if (!m) return false;
  const mes = Number(m[2]);
  return mes >= 1 && mes <= 12;
}

export function periodoCompetencia(competencia: string): {
  inicio: string;
  fim: string;
} {
  const m = COMPETENCIA_RE.exec(competencia);
  if (!m) throw new Error("Competência inválida.");
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const ultimo = new Date(ano, mes, 0).getDate();
  return {
    inicio: `${competencia}-01`,
    fim: `${competencia}-${String(ultimo).padStart(2, "0")}`,
  };
}

export function rotuloCompetencia(competencia: string): string {
  const m = COMPETENCIA_RE.exec(competencia);
  if (!m) return competencia;
  const data = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  const texto = data.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
