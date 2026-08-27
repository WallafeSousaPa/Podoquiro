/** Programa local no PC do leitor (USB). O servidor Vercel nunca vê o FS80H. */
export const AGENTE_PONTO_URL = (
  process.env.NEXT_PUBLIC_PONTO_LOCAL_URL || "http://127.0.0.1:8765"
).replace(/\/$/, "");

const CAMINHOS: Record<string, string> = {
  "/api/ponto/leitor": "/api/leitor",
  "/api/ponto/capturar": "/api/capturar",
  "/api/ponto/cadastros": "/api/cadastros",
  "/api/ponto/validar": "/api/validar",
};

export function urlAgentePonto(caminhoApp: string) {
  const [path, query] = caminhoApp.split("?");
  const mapeado = CAMINHOS[path] ?? path.replace(/^\/api\/ponto/, "/api");
  const qs = query ? `?${query}` : "";
  return `${AGENTE_PONTO_URL}${mapeado}${qs}`;
}

export async function fetchAgentePonto(caminhoApp: string, init?: RequestInit) {
  try {
    return await fetch(urlAgentePonto(caminhoApp), {
      ...init,
      targetAddressSpace: "loopback",
    } as RequestInit);
  } catch {
    throw new Error(mensagemAgenteIndisponivel());
  }
}

export function mensagemAgenteIndisponivel() {
  return (
    "Não foi possível falar com o programa local do leitor. Neste computador, " +
    "abra o Ponto Podoquiro (iniciar.bat), deixe a janela aberta e use Chrome ou Edge. " +
    "Se o navegador pedir acesso à rede local, permita."
  );
}
