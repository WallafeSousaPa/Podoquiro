import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="login-container">
      <section className="brand-panel" aria-label="Podoquiro">
        <div className="logo-wrapper">
          <img
            src="/IconePodoquiro.png"
            alt="Podoquiro"
            decoding="async"
          />
        </div>
        <h1 className="brand-title">Podoquiro</h1>
        <p className="brand-tagline">Clínica de Podologia</p>
        <p className="brand-welcome">
          Bem-vindo de volta! Acesse sua conta para gerenciar seus agendamentos.
        </p>
      </section>

      <section className="form-panel" aria-label="Formulário de login">
        <div className="form-header">
          <h2>Login</h2>
          <p>Entre com suas credenciais para acessar o sistema.</p>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
