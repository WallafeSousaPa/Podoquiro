export const SEXO_OPCOES = ["Masculino", "Feminino", "Outro"] as const;
export const HISTORICO_LESAO = ["primeira", "recidiva"] as const;
export const EVOLUCAO_LESAO = ["aguda", "cronica"] as const;
export const AVALIACAO_NUTRICIONAL = ["inadequada", "adequada", "excelente"] as const;

export const OPCOES_TIPO_TECIDO = [
  "Granulação viável",
  "Granulação pálida",
  "Necrose liquefação",
  "Necrose coagulação",
] as const;

export const OPCOES_CONTAMINACAO = ["Infecção", "Biofilme", "Limpa"] as const;
export const OPCOES_QTD_EXSUDATO = ["0", "1", "2", "3", "4", "5"] as const;
export const OPCOES_CARAC_EXSUDATO = [
  "Seroso",
  "Seropurulento",
  "Purulento",
  "Sanguinolento",
] as const;
export const OPCOES_ODOR = [
  "Sem odor",
  "Odor 1",
  "Odor 2",
  "Odor 3",
  "Odor 4",
  "Odor 5",
] as const;
export const OPCOES_BORDAS = [
  "Íntegra",
  "Macerada",
  "Necrose",
  "Epibolia",
  "Hiperqueratose",
] as const;
export const OPCOES_PELE_PERILESIONAL = ["Íntegra", "Macerada", "Hiperemia"] as const;
export const OPCOES_PUSH = ["0", "1", "2", "3", "4", "5"] as const;

export const CRITERIOS_PE = [
  { key: "ulcera", label: "Presença de uma úlcera", grupo: "" },
  {
    key: "mono",
    label: "Sensibilidade protetora (monofilamento) ausente",
    grupo: "Neuropatia periférica",
  },
  {
    key: "vib",
    label: "Vibração (diapasão 128 Hz) ausente ou diminuída",
    grupo: "Neuropatia periférica",
  },
  {
    key: "toque",
    label: "Leve toque (Teste de toque Ipswich) indetectável",
    grupo: "Neuropatia periférica",
  },
  { key: "tibial", label: "Artéria tibial posterior ausente", grupo: "Pulsos do pé" },
  { key: "pediosa", label: "Artéria pediosa ausente", grupo: "Pulsos do pé" },
  {
    key: "deform",
    label: "Deformidades no pé ou proeminências ósseas excessivas",
    grupo: "Outros",
  },
  { key: "mobilidade", label: "Mobilidade articular limitada", grupo: "Outros" },
  {
    key: "pressao",
    label: "Sinais de pressão anormal, tais como calosidade",
    grupo: "Outros",
  },
  { key: "higiene", label: "Má higiene dos pés", grupo: "Outros" },
  { key: "calcado", label: "Calçados inadequados", grupo: "Outros" },
  { key: "ulceraPrevia", label: "Úlcera prévia", grupo: "Outros" },
  { key: "amputacao", label: "Amputação de MMII", grupo: "Outros" },
] as const;

export type CriterioPeKey = (typeof CRITERIOS_PE)[number]["key"];
export type SimNao = "" | "sim" | "nao";

export type LadosPe = { direito: SimNao; esquerdo: SimNao };

