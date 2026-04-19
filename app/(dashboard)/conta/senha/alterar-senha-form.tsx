"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";

export function AlterarSenhaForm() {
  const router = useRouter();
  const senhaAtualId = useId();
  const senhaNovaId = useId();
  const senhaConfirmaId = useId();

  const [senhaAtual, setSenhaAtual] = useState("");
  const [senhaNova, setSenhaNova] = useState("");
  const [senhaConfirma, setSenhaConfirma] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (senhaNova !== senhaConfirma) {
      setError("A confirmação da nova senha não confere.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/alterar-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senha_atual: senhaAtual,
          senha_nova: senhaNova,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Não foi possível alterar a senha.");
        return;
      }
      router.replace("/inicio");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card card-outline card-primary">
      <div className="card-body">
        <form onSubmit={(e) => void onSubmit(e)}>
          {error ? (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          ) : null}

          <div className="form-group">
            <label htmlFor={senhaAtualId}>Senha atual</label>
            <input
              id={senhaAtualId}
              type="password"
              className="form-control"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              autoComplete="current-password"
              required
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label htmlFor={senhaNovaId}>Nova senha</label>
            <input
              id={senhaNovaId}
              type="password"
              className="form-control"
              value={senhaNova}
              onChange={(e) => setSenhaNova(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
              disabled={loading}
            />
            <small className="form-text text-muted">Mínimo de 6 caracteres.</small>
          </div>
          <div className="form-group">
            <label htmlFor={senhaConfirmaId}>Confirmar nova senha</label>
            <input
              id={senhaConfirmaId}
              type="password"
              className="form-control"
              value={senhaConfirma}
              onChange={(e) => setSenhaConfirma(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
              disabled={loading}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "Salvando…" : "Salvar nova senha"}
          </button>
        </form>
      </div>
    </div>
  );
}
