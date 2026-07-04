"use client";

import { FormEvent, useState } from "react";
import { entrarComCredenciais } from "./actions";

export function LoginForm() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await entrarComCredenciais(login, password);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      window.location.assign("/inicio");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Não foi possível entrar.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form onSubmit={onSubmit}>
        {error ? (
          <div className="login-error" role="alert">
            {error}
          </div>
        ) : null}

        <div className="input-group">
          <label htmlFor="login-usuario">Usuário</label>
          <div className="input-wrapper">
            <i className="fa-regular fa-user input-icon" aria-hidden />
            <input
              type="text"
              id="login-usuario"
              name="username"
              placeholder="nome de usuário"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              autoComplete="username"
              required
              disabled={loading}
            />
          </div>
        </div>

        <div className="input-group">
          <label htmlFor="login-senha">Senha</label>
          <div className="input-wrapper input-wrapper--password">
            <i className="fa-solid fa-lock input-icon" aria-hidden />
            <input
              type={mostrarSenha ? "text" : "password"}
              id="login-senha"
              name="password"
              placeholder="Digite sua senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              disabled={loading}
            />
            <button
              type="button"
              className="input-toggle-senha"
              onClick={() => setMostrarSenha((v) => !v)}
              disabled={loading}
              aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
              aria-pressed={mostrarSenha}
            >
              <i
                className={mostrarSenha ? "fa-solid fa-eye-slash" : "fa-solid fa-eye"}
                aria-hidden
              />
            </button>
          </div>
        </div>

        <div className="form-options">
          <label className="remember-me">
            <input type="checkbox" id="remember" name="remember" disabled={loading} />
            Lembrar de mim
          </label>
        </div>

        <button type="submit" className="btn-submit" disabled={loading}>
          {loading ? "ENTRANDO…" : "ENTRAR NO SISTEMA"}
        </button>
      </form>

      <div className="form-footer">
        <p>
          Ainda não tem acesso?{" "}
          <span className="form-footer-link">Contate o administrador</span>
        </p>
      </div>
    </>
  );
}
