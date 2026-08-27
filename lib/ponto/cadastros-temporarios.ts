import fs from "node:fs";
import path from "node:path";

export type CadastroDigitalTeste = {
  id: string;
  nome: string;
  width: number;
  height: number;
  pixelsBase64: string;
  criadoEm: string;
};

function arquivoCadastros() {
  return path.join(process.cwd(), ".data", "ponto-digitais-teste.json");
}

function ler(): CadastroDigitalTeste[] {
  const arquivo = arquivoCadastros();
  if (!fs.existsSync(arquivo)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(arquivo, "utf8")) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter((item): item is CadastroDigitalTeste => {
      if (!item || typeof item !== "object") return false;
      const row = item as CadastroDigitalTeste;
      return (
        typeof row.id === "string" &&
        typeof row.nome === "string" &&
        typeof row.pixelsBase64 === "string" &&
        Number.isFinite(row.width) &&
        Number.isFinite(row.height)
      );
    });
  } catch {
    return [];
  }
}

function gravar(rows: CadastroDigitalTeste[]) {
  const arquivo = arquivoCadastros();
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, JSON.stringify(rows, null, 2), "utf8");
}

export function listarCadastrosDigitaisTeste() {
  return ler().sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
}

export function salvarCadastroDigitalTeste(input: {
  nome: string;
  width: number;
  height: number;
  pixelsBase64: string;
}) {
  const rows = ler();
  const item: CadastroDigitalTeste = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    nome: input.nome.trim(),
    width: input.width,
    height: input.height,
    pixelsBase64: input.pixelsBase64,
    criadoEm: new Date().toISOString(),
  };
  rows.push(item);
  gravar(rows);
  return item;
}

export function removerCadastroDigitalTeste(id: string) {
  const rows = ler();
  const next = rows.filter((r) => r.id !== id);
  if (next.length === rows.length) return false;
  gravar(next);
  return true;
}
