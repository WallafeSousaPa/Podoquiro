export type PapelParceiro = "fornecedor" | "comprador";

export function tabelaParceiro(
  papel: unknown,
): "estoque_fornecedores" | "estoque_compradores" | null {
  if (papel === "fornecedor") return "estoque_fornecedores";
  if (papel === "comprador") return "estoque_compradores";
  return null;
}

export type ParceiroEstoqueRow = {
  id: string;
  id_empresa: number;
  nome: string;
  razao_social: string | null;
  fantasia: string | null;
  doc: string;
  tipo_doc: "CPF" | "CNPJ";
  ie: string | null;
  email: string | null;
  fone: string | null;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  ativo: boolean;
  observacao: string | null;
  created_at: string;
  updated_at: string;
};

export type ParceiroEstoquePayload = {
  nome: string;
  razao_social: string | null;
  fantasia: string | null;
  doc: string;
  tipo_doc: "CPF" | "CNPJ";
  ie: string | null;
  email: string | null;
  fone: string | null;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  ativo: boolean;
  observacao: string | null;
};

function optString(v: unknown, max?: number): string | null {
  if (v == null) return null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return max ? t.slice(0, max) : t;
}

function soDigitos(v: unknown): string {
  if (typeof v !== "string" && typeof v !== "number") return "";
  return String(v).replace(/\D/g, "");
}

export function parseParceiroBody(
  body: Record<string, unknown>,
  opts?: { patch?: boolean },
): { ok: true; data: Partial<ParceiroEstoquePayload> & { nome?: string; doc?: string; tipo_doc?: "CPF" | "CNPJ" } } | { ok: false; error: string } {
  const patch = opts?.patch === true;
  const out: Partial<ParceiroEstoquePayload> = {};

  if ("nome" in body || !patch) {
    const nome = optString(body.nome, 255);
    if (!nome) return { ok: false, error: "Informe o nome." };
    out.nome = nome;
  }

  if ("doc" in body || !patch) {
    const doc = soDigitos(body.doc);
    if (doc.length !== 11 && doc.length !== 14) {
      return { ok: false, error: "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos)." };
    }
    out.doc = doc;
    out.tipo_doc = doc.length === 11 ? "CPF" : "CNPJ";
  }

  if ("razao_social" in body || !patch) out.razao_social = optString(body.razao_social, 255);
  if ("fantasia" in body || !patch) out.fantasia = optString(body.fantasia, 255);
  if ("ie" in body || !patch) out.ie = optString(body.ie, 20);
  if ("email" in body || !patch) out.email = optString(body.email, 120);
  if ("fone" in body || !patch) out.fone = optString(body.fone, 20);
  if ("cep" in body || !patch) {
    const cep = soDigitos(body.cep).slice(0, 8);
    out.cep = cep.length === 8 ? cep : cep || null;
  }
  if ("endereco" in body || !patch) out.endereco = optString(body.endereco, 120);
  if ("numero" in body || !patch) out.numero = optString(body.numero, 20);
  if ("complemento" in body || !patch) out.complemento = optString(body.complemento, 60);
  if ("bairro" in body || !patch) out.bairro = optString(body.bairro, 80);
  if ("municipio" in body || !patch) out.municipio = optString(body.municipio, 80);
  if ("uf" in body || !patch) {
    const uf = optString(body.uf, 2);
    out.uf = uf ? uf.toUpperCase() : null;
  }
  if ("observacao" in body || !patch) out.observacao = optString(body.observacao, 500);
  if ("ativo" in body) out.ativo = body.ativo !== false;
  else if (!patch) out.ativo = true;

  return { ok: true, data: out };
}

export function erroUnicoDocParceiro(message: string | undefined): string | null {
  if (!message) return null;
  if (message.includes("estoque_fornecedores_empresa_doc_uq") || message.includes("estoque_compradores_empresa_doc_uq")) {
    return "Já existe um cadastro com este CPF/CNPJ nesta empresa.";
  }
  return null;
}
