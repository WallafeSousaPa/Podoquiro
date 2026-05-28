import { getNotaasBaseUrl } from "./config";

export type NotaasProjectFiscalPatch = {
  cnae: string;
  codigoTributacao: string;
};

export type ResultadoSyncProjectNotaas =
  | { ok: true; projectId: string }
  | {
      ok: false;
      motivo: "nao_configurado" | "token_invalido" | "erro_api";
      detalhe?: string;
    };

export type NotaasProjectResumo = {
  id: string;
  codigoMunicipio?: string | null;
  codigoTributacao?: string | null;
  cnae?: string | null;
  hasCertificate?: boolean;
  inscricaoMunicipal?: string | null;
};

export type ResultadoValidacaoProjetoNotaas =
  | {
      ok: true;
      projectId: string;
      checks: {
        municipio: boolean;
        codigoTributacao: boolean;
        cnae: boolean;
        inscricaoMunicipal: boolean;
      };
      projeto: NotaasProjectResumo;
    }
  | {
      ok: false;
      motivo: "nao_configurado" | "token_invalido" | "erro_api";
      detalhe?: string;
    };

/**
 * Atualiza CNAE e código LC 116 no projeto Notaas (Org API).
 * Belém/DSF e GINFES leem esses campos do projeto — o POST /emitir não aceita CNAE.
 */
export async function sincronizarProjetoNotaas(
  patch: NotaasProjectFiscalPatch,
): Promise<ResultadoSyncProjectNotaas> {
  const orgToken = process.env.NOTAAS_ORG_TOKEN?.trim();
  const projectId = process.env.NOTAAS_PROJECT_ID?.trim();
  if (!orgToken || !projectId) {
    return { ok: false, motivo: "nao_configurado" };
  }
  if (!orgToken.startsWith("ntaas_org_")) {
    return {
      ok: false,
      motivo: "token_invalido",
      detalhe: "NOTAAS_ORG_TOKEN deve iniciar com 'ntaas_org_'.",
    };
  }

  const res = await fetch(
    `${getNotaasBaseUrl()}/org/projects/${encodeURIComponent(projectId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": orgToken,
      },
      body: JSON.stringify({
        cnae: patch.cnae,
        codigoTributacao: patch.codigoTributacao,
      }),
    },
  );

  if (!res.ok) {
    let detalhe = `HTTP ${res.status}`;
    try {
      const json = (await res.json()) as { message?: string; error?: string };
      detalhe = json.message ?? json.error ?? detalhe;
    } catch {
      /* ignore */
    }
    return { ok: false, motivo: "erro_api", detalhe };
  }

  return { ok: true, projectId };
}

async function buscarProjetoNotaas(
  orgToken: string,
  projectId: string,
): Promise<NotaasProjectResumo> {
  const res = await fetch(`${getNotaasBaseUrl()}/org/projects/${encodeURIComponent(projectId)}`, {
    headers: { "x-api-key": orgToken },
    cache: "no-store",
  });

  if (!res.ok) {
    let detalhe = `HTTP ${res.status}`;
    try {
      const json = (await res.json()) as { message?: string; error?: string };
      detalhe = json.message ?? json.error ?? detalhe;
    } catch {
      /* ignore */
    }
    throw new Error(detalhe);
  }

  const json = (await res.json()) as NotaasProjectResumo;
  return json;
}

/**
 * Valida no projeto Notaas se município/código/CNAE estão realmente aplicados.
 */
export async function validarProjetoNotaas(
  esperado: { codigoMunicipio: string; codigoTributacao: string; cnae: string },
): Promise<ResultadoValidacaoProjetoNotaas> {
  const orgToken = process.env.NOTAAS_ORG_TOKEN?.trim();
  const projectId = process.env.NOTAAS_PROJECT_ID?.trim();
  if (!orgToken || !projectId) {
    return { ok: false, motivo: "nao_configurado" };
  }
  if (!orgToken.startsWith("ntaas_org_")) {
    return {
      ok: false,
      motivo: "token_invalido",
      detalhe: "NOTAAS_ORG_TOKEN deve iniciar com 'ntaas_org_'.",
    };
  }

  try {
    const projeto = await buscarProjetoNotaas(orgToken, projectId);
    const cnaeProjeto = (projeto.cnae ?? "").replace(/\D/g, "");
    const cnaeEsperado = esperado.cnae.replace(/\D/g, "");
    const codigoProj = (projeto.codigoTributacao ?? "").replace(/\D/g, "");
    const codigoEsperado = esperado.codigoTributacao.replace(/\D/g, "");
    const municipioProj = (projeto.codigoMunicipio ?? "").replace(/\D/g, "");
    const municipioEsperado = esperado.codigoMunicipio.replace(/\D/g, "");

    return {
      ok: true,
      projectId,
      projeto,
      checks: {
        municipio: municipioProj === municipioEsperado,
        codigoTributacao: codigoProj === codigoEsperado,
        cnae: cnaeProjeto === cnaeEsperado,
        inscricaoMunicipal: Boolean((projeto.inscricaoMunicipal ?? "").trim()),
      },
    };
  } catch (e) {
    return {
      ok: false,
      motivo: "erro_api",
      detalhe: e instanceof Error ? e.message : "Falha ao validar projeto.",
    };
  }
}
