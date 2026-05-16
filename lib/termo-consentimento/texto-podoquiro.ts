/** Texto jurídico e dados fixos da clínica (Podoquiro). */

export type DadosPacienteTermo = {
  nomePaciente: string;
  cpf: string;
  telefone: string;
  email: string;
  endereco: string;
};

export type RodapeDataLocal = {
  cidadeEmpresa: string;
  dia: number;
  mesNome: string;
  ano: number;
};

const MESES_PT = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

export function obterDataLocalBrasilia(dataRef: Date = new Date()): {
  dia: number;
  mesNome: string;
  ano: number;
} {
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
  const parts = fmt.formatToParts(dataRef);
  const dia = Number(parts.find((x) => x.type === "day")?.value ?? "1");
  const mes = Number(parts.find((x) => x.type === "month")?.value ?? "1");
  const ano = Number(parts.find((x) => x.type === "year")?.value ?? String(dataRef.getFullYear()));
  const mesNome = MESES_PT[Math.max(0, Math.min(11, mes - 1))] ?? "mês";
  return { dia, mesNome, ano };
}

export function montarRodapeAssinatura(cidadeEmpresa: string | null | undefined): RodapeDataLocal {
  const d = obterDataLocalBrasilia();
  return {
    cidadeEmpresa: (cidadeEmpresa && cidadeEmpresa.trim()) || "Belém",
    ...d,
  };
}

export function montarEnderecoPacienteTermo(p: {
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
}): string {
  const partes: string[] = [];
  const linhaRua = [p.logradouro, p.numero, p.complemento]
    .map((s) => (s != null ? String(s).trim() : ""))
    .filter(Boolean)
    .join(", ");
  if (linhaRua) partes.push(linhaRua);
  const bairroCidade = [p.bairro, p.cidade, p.uf]
    .map((s) => (s != null ? String(s).trim() : ""))
    .filter(Boolean)
    .join(" — ");
  if (bairroCidade) partes.push(bairroCidade);
  const cep = p.cep != null ? String(p.cep).trim() : "";
  if (cep) partes.push(`CEP ${cep}`);
  const s = partes.join(". ").trim();
  return s || "não informado";
}

export function formatarCpfExibicao(cpfDigits: string): string {
  const d = cpfDigits.replace(/\D/g, "");
  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  return cpfDigits.trim() || "não informado";
}

/** Exibição na tabela do PDF (capitalização alinhada ao modelo). */
export function textoCampoTabelaTermo(valor: string): string {
  const t = valor.trim();
  if (!t || /^não informado$/i.test(t)) return "Não informado";
  return t;
}

/** Título principal do termo (modelo HTML/PDF). */
export const TITULO_TERMO_PRINCIPAL = "Termo de Consentimento, Adesão e Responsabilidade";

export const SUBTITULO_TERMO = "Serviços Especializados de Podologia";

/** Compat: nome antigo usado no código. */
export const TITULO_TERMO_CONSENTIMENTO_PODOQUIRO = TITULO_TERMO_PRINCIPAL;

export type SegmentoTextoTermoPdf = { text: string; bold: boolean };

/** Introdução após a tabela de dados (trechos em negrito no PDF). */
export function segmentosIntroTermoModelo(): SegmentoTextoTermoPdf[] {
  return [
    { text: "O(A) ", bold: false },
    { text: "PACIENTE", bold: true },
    {
      text: " acima qualificado(a) adere e concorda integralmente com os termos e condições descritos a seguir para a prestação de serviços de podologia pela ",
      bold: false,
    },
    { text: "CLÍNICA DE PODOLOGIA PODOQUIRO LTDA", bold: true },
    {
      text: ", inscrita no CNPJ sob o nº 44.867.069/0001-92, com sede na Travessa Humaitá, 1377, anexo Smart Mall, sala 13, Pedreira – Belém/PA, CEP: 66.085-148, doravante denominada ",
      bold: false,
    },
    { text: "CLÍNICA", bold: true },
    { text: ".", bold: false },
  ];
}

