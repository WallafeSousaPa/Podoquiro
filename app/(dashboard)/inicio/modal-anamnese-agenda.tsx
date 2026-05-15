"use client";

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import { DropdownCheckboxMultiselect } from "@/components/dropdown-checkbox-multiselect";
import { mensagemErroAnamneseComCodigo, MSG_ERRO_PAYLOAD_GRANDE_ANAMNESE } from "@/lib/aplicacao/mensagem-erro-anamnese";
import {
  comprimirImagemParaAnamnese,
  MAX_TOTAL_ANEXOS_ANAMNESE_BYTES,
  somaTamanhosArquivos,
} from "@/lib/client/comprimir-imagem-anamnese";
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

type ApiSalvarAnamneseJson = {
  error?: string;
  codigo_erro?: number;
  data?: unknown;
};

function mensagemDeErroApiSalvar(json: ApiSalvarAnamneseJson): string {
  if (
    json.codigo_erro != null &&
    Number.isFinite(Number(json.codigo_erro)) &&
    Number(json.codigo_erro) > 0
  ) {
    return mensagemErroAnamneseComCodigo(Number(json.codigo_erro));
  }
  return json.error?.trim() || "Erro ao salvar anamnese.";
}

async function registrarErroClienteNoServidor(payload: {
  origem: string;
  mensagem_curta: string;
  detalhe: string;
  id_paciente: number;
}): Promise<number | null> {
  const res = await fetch("/api/aplicacao/registrar-erro", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j = (await res.json().catch(() => ({}))) as { codigo_erro?: number };
  const id = j.codigo_erro;
  return id != null && Number.isFinite(id) && id > 0 ? id : null;
}

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
      const [
        fPlantarDir,
        fPlantarEsq,
        fDorsoDir,
        fDorsoEsq,
        fTermo,
      ] = await Promise.all([
        fotoPlantarDireito
          ? comprimirImagemParaAnamnese(fotoPlantarDireito)
          : Promise.resolve<File | null>(null),
        fotoPlantarEsquerdo
          ? comprimirImagemParaAnamnese(fotoPlantarEsquerdo)
          : Promise.resolve<File | null>(null),
        fotoDorsoDireito
          ? comprimirImagemParaAnamnese(fotoDorsoDireito)
          : Promise.resolve<File | null>(null),
        fotoDorsoEsquerdo
          ? comprimirImagemParaAnamnese(fotoDorsoEsquerdo)
          : Promise.resolve<File | null>(null),
        fotoTermo ? comprimirImagemParaAnamnese(fotoTermo) : Promise.resolve<File | null>(null),
      ]);

      const totalAnexos = somaTamanhosArquivos([
        fPlantarDir,
        fPlantarEsq,
        fDorsoDir,
        fDorsoEsq,
        fTermo,
      ]);
      if (totalAnexos > MAX_TOTAL_ANEXOS_ANAMNESE_BYTES) {
        setError(
          `${MSG_ERRO_PAYLOAD_GRANDE_ANAMNESE} Tamanho total dos anexos após compressão: ~${(totalAnexos / (1024 * 1024)).toFixed(1)} MB (máximo recomendado ~3,5 MB).`,
        );
        return;
      }

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
      if (fPlantarDir) fd.append("foto_plantar_direito", fPlantarDir);
      if (fPlantarEsq) fd.append("foto_plantar_esquerdo", fPlantarEsq);
      if (fDorsoDir) fd.append("foto_dorso_direito", fDorsoDir);
      if (fDorsoEsq) fd.append("foto_dorso_esquerdo", fDorsoEsq);
      if (fTermo) fd.append("foto_doc_termo_consentimento", fTermo);

      const res = await fetch("/api/pacientes-evolucao", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const rawText = await res.text();
      let json: ApiSalvarAnamneseJson;
      try {
        json = rawText ? (JSON.parse(rawText) as ApiSalvarAnamneseJson) : {};
      } catch (parseErr) {
        const payloadGrande =
          res.status === 413 ||
          /FUNCTION_PAYLOAD_TOO_LARGE/i.test(rawText) ||
          /Request Entity Too Large/i.test(rawText);
        if (payloadGrande) {
          setError(MSG_ERRO_PAYLOAD_GRANDE_ANAMNESE);
          return;
        }
        const codigo = await registrarErroClienteNoServidor({
          origem: "modal-anamnese-agenda:resposta_nao_json",
          mensagem_curta: "Resposta não JSON ao salvar anamnese",
          detalhe: JSON.stringify({
            status: res.status,
            corpo: rawText.slice(0, 8000),
            parse: parseErr instanceof Error ? parseErr.message : String(parseErr),
          }),
          id_paciente: ag.id_paciente,
        });
        setError(
          codigo != null
            ? mensagemErroAnamneseComCodigo(codigo)
            : "Erro ao salvar anamnese.",
        );
        return;
      }
      if (!res.ok) {
        setError(mensagemDeErroApiSalvar(json));
        return;
      }
      /* Só grava pacientes_evolucao; não altera status nem dados de agendamentos. */
      onClose();
      onSalvo?.();
    } catch (err) {
      const detalhe =
        err instanceof Error
          ? JSON.stringify({
              message: err.message,
              stack: err.stack,
              name: err.name,
            })
          : JSON.stringify({ erro: String(err) });
      const codigo = await registrarErroClienteNoServidor({
        origem: "modal-anamnese-agenda:excecao_fetch",
        mensagem_curta: "Exceção ao enviar anamnese (rede, timeout ou limite)",
        detalhe,
        id_paciente: ag.id_paciente,
      });
      setError(
        codigo != null
          ? mensagemErroAnamneseComCodigo(codigo)
          : err instanceof Error
            ? err.message
            : "Erro ao salvar anamnese.",
      );
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
