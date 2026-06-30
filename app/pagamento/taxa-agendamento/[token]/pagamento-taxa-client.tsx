"use client";

import { useEffect, useState } from "react";

type DadosPagamento = {
  token: string;
  valor: number;
  status: string;
  link_pagamento_rede: string | null;
  expira_em: string | null;
  pago_em: string | null;
  nome_empresa: string | null;
  nome_paciente: string;
  data_hora_agendamento: string | null;
};

function fmtMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDataHora(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
    return <p className="text-muted">Carregando pagamento…</p>;
  }
  if (erro || !dados) {
    return (
      <div className="alert alert-danger" role="alert">
        {erro ?? "Link inválido ou expirado."}
      </div>
    );
  }

  return (
    <div className="card shadow-sm">
      <div className="card-body text-center">
        <h1 className="h4 mb-1">Taxa de agendamento</h1>
        {dados.nome_empresa ? (
          <p className="text-muted mb-2">{dados.nome_empresa}</p>
        ) : null}
        <p className="mb-1">
          Paciente: <strong>{dados.nome_paciente}</strong>
        </p>
        {dados.data_hora_agendamento ? (
          <p className="text-muted small">
            Horário: {fmtDataHora(dados.data_hora_agendamento)}
          </p>
        ) : null}
        <p className="display-6 text-primary my-3">{fmtMoeda(dados.valor)}</p>

        {dados.status === "pago" ? (
          <div className="alert alert-success">Pagamento confirmado. Obrigado!</div>
        ) : dados.status === "expirado" ? (
          <div className="alert alert-warning">
            Este link expirou. Solicite um novo link à clínica.
          </div>
        ) : dados.status === "cancelado" ? (
          <div className="alert alert-warning">
            Este link foi cancelado. Solicite um novo link à clínica.
          </div>
        ) : (
          <>
            <p className="small text-muted mb-3">
              Você será direcionado ao checkout seguro da Rede (Pix ou cartão).
              {dados.expira_em ? (
                <> Válido até {fmtDataHora(dados.expira_em)}.</>
              ) : null}
            </p>
            {dados.link_pagamento_rede ? (
              <a
                href={dados.link_pagamento_rede}
                className="btn btn-primary btn-lg"
                target="_blank"
                rel="noopener noreferrer"
              >
                Pagar agora
              </a>
            ) : (
              <p className="text-muted">Link de pagamento indisponível no momento.</p>
            )}
            <p className="text-muted small mt-3 mb-0">
              Esta página atualiza o status automaticamente após o pagamento.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
