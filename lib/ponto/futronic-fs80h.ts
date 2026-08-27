import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ResultadoLeitor = {
  ok: boolean;
  conectado?: boolean;
  leitor?: string;
  width?: number;
  height?: number;
  pixelsBase64?: string;
  error?: string;
  dllPath?: string;
  dllProcurada?: string[];
};

function raizProjeto() {
  return process.cwd();
}

export function scriptCapturaFs80h() {
  return path.join(raizProjeto(), "tools", "futronic-fs80h", "capturar.py");
}

function pythonCandidates() {
  const env = process.env.PYTHON?.trim();
  return [env, "python", "python3"].filter((v): v is string => Boolean(v));
}

async function executarPython(
  acao: "status" | "capturar",
  timeoutSec: number,
): Promise<ResultadoLeitor> {
  const script = scriptCapturaFs80h();
  if (!fs.existsSync(script)) {
    return {
      ok: false,
      conectado: false,
      error: `Script do leitor não encontrado: ${script}`,
    };
  }

  let ultimoErro = "Python não encontrado no PATH.";
  for (const bin of pythonCandidates()) {
    try {
      const { stdout, stderr } = await execFileAsync(
        bin,
        [
          script,
          "--acao",
          acao,
          "--timeout",
          String(timeoutSec),
        ],
        {
          timeout: (timeoutSec + 6) * 1000,
          windowsHide: true,
          encoding: "utf8",
          cwd: raizProjeto(),
        },
      );
      const linha = String(stdout)
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .at(-1);
      if (!linha) {
        ultimoErro =
          stderr.trim() || "O leitor não devolveu dados. Verifique o Python e a DLL.";
        continue;
      }
      const parsed = JSON.parse(linha) as ResultadoLeitor;
      return parsed;
    } catch (e) {
      const err = e as {
        code?: string | number;
        stderr?: string;
        stdout?: string;
        message?: string;
        killed?: boolean;
      };
      if (err.killed) {
        return {
          ok: false,
          error: "Tempo esgotado na leitura. Mantenha o dedo no FS80H até concluir.",
        };
      }
      if (typeof err.stdout === "string" && err.stdout.trim()) {
        try {
          const linha = err.stdout
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean)
            .at(-1);
          if (linha) return JSON.parse(linha) as ResultadoLeitor;
        } catch {
          /* segue */
        }
      }
      if (err.code === "ENOENT") {
        ultimoErro = `Não achei o executável "${bin}". Instale o Python 3.`;
        continue;
      }
      ultimoErro =
        String(err.stderr || err.message || ultimoErro).trim() || ultimoErro;
    }
  }
  return { ok: false, conectado: false, error: ultimoErro };
}

export function statusLeitorFs80h() {
  return executarPython("status", 8);
}

export function capturarDigitalFs80h(timeoutSec = 18) {
  return executarPython("capturar", timeoutSec);
}

export function pixelsDaCaptura(resultado: ResultadoLeitor) {
  if (!resultado.ok || !resultado.pixelsBase64) {
    throw new Error(resultado.error || "Falha ao capturar a digital.");
  }
  const width = Number(resultado.width);
  const height = Number(resultado.height);
  const pixels = Buffer.from(resultado.pixelsBase64, "base64");
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("A captura não trouxe as dimensões da imagem.");
  }
  if (pixels.length < width * height) {
    throw new Error("A captura da digital está incompleta.");
  }
  return { width, height, pixels, pixelsBase64: resultado.pixelsBase64 };
}
