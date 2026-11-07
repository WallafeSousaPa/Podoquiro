"use client";

import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ModalTermoAssinaturaVirtual } from "@/components/modal-termo-assinatura-virtual";
import { imprimirHtml } from "@/lib/client/imprimir-html";
import {
  MAX_BYTES_PDF_TERMO_ASSINATURA,
  mensagemPdfTermoGrandeDemais,
} from "@/lib/client/comprimir-imagem-anamnese";
import { ConsultaFichaEnfermagem } from "../../pacientes/avaliacoes/consulta-ficha-enfermagem";
import {
  AVALIACAO_NUTRICIONAL,
  calcularImc,
  CRITERIOS_PE,
  EVOLUCAO_LESAO,
  HISTORICO_LESAO,
  OPCOES_BORDAS,
  OPCOES_CARAC_EXSUDATO,
  OPCOES_CONTAMINACAO,
  OPCOES_ODOR,
  OPCOES_PELE_PERILESIONAL,
  OPCOES_PUSH,
  OPCOES_QTD_EXSUDATO,
  OPCOES_TIPO_TECIDO,
  sanitizarFicha,
  type BooleanFichaKey,
  type CriterioPeKey,
  type FichaEnfermagem,
  type SimNao,
} from "@/lib/enfermagem/ficha";
import "./modal-avaliacao-enfermagem.css";

export type AvaliacaoAgendamento = {
  id: number;
  id_paciente: number;
  paciente_nome: string;
};

type Props = {
  ag: AvaliacaoAgendamento;
  onClose: () => void;
  onSalvo: (idAgendamento: number) => void;
};

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <>
      <h4 className="section-title">{titulo}</h4>
      {children}
    </>
  );
}

