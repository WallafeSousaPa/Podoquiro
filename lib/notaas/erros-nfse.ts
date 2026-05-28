import type { AtividadeEmissaoNfse } from "./atividade-emissao";

export type DiagnosticoAtividadeNfse = {
  titulo: string;
  resumo: string;
  passos: string[];
};

/** Passos concretos quando L999/atividade não informada com config local aparentemente correta. */
export function diagnosticoAtividadeNfse(
  atividade: AtividadeEmissaoNfse,
  errorCode?: string | null,
): DiagnosticoAtividadeNfse | null {
  const code = (errorCode ?? "").trim().toUpperCase();
  const isL999 = code === "L999";
  if (!isL999 && !atividade.cnae && !atividade.codigoLc116) return null;
  if (!isL999) return null;

  const codigo = atividade.codigoExibicao ?? atividade.codigoLc116 ?? "—";
  const cnae = atividade.cnaeExibicao ?? atividade.cnae ?? "—";

  return {
    titulo: "CNAE ausente no projeto Notaas (não no Podoquiro)",
    resumo:
      `O Podoquiro enviou o código LC 116 ${codigo} na API. O CNAE ${cnae} está salvo aqui como referência, ` +
      "mas a Notaas/DSF lê o CNAE do projeto vinculado à API key — e esse campo está vazio ou incorreto no painel Notaas.",
    passos: [
      "Acesse platform.notaas.com.br → abra o projeto da API key usada em Parâmetros.",
      "Em Settings: município Belém (IBGE 1501402), motor DSF (não SNNFSE).",
      `Preencha CNAE ${cnae} e código de tributação ${atividade.codigoLc116 ?? "060101"} (item 6.01).`,
      "Confira inscrição municipal e certificado A1 no mesmo projeto.",
      "Gere uma nova API key nesse projeto e cole em Financeiro → Nota Fiscal → Parâmetros.",
      "Emita novamente e confira se o CNAE exibido no modal coincide com o do painel Notaas.",
    ],
  };
}

/** Orientação para rejeições conhecidas (DSF Belém, GINFES, SNNFSE, etc.). */
export function mensagemOrientacaoErroNfse(
  errorCode: string | null | undefined,
  errorMessage: string | null | undefined,
): string | null {
  const code = (errorCode ?? "").trim().toUpperCase();
  const msg = (errorMessage ?? "").trim().toLowerCase();

  const municipioNaoSnnfse =
    code === "E0039" ||
    msg.includes("e0039") ||
    msg.includes("não aderente ao snnfse") ||
    msg.includes("nao aderente ao snnfse") ||
    msg.includes("sistema nacional de nfs-e") ||
    msg.includes("snnfse");

  if (municipioNaoSnnfse) {
    return (
      "Belém (PA) não adere ao SNNFSE federal — notas enviadas pelo sistema nacional são rejeitadas (E0039). " +
      "No painel Notaas → Settings do projeto, confira: município Belém (IBGE 1501402), motor DSF (não SNNFSE), " +
      "certificado A1, inscrição municipal, CNAE do seu cadastro municipal (ex.: 869090400) e código 060101 (item 6.01). " +
      "Documentação: docs.notaas.com.br/docs/cobertura (Belém = DSF/Centi)."
    );
  }

  const atividadeNaoInformada =
    code === "L999" ||
    msg.includes("atividade não informada") ||
    msg.includes("atividade nao informada") ||
    msg.includes("atividade não encontrada") ||
    msg.includes("atividade nao encontrada");

  if (atividadeNaoInformada) {
    return (
      "Erro L999: a prefeitura (DSF Belém) recebeu a nota sem CNAE. " +
      "O Podoquiro não envia CNAE no POST /emitir — a Notaas injeta do projeto da API key. " +
      "Se o modal mostra CNAE correto aqui, o problema está no painel Notaas (Settings → CNAE vazio ou API key de outro projeto). " +
      "O CNAE também precisa estar habilitado na SEFIN Belém para o seu CNPJ."
    );
  }

  const dataRpsInvalida =
    code === "E16" ||
    msg.includes("e16") ||
    msg.includes("data da emissão do rps") ||
    msg.includes("data da emissao do rps") ||
    msg.includes("data de emissão de rps") ||
    msg.includes("data de emissao de rps");

  if (dataRpsInvalida) {
    return (
      "Erro E16: a Notaas montou o RPS com data UTC (dia seguinte), mas Belém ainda está no dia anterior — mesmo enviando dataEmissao em horário de Brasília no POST /emitir (confira no modal). " +
      "Emita após 00:00 BRT ou pela manhã. Correção definitiva: suporte Notaas deve usar America/Sao_Paulo na DataEmissao do XML DSF."
    );
  }

  return null;
}

export function isErroAtividadeNaoInformada(
  errorCode: string | null | undefined,
  errorMessage: string | null | undefined,
): boolean {
  const code = (errorCode ?? "").trim().toUpperCase();
  const msg = (errorMessage ?? "").trim().toLowerCase();
  return (
    code === "L999" ||
    msg.includes("atividade não informada") ||
    msg.includes("atividade nao informada") ||
    msg.includes("atividade não encontrada") ||
    msg.includes("atividade nao encontrada")
  );
}