export type FichaEnfermagem = {
  nome: string;
  prontuario: string;
  dataAdmissao: string;
  sexo: string;
  raca: string;
  idade: string;
  dn: string;
  religiao: string;
  ocupacao: string;
  telefone: string;
  endereco: string;
  escolaridade: string;
  responsavel: string;
  hasPes: boolean;
  dmPes: boolean;
  tabagista: boolean;
  etilista: boolean;
  cirurgiasAnteriores: string;
  outrasDoencasPes: string;
  hasFam: boolean;
  dmFam: boolean;
  outrasDoencasFam: string;
  lesaoPressao: boolean;
  queimaduras: boolean;
  sitioCirurgico: boolean;
  deiscencias: boolean;
  ulceraVenosa: boolean;
  peDiabetico: boolean;
  feridasTraumaticas: boolean;
  ulceraArterial: boolean;
  feridaOperatoria: boolean;
  dermatites: boolean;
  outrasLesoes: string;
  historicoLesao: string;
  etiologiaTrauma: boolean;
  etiologiaCirurgica: boolean;
  etiologiaEspontanea: boolean;
  evolucaoLesao: string;
  outrasEtiologias: string;
  dmCompensada: boolean;
  dmDescompensada: boolean;
  hasSistemica: boolean;
  doencaCardiovascular: boolean;
  doencaVascular: boolean;
  neoplasia: boolean;
  outrasComorbidades: string;
  medicacaoContinua: string;
  pa: string;
  temperatura: string;
  pulso: string;
  respiracao: string;
  sapo2: string;
  pulsoPedioso: string;
  pulsoTibialPosterior: string;
  peso: string;
  altura: string;
  imc: string;
  auscultaCardiaca: string;
  auscultaPulmonar: string;
  neuroConsciente: boolean;
  neuroAgitado: boolean;
  neuroOrientado: boolean;
  neuroSonolento: boolean;
  neuroInconsciente: boolean;
  neuroTorporoso: boolean;
  neuroConfuso: boolean;
  neuroComatoso: boolean;
  peleCorado: boolean;
  peleCianotico: boolean;
  pelePalidez: boolean;
  peleIcterico: boolean;
  peleManchas: boolean;
  peleBolhas: boolean;
  peleHidratado: boolean;
  peleDesidratado: boolean;
  peleHiperemia: boolean;
  peleVarizes: boolean;
  pelePortaEntrada: boolean;
  peleDescamacao: boolean;
  peleFungosInterdigital: boolean;
  peleFungoUngueal: boolean;
  forcaPreservada: boolean;
  forcaDiminuida: boolean;
  parestesia: boolean;
  paresia: boolean;
  plegia: boolean;
  expressaoDor: boolean;
  dorEstimulacao: boolean;
  relatoVerbal: boolean;
  escalaDor: string;
  localDor: string;
  ventilacaoEspontanea: boolean;
  oxigenoterapia: boolean;
  vm: boolean;
  traqueostomia: boolean;
  edemaMMII: boolean;
  hipoxemia: boolean;
  irpa: boolean;
  cianoseExtremidades: boolean;
  baixaSaturacao: boolean;
  hipotensao: boolean;
  usoDrogasVasoativas: boolean;
  hipoxia: boolean;
  hipovolemia: boolean;
  peleFriaUmida: boolean;
  nutrido: boolean;
  anemia: boolean;
  emagrecido: boolean;
  obeso: boolean;
  caquetico: boolean;
  dietaVO: boolean;
  dietaSNG: boolean;
  dietaSNE: boolean;
  dietaNPPNPT: boolean;
  dietaGastrostomia: boolean;
  avNutricional: string;
  pe: Record<CriterioPeKey, LadosPe>;
  classificacao: string;
  sinbad: string;
  itb: string;
  tipoTecido: string;
  contaminacao: string;
  qtdExsudato: string;
  caracExsudato: string;
  odorExsudato: string;
  bordas: string;
  pelePerilesional: string;
  comprimento: string;
  alturaLesao: string;
  profundidade: string;
  escalaPush: string;
  diagEnfermagem: string;
  solucaoLimpeza: string;
  coberturaPrimaria: string;
  coberturaSecundaria: string;
  terapiaCompressiva: string;
  terapiaAdjuvante: string;
  tempoTroca: string;
  evolucao: string;
  planosCuidado: string;
  proximaConsulta: string;
};

export type BooleanFichaKey = {
  [K in keyof FichaEnfermagem]: FichaEnfermagem[K] extends boolean ? K : never;
}[keyof FichaEnfermagem];

