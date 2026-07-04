"use client";

import { useEffect, useState } from "react";

type DadosPagamento = {
  token: string;
  valor: number;
  status: string;
  link_pagamento_asaas: string | null;
  expira_em: string | null;
  pago_em: string | null;
  nome_empresa: string | null;
  nome_paciente: string;
  data_hora_agendamento: string | null;
};

function fmtMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDataHoraCurto(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const data = d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const hora = d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${data} às ${hora}`;
}

function IconShieldCheck({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function IconUser({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconCalendar({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
    </svg>
  );
}

function IconInfo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function IconArrowRight({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

function IconCheckCircle({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function CardHeader() {
  return (
    <div className="bg-brand-primary p-6 text-center text-white relative">
      <div className="absolute top-4 right-4 flex items-center space-x-1 bg-white/10 px-2 py-1 rounded-full text-xs">
        <IconShieldCheck className="w-4 h-4 text-brand-secondary" />
        <span>Ambiente Seguro</span>
      </div>
      <h1 className="text-2xl font-black tracking-wider uppercase mb-1">PODOQUIRO</h1>
      <p className="text-purple-200 text-sm font-medium">Taxa de agendamento</p>
    </div>
  );
}

function CardFooterAutoUpdate() {
  return (
    <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex items-center justify-center space-x-2 text-xs text-gray-500">
      <div className="flex space-x-1">
        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
      </div>
      <span>Esta página atualiza o status automaticamente após o pagamento.</span>
    </div>
  );
}

function LoadingCard() {
  return (
    <div
      className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-purple-100 overflow-hidden animate-pulse"
      aria-busy="true"
      aria-label="Carregando pagamento"
    >
      <div className="bg-brand-primary p-6 h-28" />
      <div className="p-6 space-y-6">
        <div className="bg-purple-50 rounded-xl h-24" />
        <div className="space-y-4">
          <div className="h-14 bg-gray-100 rounded-xl" />
          <div className="h-14 bg-gray-100 rounded-xl" />
        </div>
        <div className="h-20 bg-orange-50 rounded-xl" />
        <div className="h-14 bg-brand-secondary/30 rounded-xl" />
      </div>
    </div>
  );
}

export function PagamentoTaxaClient({ token }: { token: string }) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [dados, setDados] = useState<DadosPagamento | null>(null);

  useEffect(() => {
    let cancel = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function carregar() {
      try {
        const res = await fetch(`/api/pagamento/taxa-agendamento/${token}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Pagamento não encontrado.");
        if (!cancel) setDados(json.data as DadosPagamento);
        return json.data as DadosPagamento;
      } catch (e) {
        if (!cancel) setErro(e instanceof Error ? e.message : "Erro ao carregar.");
        return null;
      } finally {
        if (!cancel) setCarregando(false);
      }
    }

    void carregar().then((d) => {
      if (cancel || !d || d.status !== "pendente") return;
      interval = setInterval(() => {
        void carregar();
      }, 60_000);
    });

    return () => {
      cancel = true;
      if (interval) clearInterval(interval);
    };
  }, [token]);

  if (carregando) {
    return <LoadingCard />;
  }

  if (erro || !dados) {
    return (
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-purple-100 overflow-hidden">
        <CardHeader />
        <div className="p-6">
          <div className="bg-orange-50/60 border border-brand-secondary/30 rounded-xl p-4 flex items-start space-x-3">
            <IconInfo className="w-5 h-5 text-brand-secondary shrink-0 mt-0.5" />
            <div className="text-xs text-gray-600 space-y-1">
              <p className="font-semibold text-gray-700">Link indisponível</p>
              <p>
                {erro ??
                  "Este link é inválido ou expirou. Entre em contato com a clínica para solicitar um novo."}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const pago = dados.status === "pago";
  const bloqueado = dados.status === "expirado" || dados.status === "cancelado";

  if (pago) {
    return (
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-purple-100 overflow-hidden">
        <CardHeader />
        <div className="p-6 space-y-4 text-center">
          <IconCheckCircle className="w-12 h-12 text-emerald-500 mx-auto" />
          <h2 className="text-lg font-bold text-brand-primary">Pagamento confirmado</h2>
          <p className="text-sm text-gray-600">
            Obrigado! Seu horário está confirmado
            {dados.pago_em ? ` em ${fmtDataHoraCurto(dados.pago_em)}` : ""}.
          </p>
        </div>
        <CardFooterAutoUpdate />
      </div>
    );
  }

  if (bloqueado) {
    return (
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-purple-100 overflow-hidden">
        <CardHeader />
        <div className="p-6">
          <div className="bg-orange-50/60 border border-brand-secondary/30 rounded-xl p-4 flex items-start space-x-3">
            <IconInfo className="w-5 h-5 text-brand-secondary shrink-0 mt-0.5" />
            <div className="text-xs text-gray-600 space-y-1">
              <p className="font-semibold text-gray-700">
                {dados.status === "expirado" ? "Link expirado" : "Link cancelado"}
              </p>
              <p>Solicite um novo link de pagamento à clínica para confirmar seu agendamento.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-purple-100 overflow-hidden">
      <CardHeader />

      <div className="p-6 space-y-6">
        <div className="bg-purple-50 rounded-xl p-4 text-center border border-purple-100">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Total a pagar
          </span>
          <div className="text-3xl font-extrabold text-brand-primary mt-1">
            {fmtMoeda(dados.valor)}
          </div>
        </div>

        <div className="space-y-4 border-b border-gray-100 pb-4">
          <div className="flex items-start space-x-3">
            <div className="p-2 bg-purple-100 rounded-lg text-brand-primary shrink-0">
              <IconUser className="w-5 h-5" />
            </div>
            <div>
              <span className="block text-xs font-medium text-gray-400">Paciente</span>
              <span className="text-sm font-semibold text-gray-700">{dados.nome_paciente}</span>
            </div>
          </div>

          {dados.data_hora_agendamento ? (
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-purple-100 rounded-lg text-brand-primary shrink-0">
                <IconCalendar className="w-5 h-5" />
              </div>
              <div>
                <span className="block text-xs font-medium text-gray-400">
                  Horário do Atendimento
                </span>
                <span className="text-sm font-semibold text-gray-700">
                  {fmtDataHoraCurto(dados.data_hora_agendamento)}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="bg-orange-50/60 border border-brand-secondary/30 rounded-xl p-4 flex items-start space-x-3">
          <IconInfo className="w-5 h-5 text-brand-secondary shrink-0 mt-0.5" />
          <div className="text-xs text-gray-600 space-y-1">
            <p>
              Você será direcionado ao checkout seguro do <strong>Asaas</strong> (Pix, cartão ou
              boleto).
            </p>
            {dados.expira_em ? (
              <p className="text-brand-secondary font-medium">
                Válido até: {fmtDataHoraCurto(dados.expira_em)}
              </p>
            ) : null}
          </div>
        </div>

        {dados.link_pagamento_asaas ? (
          <a
            href={dados.link_pagamento_asaas}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full bg-brand-secondary hover:bg-opacity-90 text-white font-bold py-4 px-6 rounded-xl shadow-lg shadow-orange-500/20 transition-all transform active:scale-95 flex items-center justify-center space-x-2 text-lg no-underline"
          >
            <span>Pagar agora</span>
            <IconArrowRight className="w-5 h-5" />
          </a>
        ) : (
          <div className="bg-orange-50/60 border border-brand-secondary/30 rounded-xl p-4 flex items-start space-x-3">
            <IconInfo className="w-5 h-5 text-brand-secondary shrink-0 mt-0.5" />
            <p className="text-xs text-gray-600 mb-0">
              Link de pagamento indisponível no momento. Tente novamente em instantes ou fale com
              a clínica.
            </p>
          </div>
        )}
      </div>

      <CardFooterAutoUpdate />
    </div>
  );
}