function Campo({
  id,
  label,
  children,
  className = "col-md-4",
}: {
  id?: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="form-label font-weight-bold" htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Checks({
  ficha,
  onChange,
  itens,
  col = "col-md-4",
}: {
  ficha: FichaEnfermagem;
  onChange: (key: BooleanFichaKey, value: boolean) => void;
  itens: { key: BooleanFichaKey; label: string }[];
  col?: string;
}) {
  return (
    <div className="row g-2">
      {itens.map((item) => (
        <div className={col} key={item.key}>
          <div className="form-check">
            <input
              className="form-check-input"
              type="checkbox"
              id={`enf-${item.key}`}
              checked={ficha[item.key]}
              onChange={(e) => onChange(item.key, e.target.checked)}
            />
            <label className="form-check-label" htmlFor={`enf-${item.key}`}>
              {item.label}
            </label>
          </div>
        </div>
      ))}
    </div>
  );
}

function SelectCampo({
  id,
  label,
  value,
  options,
  onChange,
  className = "col-md-6",
}: {
  id: string;
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <Campo id={id} label={label} className={className}>
      <select
        id={id}
        className="form-control"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Selecione...</option>
        {options.map((op) => (
          <option key={op} value={op}>
            {op}
          </option>
        ))}
      </select>
    </Campo>
  );
}

export function ModalAvaliacaoEnfermagem({ ag, onClose, onSalvo }: Props) {
  const [portalOk, setPortalOk] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ficha, setFicha] = useState<FichaEnfermagem | null>(null);
  const [jaSalva, setJaSalva] = useState(false);
  const [assinaturaVirtual, setAssinaturaVirtual] = useState(false);
  const [arquivoTermoAssinatura, setArquivoTermoAssinatura] = useState<File | null>(null);
  const [termoExistente, setTermoExistente] = useState<string | null>(null);
  const [modalTermoAberto, setModalTermoAberto] = useState(false);
  const [perguntarImpressao, setPerguntarImpressao] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const imcAuto = useRef("");

  useEffect(() => {
    setPortalOk(true);
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, []);

  useEffect(() => {
    let ativo = true;
    async function load() {
      setCarregando(true);
      setErro(null);
      try {
        const res = await fetch(
          `/api/pacientes/${ag.id_paciente}/ficha-enfermagem?id_agendamento=${ag.id}`,
        );
        const json = (await res.json()) as {
          error?: string;
          id?: number | null;
          dados?: unknown;
          arquivo_termo_assinatura_virtual?: string | null;
        };
        if (!res.ok) throw new Error(json.error ?? "Erro ao abrir a avaliação.");
        if (!ativo) return;
        const dados = sanitizarFicha(json.dados);
        imcAuto.current = calcularImc(dados.peso, dados.altura);
        const pathTermo =
          typeof json.arquivo_termo_assinatura_virtual === "string" &&
          json.arquivo_termo_assinatura_virtual.trim()
            ? json.arquivo_termo_assinatura_virtual.trim()
            : null;
        setFicha(dados);
        setJaSalva(json.id != null);
        setTermoExistente(pathTermo);
        setArquivoTermoAssinatura(null);
        setAssinaturaVirtual(pathTermo != null);
        setModalTermoAberto(false);
      } catch (e) {
        if (!ativo) return;
        setErro(e instanceof Error ? e.message : "Erro ao abrir a avaliação.");
      } finally {
        if (ativo) setCarregando(false);
      }
    }
    void load();
    return () => {
      ativo = false;
    };
  }, [ag.id, ag.id_paciente]);

  function setTexto<K extends keyof FichaEnfermagem>(key: K, value: FichaEnfermagem[K]) {
    setFicha((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function setBool(key: BooleanFichaKey, value: boolean) {
    setFicha((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function setMedida(campo: "peso" | "altura", valor: string) {
    setFicha((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [campo]: valor };
      const calc = calcularImc(
        campo === "peso" ? valor : prev.peso,
        campo === "altura" ? valor : prev.altura,
      );
      if (prev.imc === "" || prev.imc === imcAuto.current) {
        next.imc = calc;
        imcAuto.current = calc;
      }
      return next;
    });
  }

  function setPe(key: CriterioPeKey, lado: "direito" | "esquerdo", valor: SimNao) {
    setFicha((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        pe: {
          ...prev.pe,
          [key]: { ...prev.pe[key], [lado]: valor },
        },
      };
    });
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!ficha || salvando) return;
    const temTermo = Boolean(arquivoTermoAssinatura) || (assinaturaVirtual && Boolean(termoExistente));
    if (!temTermo) {
      setErro("Preencha o Termo — assinatura virtual (marque a opção, leia e assine o termo).");
      return;
    }
    if (arquivoTermoAssinatura && arquivoTermoAssinatura.size > MAX_BYTES_PDF_TERMO_ASSINATURA) {
      setErro(mensagemPdfTermoGrandeDemais(arquivoTermoAssinatura.size));
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const fd = new FormData();
      fd.append("id_agendamento", String(ag.id));
      fd.append("dados", JSON.stringify(ficha));
      if (arquivoTermoAssinatura) {
        fd.append("arquivo_termo_assinatura_virtual", arquivoTermoAssinatura);
      } else if (assinaturaVirtual && termoExistente) {
        fd.append("manter_termo_existente", "1");
      }
      const res = await fetch(`/api/pacientes/${ag.id_paciente}/ficha-enfermagem`, {
        method: "PUT",
        body: fd,
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao salvar a avaliação.");
      onSalvo(ag.id);
      setPerguntarImpressao(true);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar a avaliação.");
    } finally {
      setSalvando(false);
    }
  }

  function imprimirFicha() {
    if (!printRef.current) return;
    imprimirHtml(printRef.current, `Avaliação de enfermagem — ${ag.paciente_nome}`);
  }

  if (!portalOk) return null;

  let grupoAnterior = "";

  const corpo = (
    <div className="modal-avaliacao-enfermagem">
      <div
        className="modal fade show"
        style={{ display: "block", zIndex: 1080 }}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-avaliacao-enfermagem"
      >
        <div className="modal-dialog" role="document">
          <div className="modal-content shadow-lg">
            <div className="card-header-custom text-center py-4 px-3">
              <h2 id="titulo-avaliacao-enfermagem" className="h4 mb-1">
                FICHA DE ADMISSÃO, AVALIAÇÃO E PÉ DIABÉTICO
              </h2>
              <span className="badge badge-light mt-2">REGISTRO INTEGRADO DE ENFERMAGEM</span>
              <div className="small mt-2">{ag.paciente_nome}</div>
            </div>
            <button
              type="button"
              className="close text-white position-absolute"
              style={{ top: 12, right: 16, zIndex: 2, textShadow: "none", opacity: 1 }}
              aria-label="Fechar"
              onClick={onClose}
            >
              <span aria-hidden="true">&times;</span>
            </button>
            {carregando ? (
              <div className="modal-body">
                <p className="text-center text-muted py-5 mb-0">Carregando ficha...</p>
              </div>
            ) : !ficha ? (
              <div className="modal-body">
                {erro ? (
                  <div className="alert alert-danger" role="alert">
                    {erro}
                  </div>
                ) : null}
                <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
                  Fechar
                </button>
              </div>
            ) : (
                <form className="ficha-form" onSubmit={(e) => void salvar(e)}>
                  <div className="ficha-corpo">
                  {jaSalva ? (
                    <div className="alert alert-info py-2" role="status">
                      Esta avaliação já foi registrada neste atendimento. Salvar atualiza a ficha.
                    </div>
                  ) : null}
                  {erro ? (
                    <div className="alert alert-danger py-2" role="alert">
                      {erro}
                    </div>
                  ) : null}

                  <Secao titulo="2. ANTECEDENTES PESSOAIS">
                    <Checks
                      ficha={ficha}
                      onChange={setBool}
                      col="col-md-3"
                      itens={[
                        { key: "hasPes", label: "HAS" },
                        { key: "dmPes", label: "DM" },
                        { key: "tabagista", label: "Tabagista" },
                        { key: "etilista", label: "Etilista" },
                      ]}
                    />
                    <div className="row g-3 mt-1">
                      <Campo id="enf-cirurgias" label="Cirurgias Anteriores:" className="col-md-6">
                        <input
                          id="enf-cirurgias"
                          className="form-control"
                          value={ficha.cirurgiasAnteriores}
                          onChange={(e) => setTexto("cirurgiasAnteriores", e.target.value)}
                        />
                      </Campo>
                      <Campo id="enf-outras-pes" label="Outras Doenças:" className="col-md-6">
                        <input
                          id="enf-outras-pes"
                          className="form-control"
                          value={ficha.outrasDoencasPes}
                          onChange={(e) => setTexto("outrasDoencasPes", e.target.value)}
                        />
                      </Campo>
                    </div>
                  </Secao>

                  <Secao titulo="3. ANTECEDENTES FAMILIARES">
                    <Checks
                      ficha={ficha}
                      onChange={setBool}
                      col="col-md-3"
                      itens={[
                        { key: "hasFam", label: "HAS" },
                        { key: "dmFam", label: "DM" },
                      ]}
                    />
                    <div className="row g-3 mt-1">
                      <Campo id="enf-outras-fam" label="Outras Doenças:" className="col-md-6">
                        <input
                          id="enf-outras-fam"
                          className="form-control"
                          value={ficha.outrasDoencasFam}
                          onChange={(e) => setTexto("outrasDoencasFam", e.target.value)}
                        />
                      </Campo>
                    </div>
                  </Secao>

                  <Secao titulo="4. TIPO DE LESÃO">
                    <Checks
                      ficha={ficha}
                      onChange={setBool}
                      itens={[
                        { key: "lesaoPressao", label: "Lesão por Pressão" },
                        { key: "queimaduras", label: "Queimaduras" },
                        { key: "sitioCirurgico", label: "Sítio Cirúrgico" },
                        { key: "deiscencias", label: "Deiscências" },
                        { key: "ulceraVenosa", label: "Úlcera Venosa" },
                        { key: "peDiabetico", label: "Pé diabético" },
                        { key: "feridasTraumaticas", label: "Feridas Traumáticas" },
                        { key: "ulceraArterial", label: "Úlcera Arterial" },
                        { key: "feridaOperatoria", label: "Ferida Operatória" },
                        { key: "dermatites", label: "Dermatites" },
                      ]}
                    />
                    <div className="row g-3 mt-1">
                      <Campo id="enf-outras-lesoes" label="Outras:" className="col-md-8">
                        <input
                          id="enf-outras-lesoes"
                          className="form-control"
                          value={ficha.outrasLesoes}
                          onChange={(e) => setTexto("outrasLesoes", e.target.value)}
                        />
                      </Campo>
                    </div>
                  </Secao>

                  <Secao titulo="5. HISTÓRIA DA LESÃO">
                    <div className="row g-3">
                      <div className="col-md-4">
                        <span className="form-label font-weight-bold d-block">Ocorrência:</span>
                        {HISTORICO_LESAO.map((op) => (
                          <div className="form-check" key={op}>
                            <input
                              className="form-check-input"
                              type="radio"
                              name="historicoLesao"
                              id={`enf-hist-${op}`}
                              checked={ficha.historicoLesao === op}
                              onChange={() => setTexto("historicoLesao", op)}
                            />
                            <label className="form-check-label" htmlFor={`enf-hist-${op}`}>
                              {op === "primeira" ? "Primeira vez" : "Recidiva"}
                            </label>
                          </div>
                        ))}
                      </div>
                      <div className="col-md-4">
                        <span className="form-label font-weight-bold d-block">Etiologia:</span>
                        <Checks
                          ficha={ficha}
                          onChange={setBool}
                          col="col-12"
                          itens={[
                            { key: "etiologiaTrauma", label: "Trauma" },
                            { key: "etiologiaCirurgica", label: "Cirúrgica" },
                            { key: "etiologiaEspontanea", label: "Espontânea" },
                          ]}
                        />
                      </div>
                      <div className="col-md-4">
                        <span className="form-label font-weight-bold d-block">Evolução:</span>
                        {EVOLUCAO_LESAO.map((op) => (
                          <div className="form-check" key={op}>
                            <input
                              className="form-check-input"
                              type="radio"
                              name="evolucaoLesao"
                              id={`enf-evo-${op}`}
                              checked={ficha.evolucaoLesao === op}
                              onChange={() => setTexto("evolucaoLesao", op)}
                            />
                            <label className="form-check-label" htmlFor={`enf-evo-${op}`}>
                              {op === "aguda" ? "Aguda" : "Crônica"}
                            </label>
                          </div>
                        ))}
                      </div>
                      <Campo id="enf-outras-etio" label="Outras - Quais:" className="col-12">
                        <input
                          id="enf-outras-etio"
                          className="form-control"
                          value={ficha.outrasEtiologias}
                          onChange={(e) => setTexto("outrasEtiologias", e.target.value)}
                        />
                      </Campo>
                    </div>
                  </Secao>

                  <Secao titulo="6. COMORBIDADES PRESENTES QUE INFLUENCIARÃO NO PROCESSO DE CICATRIZAÇÃO">
                    <Checks
                      ficha={ficha}
                      onChange={setBool}
                      itens={[
                        { key: "dmCompensada", label: "Diabetes Compensada" },
                        { key: "dmDescompensada", label: "Diabetes Descompensada" },
                        { key: "hasSistemica", label: "Hipertensão Arterial Sistêmica" },
                        { key: "doencaCardiovascular", label: "Doença Cardiovascular" },
                        { key: "doencaVascular", label: "Doença Vascular" },
                        { key: "neoplasia", label: "Neoplasia" },
                      ]}
                    />
                    <div className="row g-3 mt-1">
                      <Campo id="enf-outras-comorb" label="Outros:" className="col-12">
                        <input
                          id="enf-outras-comorb"
                          className="form-control"
                          value={ficha.outrasComorbidades}
                          onChange={(e) => setTexto("outrasComorbidades", e.target.value)}
                        />
                      </Campo>
                    </div>
                  </Secao>

                  <Secao titulo="7. MEDICAÇÃO CONTÍNUA">
                    <textarea
                      className="form-control"
                      rows={2}
                      placeholder="Descreva as medicações de uso contínuo..."
                      value={ficha.medicacaoContinua}
                      onChange={(e) => setTexto("medicacaoContinua", e.target.value)}
                    />
                  </Secao>

                  <Secao titulo="8. EXAME FÍSICO">
                    <div className="row g-3">
                      <Campo id="enf-pa" label="PA (mmHg):" className="col-md-3">
                        <input
                          id="enf-pa"
                          className="form-control"
                          placeholder="Ex: 120/80"
                          value={ficha.pa}
                          onChange={(e) => setTexto("pa", e.target.value)}
                        />
                      </Campo>
                      <Campo id="enf-temp" label="T (ºC):" className="col-md-3">
                        <input
                          id="enf-temp"
                          className="form-control"
                          value={ficha.temperatura}
                          onChange={(e) => setTexto("temperatura", e.target.value)}
                        />
                      </Campo>
                      <Campo id="enf-pulso" label="P (bpm):" className="col-md-3">
                        <input
                          id="enf-pulso"
                          className="form-control"
                          value={ficha.pulso}
                          onChange={(e) => setTexto("pulso", e.target.value)}
                        />
                      </Campo>
                      <Campo id="enf-resp" label="R (irpm):" className="col-md-3">
                        <input
                          id="enf-resp"
                          className="form-control"
                          value={ficha.respiracao}
                          onChange={(e) => setTexto("respiracao", e.target.value)}
                        />
                      </Campo>
                      <Campo id="enf-sato" label="SapO2:" className="col-md-3">
                        <input
                          id="enf-sato"
                          className="form-control"
                          value={ficha.sapo2}
                          onChange={(e) => setTexto("sapo2", e.target.value)}
                        />
                      </Campo>
                      <Campo id="enf-pedioso" label="Pulso Pedioso:" className="col-md-3">
                        <input
                          id="enf-pedioso"
                          className="form-control"
                          value={ficha.pulsoPedioso}
                          onChange={(e) => setTexto("pulsoPedioso", e.target.value)}
                        />
                      </Campo>
                      <Campo id="enf-tibial" label="Pulso Tibial Posterior:" className="col-md-3">
                        <input
                          id="enf-tibial"
                          className="form-control"
                          value={ficha.pulsoTibialPosterior}
                          onChange={(e) => setTexto("pulsoTibialPosterior", e.target.value)}
                        />
                      </Campo>
                      <Campo id="enf-peso" label="PESO:" className="col-md-3">
                        <input
                          id="enf-peso"
                          className="form-control"
                          value={ficha.peso}
                          onChange={(e) => setMedida("peso", e.target.value)}
                        />
                      </Campo>
                      <Campo id="enf-altura" label="ALTURA:" className="col-md-4">
                        <input
                          id="enf-altura"
                          className="form-control"
                          value={ficha.altura}
                          onChange={(e) => setMedida("altura", e.target.value)}
                        />
                      </Campo>
                      <Campo id="enf-imc" label="IMC:" className="col-md-4">
                        <input
                          id="enf-imc"
                          className="form-control"
                          value={ficha.imc}
                          onChange={(e) => setTexto("imc", e.target.value)}
                        />
                      </Campo>
                      <Campo id="enf-ac" label="Ausculta Cardíaca:" className="col-md-4">
                        <input
                          id="enf-ac"
                          className="form-control"
                          value={ficha.auscultaCardiaca}
                          onChange={(e) => setTexto("auscultaCardiaca", e.target.value)}
                        />
                      </Campo>
                      <Campo id="enf-ap" label="Ausculta Pulmonar:" className="col-md-6">
                        <input
                          id="enf-ap"
                          className="form-control"
                          value={ficha.auscultaPulmonar}
                          onChange={(e) => setTexto("auscultaPulmonar", e.target.value)}
                        />
                      </Campo>
                    </div>
                  </Secao>

                  <Secao titulo="9. SISTEMA NEUROLÓGICO">
                    <Checks
                      ficha={ficha}
                      onChange={setBool}
                      col="col-md-3"
                      itens={[
                        { key: "neuroConsciente", label: "Consciente" },
                        { key: "neuroAgitado", label: "Agitado" },
                        { key: "neuroOrientado", label: "Orientado" },
                        { key: "neuroSonolento", label: "Sonolento" },
                        { key: "neuroInconsciente", label: "Inconsciente" },
                        { key: "neuroTorporoso", label: "Torporoso" },
                        { key: "neuroConfuso", label: "Confuso" },
                        { key: "neuroComatoso", label: "Comatoso" },
                      ]}
                    />
                  </Secao>

                  <Secao titulo="10. PELE E MUCOSAS">
                    <Checks
                      ficha={ficha}
                      onChange={setBool}
                      itens={[
                        { key: "peleCorado", label: "Corado" },
                        { key: "peleCianotico", label: "Cianótico" },
                        { key: "pelePalidez", label: "Palidez" },
                        { key: "peleIcterico", label: "Ictérico" },
                        { key: "peleManchas", label: "Manchas Escuras" },
                        { key: "peleBolhas", label: "Bolhas" },
                        { key: "peleHidratado", label: "Hidratado" },
                        { key: "peleDesidratado", label: "Desidratado" },
                        { key: "peleHiperemia", label: "Hiperemia" },
                        { key: "peleVarizes", label: "Varizes" },
                        { key: "pelePortaEntrada", label: "Porta de Entrada" },
                        { key: "peleDescamacao", label: "Descamação da Pele" },
                        { key: "peleFungosInterdigital", label: "Fungos Interdigital" },
                        { key: "peleFungoUngueal", label: "Fungo Ungueal" },
                      ]}
                    />
                  </Secao>

                  <Secao titulo="11. SISTEMA SENSITIVO / MOTOR">
                    <Checks
                      ficha={ficha}
                      onChange={setBool}
                      col="col-md-3"
                      itens={[
                        { key: "forcaPreservada", label: "Força Preservada" },
                        { key: "forcaDiminuida", label: "Força Diminuída" },
                        { key: "parestesia", label: "Parestesia" },
                        { key: "paresia", label: "Paresia" },
                        { key: "plegia", label: "Plegia" },
                      ]}
                    />
                  </Secao>

                  <Secao titulo="12. AVALIAÇÃO DE DOR">
                    <Checks
                      ficha={ficha}
                      onChange={setBool}
                      itens={[
                        { key: "expressaoDor", label: "Expressão Facial de Dor" },
                        { key: "dorEstimulacao", label: "Dor a Estimulação Tátil" },
                        { key: "relatoVerbal", label: "Relato Verbal de Dor" },
                      ]}
                    />
                    <div className="row g-3 mt-1">
                      <Campo id="enf-escala-dor" label="Escala (De 0 a 10):" className="col-md-6">
                        <input
                          id="enf-escala-dor"
                          type="number"
                          min={0}
                          max={10}
                          className="form-control"
                          value={ficha.escalaDor}
                          onChange={(e) => setTexto("escalaDor", e.target.value)}
                        />
                      </Campo>
                      <Campo id="enf-local-dor" label="Local:" className="col-md-6">
                        <input
                          id="enf-local-dor"
                          className="form-control"
                          value={ficha.localDor}
                          onChange={(e) => setTexto("localDor", e.target.value)}
                        />
                      </Campo>
                    </div>
                  </Secao>

                  <Secao titulo="13. SISTEMA RESPIRATÓRIO">
                    <Checks
                      ficha={ficha}
                      onChange={setBool}
                      col="col-md-3"
                      itens={[
                        { key: "ventilacaoEspontanea", label: "Ventilação Espontânea" },
                        { key: "oxigenoterapia", label: "Oxigenoterapia" },
                        { key: "vm", label: "VM" },
                        { key: "traqueostomia", label: "Traqueostomia" },
                      ]}
                    />
                  </Secao>

                  <Secao titulo="14. SISTEMA CARDIOVASCULAR / PERFUSÃO">
                    <Checks
                      ficha={ficha}
                      onChange={setBool}
                      itens={[
                        { key: "edemaMMII", label: "Edema de MMII" },
                        { key: "hipoxemia", label: "Hipoxemia" },
                        { key: "irpa", label: "IRpA" },
                        { key: "cianoseExtremidades", label: "Cianose de Extremidades" },
                        { key: "baixaSaturacao", label: "Baixa Saturação" },
                        { key: "hipotensao", label: "Hipotensão" },
                        { key: "usoDrogasVasoativas", label: "Uso de Drogas Vasoativas" },
                        { key: "hipoxia", label: "Hipóxia" },
                        { key: "hipovolemia", label: "Hipovolemia" },
                        { key: "peleFriaUmida", label: "Pele Fria e Úmida" },
                      ]}
                    />
                  </Secao>

                  <Secao titulo="15. NUTRIÇÃO">
                    <Checks
                      ficha={ficha}
                      onChange={setBool}
                      col="col-md-3"
                      itens={[
                        { key: "nutrido", label: "Nutrido" },
                        { key: "anemia", label: "Anemia" },
                        { key: "emagrecido", label: "Emagrecido" },
                        { key: "obeso", label: "Obeso" },
                        { key: "caquetico", label: "Caquético" },
                      ]}
                    />
                    <h5 className="mt-4 text-secondary font-weight-bold">15.1. DIETA</h5>
                    <Checks
                      ficha={ficha}
                      onChange={setBool}
                      col="col-md-2"
                      itens={[
                        { key: "dietaVO", label: "VO" },
                        { key: "dietaSNG", label: "SNG" },
                        { key: "dietaSNE", label: "SNE" },
                        { key: "dietaNPPNPT", label: "NPP/NPT" },
                        { key: "dietaGastrostomia", label: "Gastrostomia" },
                      ]}
                    />
                    <h5 className="mt-4 text-secondary font-weight-bold">15.2. AVALIAÇÃO NUTRICIONAL</h5>
                    <div className="row g-2">
                      {AVALIACAO_NUTRICIONAL.map((op) => (
                        <div className="col-md-4" key={op}>
                          <div className="form-check">
                            <input
                              className="form-check-input"
                              type="radio"
                              name="avNutricional"
                              id={`enf-nutri-${op}`}
                              checked={ficha.avNutricional === op}
                              onChange={() => setTexto("avNutricional", op)}
                            />
                            <label className="form-check-label" htmlFor={`enf-nutri-${op}`}>
                              {op === "inadequada"
                                ? "* Inadequada"
                                : op === "adequada"
                                  ? "** Adequada"
                                  : "*** Excelente"}
                            </label>
                          </div>
                        </div>
                      ))}
                      <div className="col-12">
                        <small className="text-muted d-block">
                          * Inadequada: NPT por mais de 3 dias, SNG e SNE com débito acima de 100ml
                          entre as dietas; come menos da metade em dietas livres.
                        </small>
                        <small className="text-muted d-block">
                          ** Adequada: NPT por até dois dias, SNG e SNE sem débito, come mais da
                          metade da dieta.
                        </small>
                        <small className="text-muted d-block">
                          *** Excelente: Dieta Livre e Aceitando!
                        </small>
                      </div>
                    </div>
                  </Secao>

                  <Secao titulo="16. AVALIAÇÃO DE RISCO PARA LESÃO DOS PÉS – CLIENTE COM DIABETES">
                    <div className="table-responsive">
                      <table className="table table-bordered table-custom align-middle">
                        <thead>
                          <tr>
                            <th rowSpan={2} className="text-left pl-3">
                              Critérios de Avaliação
                            </th>
                            <th colSpan={2}>Pé Direito</th>
                            <th colSpan={2}>Pé Esquerdo</th>
                          </tr>
                          <tr>
                            <th>SIM</th>
                            <th>NÃO</th>
                            <th>SIM</th>
                            <th>NÃO</th>
                          </tr>
                        </thead>
                        <tbody>
                          {CRITERIOS_PE.map((criterio) => {
                            const mostraGrupo =
                              criterio.grupo !== "" && criterio.grupo !== grupoAnterior;
                            if (criterio.grupo) grupoAnterior = criterio.grupo;
                            const linha = ficha.pe[criterio.key];
                            return (
                              <FragmentoCriterio
                                key={criterio.key}
                                grupo={mostraGrupo ? criterio.grupo : ""}
                                label={criterio.label}
                                name={criterio.key}
                                linha={linha}
                                onChange={(lado, valor) => setPe(criterio.key, lado, valor)}
                              />
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="row g-3 mb-2">
                      <Campo id="enf-classificacao" label="Classificação:" className="col-md-8">
                        <input
                          id="enf-classificacao"
                          className="form-control"
                          value={ficha.classificacao}
                          onChange={(e) => setTexto("classificacao", e.target.value)}
                        />
                      </Campo>
                      <Campo id="enf-sinbad" label="SINBAD:" className="col-md-4">
                        <input
                          id="enf-sinbad"
                          className="form-control"
                          value={ficha.sinbad}
                          onChange={(e) => setTexto("sinbad", e.target.value)}
                        />
                      </Campo>
                      <Campo id="enf-itb" label="ITB:" className="col-md-6">
                        <input
                          id="enf-itb"
                          className="form-control"
                          value={ficha.itb}
                          onChange={(e) => setTexto("itb", e.target.value)}
                        />
                      </Campo>
                    </div>
                  </Secao>

                  <Secao titulo="17. CARACTERÍSTICAS DA LESÃO / FERIDA">
                    <div className="row g-3">
                      <SelectCampo
                        id="enf-tecido"
                        label="Tipo de tecido:"
                        value={ficha.tipoTecido}
                        options={OPCOES_TIPO_TECIDO}
                        onChange={(v) => setTexto("tipoTecido", v)}
                      />
                      <SelectCampo
                        id="enf-cont"
                        label="Contaminação:"
                        value={ficha.contaminacao}
                        options={OPCOES_CONTAMINACAO}
                        onChange={(v) => setTexto("contaminacao", v)}
                      />
                      <SelectCampo
                        id="enf-qtd"
                        label="Quantidade de exsudato:"
                        value={ficha.qtdExsudato}
                        options={OPCOES_QTD_EXSUDATO}
                        onChange={(v) => setTexto("qtdExsudato", v)}
                      />
                      <SelectCampo
                        id="enf-carac"
                        label="Característica do exsudato:"
                        value={ficha.caracExsudato}
                        options={OPCOES_CARAC_EXSUDATO}
                        onChange={(v) => setTexto("caracExsudato", v)}
                      />
                      <SelectCampo
                        id="enf-odor"
                        label="Odor do Exsudato:"
                        value={ficha.odorExsudato}
                        options={OPCOES_ODOR}
                        onChange={(v) => setTexto("odorExsudato", v)}
                        className="col-md-4"
                      />
                      <SelectCampo
                        id="enf-bordas"
                        label="Bordas:"
                        value={ficha.bordas}
                        options={OPCOES_BORDAS}
                        onChange={(v) => setTexto("bordas", v)}
                        className="col-md-4"
                      />
                      <SelectCampo
                        id="enf-perilesional"
                        label="Pele Perilesional:"
                        value={ficha.pelePerilesional}
                        options={OPCOES_PELE_PERILESIONAL}
                        onChange={(v) => setTexto("pelePerilesional", v)}
                        className="col-md-4"
                      />
                    </div>
                    <div className="row g-3 mt-1">
                      <span className="form-label font-weight-bold mb-0">Tamanho:</span>
                      {(
                        [
                          ["comprimento", "Comprimento"],
                          ["alturaLesao", "Altura"],
                          ["profundidade", "Profundidade"],
                        ] as const
                      ).map(([key, rotulo]) => (
                        <div className="col-md-4" key={key}>
                          <div className="input-group">
                            <span className="input-group-text">{rotulo}</span>
                            <input
                              type="number"
                              step="0.1"
                              min={0}
                              className="form-control"
                              value={ficha[key]}
                              onChange={(e) => setTexto(key, e.target.value)}
                            />
                            <span className="input-group-text">cm</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="row g-3 mt-1">
                      <SelectCampo
                        id="enf-push"
                        label="Escala de Pressure Ulcer Scale for Healing (PUSH):"
                        value={ficha.escalaPush}
                        options={OPCOES_PUSH}
                        onChange={(v) => setTexto("escalaPush", v)}
                        className="col-12"
                      />
                    </div>
                  </Secao>

                  <Secao titulo="18. DIAGNÓSTICOS E CONDUTAS">
                    <Campo id="enf-diag" label="Diagnósticos de enfermagem:" className="col-12">
                      <textarea
                        id="enf-diag"
                        className="form-control"
                        rows={3}
                        value={ficha.diagEnfermagem}
                        onChange={(e) => setTexto("diagEnfermagem", e.target.value)}
                      />
                    </Campo>
                    <h5 className="mt-4 text-secondary font-weight-bold">18.1. Prescrição de enfermagem</h5>
                    <div className="row g-3">
                      {(
                        [
                          ["solucaoLimpeza", "Solução de limpeza:"],
                          ["coberturaPrimaria", "Cobertura primária:"],
                          ["coberturaSecundaria", "Cobertura secundária/Terciária:"],
                          ["terapiaCompressiva", "Terapia compressiva:"],
                          ["terapiaAdjuvante", "Terapia adjuvante:"],
                          ["tempoTroca", "Tempo de troca:"],
                        ] as const
                      ).map(([key, label]) => (
                        <Campo key={key} id={`enf-${key}`} label={label} className="col-12">
                          <input
                            id={`enf-${key}`}
                            className="form-control"
                            value={ficha[key]}
                            onChange={(e) => setTexto(key, e.target.value)}
                          />
                        </Campo>
                      ))}
                      <Campo id="enf-evolucao" label="Evolução:" className="col-12">
                        <textarea
                          id="enf-evolucao"
                          className="form-control"
                          rows={3}
                          value={ficha.evolucao}
                          onChange={(e) => setTexto("evolucao", e.target.value)}
                        />
                      </Campo>
                      <Campo id="enf-planos" label="Planos de cuidado:" className="col-12">
                        <textarea
                          id="enf-planos"
                          className="form-control"
                          rows={3}
                          value={ficha.planosCuidado}
                          onChange={(e) => setTexto("planosCuidado", e.target.value)}
                        />
                      </Campo>
                      <Campo id="enf-proxima" label="Próxima consulta:" className="col-md-6">
                        <input
                          id="enf-proxima"
                          type="date"
                          className="form-control"
                          value={ficha.proximaConsulta}
                          onChange={(e) => setTexto("proximaConsulta", e.target.value)}
                        />
                      </Campo>
                    </div>
                  </Secao>

                  <Secao titulo="19. Sistema de classificação de úlceras de Pé Diabético SINBAD">
                    <div className="table-responsive mb-4">
                      <table className="table table-striped table-bordered text-center align-middle">
                        <thead className="table-dark">
                          <tr>
                            <th>Categoria</th>
                            <th>Definição</th>
                            <th>Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>Local (Site)</td>
                            <td className="text-left">
                              Antepé
                              <br />
                              Mediopé ou retropé
                            </td>
                            <td>
                              0<br />1
                            </td>
                          </tr>
                          <tr>
                            <td>Isquemia</td>
                            <td className="text-left">
                              Fluxo sanguíneo intacto, um pulso palpável
                              <br />
                              Evidência clínica de redução de fluxo sanguíneo
                            </td>
                            <td>
                              0<br />1
                            </td>
                          </tr>
                          <tr>
                            <td>Neuropatia</td>
                            <td className="text-left">
                              Sensação protetora intacta
                              <br />
                              Sensação protetora perdida
                            </td>
                            <td>
                              0<br />1
                            </td>
                          </tr>
                          <tr>
                            <td>Infecção Bacteriana</td>
                            <td className="text-left">
                              Ausente
                              <br />
                              Presente
                            </td>
                            <td>
                              0<br />1
                            </td>
                          </tr>
                          <tr>
                            <td>Área</td>
                            <td className="text-left">
                              Úlcera &lt;1cm²
                              <br />
                              Úlcera &gt;1cm²
                            </td>
                            <td>
                              0<br />1
                            </td>
                          </tr>
                          <tr>
                            <td>Profundidade (Depth)</td>
                            <td className="text-left">
                              Úlcera confinada à pele e tecido subcutâneo
                              <br />
                              Úlcera atingindo músculo, tendão ou mais profunda
                            </td>
                            <td>
                              0<br />1
                            </td>
                          </tr>
                          <tr className="font-weight-bold">
                            <td colSpan={2} className="text-right">
                              Score total possível
                            </td>
                            <td>0 - 6</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </Secao>

                  <div className="border rounded p-3 mb-3">
                    <h4 className="section-title">Termo — assinatura virtual *</h4>
                    <div className="form-check mb-2">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        id="enfermagem-assinatura-virtual"
                        checked={assinaturaVirtual}
                        disabled={salvando}
                        onChange={(ev) => {
                          const ck = ev.target.checked;
                          setAssinaturaVirtual(ck);
                          if (ck) {
                            if (!arquivoTermoAssinatura && !termoExistente) {
                              setModalTermoAberto(true);
                            }
                          } else {
                            setArquivoTermoAssinatura(null);
                          }
                        }}
                      />
                      <label className="form-check-label" htmlFor="enfermagem-assinatura-virtual">
                        Assinatura virtual (termo de consentimento Podoquiro)
                      </label>
                    </div>
                    {assinaturaVirtual ? (
                      <div className="mb-0">
                        <button
                          type="button"
                          className="btn btn-outline-primary btn-sm mr-2"
                          disabled={salvando}
                          onClick={() => setModalTermoAberto(true)}
                        >
                          {arquivoTermoAssinatura || termoExistente
                            ? "Alterar termo assinado"
                            : "Abrir termo para leitura e assinatura"}
                        </button>
                        {arquivoTermoAssinatura ? (
                          <span className="small text-success">Anexo: {arquivoTermoAssinatura.name}</span>
                        ) : termoExistente ? (
                          <span className="small text-success">Termo já assinado nesta ficha.</span>
                        ) : (
                          <span className="small text-warning">
                            Leia o termo na tela cheia e assine abaixo do texto.
                          </span>
                        )}
                      </div>
                    ) : null}
                  </div>

                  </div>
                  <div className="ficha-acoes">
                    {erro ? (
                      <div className="alert alert-danger py-2 mb-0 ficha-erro" role="alert">
                        {erro}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={onClose}
                      disabled={salvando}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-primary"
                      onClick={imprimirFicha}
                      disabled={salvando || !ficha}
                    >
                      Imprimir PDF
                    </button>
                    <button type="submit" className="btn btn-custom" disabled={salvando}>
                      {salvando ? "Salvando..." : "Salvar Ficha Completa"}
                    </button>
                  </div>
                </form>
            )}
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" style={{ zIndex: 1070 }} />
      {ficha ? (
        <div ref={printRef} className="d-none" aria-hidden="true">
          <ConsultaFichaEnfermagem dados={ficha} />
        </div>
      ) : null}
      {perguntarImpressao ? (
        <>
          <div className="modal fade show" style={{ display: "block", zIndex: 1090 }} role="dialog" aria-modal="true">
            <div className="modal-dialog modal-dialog-centered" role="document">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Ficha salva</h5>
                </div>
                <div className="modal-body">
                  <p className="mb-0">Deseja imprimir a avaliação de enfermagem em PDF?</p>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={onClose}>
                    Agora não
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      imprimirFicha();
                      onClose();
                    }}
                  >
                    Imprimir PDF
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" style={{ zIndex: 1085 }} />
        </>
      ) : null}
    </div>
  );

  return createPortal(
    <>
      {corpo}
      <ModalTermoAssinaturaVirtual
        key={modalTermoAberto ? `termo-enf-${ag.id_paciente}` : "termo-enf-fechado"}
        open={modalTermoAberto}
        zIndex={1100}
        idPaciente={ag.id_paciente}
        nomeDisplayPaciente={ag.paciente_nome}
        onClose={() => setModalTermoAberto(false)}
        onConfirm={(file) => {
          setArquivoTermoAssinatura(file);
          setAssinaturaVirtual(true);
          setModalTermoAberto(false);
        }}
      />
    </>,
    document.body,
  );
}

function FragmentoCriterio({
  grupo,
  label,
  name,
  linha,
  onChange,
}: {
  grupo: string;
  label: string;
  name: string;
  linha: { direito: SimNao; esquerdo: SimNao };
  onChange: (lado: "direito" | "esquerdo", valor: SimNao) => void;
}) {
  return (
    <>
      {grupo ? (
        <tr className="table-secondary font-weight-bold">
          <td colSpan={5} className="text-left pl-3 text-dark">
            {grupo}
          </td>
        </tr>
      ) : null}
      <tr>
        <td className="text-left pl-3">{label}</td>
        {(["direito", "esquerdo"] as const).flatMap((lado) =>
          (["sim", "nao"] as const).map((valor) => (
            <td className="center-cell" key={`${lado}-${valor}`}>
              <input
                className="form-check-input"
                type="radio"
                name={`${name}_${lado}`}
                checked={linha[lado] === valor}
                onChange={() => onChange(lado, valor)}
                aria-label={`${label} ${lado} ${valor}`}
              />
            </td>
          )),
        )}
      </tr>
    </>
  );
}
