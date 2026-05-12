"use client";

import { useCallback, useEffect, useState } from "react";
import "./caixa.css";
import type { CaixaAgendamentoRow } from "./caixa-client";
import { CaixaClient } from "./caixa-client";
import { ModalCaixaAgendamento } from "./modal-caixa-agendamento";
import { CaixaSessaoClient } from "./caixa-sessao-client";

/** Todos os lançamentos com status pago — modal só para consulta. */
function todosPagamentosQuitadosNaLista(r: CaixaAgendamentoRow): boolean {
  return (
    r.pagamentos.length > 0 &&
    r.pagamentos.every((p) => p.status_pagamento === "pago")
  );
}

function dataLocalYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function CaixaPaginaClient() {
  const [dataRef, setDataRef] = useState(dataLocalYmd);
  const [rows, setRows] = useState<CaixaAgendamentoRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalRow, setModalRow] = useState<CaixaAgendamentoRow | null>(null);

  const carregarLinhas = useCallback(async (data: string) => {
    setLoadingRows(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/financeiro/caixa/agendamentos-pagos?data=${encodeURIComponent(data)}`,
      );
      const j = (await res.json()) as {
        rows?: CaixaAgendamentoRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Erro ao carregar agendamentos.");
      const list = Array.isArray(j.rows) ? j.rows : [];
      list.sort((a, b) => {
        const ta = new Date(a.data_hora_inicio).getTime();
        const tb = new Date(b.data_hora_inicio).getTime();
        if (ta !== tb) return ta - tb;
        return a.id - b.id;
      });
      setRows(list);
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "Não foi possível carregar o caixa.",
      );
      setRows([]);
    } finally {
      setLoadingRows(false);
    }
  }, []);

  useEffect(() => {
    void carregarLinhas(dataRef);
  }, [dataRef, carregarLinhas]);

  const recarregarTabela = useCallback(() => {
    void carregarLinhas(dataRef);
  }, [dataRef, carregarLinhas]);

  return (
    <>
      <CaixaSessaoClient dataRef={dataRef} onDataRefChange={setDataRef} />
      <p className="text-muted small mb-3">
        Abaixo: todos os agendamentos do dia selecionado em <strong>Data</strong>{" "}
        (qualquer status do agendamento), com os pagamentos vinculados em todos os
        status. Abra e feche o caixa por dia na sessão acima; o relatório de
        fechamento consolida apenas valores quitados no sistema.
      </p>
      <div className="row">
        <div className="col-12">
          <CaixaClient
            rows={rows}
            loadError={loadError}
            loadingRows={loadingRows}
            dataRef={dataRef}
            onPacienteClick={(r) => setModalRow(r)}
            onAtualizar={() => void carregarLinhas(dataRef)}
          />
        </div>
      </div>

      {modalRow ? (
        <ModalCaixaAgendamento
          row={modalRow}
          somenteVisualizar={todosPagamentosQuitadosNaLista(modalRow)}
          onClose={() => setModalRow(null)}
          onSaved={recarregarTabela}
        />
      ) : null}
    </>
  );
}
