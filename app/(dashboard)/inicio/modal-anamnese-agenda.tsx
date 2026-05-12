"use client";

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import { DropdownCheckboxMultiselect } from "@/components/dropdown-checkbox-multiselect";
import "./agenda.css";

function ModalBackdrop({
  children,
  onBackdropClick,
  zIndex = 1050,
}: {
  children: ReactNode;
  onBackdropClick: () => void;
  zIndex?: number;
}) {
  return (
    <>
      <div
        className="modal fade show"
        style={{ display: "block", zIndex }}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
      <div
        className="modal-backdrop fade show"
        style={{ zIndex: zIndex - 5 }}
        role="presentation"
        onClick={onBackdropClick}
      />
    </>
  );
}

const FORMAS_CONTATO_PACIENTE = [
  "Instagram",
  "Google",
  "Tik Tok",
  "Facebook",
  "Indicação",
] as const;

type AvaliacaoOptionItem = {
  id: number;
  tipo?: string | null;
  condicao?: string | null;
  ativo: boolean;
};

/**
 * Dados mínimos do agendamento para abrir a anamnese (evolução / pacientes-evolucao).
 * Condição de saúde, tipo de unha e hidrose: multiseleção (vários `id_*` no FormData).
 */
export type AnamneseAgendamentoContext = {
  /** ID do agendamento (para reabrir o mesmo fluxo com formulário limpo). */
  id: number;
  id_paciente: number;
  paciente_nome: string;
};

type Props = {
  ag: AnamneseAgendamentoContext;
  onClose: () => void;
  /** Após salvar (ex.: refresh). Não deve alterar status do agendamento. */
  onSalvo?: () => void;
};

