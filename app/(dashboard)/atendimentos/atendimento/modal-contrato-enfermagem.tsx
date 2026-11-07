"use client";

import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CampoAssinatura, type CampoAssinaturaHandle } from "@/components/campo-assinatura";
import { imprimirHtml } from "@/lib/client/imprimir-html";
import {
  CONTRATO_VAZIO,
  sanitizarContrato,
  type ContratoEnfermagem,
} from "@/lib/enfermagem/contrato";
import { ContratoDocumento } from "./contrato-documento";
import "./modal-contrato-enfermagem.css";

export type ContratoContexto = {
  id: number;
  id_paciente: number;
  paciente_nome: string;
};

export type ContratoSalvo = {
  id: number;
  created_at: string;
  dados: ContratoEnfermagem;
};

type Props = {
  ag: ContratoContexto;
  inicio: "perguntar" | "novo" | "consulta";
  consulta?: ContratoSalvo | null;
  onClose: () => void;
  onSalvo?: () => void;
};

type Etapa = "perguntar" | "formulario" | "consulta";

export function ModalContratoEnfermagem({ ag, inicio, consulta, onClose, onSalvo }: Props) {
  const [etapa, setEtapa] = useState<Etapa>(inicio === "perguntar" ? "perguntar" : inicio === "consulta" ? "consulta" : "formulario");
  const [form, setForm] = useState<ContratoEnfermagem>(consulta?.dados ?? CONTRATO_VAZIO);
  const [carregando, setCarregando] = useState(inicio !== "consulta" || !consulta);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [errosCampo, setErrosCampo] = useState<Partial<Record<keyof ContratoEnfermagem, string>>>({});
  const [quantidade, setQuantidade] = useState(consulta ? 1 : 0);
  const [perguntarImpressao, setPerguntarImpressao] = useState(false);
  const [perguntarAssinatura, setPerguntarAssinatura] = useState(false);
  const [assinandoPaciente, setAssinandoPaciente] = useState(false);
  const [erroAssinatura, setErroAssinatura] = useState<string | null>(null);
  const [limparAssinatura, setLimparAssinatura] = useState(0);
  const [temAssinaturaEnfermeira, setTemAssinaturaEnfermeira] = useState(false);
  const assinaturaRef = useRef<CampoAssinaturaHandle>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (inicio === "consulta" && consulta) {
      setCarregando(false);
      return;
    }
    if (inicio === "perguntar") {
      setCarregando(false);
      return;
    }
    let ativo = true;
    async function carregar() {
      setCarregando(true);
      setErro(null);
      try {
        const res = await fetch(`/api/pacientes/${ag.id_paciente}/contratos-enfermagem`);
        const json = (await res.json()) as {
          error?: string;
          prefill?: ContratoEnfermagem;
          tem_assinatura_enfermeira?: boolean;
          contratos?: { id: number; created_at: string; dados: ContratoEnfermagem }[];
        };
        if (!res.ok) throw new Error(json.error ?? "Erro ao carregar o contrato.");
        if (!ativo) return;
        setTemAssinaturaEnfermeira(Boolean(json.tem_assinatura_enfermeira));
        const lista = json.contratos ?? [];
        setQuantidade(lista.length);
        if (inicio === "consulta") {
          const ultimo = lista[0];
          if (!ultimo) throw new Error("Nenhum contrato encontrado para este paciente.");
          setForm(ultimo.dados);
        } else if (json.prefill) {
          setForm(json.prefill);
        }
      } catch (e) {
        if (ativo) setErro(e instanceof Error ? e.message : "Erro ao carregar o contrato.");
      } finally {
        if (ativo) setCarregando(false);
      }
    }
    void carregar();
    return () => {
      ativo = false;
    };
  }, [ag.id_paciente, consulta, inicio]);

  function definir<K extends keyof ContratoEnfermagem>(chave: K, valor: ContratoEnfermagem[K]) {
    setForm((atual) => ({ ...atual, [chave]: valor }));
    setErrosCampo((atual) => {
      if (!atual[chave]) return atual;
      const proximo = { ...atual };
      delete proximo[chave];
      return proximo;
    });
  }

  function mostrarErros(erros: Partial<Record<keyof ContratoEnfermagem, string>>) {
    setErrosCampo(erros);
    setErro(erros.enfermeira_nome ?? null);
    window.requestAnimationFrame(() => {
      document
        .querySelector(".modal-contrato-enfermagem .is-invalid")
        ?.scrollIntoView({ block: "center" });
    });
  }

  function imprimir() {
    if (!printRef.current) return;
    imprimirHtml(printRef.current, `Contrato — ${ag.paciente_nome}`, {
      rodape: "Podoquiro · Contrato de prestação de serviços",
    });
  }

  function pedirAssinatura(e: FormEvent) {
    e.preventDefault();
    const limpo = sanitizarContrato(form);
    if (!limpo.ok) {
      mostrarErros(limpo.erros);
      return;
    }
    setErro(null);
    setErrosCampo({});
    setPerguntarAssinatura(true);
  }

  async function persistir(assinaturaPaciente: string) {
    const limpo = sanitizarContrato({ ...form, assinatura_paciente: assinaturaPaciente });
    if (!limpo.ok) {
      mostrarErros(limpo.erros);
      setPerguntarAssinatura(false);
      setAssinandoPaciente(false);
      return;
    }
    setSalvando(true);
    setErro(null);
    setErroAssinatura(null);
    try {
      const res = await fetch(`/api/pacientes/${ag.id_paciente}/contratos-enfermagem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_agendamento: ag.id, dados: limpo.dados }),
      });
      const json = (await res.json()) as { error?: string; dados?: ContratoEnfermagem };
      if (!res.ok) throw new Error(json.error ?? "Erro ao salvar o contrato.");
      setForm(json.dados ?? limpo.dados);
      setEtapa("consulta");
      setPerguntarAssinatura(false);
      setAssinandoPaciente(false);
      setPerguntarImpressao(true);
      onSalvo?.();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar o contrato.");
      setPerguntarAssinatura(false);
      setAssinandoPaciente(false);
    } finally {
      setSalvando(false);
    }
  }

  function confirmarAssinaturaPaciente() {
    const imagem = assinaturaRef.current?.exportarJpeg();
    if (!imagem) {
      setErroAssinatura("Desenhe a assinatura do paciente no campo indicado.");
      return;
    }
    void persistir(imagem);
  }

  const titulo =
    etapa === "perguntar"
      ? "Contrato já preenchido"
      : etapa === "formulario"
        ? "Novo contrato"
        : "Contrato de prestação de serviços";

  return createPortal(
    <div className="modal-contrato-enfermagem">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="contrato-titulo">
        <div className={`modal-dialog ${etapa === "perguntar" ? "pergunta-dialog" : ""}`}>
          {etapa === "perguntar" ? (
            <div className="pergunta">
              <h2 id="contrato-titulo" className="h5" style={{ color: "#4f1964" }}>
                {ag.paciente_nome} já possui contrato
              </h2>
              <p className="mb-3">Deseja fazer outro contrato para este paciente?</p>
              <div className="d-flex flex-column flex-sm-row justify-content-end" style={{ gap: 8 }}>
                <button type="button" className="btn btn-light" onClick={onClose}>
                  Agora não
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => {
                    setEtapa("consulta");
                    setCarregando(true);
                    void fetch(`/api/pacientes/${ag.id_paciente}/contratos-enfermagem`)
                      .then(async (res) => {
                        const json = (await res.json()) as {
                          error?: string;
                          contratos?: { dados: ContratoEnfermagem }[];
                        };
                        if (!res.ok) throw new Error(json.error ?? "Erro ao abrir o contrato.");
                        const ultimo = json.contratos?.[0];
                        if (!ultimo) throw new Error("Nenhum contrato encontrado.");
                        setForm(ultimo.dados);
                        setQuantidade(json.contratos?.length ?? 1);
                      })
                      .catch((e: unknown) => setErro(e instanceof Error ? e.message : "Erro ao abrir o contrato."))
                      .finally(() => setCarregando(false));
                  }}
                >
                  Ver contrato
                </button>
                <button
                  type="button"
                  className="btn btn-custom"
                  onClick={() => {
                    setEtapa("formulario");
                    setCarregando(true);
                    setErro(null);
                    void fetch(`/api/pacientes/${ag.id_paciente}/contratos-enfermagem`)
                      .then(async (res) => {
                        const json = (await res.json()) as {
                          error?: string;
                          prefill?: ContratoEnfermagem;
                          tem_assinatura_enfermeira?: boolean;
                        };
                        if (!res.ok) throw new Error(json.error ?? "Erro ao preparar o contrato.");
                        setTemAssinaturaEnfermeira(Boolean(json.tem_assinatura_enfermeira));
                        if (json.prefill) setForm(json.prefill);
                      })
                      .catch((e: unknown) => setErro(e instanceof Error ? e.message : "Erro ao preparar o contrato."))
                      .finally(() => setCarregando(false));
                  }}
                >
                  Fazer outro
                </button>
              </div>
            </div>
          ) : (
            <div className="modal-content">
              <div className="card-header-custom">
                <div>
                  <h2 id="contrato-titulo">{titulo}</h2>
                  <p>{ag.paciente_nome}</p>
                </div>
                <button type="button" className="btn-fechar" onClick={onClose} aria-label="Fechar">
                  ×
                </button>
              </div>
              <form className="d-flex flex-column flex-grow-1" style={{ minHeight: 0 }} onSubmit={pedirAssinatura}>
                <div className="ficha-corpo">
                  {erro ? <div className="alert alert-danger py-2">{erro}</div> : null}
                  {carregando ? <p className="text-muted mb-0">Carregando...</p> : null}
                  {!carregando && etapa === "formulario" ? (
                    <>
                      <h3 className="section-title">Paciente</h3>
                      <div className="form-row">
                        <Campo label="Nome completo" valor={form.paciente_nome} erro={errosCampo.paciente_nome} onChange={(v) => definir("paciente_nome", v)} />
                        <Campo label="CPF" valor={form.paciente_cpf} onChange={(v) => definir("paciente_cpf", v)} />
                        <Campo label="Estado civil" valor={form.paciente_estado_civil} onChange={(v) => definir("paciente_estado_civil", v)} />
                        <Campo label="Profissão" valor={form.paciente_profissao} onChange={(v) => definir("paciente_profissao", v)} />
                        <Campo label="Rua" valor={form.paciente_rua} onChange={(v) => definir("paciente_rua", v)} largo />
                        <Campo label="Bairro" valor={form.paciente_bairro} onChange={(v) => definir("paciente_bairro", v)} />
                        <Campo label="Cidade" valor={form.paciente_cidade} onChange={(v) => definir("paciente_cidade", v)} />
                        <Campo label="UF" valor={form.paciente_uf} onChange={(v) => definir("paciente_uf", v.toUpperCase())} />
                      </div>
                      <h3 className="section-title">Valores e vigência</h3>
                      <div className="form-row">
                        <Campo label="Primeira consulta (R$)" valor={form.valor_primeira_consulta} erro={errosCampo.valor_primeira_consulta} onChange={(v) => definir("valor_primeira_consulta", v)} />
                        <Campo label="Pacote de 5 curativos (R$)" valor={form.valor_pacote} erro={errosCampo.valor_pacote} onChange={(v) => definir("valor_pacote", v)} />
                        <Campo label="Início" tipo="date" valor={form.data_inicio} erro={errosCampo.data_inicio} onChange={(v) => definir("data_inicio", v)} />
                        <Campo label="Término" tipo="date" valor={form.data_fim} erro={errosCampo.data_fim} onChange={(v) => definir("data_fim", v)} />
                        <Campo label="Local da assinatura" valor={form.local_assinatura} erro={errosCampo.local_assinatura} onChange={(v) => definir("local_assinatura", v)} />
                        <Campo label="Data da assinatura" tipo="date" valor={form.data_assinatura} erro={errosCampo.data_assinatura} onChange={(v) => definir("data_assinatura", v)} />
                      </div>
                      <p className="small text-muted mb-0">
                        {temAssinaturaEnfermeira
                          ? "A assinatura cadastrada no seu usuário entra na via da enfermeira."
                          : "Você ainda não tem assinatura em Usuários > Cadastro. A via da enfermeira fica em branco até o cadastro."}
                      </p>
                    </>
                  ) : null}
                  {!carregando && etapa === "consulta" ? (
                    <>
                      {quantidade > 1 ? (
                        <p className="text-muted small">
                          Exibindo o contrato mais recente. Este paciente tem {quantidade} contratos em Pacientes &gt; Contratos.
                        </p>
                      ) : null}
                      <ContratoDocumento dados={form} />
                    </>
                  ) : null}
                  <div className="d-none" ref={printRef}>
                    <ContratoDocumento dados={form} />
                  </div>
                </div>
                <div className="ficha-acoes">
                  <button type="button" className="btn btn-light" onClick={onClose}>
                    Fechar
                  </button>
                  {etapa === "consulta" ? (
                    <button type="button" className="btn btn-custom" onClick={imprimir} disabled={carregando}>
                      Imprimir PDF
                    </button>
                  ) : (
                    <button type="submit" className="btn btn-custom" disabled={salvando || carregando}>
                      {salvando ? "Salvando..." : "Salvar contrato"}
                    </button>
                  )}
                </div>
              </form>
              {perguntarAssinatura && !assinandoPaciente ? (
                <div className="modal" style={{ background: "rgba(53, 16, 67, 0.35)", zIndex: 2 }}>
                  <div className="pergunta">
                    <h2 className="h5" style={{ color: "#4f1964" }}>Assinatura do paciente</h2>
                    <p>O paciente vai assinar o contrato virtualmente?</p>
                    <div className="d-flex flex-column flex-sm-row justify-content-end" style={{ gap: 8 }}>
                      <button type="button" className="btn btn-light" onClick={() => setPerguntarAssinatura(false)} disabled={salvando}>
                        Voltar
                      </button>
                      <button type="button" className="btn btn-outline-secondary" onClick={() => void persistir("")} disabled={salvando}>
                        {salvando ? "Salvando..." : "Salvar sem assinatura"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-custom"
                        disabled={salvando}
                        onClick={() => {
                          setErroAssinatura(null);
                          setLimparAssinatura((n) => n + 1);
                          setAssinandoPaciente(true);
                        }}
                      >
                        Sim, assinar
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
              {assinandoPaciente ? (
                <div className="modal assinatura-paciente" style={{ background: "#f8f9fa", zIndex: 3 }}>
                  <div className="assinatura-painel">
                    <h2 className="h5 mb-1" style={{ color: "#4f1964" }}>Assinatura do paciente</h2>
                    <p className="small text-muted">
                      Assine no campo abaixo com o dedo ou o mouse, como no termo de consentimento.
                    </p>
                    {erroAssinatura ? <div className="alert alert-danger py-2">{erroAssinatura}</div> : null}
                    <CampoAssinatura ref={assinaturaRef} resetKey={limparAssinatura} />
                    <div className="assinatura-acoes d-flex flex-wrap justify-content-end mt-3" style={{ gap: 8 }}>
                      <button
                        type="button"
                        className="btn btn-light"
                        disabled={salvando}
                        onClick={() => setAssinandoPaciente(false)}
                      >
                        Voltar
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        disabled={salvando}
                        onClick={() => {
                          setErroAssinatura(null);
                          setLimparAssinatura((n) => n + 1);
                        }}
                      >
                        Limpar assinatura
                      </button>
                      <button type="button" className="btn btn-custom" disabled={salvando} onClick={confirmarAssinaturaPaciente}>
                        {salvando ? "Salvando..." : "Confirmar e salvar"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
              {perguntarImpressao ? (
                <div className="modal" style={{ background: "rgba(53, 16, 67, 0.35)", zIndex: 2 }}>
                  <div className="pergunta">
                    <h2 className="h5" style={{ color: "#4f1964" }}>Contrato salvo</h2>
                    <p>Deseja imprimir o contrato agora?</p>
                    <div className="d-flex flex-column flex-sm-row justify-content-end" style={{ gap: 8 }}>
                      <button type="button" className="btn btn-light" onClick={() => setPerguntarImpressao(false)}>
                        Agora não
                      </button>
                      <button
                        type="button"
                        className="btn btn-custom"
                        onClick={() => {
                          setPerguntarImpressao(false);
                          imprimir();
                        }}
                      >
                        Imprimir PDF
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Campo({
  label,
  valor,
  onChange,
  tipo = "text",
  largo = false,
  erro,
}: {
  label: string;
  valor: string;
  onChange: (valor: string) => void;
  tipo?: string;
  largo?: boolean;
  erro?: string;
}) {
  const uid = useId();
  const id = `contrato-${uid}`;
  return (
    <div className={largo ? "form-group col-12" : "form-group col-md-6"}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className={`form-control${erro ? " is-invalid" : ""}`}
        type={tipo}
        value={valor}
        aria-invalid={erro ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {erro ? <div className="invalid-feedback">{erro}</div> : null}
    </div>
  );
}
