"use client";

import type { PapelParceiro } from "@/lib/estoque/parceiro-campos";
import { useRef, useState } from "react";
import "./modal-comprador-estoque.css";

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

export type FormCompradorEstoque = {
  nome: string;
  razao_social: string;
  fantasia: string;
  doc: string;
  ie: string;
  email: string;
  fone: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  ativo: boolean;
  observacao: string;
};

type Props = {
  papel: PapelParceiro;
  formId: string;
  editandoId: string | null;
  form: FormCompradorEstoque;
  salvando: boolean;
  error: string | null;
  onCampo: <K extends keyof FormCompradorEstoque>(k: K, v: FormCompradorEstoque[K]) => void;
  onClose: () => void;
  onSave: () => void;
};

function soDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

function formatarCep(digits: string): string {
  const d = soDigitos(digits).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function formatarTelefone(digits: string): string {
  const d = soDigitos(digits).slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function ModalCompradorEstoque({
  papel,
  formId,
  editandoId,
  form,
  salvando,
  error,
  onCampo,
  onClose,
  onSave,
}: Props) {
  const rotulo = papel === "fornecedor" ? "fornecedor" : "comprador";
  const tituloModal = editandoId ? `Editar ${rotulo}` : `Novo ${rotulo}`;
  const icone = papel === "fornecedor" ? "fas fa-truck" : "fas fa-user-plus";
  const numeroRef = useRef<HTMLInputElement>(null);
  const cepConsultado = useRef<string>("");
  const cnpjConsultado = useRef<string>("");
  const [cepBuscando, setCepBuscando] = useState(false);
  const [cepMensagem, setCepMensagem] = useState<string | null>(null);
  const [cepErro, setCepErro] = useState(false);
  const [cnpjBuscando, setCnpjBuscando] = useState(false);
  const [cnpjMensagem, setCnpjMensagem] = useState<string | null>(null);
  const [cnpjErro, setCnpjErro] = useState(false);

  const docDigits = soDigitos(form.doc);
  const ehPj = docDigits.length > 11;
  const ehPf = docDigits.length > 0 && docDigits.length <= 11;

  async function buscarCep(cep: string) {
    if (cep.length !== 8 || cep === cepConsultado.current) return;
    cepConsultado.current = cep;
    setCepBuscando(true);
    setCepMensagem(null);
    setCepErro(false);
    try {
      const res = await fetch(`/api/cep/${cep}`, { credentials: "include" });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        logradouro?: string;
        bairro?: string;
        cidade?: string;
        uf?: string;
      };
      if (cepConsultado.current !== cep) return;
      if (!res.ok) {
        cepConsultado.current = "";
        setCepErro(true);
        setCepMensagem(json.error ?? "CEP não encontrado.");
        return;
      }
      onCampo("endereco", json.logradouro ?? "");
      onCampo("bairro", json.bairro ?? "");
      onCampo("municipio", json.cidade ?? "");
      onCampo("uf", (json.uf ?? "").toUpperCase().slice(0, 2));
      setCepErro(false);
      setCepMensagem("Endereço preenchido a partir do CEP.");
      numeroRef.current?.focus();
    } catch {
      cepConsultado.current = "";
      setCepErro(true);
      setCepMensagem("Não foi possível buscar o CEP. Verifique a conexão.");
    } finally {
      setCepBuscando(false);
    }
  }

  async function buscarCnpj(cnpj: string) {
    if (cnpj.length !== 14 || cnpj === cnpjConsultado.current) return;
    cnpjConsultado.current = cnpj;
    setCnpjBuscando(true);
    setCnpjMensagem(null);
    setCnpjErro(false);
    try {
      const res = await fetch(`/api/cnpj/${cnpj}`, { credentials: "include" });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        razao_social?: string;
        nome_fantasia?: string;
        nome?: string;
        email?: string;
        telefone?: string;
        cep?: string;
        endereco?: string;
        numero?: string;
        complemento?: string;
        bairro?: string;
        municipio?: string;
        uf?: string;
      };
      if (cnpjConsultado.current !== cnpj) return;
      if (!res.ok) {
        cnpjConsultado.current = "";
        setCnpjErro(true);
        setCnpjMensagem(json.error ?? "CNPJ não encontrado.");
        return;
      }
      onCampo("nome", json.nome || json.razao_social || json.nome_fantasia || "");
      onCampo("razao_social", json.razao_social ?? "");
      onCampo("fantasia", json.nome_fantasia ?? "");
      if (json.email) onCampo("email", json.email);
      if (json.telefone) onCampo("fone", json.telefone);
      const cep = soDigitos(json.cep ?? "").slice(0, 8);
      if (cep.length === 8) {
        cepConsultado.current = cep;
        onCampo("cep", cep);
      }
      onCampo("endereco", json.endereco ?? "");
      onCampo("numero", json.numero ?? "");
      onCampo("complemento", json.complemento ?? "");
      onCampo("bairro", json.bairro ?? "");
      onCampo("municipio", json.municipio ?? "");
      onCampo("uf", json.uf ?? "");
      setCnpjErro(false);
      setCnpjMensagem("Dados preenchidos a partir do CNPJ.");
      setCepMensagem(null);
      setCepErro(false);
    } catch {
      if (cnpjConsultado.current !== cnpj) return;
      cnpjConsultado.current = "";
      setCnpjErro(true);
      setCnpjMensagem("Não foi possível consultar o CNPJ. Verifique a conexão.");
    } finally {
      setCnpjBuscando(false);
    }
  }

  return (
    <>
      <div
        className="modal fade show modal-comprador-estoque"
        style={{ display: "block" }}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${formId}-titulo`}
      >
        <div className="modal-dialog modal-xl modal-dialog-scrollable" role="document">
          <div className="modal-content">
            <div className="modal-header">
              <div className="modal-title-wrap">
                <i className={`${icone} modal-title-icon`} aria-hidden />
                <h5 className="modal-title" id={`${formId}-titulo`}>
                  {tituloModal}
                </h5>
              </div>
              <button
                type="button"
                className="close"
                aria-label="Fechar"
                onClick={onClose}
                disabled={salvando}
              >
                <span aria-hidden>×</span>
              </button>
            </div>

            <form
              id={formId}
              autoComplete="off"
              onSubmit={(e) => {
                e.preventDefault();
                onSave();
              }}
            >
              <div className="modal-body">
                {error ? (
                  <div className="alert alert-danger py-2 small" role="alert">
                    {error}
                  </div>
                ) : null}

                <div className="row">
                  <div className="col-12 col-md-4 form-group">
                    <label className="comprador-label" htmlFor={`${formId}-doc`}>
                      <span>CPF / CNPJ *</span>
                      {ehPf ? (
                        <span className="doc-type-badge badge-cpf">Pessoa física</span>
                      ) : null}
                      {ehPj ? (
                        <span className="doc-type-badge badge-cnpj">Pessoa jurídica</span>
                      ) : null}
                    </label>
                    <div className="input-group">
                      <input
                        id={`${formId}-doc`}
                        className="form-control"
                        inputMode="numeric"
                        placeholder="Cole ou digite com ou sem pontuação"
                        value={docDigits}
                        required
                        onPaste={(e) => {
                          const colado = e.clipboardData.getData("text");
                          const proximo = soDigitos(colado).slice(0, 14);
                          if (!proximo) return;
                          e.preventDefault();
                          cnpjConsultado.current = "";
                          setCnpjMensagem(null);
                          setCnpjErro(false);
                          onCampo("doc", proximo);
                          if (proximo.length === 14) void buscarCnpj(proximo);
                        }}
                        onChange={(e) => {
                          const proximo = soDigitos(e.target.value).slice(0, 14);
                          if (soDigitos(form.doc) !== proximo) {
                            cnpjConsultado.current = "";
                            setCnpjMensagem(null);
                            setCnpjErro(false);
                          }
                          onCampo("doc", proximo);
                          if (proximo.length === 14) void buscarCnpj(proximo);
                        }}
                      />
                      <div className="input-group-append">
                        <span className="input-group-text">
                          {cnpjBuscando ? (
                            <span
                              className="spinner-border spinner-border-sm"
                              role="status"
                              aria-label="Consultando CNPJ"
                            />
                          ) : (
                            <i className="fas fa-id-card" aria-hidden />
                          )}
                        </span>
                      </div>
                    </div>
                    {cnpjMensagem ? (
                      <small className={`cep-msg ${cnpjErro ? "erro" : "ok"}`}>
                        {cnpjMensagem}
                      </small>
                    ) : (
                      <small className="hint-muted">
                        Limpeza automática de pontuação. CNPJ preenche os dados da empresa.
                      </small>
                    )}
                  </div>

                  {!ehPj ? (
                    <div className="col-12 col-md-8 form-group">
                      <label className="comprador-label" htmlFor={`${formId}-nome`}>
                        Nome completo *
                      </label>
                      <input
                        id={`${formId}-nome`}
                        className="form-control"
                        placeholder="Digite o nome completo"
                        value={form.nome}
                        required
                        onChange={(e) => onCampo("nome", e.target.value)}
                      />
                    </div>
                  ) : null}

                  {ehPj ? (
                    <>
                      <div className="col-12 col-md-8 form-group">
                        <label className="comprador-label" htmlFor={`${formId}-razao`}>
                          Razão social *
                        </label>
                        <input
                          id={`${formId}-razao`}
                          className="form-control"
                          placeholder="Razão social da empresa"
                          value={form.razao_social}
                          required
                          onChange={(e) => onCampo("razao_social", e.target.value)}
                        />
                      </div>
                      <div className="col-12 col-md-4 form-group">
                        <label className="comprador-label" htmlFor={`${formId}-fantasia`}>
                          Nome fantasia
                        </label>
                        <input
                          id={`${formId}-fantasia`}
                          className="form-control"
                          placeholder="Nome fantasia"
                          value={form.fantasia}
                          onChange={(e) => onCampo("fantasia", e.target.value)}
                        />
                      </div>
                      <div className="col-12 col-md-4 form-group">
                        <label className="comprador-label" htmlFor={`${formId}-ie`}>
                          Inscrição estadual
                        </label>
                        <input
                          id={`${formId}-ie`}
                          className="form-control"
                          placeholder="Isento ou N° IE"
                          value={form.ie}
                          onChange={(e) => onCampo("ie", e.target.value)}
                        />
                      </div>
                    </>
                  ) : null}

                  <div className="col-12 col-md-6 form-group">
                    <label className="comprador-label" htmlFor={`${formId}-email`}>
                      E-mail
                    </label>
                    <input
                      id={`${formId}-email`}
                      type="email"
                      className="form-control"
                      placeholder="cliente@email.com"
                      value={form.email}
                      onChange={(e) => onCampo("email", e.target.value)}
                    />
                  </div>
                  <div className="col-12 col-md-6 form-group">
                    <label className="comprador-label" htmlFor={`${formId}-fone`}>
                      Telefone / WhatsApp
                    </label>
                    <input
                      id={`${formId}-fone`}
                      type="tel"
                      className="form-control"
                      placeholder="(00) 00000-0000"
                      value={formatarTelefone(form.fone)}
                      onChange={(e) => onCampo("fone", soDigitos(e.target.value).slice(0, 11))}
                    />
                  </div>

                  <div className="col-12">
                    <hr className="divisor-endereco" />
                  </div>

                  <div className="col-12 col-md-3 form-group">
                    <label className="comprador-label" htmlFor={`${formId}-cep`}>
                      CEP *
                    </label>
                    <div className="input-group">
                      <input
                        id={`${formId}-cep`}
                        className="form-control"
                        inputMode="numeric"
                        placeholder="00000-000"
                        maxLength={9}
                        value={formatarCep(form.cep)}
                        required
                        onChange={(e) => {
                          const proximo = soDigitos(e.target.value).slice(0, 8);
                          if (soDigitos(form.cep) !== proximo) {
                            cepConsultado.current = "";
                            setCepMensagem(null);
                            setCepErro(false);
                          }
                          onCampo("cep", proximo);
                          if (proximo.length === 8) void buscarCep(proximo);
                        }}
                      />
                      <div className="input-group-append">
                        <span className="input-group-text">
                          {cepBuscando ? (
                            <span
                              className="spinner-border spinner-border-sm"
                              role="status"
                              aria-label="Buscando CEP"
                            />
                          ) : (
                            <i className="fas fa-search" aria-hidden />
                          )}
                        </span>
                      </div>
                    </div>
                    {cepMensagem ? (
                      <small className={`cep-msg ${cepErro ? "erro" : "ok"}`}>
                        {cepMensagem}
                      </small>
                    ) : null}
                  </div>

                  <div className="col-12 col-md-7 form-group">
                    <label className="comprador-label" htmlFor={`${formId}-end`}>
                      Endereço
                    </label>
                    <input
                      id={`${formId}-end`}
                      className="form-control"
                      placeholder="Rua, Avenida, Alameda..."
                      value={form.endereco}
                      onChange={(e) => onCampo("endereco", e.target.value)}
                    />
                  </div>
                  <div className="col-12 col-md-2 form-group">
                    <label className="comprador-label" htmlFor={`${formId}-nro`}>
                      Nº
                    </label>
                    <input
                      id={`${formId}-nro`}
                      ref={numeroRef}
                      className="form-control"
                      placeholder="123"
                      value={form.numero}
                      onChange={(e) => onCampo("numero", e.target.value)}
                    />
                  </div>
                  <div className="col-12 col-md-4 form-group">
                    <label className="comprador-label" htmlFor={`${formId}-cpl`}>
                      Complemento
                    </label>
                    <input
                      id={`${formId}-cpl`}
                      className="form-control"
                      placeholder="Apt, Bloco, Sala"
                      value={form.complemento}
                      onChange={(e) => onCampo("complemento", e.target.value)}
                    />
                  </div>
                  <div className="col-12 col-md-4 form-group">
                    <label className="comprador-label" htmlFor={`${formId}-bairro`}>
                      Bairro
                    </label>
                    <input
                      id={`${formId}-bairro`}
                      className="form-control"
                      value={form.bairro}
                      onChange={(e) => onCampo("bairro", e.target.value)}
                    />
                  </div>
                  <div className="col-12 col-md-3 form-group">
                    <label className="comprador-label" htmlFor={`${formId}-mun`}>
                      Município
                    </label>
                    <input
                      id={`${formId}-mun`}
                      className="form-control"
                      value={form.municipio}
                      onChange={(e) => onCampo("municipio", e.target.value)}
                    />
                  </div>
                  <div className="col-12 col-md-1 form-group">
                    <label className="comprador-label" htmlFor={`${formId}-uf`}>
                      UF
                    </label>
                    <select
                      id={`${formId}-uf`}
                      className="form-control"
                      value={form.uf}
                      onChange={(e) => onCampo("uf", e.target.value)}
                    >
                      <option value="">-</option>
                      {UFS.map((uf) => (
                        <option key={uf} value={uf}>
                          {uf}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-12 form-group">
                    <label className="comprador-label" htmlFor={`${formId}-obs`}>
                      Observação
                    </label>
                    <textarea
                      id={`${formId}-obs`}
                      className="form-control"
                      rows={2}
                      placeholder={`Notas internas sobre o ${rotulo}...`}
                      value={form.observacao}
                      onChange={(e) => onCampo("observacao", e.target.value)}
                    />
                  </div>

                  <div className="col-12 form-group mb-0 pt-1">
                    <div className="custom-control custom-switch">
                      <input
                        type="checkbox"
                        className="custom-control-input"
                        id={`${formId}-ativo`}
                        checked={form.ativo}
                        onChange={(e) => onCampo("ativo", e.target.checked)}
                      />
                      <label className="custom-control-label" htmlFor={`${formId}-ativo`}>
                        Cadastro ativo
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-cancelar"
                  onClick={onClose}
                  disabled={salvando}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-salvar" disabled={salvando}>
                  <i className="fas fa-check-circle mr-1" aria-hidden />
                  {salvando ? "Salvando…" : `Salvar ${rotulo}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" role="presentation" />
    </>
  );
}