/** Cláusulas do modelo oficial (título + corpo). */
export const CLAUSULAS_TERMO_MODELO: { titulo: string; corpo: string }[] = [
  {
    titulo: "1. Serviços e Responsabilidade Compartilhada",
    corpo:
      "Autorizo a CLÍNICA a realizar os procedimentos de podologia que se fizerem necessários, conforme avaliação profissional (anamnese) e meu consentimento. Reconheço que o sucesso do tratamento depende da colaboração mútua. A CLÍNICA se compromete a aplicar as melhores técnicas disponíveis, e eu me comprometo a fornecer informações precisas e seguir estritamente as orientações pós-atendimento. A CLÍNICA não se responsabilizará por resultados adversos decorrentes da omissão de informações sobre minha saúde, do não cumprimento das orientações fornecidas ou de fatores orgânicos individuais imprevisíveis.",
  },
  {
    titulo: "2. Consentimento Informado e Anamnese",
    corpo:
      "Declaro que fui submetido(a) a uma anamnese detalhada e forneci informações completas e verdadeiras sobre meu histórico de saúde, incluindo doenças preexistentes, alergias e uso contínuo de medicamentos. Afirmo que fui devidamente informado(a) e compreendi os procedimentos propostos, seus benefícios, riscos, cuidados necessários e possíveis alternativas.",
  },
  {
    titulo: "3. Recusa de Procedimentos",
    corpo:
      "Caso eu opte por recusar a realização de exames complementares (ex: exame micológico) ou tratamentos recomendados pela CLÍNICA, declaro estar ciente dos riscos e possíveis consequências dessa recusa. Assumo, neste ato, integral responsabilidade por resultados insatisfatórios ou pelo agravamento da condição que poderiam ser evitados, isentando a CLÍNICA de qualquer responsabilidade direta sobre essa decisão.",
  },
  {
    titulo: "4. Uso de Imagem para Fins Clínicos",
    corpo:
      "Autorizo a realização de registros fotográficos e/ou vídeos das áreas tratadas (pés, unhas, etc.) pela CLÍNICA. Estas imagens serão utilizadas exclusivamente para compor meu prontuário, permitindo o acompanhamento técnico da evolução do tratamento. Fica expressamente vedada a divulgação pública, cessão a terceiros ou uso comercial dessas imagens sem uma nova e específica autorização por escrito.",
  },
  {
    titulo: "5. Pagamento e Condições",
    corpo:
      "O valor dos serviços será informado previamente e o pagamento deverá ser realizado no ato do atendimento. Reconheço que, uma vez que o serviço seja prestado integralmente e sem que se comprove falha técnica da CLÍNICA, o valor pago não será objeto de devolução, por se tratar de remuneração por serviço efetivamente executado, resguardados os direitos previstos no Código de Defesa do Consumidor.",
  },
  {
    titulo: "6. Política de Agendamento e Comparecimento",
    corpo:
      "Estou ciente e de acordo com a política de agendamento da CLÍNICA, que estabelece:\na) Uma tolerância de até 10 (dez) minutos de atraso. Atrasos superiores podem inviabilizar a realização do procedimento no tempo previsto, resultando no cancelamento da sessão.\nb) A necessidade de comunicar o cancelamento ou pedido de reagendamento com, no mínimo, 24 (vinte e quatro) horas de antecedência.\nc) O não comparecimento à consulta sem o aviso prévio resultará na perda do agendamento, devendo o paciente verificar a disponibilidade de uma nova vaga.",
  },
  {
    titulo: "7. Proteção de Dados (LGPD)",
    corpo:
      "Autorizo a CLÍNICA a coletar e tratar meus dados pessoais e de saúde, incluindo as imagens do prontuário, em estrita conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018). Tenho ciência de que estes dados serão utilizados exclusivamente para a finalidade da prestação dos serviços de podologia, agendamento e comunicação, sendo armazenados com segurança e estrita confidencialidade.",
  },
  {
    titulo: "8. Foro",
    corpo:
      "Fica eleito o foro da Comarca de Belém/PA para dirimir quaisquer controvérsias que possam surgir deste termo.",
  },
];