const BOOLEAN_KEYS = [
  "hasPes",
  "dmPes",
  "tabagista",
  "etilista",
  "hasFam",
  "dmFam",
  "lesaoPressao",
  "queimaduras",
  "sitioCirurgico",
  "deiscencias",
  "ulceraVenosa",
  "peDiabetico",
  "feridasTraumaticas",
  "ulceraArterial",
  "feridaOperatoria",
  "dermatites",
  "etiologiaTrauma",
  "etiologiaCirurgica",
  "etiologiaEspontanea",
  "dmCompensada",
  "dmDescompensada",
  "hasSistemica",
  "doencaCardiovascular",
  "doencaVascular",
  "neoplasia",
  "neuroConsciente",
  "neuroAgitado",
  "neuroOrientado",
  "neuroSonolento",
  "neuroInconsciente",
  "neuroTorporoso",
  "neuroConfuso",
  "neuroComatoso",
  "peleCorado",
  "peleCianotico",
  "pelePalidez",
  "peleIcterico",
  "peleManchas",
  "peleBolhas",
  "peleHidratado",
  "peleDesidratado",
  "peleHiperemia",
  "peleVarizes",
  "pelePortaEntrada",
  "peleDescamacao",
  "peleFungosInterdigital",
  "peleFungoUngueal",
  "forcaPreservada",
  "forcaDiminuida",
  "parestesia",
  "paresia",
  "plegia",
  "expressaoDor",
  "dorEstimulacao",
  "relatoVerbal",
  "ventilacaoEspontanea",
  "oxigenoterapia",
  "vm",
  "traqueostomia",
  "edemaMMII",
  "hipoxemia",
  "irpa",
  "cianoseExtremidades",
  "baixaSaturacao",
  "hipotensao",
  "usoDrogasVasoativas",
  "hipoxia",
  "hipovolemia",
  "peleFriaUmida",
  "nutrido",
  "anemia",
  "emagrecido",
  "obeso",
  "caquetico",
  "dietaVO",
  "dietaSNG",
  "dietaSNE",
  "dietaNPPNPT",
  "dietaGastrostomia",
] as const satisfies readonly BooleanFichaKey[];

type ChaveBooleanaAusente = Exclude<BooleanFichaKey, (typeof BOOLEAN_KEYS)[number]>;
const _chavesBooleanasCompletas: ChaveBooleanaAusente extends never ? true : ChaveBooleanaAusente =
  true;
void _chavesBooleanasCompletas;

function ladosVazios(): LadosPe {
  return { direito: "", esquerdo: "" };
}

