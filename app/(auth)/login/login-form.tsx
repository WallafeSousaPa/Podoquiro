"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Não foi possível entrar.");
        return;
      }
      router.push("/inicio");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      {error ? (
        <div className="alert alert-danger py-2 small" role="alert">
          {error}
        </div>
      ) : null}

      <div className="mb-3">
        <label className="form-label fw-semibold">E-mail ou usuário</label>
        <div className="input-group">
          <span className="input-group-text bg-light border-end-0">
            <i className="bi bi-person text-purple" aria-hidden />
          </span>
          <input
            type="text"
            className="form-control bg-light border-start-0"
            placeholder="nome de usuário ou e-mail"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoComplete="username"
            required
            disabled={loading}
          />
        </div>
      </div>

      <div className="mb-4">
        <div className="d-flex justify-content-between">
          <label className="form-label fw-semibold">Senha</label>
          <span className="text-orange small">Esqueceu a senha?</span>
        </div>
        <div className="input-group">
          <span className="input-group-text bg-light border-end-0">
            <i className="bi bi-lock text-purple" aria-hidden />
          </span>
          <input
            type="password"
            className="form-control bg-light border-start-0"
            placeholder="Digite sua senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            disabled={loading}
          />
        </div>
      </div>

      <div className="mb-3 form-check">
        <input
          type="checkbox"
          className="form-check-input"
          id="remember"
          disabled={loading}
        />
        <label className="form-check-label small text-muted" htmlFor="remember">
          Lembrar de mim
        </label>
      </div>

      <button
        type="submit"
        className="btn btn-login w-100 mb-3 shadow-sm"
        disabled={loading}
      >
        {loading ? "ENTRANDO…" : "ENTRAR NO SISTEMA"}
      </button>

      <div className="text-center mt-4">
        <p className="small text-muted mb-0">
          Ainda não tem acesso?{" "}
          <span className="text-purple fw-bold">Contate o administrador</span>
        </p>
      </div>
    </form>
  );
}
