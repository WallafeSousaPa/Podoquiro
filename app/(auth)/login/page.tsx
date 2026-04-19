import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="login-page">
      <div className="container">
        <div className="row login-card mx-auto">
          <div className="col-md-5 brand-side">
            <div className="logo-placeholder">
              <img
                src="/IconePodoquiro.png"
                alt=""
                width={72}
                height={72}
                decoding="async"
              />
            </div>
            <h1 className="fw-bold">Podoquiro</h1>
            <p className="lead">Cuidando de cada passo seu com excelência.</p>
            <div className="mt-4 d-none d-md-block">
              <small>
                Bem-vindo de volta! Acesse sua conta para gerenciar seus
                agendamentos.
              </small>
            </div>
          </div>

          <div className="col-md-7 form-side">
            <div className="mb-4 text-center">
              <h2 className="fw-bold text-purple">Login</h2>
              <p className="text-muted mb-0">Entre com suas credenciais</p>
            </div>
            <LoginForm />
          </div>
        </div>
      </div>
    </div>
  );
}