export function fichaVazia(): FichaEnfermagem {
  const pe = {} as Record<CriterioPeKey, LadosPe>;
  for (const c of CRITERIOS_PE) pe[c.key] = ladosVazios();
  return {
    nome: "",
    prontuario: "",
    dataAdmissao: "",
    sexo: "",
    raca: "",
    idade: "",
    dn: "",
    religiao: "",
    ocupacao: "",
    telefone: "",
    endereco: "",
    escolaridade: "",
    responsavel: "",
    hasPes: false,
    dmPes: false,
    tabagista: false,
    etilista: false,
    cirurgiasAnteriores: "",
    outrasDoencasPes: "",
    hasFam: false,
    dmFam: false,
    outrasDoencasFam: "",
    lesaoPressao: false,
    queimaduras: false,
    sitioCirurgico: false,
    deiscencias: false,
    ulceraVenosa: false,
    peDiabetico: false,
    feridasTraumaticas: false,
    ulceraArterial: false,
    feridaOperatoria: false,
    dermatites: false,
    outrasLesoes: "",
    historicoLesao: "",
    etiologiaTrauma: false,
    etiologiaCirurgica: false,
    etiologiaEspontanea: false,
    evolucaoLesao: "",
    outrasEtiologias: "",
    dmCompensada: false,
    dmDescompensada: false,
    hasSistemica: false,
    doencaCardiovascular: false,
    doencaVascular: false,
    neoplasia: false,
    outrasComorbidades: "",
    medicacaoContinua: "",
    pa: "",
    temperatura: "",
    pulso: "",
    respiracao: "",
    sapo2: "",
    pulsoPedioso: "",
    pulsoTibialPosterior: "",
    peso: "",
    altura: "",
    imc: "",
    auscultaCardiaca: "",
    auscultaPulmonar: "",
    neuroConsciente: false,
    neuroAgitado: false,
    neuroOrientado: false,
    neuroSonolento: false,
    neuroInconsciente: false,
    neuroTorporoso: false,
    neuroConfuso: false,
    neuroComatoso: false,
    peleCorado: false,
    peleCianotico: false,
    pelePalidez: false,
    peleIcterico: false,
    peleManchas: false,
    peleBolhas: false,
    peleHidratado: false,
    peleDesidratado: false,
    peleHiperemia: false,
    peleVarizes: false,
    pelePortaEntrada: false,
    peleDescamacao: false,
    peleFungosInterdigital: false,
    peleFungoUngueal: false,
    forcaPreservada: false,
    forcaDiminuida: false,
    parestesia: false,
    paresia: false,
    plegia: false,
    expressaoDor: false,
    dorEstimulacao: false,
    relatoVerbal: false,
    escalaDor: "",
    localDor: "",
    ventilacaoEspontanea: false,
    oxigenoterapia: false,
    vm: false,
    traqueostomia: false,
    edemaMMII: false,
    hipoxemia: false,
    irpa: false,
    cianoseExtremidades: false,
    baixaSaturacao: false,
    hipotensao: false,
    usoDrogasVasoativas: false,
    hipoxia: false,
    hipovolemia: false,
    peleFriaUmida: false,
    nutrido: false,
    anemia: false,
    emagrecido: false,
    obeso: false,
    caquetico: false,
    dietaVO: false,
    dietaSNG: false,
    dietaSNE: false,
    dietaNPPNPT: false,
    dietaGastrostomia: false,
    avNutricional: "",
    pe,
    classificacao: "",
    sinbad: "",
    itb: "",
    tipoTecido: "",
    contaminacao: "",
    qtdExsudato: "",
    caracExsudato: "",
    odorExsudato: "",
    bordas: "",
    pelePerilesional: "",
    comprimento: "",
    alturaLesao: "",
    profundidade: "",
    escalaPush: "",
    diagEnfermagem: "",
    solucaoLimpeza: "",
    coberturaPrimaria: "",
    coberturaSecundaria: "",
    terapiaCompressiva: "",
    terapiaAdjuvante: "",
    tempoTroca: "",
    evolucao: "",
    planosCuidado: "",
    proximaConsulta: "",
  };
}

function texto(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.replace(/\u0000/g, "").trim().slice(0, max);
}