export const TEXTO_DECLARACAO_ASSINATURA_PLATAFORMA =
  "Ao assinar eletronicamente através desta plataforma, declaro que li, compreendi e concordo integralmente com todos os termos e condições aqui estabelecidos.";

/** Linha de data local (alinhada à direita no PDF). */
export function formatarLinhaDataLocalTermo(rodape: RodapeDataLocal): string {
  const cidade = rodape.cidadeEmpresa.trim() || "Belém";
  return `${cidade}/PA, ${rodape.dia} de ${rodape.mesNome} de ${rodape.ano}.`;
}

/** Rodapé institucional após a assinatura no PDF. */
export const RODAPE_CLINICA_PDF_LINHAS = [
  "CLÍNICA DE PODOLOGIA PODOQUIRO LTDA",
  "CNPJ nº 44.867.069/0001-92",
  "Travessa Humaitá, 1377, anexo Smart Mall, sala 13 — Pedreira — Belém/PA — CEP 66.085-148",
] as const;

/** Texto plano para pré-visualização no modal (aproxima o modelo). */
export function montarTextoContratoCompleto(pac: DadosPacienteTermo, rodape: RodapeDataLocal): string {
  const np = textoCampoTabelaTermo(pac.nomePaciente);
  const cpf = textoCampoTabelaTermo(pac.cpf);
  const tel = textoCampoTabelaTermo(pac.telefone);
  const em = textoCampoTabelaTermo(pac.email);
  const end = textoCampoTabelaTermo(pac.endereco);
  const intro = segmentosIntroTermoModelo()
    .map((s) => s.text)
    .join("");
  const clausulasBloco = CLAUSULAS_TERMO_MODELO.map((c) => `${c.titulo}\n${c.corpo}`).join("\n\n");
  return `${TITULO_TERMO_PRINCIPAL}
${SUBTITULO_TERMO}

Paciente: ${np} | CPF: ${cpf}
Telefone: ${tel} | E-mail: ${em}
Endereço: ${end}

${intro}

${clausulasBloco}

${TEXTO_DECLARACAO_ASSINATURA_PLATAFORMA}

${formatarLinhaDataLocalTermo(rodape)}`;
}

/** @deprecated Use segmentosIntroTermoModelo; mantido para compatibilidade. */
export function segmentosIdentificacaoPaciente(pac: DadosPacienteTermo): SegmentoTextoTermoPdf[] {
  return [
    { text: "Pelo presente, eu ", bold: false },
    { text: pac.nomePaciente, bold: true },
    { text: ", CPF n° ", bold: false },
    { text: pac.cpf, bold: true },
    { text: ", telefone ", bold: false },
    { text: pac.telefone, bold: true },
    { text: ", email: ", bold: false },
    { text: pac.email, bold: true },
    { text: ", endereço: ", bold: false },
    { text: pac.endereco, bold: true },
    { text: ".", bold: false },
  ];
}

/** @deprecated Estrutura antiga monolítica; o PDF usa CLAUSULAS_TERMO_MODELO. */
export function montarCorpoContratoAposIdentificacao(rodape: RodapeDataLocal): string {
  const partes: string[] = [];
  partes.push(segmentosIntroTermoModelo().map((s) => s.text).join(""));
  for (const c of CLAUSULAS_TERMO_MODELO) {
    partes.push(`${c.titulo}: ${c.corpo}`);
  }
  partes.push(TEXTO_DECLARACAO_ASSINATURA_PLATAFORMA);
  partes.push(formatarLinhaDataLocalTermo(rodape));
  return partes.join("\n\n");
}
