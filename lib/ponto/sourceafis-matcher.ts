import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type CandidatoDigital = {
  id: string;
  nome: string;
  width: number;
  height: number;
  pixelsBase64: string;
};

export type ScoreDigital = {
  id: string;
  nome: string;
  score: number;
};

/** Limiar oficial do SourceAFIS (~0,01% FMR). */
export const LIMIAR_VALIDACAO_TESTE = 40;

/** Diferença mínima entre 1º e 2º para não escolher o “menos ruim”. */
export const MARGEM_IDENTIFICACAO = 10;

function raizProjeto() {
  return process.cwd();
}

function pastaProjeto() {
  return path.join(raizProjeto(), "tools", "futronic-fs80h", "SourceAfisMatcher");
}

function dllMatcher() {
  return path.join(
    pastaProjeto(),
    "bin",
    "Release",
    "net9.0",
    "SourceAfisMatcher.dll",
  );
}

async function garantirBuild() {
  if (fs.existsSync(dllMatcher())) return;
  await execFileAsync(
    "dotnet",
    ["build", pastaProjeto(), "-c", "Release", "--nologo"],
    { timeout: 180_000, windowsHide: true, cwd: raizProjeto() },
  );
  if (!fs.existsSync(dllMatcher())) {
    throw new Error("Não foi possível compilar o reconhecedor SourceAFIS.");
  }
}

function spawnJson(args: string[], payload: unknown): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("dotnet", args, {
      windowsHide: true,
      cwd: raizProjeto(),
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d: string) => {
      stdout += d;
    });
    child.stderr.on("data", (d: string) => {
      stderr += d;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const linha = stdout
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .at(-1);
      if (linha) {
        resolve(linha);
        return;
      }
      reject(
        new Error(
          stderr.trim() ||
            `SourceAFIS encerrou sem resultado (código ${code ?? "?"}).`,
        ),
      );
    });
    child.stdin.write(JSON.stringify(payload), "utf8");
    child.stdin.end();
  });
}

export async function ranquearDigitaisSourceAfis(
  probe: { width: number; height: number; pixels: Buffer },
  cadastros: CandidatoDigital[],
): Promise<ScoreDigital[]> {
  await garantirBuild();
  const bruto = await spawnJson([dllMatcher()], {
    probe: {
      width: probe.width,
      height: probe.height,
      pixelsBase64: probe.pixels.toString("base64"),
    },
    candidates: cadastros.map((c) => ({
      id: c.id,
      width: c.width,
      height: c.height,
      pixelsBase64: c.pixelsBase64,
    })),
  });
  const parsed = JSON.parse(bruto) as {
    ok?: boolean;
    error?: string;
    scores?: { id: string; score: number }[];
  };
  if (!parsed.ok || !parsed.scores) {
    throw new Error(parsed.error || "Falha no reconhecimento SourceAFIS.");
  }
  const nomes = new Map(cadastros.map((c) => [c.id, c.nome]));
  return parsed.scores
    .map((s) => ({
      id: s.id,
      nome: nomes.get(s.id) ?? s.id,
      score: Number(s.score) || 0,
    }))
    .sort((a, b) => b.score - a.score);
}

export function decidirIdentificacao(ranque: ScoreDigital[]): {
  valido: boolean;
  melhor: ScoreDigital;
  motivo?: string;
} {
  const melhor = ranque[0];
  if (!melhor) {
    return {
      valido: false,
      melhor: { id: "", nome: "", score: 0 },
      motivo: "Nenhum cadastro para comparar.",
    };
  }
  if (melhor.score < LIMIAR_VALIDACAO_TESTE) {
    return {
      valido: false,
      melhor,
      motivo: `Score ${melhor.score} abaixo do limiar ${LIMIAR_VALIDACAO_TESTE}.`,
    };
  }
  const segundo = ranque[1];
  if (segundo && melhor.score - segundo.score < MARGEM_IDENTIFICACAO) {
    return {
      valido: false,
      melhor,
      motivo: `Empate com ${segundo.nome} (scores ${melhor.score} e ${segundo.score}).`,
    };
  }
  return { valido: true, melhor };
}