function dataIso(v: unknown): string {
  const s = texto(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function opcao(v: unknown, lista: readonly string[]): string {
  const s = texto(v, 80);
  return lista.includes(s) ? s : "";
}

function medida(v: unknown): string {
  const s = texto(v, 8).replace(",", ".");
  if (s === "") return "";
  return /^\d{1,3}(\.\d{1,2})?$/.test(s) ? s : "";
}

function simNao(v: unknown): SimNao {
  return v === "sim" || v === "nao" ? v : "";
}

function sanitizarPe(raw: unknown): Record<CriterioPeKey, LadosPe> {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const pe = {} as Record<CriterioPeKey, LadosPe>;
  for (const c of CRITERIOS_PE) {
    const item = src[c.key];
    const lado =
      item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    pe[c.key] = { direito: simNao(lado.direito), esquerdo: simNao(lado.esquerdo) };
  }
  return pe;
}

export function sanitizarFicha(raw: unknown): FichaEnfermagem {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const ficha = fichaVazia();

  for (const key of BOOLEAN_KEYS) {
    ficha[key] = src[key] === true;
  }

  ficha.nome = texto(src.nome, 200);
  ficha.prontuario = texto(src.prontuario, 40);
  ficha.dataAdmissao = dataIso(src.dataAdmissao);
  ficha.sexo = opcao(src.sexo, SEXO_OPCOES);
  ficha.raca = texto(src.raca, 80);
  ficha.idade = /^\d{1,3}$/.test(texto(src.idade, 3)) ? texto(src.idade, 3) : "";
  ficha.dn = dataIso(src.dn);
  ficha.religiao = texto(src.religiao, 80);
  ficha.ocupacao = texto(src.ocupacao, 120);
  ficha.telefone = texto(src.telefone, 40);
  ficha.endereco = texto(src.endereco, 300);
  ficha.escolaridade = texto(src.escolaridade, 80);
  ficha.responsavel = texto(src.responsavel, 160);
  ficha.cirurgiasAnteriores = texto(src.cirurgiasAnteriores, 300);
  ficha.outrasDoencasPes = texto(src.outrasDoencasPes, 300);
  ficha.outrasDoencasFam = texto(src.outrasDoencasFam, 300);
  ficha.outrasLesoes = texto(src.outrasLesoes, 300);
  ficha.historicoLesao = opcao(src.historicoLesao, HISTORICO_LESAO);
  ficha.evolucaoLesao = opcao(src.evolucaoLesao, EVOLUCAO_LESAO);
  ficha.outrasEtiologias = texto(src.outrasEtiologias, 300);
  ficha.outrasComorbidades = texto(src.outrasComorbidades, 300);
  ficha.medicacaoContinua = texto(src.medicacaoContinua, 2000);
  ficha.pa = texto(src.pa, 20);
  ficha.temperatura = texto(src.temperatura, 10);
  ficha.pulso = texto(src.pulso, 10);
  ficha.respiracao = texto(src.respiracao, 10);
  ficha.sapo2 = texto(src.sapo2, 10);
  ficha.pulsoPedioso = texto(src.pulsoPedioso, 40);
  ficha.pulsoTibialPosterior = texto(src.pulsoTibialPosterior, 40);
  ficha.peso = texto(src.peso, 10);
  ficha.altura = texto(src.altura, 10);
  ficha.imc = texto(src.imc, 10);
  ficha.auscultaCardiaca = texto(src.auscultaCardiaca, 160);
  ficha.auscultaPulmonar = texto(src.auscultaPulmonar, 160);
  const escala = texto(src.escalaDor, 2);
  ficha.escalaDor = /^(10|[0-9])$/.test(escala) ? escala : "";
  ficha.localDor = texto(src.localDor, 160);
  ficha.avNutricional = opcao(src.avNutricional, AVALIACAO_NUTRICIONAL);
  ficha.pe = sanitizarPe(src.pe);
  ficha.classificacao = texto(src.classificacao, 120);
  ficha.sinbad = texto(src.sinbad, 20);
  ficha.itb = texto(src.itb, 20);
  ficha.tipoTecido = opcao(src.tipoTecido, OPCOES_TIPO_TECIDO);
  ficha.contaminacao = opcao(src.contaminacao, OPCOES_CONTAMINACAO);
  ficha.qtdExsudato = opcao(src.qtdExsudato, OPCOES_QTD_EXSUDATO);
  ficha.caracExsudato = opcao(src.caracExsudato, OPCOES_CARAC_EXSUDATO);
  ficha.odorExsudato = opcao(src.odorExsudato, OPCOES_ODOR);
  ficha.bordas = opcao(src.bordas, OPCOES_BORDAS);
  ficha.pelePerilesional = opcao(src.pelePerilesional, OPCOES_PELE_PERILESIONAL);
  ficha.comprimento = medida(src.comprimento);
  ficha.alturaLesao = medida(src.alturaLesao);
  ficha.profundidade = medida(src.profundidade);
  ficha.escalaPush = opcao(src.escalaPush, OPCOES_PUSH);
  ficha.diagEnfermagem = texto(src.diagEnfermagem, 4000);
  ficha.solucaoLimpeza = texto(src.solucaoLimpeza, 300);
  ficha.coberturaPrimaria = texto(src.coberturaPrimaria, 300);
  ficha.coberturaSecundaria = texto(src.coberturaSecundaria, 300);
  ficha.terapiaCompressiva = texto(src.terapiaCompressiva, 300);
  ficha.terapiaAdjuvante = texto(src.terapiaAdjuvante, 300);
  ficha.tempoTroca = texto(src.tempoTroca, 120);
  ficha.evolucao = texto(src.evolucao, 4000);
  ficha.planosCuidado = texto(src.planosCuidado, 4000);
  ficha.proximaConsulta = dataIso(src.proximaConsulta);
  return ficha;
}

export type PacienteIdentificacao = {
  id: number;
  nome_completo: string | null;
  nome_social: string | null;
  genero: string | null;
  data_nascimento: string | null;
  telefone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
};

export function nomePacienteIdentificacao(p: PacienteIdentificacao): string {
  const nc = p.nome_completo?.trim() ?? "";
  const ns = p.nome_social?.trim() ?? "";
  return nc || ns || `Paciente #${p.id}`;
}

export function sexoDaFicha(genero: string | null | undefined): string {
  const g = (genero ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase();
  if (g.startsWith("masc")) return "Masculino";
  if (g.startsWith("fem")) return "Feminino";
  if (g === "outro" || g.includes("nao-bin") || g.includes("nao bin")) return "Outro";
  return "";
}

export function idadeEmAnos(dataNascimento: string | null | undefined, referencia = new Date()): string {
  if (!dataNascimento || !/^\d{4}-\d{2}-\d{2}$/.test(dataNascimento)) return "";
  const [y, m, d] = dataNascimento.split("-").map(Number);
  if (!y || !m || !d) return "";
  let idade = referencia.getFullYear() - y;
  const mes = referencia.getMonth() + 1;
  const dia = referencia.getDate();
  if (mes < m || (mes === m && dia < d)) idade -= 1;
  if (idade < 0 || idade > 130) return "";
  return String(idade);
}

export function enderecoPaciente(p: PacienteIdentificacao): string {
  const rua = [p.logradouro?.trim(), p.numero?.trim()].filter(Boolean).join(", ");
  const comComplemento = [rua, p.complemento?.trim()].filter(Boolean).join(" ");
  const cidadeUf = [p.cidade?.trim(), p.uf?.trim()].filter(Boolean).join("/");
  const partes = [comComplemento, p.bairro?.trim(), cidadeUf].filter(Boolean);
  let textoEndereco = partes.join(" - ");
  const cep = p.cep?.trim();
  if (cep) textoEndereco = textoEndereco ? `${textoEndereco} - CEP ${cep}` : `CEP ${cep}`;
  return textoEndereco;
}

export function preencherIdentificacao(
  paciente: PacienteIdentificacao,
  dataAdmissao: string,
): FichaEnfermagem {
  const ficha = fichaVazia();
  ficha.nome = nomePacienteIdentificacao(paciente);
  ficha.prontuario = String(paciente.id);
  ficha.dataAdmissao = dataIso(dataAdmissao);
  ficha.sexo = sexoDaFicha(paciente.genero);
  ficha.dn = dataIso(paciente.data_nascimento ?? "");
  ficha.idade = idadeEmAnos(ficha.dn || paciente.data_nascimento);
  ficha.telefone = (paciente.telefone ?? "").trim().slice(0, 40);
  ficha.endereco = enderecoPaciente(paciente).slice(0, 300);
  return ficha;
}

/** IMC a partir de peso (kg) e altura (m ou cm). */
export function calcularImc(peso: string, altura: string): string {
  const p = Number(peso.trim().replace(",", "."));
  let a = Number(altura.trim().replace(",", "."));
  if (!Number.isFinite(p) || !Number.isFinite(a) || p <= 0 || a <= 0) return "";
  if (a > 3) a = a / 100;
  if (a < 0.4 || a > 2.6) return "";
  const imc = p / (a * a);
  if (!Number.isFinite(imc) || imc < 5 || imc > 90) return "";
  return imc.toFixed(1).replace(".", ",");
}
