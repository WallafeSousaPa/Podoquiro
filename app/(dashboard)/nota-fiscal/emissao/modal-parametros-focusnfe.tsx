"use client";

import { baseUrlFocusNfe } from "@/lib/focusnfe";
import { type FormEvent, useCallback, useEffect, useState } from "react";

type ConfigFocus = {
  configurado: boolean;
  tem_token_empresa: boolean;
  tem_token_ambiente: boolean;
  pode_cifrar_token: boolean;
  ambiente: "homologacao" | "producao";
  base_url: string;
  ambiente_label: string;
  prestador_cnpj: string;
  prestador_inscricao_municipal: string;
  prestador_codigo_municipio: string;
  item_lista_servico: string;
  codigo_cnae: string;
  natureza_operacao: string;
  regime_especial_tributacao: string;
  optante_simples_nacional: boolean;
  iss_retido_padrao: boolean;
  updated_at: string | null;
};

type WebhookInfo = {
  url_webhook: string;
  tem_segredo: boolean;
  configurado: boolean;
  webhook_focus_id: string | null;
  webhook_registrado_em: string | null;
  erro_lista?: string | null;
};

type Props = {
  aberto: boolean;
  onFechar: () => void;
};

export function ModalParametrosFocusNfe({ aberto, onFechar }: Props) {
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [token, setToken] = useState("");
  const [ambiente, setAmbiente] = useState<"homologacao" | "producao">("homologacao");
  const [baseUrl, setBaseUrl] = useState("");
  const [prestadorCnpj, setPrestadorCnpj] = useState("");
  const [prestadorIm, setPrestadorIm] = useState("");
  const [prestadorCmun, setPrestadorCmun] = useState("1501402");
  const [itemLista, setItemLista] = useState("060101");
  const [cnae, setCnae] = useState("869090400");
  const [natureza, setNatureza] = useState("1");
  const [regime, setRegime] = useState("6");
  const [simples, setSimples] = useState(true);
  const [issRetido, setIssRetido] = useState(false);
  const [temTokenEmpresa, setTemTokenEmpresa] = useState(false);
  const [podeCifrar, setPodeCifrar] = useState(false);

  const [webhook, setWebhook] = useState<WebhookInfo | null>(null);
  const [webhookBusy, setWebhookBusy] = useState(false);
  const [webhookMsg, setWebhookMsg] = useState<string | null>(null);
  const [webhookErro, setWebhookErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch("/api/focusnfe/config", { credentials: "include" });
      const j = (await res.json()) as ConfigFocus & { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro ao carregar parâmetros.");
      setAmbiente(j.ambiente);
      setBaseUrl(j.base_url);
      setPrestadorCnpj(j.prestador_cnpj ?? "");
      setPrestadorIm(j.prestador_inscricao_municipal ?? "");
      setPrestadorCmun(j.prestador_codigo_municipio ?? "1501402");
      setItemLista(j.item_lista_servico);
      setCnae(j.codigo_cnae);
      setNatureza(j.natureza_operacao);
      setRegime(j.regime_especial_tributacao ?? "6");
      setSimples(j.optante_simples_nacional);
      setIssRetido(j.iss_retido_padrao);
      setTemTokenEmpresa(j.tem_token_empresa);
      setPodeCifrar(j.pode_cifrar_token);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, []);

  const carregarWebhook = useCallback(async () => {
    setWebhookErro(null);
    try {
      const res = await fetch("/api/focusnfe/webhook/registrar", {
        credentials: "include",
      });
      const j = (await res.json()) as WebhookInfo & { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro ao carregar webhook.");
      setWebhook(j);
    } catch (e) {
      setWebhook(null);
      setWebhookErro(e instanceof Error ? e.message : "Erro ao carregar webhook.");
    }
  }, []);

  const registrarWebhook = useCallback(async () => {
    setWebhookBusy(true);
    setWebhookMsg(null);
    setWebhookErro(null);
    try {
      const res = await fetch("/api/focusnfe/webhook/registrar", {
        method: "POST",
        credentials: "include",
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro ao registrar webhook.");
      setWebhookMsg("Webhook registrado na Focus NFe.");
      await carregarWebhook();
    } catch (e) {
      setWebhookErro(e instanceof Error ? e.message : "Erro ao registrar webhook.");
    } finally {
      setWebhookBusy(false);
    }
  }, [carregarWebhook]);

  const removerWebhook = useCallback(async () => {
    setWebhookBusy(true);
    setWebhookMsg(null);
    setWebhookErro(null);
    try {
      const res = await fetch("/api/focusnfe/webhook/registrar", {
        method: "DELETE",
        credentials: "include",
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro ao remover webhook.");
      setWebhookMsg("Webhook removido da Focus NFe.");
      await carregarWebhook();
    } catch (e) {
      setWebhookErro(e instanceof Error ? e.message : "Erro ao remover webhook.");
    } finally {
      setWebhookBusy(false);
    }
  }, [carregarWebhook]);

  useEffect(() => {
    if (aberto) {
      void carregar();
      void carregarWebhook();
    }
  }, [aberto, carregar, carregarWebhook]);

  useEffect(() => {
    setBaseUrl(baseUrlFocusNfe(ambiente));
  }, [ambiente]);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setOkMsg(null);
    const novaKey = token.trim();
    if (novaKey && !podeCifrar) {
      setErro("Defina NFE_CERT_MASTER_KEY no servidor para gravar o token cifrado.");
      return;
    }
    setSalvando(true);
    try {
      const body: Record<string, unknown> = {
        ambiente,
        prestador_cnpj: prestadorCnpj,
        prestador_inscricao_municipal: prestadorIm,
        prestador_codigo_municipio: prestadorCmun,
        item_lista_servico: itemLista,
        codigo_cnae: cnae,
        natureza_operacao: natureza,
        regime_especial_tributacao: regime || null,
        optante_simples_nacional: simples,
        iss_retido_padrao: issRetido,
      };
      if (novaKey) body.token = novaKey;

      const res = await fetch("/api/focusnfe/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Erro ao salvar.");
      setOkMsg("Parâmetros salvos.");
      setToken("");
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  };

  if (!aberto) return null;

  return (
    <div
      className="modal fade show d-block"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="focus-param-titulo"
    >
      <div className="modal-dialog modal-lg modal-usuario-form">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title" id="focus-param-titulo">
              Parâmetros — Focus NFe
            </h5>
            <button type="button" className="close" aria-label="Fechar" onClick={onFechar}>
              <span aria-hidden>&times;</span>
            </button>
          </div>
          <form onSubmit={(e) => void salvar(e)}>
            <div className="modal-body">
              {loading ? (
                <p className="text-muted">Carregando…</p>
              ) : (
                <>
                  {erro ? (
                    <div className="alert alert-danger" role="alert">
                      {erro}
                    </div>
                  ) : null}
                  {okMsg ? (
                    <div className="alert alert-success" role="alert">
                      {okMsg}
                    </div>
                  ) : null}

                  <div className="form-group">
                    <label htmlFor="focus-token">Token Focus NFe</label>
                    <input
                      id="focus-token"
                      type="password"
                      className="form-control"
                      autoComplete="off"
                      placeholder={
                        temTokenEmpresa
                          ? "Deixe em branco para manter o token atual"
                          : "Cole o token da Focus NFe"
                      }
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                    />
                    <small className="form-text text-muted">
                      Autenticação HTTP Basic (usuário = token, senha vazia). Também pode usar
                      FOCUSNFE_TOKEN no servidor.
                    </small>
                  </div>

                  <div className="row">
                    <div className="col-md-6 form-group">
                      <label htmlFor="focus-ambiente">Ambiente / URL</label>
                      <select
                        id="focus-ambiente"
                        className="form-control"
                        value={ambiente}
                        onChange={(e) =>
                          setAmbiente(e.target.value as "homologacao" | "producao")
                        }
                      >
                        <option value="homologacao">Homologação</option>
                        <option value="producao">Produção</option>
                      </select>
                      <small className="form-text text-muted">{baseUrl}</small>
                    </div>
                    <div className="col-md-6 form-group">
                      <label htmlFor="focus-cnpj">CNPJ prestador</label>
                      <input
                        id="focus-cnpj"
                        className="form-control"
                        value={prestadorCnpj}
                        onChange={(e) => setPrestadorCnpj(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="row">
                    <div className="col-md-6 form-group">
                      <label htmlFor="focus-im">Inscrição municipal</label>
                      <input
                        id="focus-im"
                        className="form-control"
                        value={prestadorIm}
                        onChange={(e) => setPrestadorIm(e.target.value)}
                      />
                    </div>
                    <div className="col-md-6 form-group">
                      <label htmlFor="focus-cmun">Código município (IBGE)</label>
                      <input
                        id="focus-cmun"
                        className="form-control"
                        value={prestadorCmun}
                        onChange={(e) => setPrestadorCmun(e.target.value)}
                      />
                    </div>
                  </div>

                  <hr />
                  <h6 className="text-muted text-uppercase small">Serviço padrão</h6>

                  <div className="row">
                    <div className="col-md-4 form-group">
                      <label htmlFor="focus-item">Item lista serviço</label>
                      <input
                        id="focus-item"
                        className="form-control"
                        value={itemLista}
                        onChange={(e) => setItemLista(e.target.value)}
                      />
                    </div>
                    <div className="col-md-4 form-group">
                      <label htmlFor="focus-cnae">CNAE</label>
                      <input
                        id="focus-cnae"
                        className="form-control"
                        value={cnae}
                        onChange={(e) => setCnae(e.target.value)}
                      />
                    </div>
                    <div className="col-md-4 form-group">
                      <label htmlFor="focus-natureza">Natureza operação</label>
                      <input
                        id="focus-natureza"
                        className="form-control"
                        value={natureza}
                        onChange={(e) => setNatureza(e.target.value)}
                      />
                    </div>
                  </div>

                  <p className="small text-muted">
                    A discriminação da NFS-e é montada automaticamente com os procedimentos
                    realizados em cada atendimento.
                  </p>

                  <div className="row">
                    <div className="col-md-4 form-group">
                      <label htmlFor="focus-regime">Regime especial tributação</label>
                      <input
                        id="focus-regime"
                        className="form-control"
                        value={regime}
                        onChange={(e) => setRegime(e.target.value)}
                      />
                    </div>
                    <div className="col-md-4 form-group d-flex align-items-end">
                      <div className="custom-control custom-checkbox mb-3">
                        <input
                          type="checkbox"
                          className="custom-control-input"
                          id="focus-simples"
                          checked={simples}
                          onChange={(e) => setSimples(e.target.checked)}
                        />
                        <label className="custom-control-label" htmlFor="focus-simples">
                          Optante Simples Nacional
                        </label>
                      </div>
                    </div>
                    <div className="col-md-4 form-group d-flex align-items-end">
                      <div className="custom-control custom-checkbox mb-3">
                        <input
                          type="checkbox"
                          className="custom-control-input"
                          id="focus-iss"
                          checked={issRetido}
                          onChange={(e) => setIssRetido(e.target.checked)}
                        />
                        <label className="custom-control-label" htmlFor="focus-iss">
                          ISS retido (padrão)
                        </label>
                      </div>
                    </div>
                  </div>

                  <hr />
                  <h6 className="text-muted text-uppercase small">
                    Webhook — atualização automática de status
                  </h6>
                  <p className="small text-muted">
                    Ao registrar o webhook, a Focus NFe avisa o sistema quando uma
                    NFS-e é autorizada, rejeitada ou cancelada, atualizando o status
                    automaticamente em <strong>Nota Fiscal › Consultar</strong>.
                  </p>

                  {webhookErro ? (
                    <div className="alert alert-warning py-2" role="alert">
                      {webhookErro}
                    </div>
                  ) : null}
                  {webhookMsg ? (
                    <div className="alert alert-success py-2" role="alert">
                      {webhookMsg}
                    </div>
                  ) : null}

                  <div className="form-group">
                    <label className="mb-1">URL do webhook</label>
                    <input
                      type="text"
                      className="form-control"
                      readOnly
                      value={webhook?.url_webhook ?? ""}
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <small className="form-text text-muted">
                      {webhook?.tem_segredo
                        ? "Protegido por segredo (FOCUSNFE_WEBHOOK_SECRET)."
                        : "Sem segredo configurado — defina FOCUSNFE_WEBHOOK_SECRET no servidor para proteger o endpoint."}
                    </small>
                  </div>

                  <div className="d-flex flex-wrap align-items-center">
                    <span className="mr-3 mb-2">
                      Situação:{" "}
                      {webhook?.webhook_focus_id ? (
                        <span className="badge badge-success">Registrado</span>
                      ) : (
                        <span className="badge badge-secondary">Não registrado</span>
                      )}
                    </span>
                    <button
                      type="button"
                      className="btn btn-outline-primary btn-sm mr-2 mb-2"
                      disabled={webhookBusy || !webhook?.configurado}
                      onClick={() => void registrarWebhook()}
                    >
                      {webhookBusy
                        ? "Processando…"
                        : webhook?.webhook_focus_id
                          ? "Re-registrar webhook"
                          : "Registrar webhook"}
                    </button>
                    {webhook?.webhook_focus_id ? (
                      <button
                        type="button"
                        className="btn btn-outline-danger btn-sm mb-2"
                        disabled={webhookBusy}
                        onClick={() => void removerWebhook()}
                      >
                        Remover
                      </button>
                    ) : null}
                  </div>
                  {!webhook?.configurado ? (
                    <small className="form-text text-muted">
                      Configure e salve o token e o CNPJ do prestador antes de
                      registrar o webhook.
                    </small>
                  ) : null}
                </>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onFechar}>
                Fechar
              </button>
              <button type="submit" className="btn btn-primary" disabled={salvando || loading}>
                {salvando ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