export function ModalAnamneseAgenda({ ag, onClose, onSalvo }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [idsCondicao, setIdsCondicao] = useState<number[]>([]);
  const [pressaoArterial, setPressaoArterial] = useState("");
  const [glicemia, setGlicemia] = useState("");
  const [atividadeFisica, setAtividadeFisica] = useState("");
  const [tipoCalcado, setTipoCalcado] = useState("");
  const [alergias, setAlergias] = useState("");
  const [idsTipoUnha, setIdsTipoUnha] = useState<number[]>([]);
  const [idPeEsquerdo, setIdPeEsquerdo] = useState("");
  const [idPeDireito, setIdPeDireito] = useState("");
  const [idsHidrose, setIdsHidrose] = useState<number[]>([]);
  const [idLesoes, setIdLesoes] = useState("");
  const [digitoPressao, setDigitoPressao] = useState("");
  const [varizes, setVarizes] = useState("");
  const [claudicacao, setClaudicacao] = useState("");
  const [temperatura, setTemperatura] = useState("");
  const [oleo, setOleo] = useState("");
  const [agua, setAgua] = useState("");
  const [observacao, setObservacao] = useState("");
  const [idFormatoDedos, setIdFormatoDedos] = useState("");
  const [idFormatoPe, setIdFormatoPe] = useState("");
  const [formaContato, setFormaContato] = useState("");
  const [tratamento, setTratamento] = useState("");
  const [fotoPlantarDireito, setFotoPlantarDireito] = useState<File | null>(null);
  const [fotoPlantarEsquerdo, setFotoPlantarEsquerdo] = useState<File | null>(null);
  const [fotoDorsoDireito, setFotoDorsoDireito] = useState<File | null>(null);
  const [fotoDorsoEsquerdo, setFotoDorsoEsquerdo] = useState<File | null>(null);
  const [fotoTermo, setFotoTermo] = useState<File | null>(null);

  const [condicoes, setCondicoes] = useState<AvaliacaoOptionItem[]>([]);
  const [tiposUnhas, setTiposUnhas] = useState<AvaliacaoOptionItem[]>([]);
  const [tiposPe, setTiposPe] = useState<AvaliacaoOptionItem[]>([]);
  const [hidroses, setHidroses] = useState<AvaliacaoOptionItem[]>([]);
  const [lesoes, setLesoes] = useState<AvaliacaoOptionItem[]>([]);
  const [formatosDedos, setFormatosDedos] = useState<AvaliacaoOptionItem[]>([]);
  const [formatosPe, setFormatosPe] = useState<AvaliacaoOptionItem[]>([]);

  const carregarCatalogos = useCallback(async () => {
    const endpoints = [
      "/api/condicoes-saude",
      "/api/tipos-unhas",
      "/api/tipo-pe",
      "/api/hidroses",
      "/api/lesoes-mecanicas",
      "/api/formato-dedos",
      "/api/formato-pe",
    ] as const;
    const responses = await Promise.all(endpoints.map((u) => fetch(u)));
    const jsons = await Promise.all(
      responses.map((r) => r.json() as Promise<{ error?: string; data?: AvaliacaoOptionItem[] }>),
    );
    for (let i = 0; i < responses.length; i++) {
      if (!responses[i].ok) throw new Error(jsons[i].error ?? "Erro ao carregar cadastros auxiliares.");
    }
    setCondicoes(jsons[0].data ?? []);
    setTiposUnhas(jsons[1].data ?? []);
    setTiposPe(jsons[2].data ?? []);
    setHidroses(jsons[3].data ?? []);
    setLesoes(jsons[4].data ?? []);
    setFormatosDedos(jsons[5].data ?? []);
    setFormatosPe(jsons[6].data ?? []);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await carregarCatalogos();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao carregar dados da anamnese.");
      }
    })();
  }, [ag.id, carregarCatalogos]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("id_paciente", String(ag.id_paciente));
      for (const id of idsCondicao) fd.append("id_condicao", String(id));
      fd.append("pressao_arterial", pressaoArterial);
      fd.append("glicemia", glicemia);
      fd.append("atividade_fisica", atividadeFisica);
      fd.append("tipo_calcado", tipoCalcado);
      fd.append("alergias", alergias);
      for (const id of idsTipoUnha) fd.append("id_tipo_unha", String(id));
      fd.append("id_pe_esquerdo", idPeEsquerdo);
      fd.append("id_pe_direito", idPeDireito);
      for (const id of idsHidrose) fd.append("id_hidrose", String(id));
      fd.append("id_lesoes_mecanicas", idLesoes);
      fd.append("digito_pressao", digitoPressao);
      fd.append("varizes", varizes);
      fd.append("claudicacao", claudicacao);
      fd.append("temperatura", temperatura);
      fd.append("oleo", oleo);
      fd.append("agua", agua);
      fd.append("observacao", observacao);
      fd.append("id_formato_dedos", idFormatoDedos);
      fd.append("id_formato_pe", idFormatoPe);
      fd.append("forma_contato", formaContato);
      fd.append("tratamento_sugerido", tratamento);
      if (fotoPlantarDireito) fd.append("foto_plantar_direito", fotoPlantarDireito);
      if (fotoPlantarEsquerdo) fd.append("foto_plantar_esquerdo", fotoPlantarEsquerdo);
      if (fotoDorsoDireito) fd.append("foto_dorso_direito", fotoDorsoDireito);
      if (fotoDorsoEsquerdo) fd.append("foto_dorso_esquerdo", fotoDorsoEsquerdo);
      if (fotoTermo) fd.append("foto_doc_termo_consentimento", fotoTermo);

      const res = await fetch("/api/pacientes-evolucao", { method: "POST", body: fd });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao salvar anamnese.");
      /* Só grava pacientes_evolucao; não altera status nem dados de agendamentos. */
      onClose();
      onSalvo?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar anamnese.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalBackdrop onBackdropClick={() => !saving && onClose()}>
      <div
        className="modal-dialog modal-xl modal-dialog-centered"
        role="document"
        style={{
          width: "calc(100% - 1rem)",
          maxWidth: "min(1140px, calc(100vw - 1rem))",
          margin: "0.5rem auto",
        }}
      >
        <div className="modal-content">
          <form onSubmit={(e) => void salvar(e)}>
            <div className="modal-header">
              <h5 className="modal-title">Anamnese</h5>
              <button
                type="button"
                className="close"
                disabled={saving}
                onClick={() => onClose()}
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </div>
            <div className="modal-body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
              {error ? <div className="alert alert-danger py-2 small">{error}</div> : null}
              <div className="form-row">
                <div className="form-group col-md-12">
                  <label>Paciente</label>
                  <input className="form-control" value={ag.paciente_nome} readOnly />
                </div>
              </div>
              <div className="border rounded p-3 mb-3">
                <h6 className="text-primary mb-3">Informações de saúde do paciente</h6>
                <div className="form-row">
                  <div className="form-group col-md-4">
                    <DropdownCheckboxMultiselect
                      label="Condição de saúde"
                      options={condicoes
                        .filter((x) => x.ativo)
                        .map((x) => ({ id: x.id, label: x.condicao?.trim() || `ID ${x.id}` }))}
                      value={idsCondicao}
                      onChange={setIdsCondicao}
                      disabled={saving}
                    />
                  </div>
                  <div className="form-group col-md-4">
                    <label>Pressão arterial</label>
                    <input
                      className="form-control"
                      value={pressaoArterial}
                      onChange={(e) => setPressaoArterial(e.target.value)}
                    />
                  </div>
                  <div className="form-group col-md-4">
                    <label>Glicemia</label>
                    <input
                      className="form-control"
                      value={glicemia}
                      onChange={(e) => setGlicemia(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group col-md-6">
                    <label>Atividade física</label>
                    <input
                      className="form-control"
                      value={atividadeFisica}
                      onChange={(e) => setAtividadeFisica(e.target.value)}
                    />
                  </div>
                  <div className="form-group col-md-6">
                    <label>Tipo de calçado</label>
                    <input
                      className="form-control"
                      value={tipoCalcado}
                      onChange={(e) => setTipoCalcado(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group col-md-4">
                    <label>Varizes</label>
                    <input
                      className="form-control"
                      value={varizes}
                      onChange={(e) => setVarizes(e.target.value)}
                    />
                  </div>
                  <div className="form-group col-md-4">
                    <label>Claudicação</label>
                    <input
                      className="form-control"
                      value={claudicacao}
                      onChange={(e) => setClaudicacao(e.target.value)}
                    />
                  </div>
                  <div className="form-group col-md-4">
                    <label>Alergias</label>
                    <input
                      className="form-control"
                      value={alergias}
                      onChange={(e) => setAlergias(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="border rounded p-3 mb-3">
                <h6 className="text-primary mb-3">Tipos de unhas</h6>
                <div className="form-row">
                  <div className="form-group col-md-4">
                    <DropdownCheckboxMultiselect
                      label="Tipo de unha"
                      options={tiposUnhas
                        .filter((x) => x.ativo)
                        .map((x) => ({ id: x.id, label: x.tipo?.trim() || `ID ${x.id}` }))}
                      value={idsTipoUnha}
                      onChange={setIdsTipoUnha}
                      disabled={saving}
                    />
                  </div>
                  <div className="form-group col-md-4">
                    <label>Pé esquerdo</label>
                    <select
                      className="form-control"
                      value={idPeEsquerdo}
                      onChange={(e) => setIdPeEsquerdo(e.target.value)}
                    >
                      <option value="">—</option>
                      {tiposPe
                        .filter((x) => x.ativo)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.tipo}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="form-group col-md-4">
                    <label>Pé direito</label>
                    <select
                      className="form-control"
                      value={idPeDireito}
                      onChange={(e) => setIdPeDireito(e.target.value)}
                    >
                      <option value="">—</option>
                      {tiposPe
                        .filter((x) => x.ativo)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.tipo}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              </div>
              <div className="border rounded p-3 mb-3">
                <h6 className="text-primary mb-3">Analise Clinica</h6>
                <div className="form-row">
                  <div className="form-group col-md-6">
                    <DropdownCheckboxMultiselect
                      label="Hidrose"
                      options={hidroses
                        .filter((x) => x.ativo)
                        .map((x) => ({ id: x.id, label: x.tipo?.trim() || `ID ${x.id}` }))}
                      value={idsHidrose}
                      onChange={setIdsHidrose}
                      disabled={saving}
                    />
                  </div>
                  <div className="form-group col-md-6">
                    <label>Lesões mecânicas</label>
                    <select
                      className="form-control"
                      value={idLesoes}
                      onChange={(e) => setIdLesoes(e.target.value)}
                    >
                      <option value="">—</option>
                      {lesoes
                        .filter((x) => x.ativo)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.tipo}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group col-md-4">
                    <label>Dígito pressão</label>
                    <input
                      className="form-control"
                      value={digitoPressao}
                      onChange={(e) => setDigitoPressao(e.target.value)}
                    />
                  </div>
                  <div className="form-group col-md-4">
                    <label>Temperatura</label>
                    <input
                      className="form-control"
                      value={temperatura}
                      onChange={(e) => setTemperatura(e.target.value)}
                    />
                  </div>
                  <div className="form-group col-md-4">
                    <label>Óleo</label>
                    <input
                      className="form-control"
                      value={oleo}
                      onChange={(e) => setOleo(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group col-md-4">
                    <label>Água</label>
                    <input
                      className="form-control"
                      value={agua}
                      onChange={(e) => setAgua(e.target.value)}
                    />
                  </div>
                  <div className="form-group col-md-4">
                    <label>Formato dos dedos</label>
                    <select
                      className="form-control"
                      value={idFormatoDedos}
                      onChange={(e) => setIdFormatoDedos(e.target.value)}
                    >
                      <option value="">—</option>
                      {formatosDedos
                        .filter((x) => x.ativo)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.tipo}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="form-group col-md-4">
                    <label>Formato do pé</label>
                    <select
                      className="form-control"
                      value={idFormatoPe}
                      onChange={(e) => setIdFormatoPe(e.target.value)}
                    >
                      <option value="">—</option>
                      {formatosPe
                        .filter((x) => x.ativo)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.tipo}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group col-md-6">
                    <label>Forma de contato</label>
                    <select
                      className="form-control"
                      value={formaContato}
                      onChange={(e) => setFormaContato(e.target.value)}
                    >
                      <option value="">—</option>
                      {FORMAS_CONTATO_PACIENTE.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group col-md-6">
                    <label>Tratamento sugerido</label>
                    <input
                      className="form-control"
                      value={tratamento}
                      onChange={(e) => setTratamento(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-group mb-0">
                  <label>Observação</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                  />
                </div>
              </div>
              <div className="border rounded p-3">
                <h6 className="text-primary mb-3">Analise visual</h6>
                <div className="form-row">
                  <div className="form-group col-md-6">
                    <label>Plantar direito</label>
                    <input
                      type="file"
                      className="form-control-file"
                      accept="image/*"
                      onChange={(e) => setFotoPlantarDireito(e.target.files?.[0] ?? null)}
                    />
                  </div>
                  <div className="form-group col-md-6">
                    <label>Plantar esquerdo</label>
                    <input
                      type="file"
                      className="form-control-file"
                      accept="image/*"
                      onChange={(e) => setFotoPlantarEsquerdo(e.target.files?.[0] ?? null)}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group col-md-6">
                    <label>Dorso direito</label>
                    <input
                      type="file"
                      className="form-control-file"
                      accept="image/*"
                      onChange={(e) => setFotoDorsoDireito(e.target.files?.[0] ?? null)}
                    />
                  </div>
                  <div className="form-group col-md-6">
                    <label>Dorso esquerdo</label>
                    <input
                      type="file"
                      className="form-control-file"
                      accept="image/*"
                      onChange={(e) => setFotoDorsoEsquerdo(e.target.files?.[0] ?? null)}
                    />
                  </div>
                </div>
                <div className="form-group mb-0">
                  <label>Doc. termo consentimento</label>
                  <input
                    type="file"
                    className="form-control-file"
                    accept="image/*"
                    onChange={(e) => setFotoTermo(e.target.files?.[0] ?? null)}
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onClose()}
                disabled={saving}
              >
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Salvando..." : "Salvar anamnese"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalBackdrop>
  );
}
