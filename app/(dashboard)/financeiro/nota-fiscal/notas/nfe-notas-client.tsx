"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type NfeEmissaoRow = {
  id: string;
  ambiente: number;
  serie: number;
  numero_nf: number | null;
  status: string;
  chave_acesso: string | null;
  protocolo_autorizacao: string | null;
  c_stat: string | null;
  x_motivo: string | null;
  created_at: string;
  updated_at: string;
};

function labelAmbiente(a: number) {
  if (a === 1) return "Produção";
  if (a === 2) return "Homologação";
  return String(a);
}

function badgeStatus(status: string) {
  switch (status) {
    case "autorizada":
      return "badge-success";
    case "rejeitada":
    case "denegada":
      return "badge-danger";
    case "transmitida":
    case "assinada":
      return "badge-info";
    case "rascunho":
      return "badge-secondary";
    case "cancelada":
      return "badge-dark";
    default:
      return "badge-light";
  }
}

type Props = {
  rows: NfeEmissaoRow[];
  loadError?: string | null;
};

export function NfeNotasClient({ rows, loadError }: Props) {
  const router = useRouter();
  const [testando, setTestando] = useState(false);
  const [enviandoTeste, setEnviandoTeste] = useState(false);
  const [testeMsg, setTesteMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  async function executarTesteSefaz() {
    setTestando(true);
    setTesteMsg(null);
    try {
      const res = await fetch("/api/nfe/teste", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        mensagem?: string;
        cStat?: string | null;
        xMotivo?: string | null;
      };
      if (!res.ok) {
        setTesteMsg({
          ok: false,
          texto: json.error ?? "Falha no teste.",
        });
        return;
      }
      const detalhe = [json.cStat, json.xMotivo ?? json.mensagem].filter(Boolean).join(" — ");
      setTesteMsg({
        ok: Boolean(json.ok),
        texto: detalhe || json.mensagem || "Teste concluído.",
      });
      router.refresh();
    } catch {
      setTesteMsg({ ok: false, texto: "Erro de rede ao testar." });
    } finally {
      setTestando(false);
    }
  }

  async function emitirNfeTesteHomologacao() {
    setEnviandoTeste(true);
    setTesteMsg(null);
    try {
      const res = await fetch("/api/nfe/enviar-teste", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        cStatProt?: string | null;
        cStatLote?: string | null;
        xMotivo?: string | null;
        chave?: string;
        nNF?: number;
      };
      if (!res.ok) {
        setTesteMsg({
          ok: false,
          texto: json.error ?? "Falha no envio.",
        });
        return;
      }
      const stat = json.cStatProt ?? json.cStatLote;
      const detalhe = [stat, json.xMotivo, json.chave ? `Chave ${json.chave}` : ""]
        .filter(Boolean)
        .join(" — ");
      setTesteMsg({
        ok: Boolean(json.ok),
        texto: detalhe || "Envio concluído.",
      });
      router.refresh();
    } catch {
      setTesteMsg({ ok: false, texto: "Erro de rede ao enviar NF-e de teste." });
    } finally {
      setEnviandoTeste(false);
    }
  }

  if (loadError) {
    return (
      <div className="alert alert-danger" role="alert">
        {loadError}
      </div>
    );
  }

  return (
    <div className="card card-outline card-primary">
      <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
        <h3 className="card-title mb-2 mb-sm-0">NF-e — mercadoria (modelo 55)</h3>
        <div className="d-flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-outline-primary btn-sm"
            disabled={testando}
            onClick={() => void executarTesteSefaz()}
            title="Envia consulta de status do serviço (homologação ou produção conforme .env)"
          >
            {testando ? "Testando…" : "Testar NF-e (status SEFAZ)"}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={enviandoTeste}
            onClick={() => void emitirNfeTesteHomologacao()}
            title="Homologação (NFE_AMBIENTE=2): monta NF-e mínima, assina e envia lote síncrono ao SVRS"
          >
            {enviandoTeste ? "Enviando…" : "Emitir NF-e de teste (homolog.)"}
          </button>
        </div>
      </div>
      {testeMsg ? (
        <div className="card-body py-2 border-bottom">
          <div
            className={`alert mb-0 py-2 small ${testeMsg.ok ? "alert-success" : "alert-warning"}`}
            role="status"
          >
            {testeMsg.texto}
          </div>
        </div>
      ) : null}
      <div className="card-body table-responsive p-0">
        <table className="table table-hover table-striped mb-0">
          <thead>
            <tr>
              <th style={{ width: "110px" }}>Ambiente</th>
              <th style={{ width: "70px" }}>Série</th>
              <th style={{ width: "90px" }}>Número</th>
              <th style={{ width: "120px" }}>Status</th>
              <th>Chave</th>
              <th style={{ width: "140px" }}>Atualizado</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-muted py-4">
                  Nenhuma nota registrada. As emissões aparecerão aqui após a integração com a
                  SEFAZ.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td className="small">{labelAmbiente(row.ambiente)}</td>
                  <td>{row.serie}</td>
                  <td>{row.numero_nf ?? "—"}</td>
                  <td>
                    <span className={`badge ${badgeStatus(row.status)}`}>{row.status}</span>
                  </td>
                  <td className="small" style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>
                    {row.chave_acesso ? (
                      row.chave_acesso
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="small text-muted">
                    {new Date(row.updated_at).toLocaleString("pt-BR")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
