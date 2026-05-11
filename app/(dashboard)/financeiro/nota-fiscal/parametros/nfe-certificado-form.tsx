"use client";

import { useRouter } from "next/navigation";
import {
  type FormEvent,
  useCallback,
  useId,
  useState,
} from "react";

type Props = {
  certificadoNoBanco: boolean;
  atualizadoEm: string | null;
};

export function NfeCertificadoForm({
  certificadoNoBanco,
  atualizadoEm,
}: Props) {
  const router = useRouter();
  const senhaId = useId();
  const arquivoId = useId();
  const [senha, setSenha] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const aoSalvar = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setErro(null);
      setOkMsg(null);
      if (!arquivo || arquivo.size === 0) {
        setErro("Selecione o arquivo .pfx ou .p12.");
        return;
      }
      if (!senha.trim()) {
        setErro("Informe a senha do certificado.");
        return;
      }
      setSalvando(true);
      try {
        const fd = new FormData();
        fd.set("certificado", arquivo);
        fd.set("senha", senha);
        const res = await fetch("/api/nfe/certificado", {
          method: "POST",
          body: fd,
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Erro ao gravar certificado.");
        setSenha("");
        setArquivo(null);
        setOkMsg("Certificado gravado com segurança na base de dados.");
        router.refresh();
      } catch (err) {
        setErro(err instanceof Error ? err.message : "Erro ao gravar.");
      } finally {
        setSalvando(false);
      }
    },
    [arquivo, senha, router],
  );

  const aoRemover = useCallback(async () => {
    if (!certificadoNoBanco) return;
    if (!window.confirm("Remover o certificado armazenado para esta empresa?")) return;
    setErro(null);
    setOkMsg(null);
    setRemovendo(true);
    try {
      const res = await fetch("/api/nfe/certificado", { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao remover.");
      setOkMsg("Certificado removido.");
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao remover.");
    } finally {
      setRemovendo(false);
    }
  }, [certificadoNoBanco, router]);

  return (
    <div className="card card-outline card-success mt-3">
      <div className="card-header">
        <h3 className="card-title mb-0">Certificado digital (banco de dados)</h3>
      </div>
      <div className="card-body">
        <p className="text-muted small">
          O arquivo <strong>.pfx</strong> / <strong>.p12</strong> e a senha são guardados{" "}
          <strong>cifrados</strong> (AES-256-GCM) usando a chave{" "}
          <code className="small">NFE_CERT_MASTER_KEY</code> no servidor. Faça backup seguro do
          banco e dessa chave.
        </p>

        {certificadoNoBanco ? (
          <p className="mb-3">
            <span className="badge badge-success mr-2">Certificado cadastrado</span>
            {atualizadoEm ? (
              <span className="text-muted small">
                Última atualização:{" "}
                {new Date(atualizadoEm).toLocaleString("pt-BR")}
              </span>
            ) : null}
          </p>
        ) : (
          <p className="mb-3">
            <span className="badge badge-warning">Nenhum certificado no banco</span>
          </p>
        )}

        {erro ? (
          <div className="alert alert-danger py-2 small" role="alert">
            {erro}
          </div>
        ) : null}
        {okMsg ? (
          <div className="alert alert-success py-2 small" role="alert">
            {okMsg}
          </div>
        ) : null}

        <form onSubmit={(e) => void aoSalvar(e)}>
          <div className="form-group">
            <label htmlFor={arquivoId}>Arquivo (.pfx ou .p12)</label>
            <input
              id={arquivoId}
              type="file"
              className="form-control-file"
              accept=".pfx,.p12,application/x-pkcs12"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="form-group">
            <label htmlFor={senhaId}>Senha do certificado</label>
            <input
              id={senhaId}
              type="password"
              className="form-control"
              autoComplete="new-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Senha do arquivo .pfx"
            />
          </div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={salvando}>
            {salvando ? "Gravando..." : "Salvar certificado cifrado"}
          </button>
          {certificadoNoBanco ? (
            <button
              type="button"
              className="btn btn-outline-danger btn-sm ml-2"
              disabled={removendo}
              onClick={() => void aoRemover()}
            >
              {removendo ? "Removendo..." : "Remover"}
            </button>
          ) : null}
        </form>
      </div>
    </div>
  );
}
