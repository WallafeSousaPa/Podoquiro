import type { SupabaseClient } from "@supabase/supabase-js";
import { agendamentoPagamentoQuitado } from "@/lib/financeiro/agendamento-pagamento-quitado";
import {
  distribuirPagamentosNfceAtendimento,
  type PagamentoAtendimentoNfce,
} from "@/lib/financeiro/nfce-pagamentos";
import type { PagamentoDetNfce } from "@/lib/sefaz/nfe/montar-nfce-produto";

export type ProdutoAgendamentoNfce = {
  id_produto: string;
  nome_produto: string | null;
  qtd: number;
  valor_produto: number;
  valor_final: number;
};

export type NfceAtendimentoContexto = {
  id_agendamento: number;
  id_paciente: number;
  paciente_nome: string;
  data_hora_inicio: string;
  valor_total: number;
  produtos: ProdutoAgendamentoNfce[];
  paciente: {
    cpf: string | null;
    nome: string;
    cep: string | null;
    logradouro: string | null;
    numero: string | null;
    complemento: string | null;
    bairro: string | null;
    cidade: string | null;
    uf: string | null;
  } | null;
  nfce_autorizada: {
    id: string;
    numero_nf: number | null;
    chave_acesso: string | null;
    protocolo_autorizacao: string | null;
  } | null;
  /** Pagamentos quitados do atendimento (forma, valor, maquineta). */
  pagamentos: PagamentoAtendimentoNfce[];
  /** Linhas `detPag` calculadas para o total dos produtos na NFC-e. */
  pagamentos_nfce: PagamentoDetNfce[];
};

function nomePaciente(
  p: { nome_completo?: string | null; nome_social?: string | null } | null | undefined,
): string {
  const nc = p?.nome_completo != null ? String(p.nome_completo).trim() : "";
  const ns = p?.nome_social != null ? String(p.nome_social).trim() : "";
  return nc || ns || "—";
}

/** Mapeia forma de pagamento do caixa ao código `tPag` da NFC-e. */
export function tPagDeFormaPagamento(nome: string | null | undefined): string {
  const n = (nome ?? "").toLowerCase();
  if (n.includes("pix")) return "17";
  if (n.includes("crédito") || n.includes("credito")) return "03";
  if (n.includes("débito") || n.includes("debito")) return "04";
  if (n.includes("dinheiro")) return "01";
  if (n.includes("cheque")) return "02";
  return "99";
}

export async function carregarContextoNfceAtendimento(
  supabase: SupabaseClient,
  empresaId: number,
  idAgendamento: number,
): Promise<NfceAtendimentoContexto> {
  const { data: ag, error: agErr } = await supabase
    .from("agendamentos")
    .select(
      `
        id,
        id_paciente,
        data_hora_inicio,
        valor_total,
        status,
        pacientes (
          cpf,
          nome_completo,
          nome_social,
          cep,
          logradouro,
          numero,
          complemento,
          bairro,
          cidade,
          uf
        ),
        pagamentos (
          valor_pago,
          status_pagamento,
          formas_pagamento ( nome ),
          maquinetas ( nome )
        )
      `,
    )
    .eq("id", idAgendamento)
    .eq("id_empresa", empresaId)
    .maybeSingle();

  if (agErr) throw new Error(agErr.message);
  if (!ag) throw new Error("Agendamento não encontrado.");
  if (String(ag.status) !== "realizado") {
    throw new Error("Só é possível emitir NFC-e para atendimentos realizados.");
  }

  const pagsRaw = ag.pagamentos as
    | {
        valor_pago: number;
        status_pagamento: string;
        formas_pagamento: { nome: string | null } | { nome: string | null }[] | null;
        maquinetas: { nome: string | null } | { nome: string | null }[] | null;
      }[]
    | null;
  const pagamentos = (pagsRaw ?? []).map((pg) => {
    const fp = pg.formas_pagamento;
    const fp0 = Array.isArray(fp) ? fp[0] : fp;
    const mq = pg.maquinetas;
    const mq0 = Array.isArray(mq) ? mq[0] : mq;
    const forma = fp0?.nome ?? null;
    return {
      valor_pago: Number(pg.valor_pago),
      status_pagamento: String(pg.status_pagamento),
      forma,
      maquineta: mq0?.nome ?? null,
      t_pag: tPagDeFormaPagamento(forma),
    };
  });
  if (!agendamentoPagamentoQuitado(pagamentos)) {
    throw new Error("O atendimento precisa estar com pagamento quitado no caixa.");
  }

  const { data: aprods, error: apErr } = await supabase
    .from("agendamento_produtos")
    .select(
      "id_produto, qtd, valor_produto, valor_final, produtos ( produto )",
    )
    .eq("id_agendamento", idAgendamento);

  if (apErr) throw new Error(apErr.message);
  const produtos: ProdutoAgendamentoNfce[] = (aprods ?? []).map((r) => {
    const pr = r.produtos as { produto?: string } | { produto?: string }[] | null;
    const p0 = Array.isArray(pr) ? pr[0] : pr;
    return {
      id_produto: String(r.id_produto),
      nome_produto: p0?.produto?.trim() ?? null,
      qtd: Number(r.qtd),
      valor_produto: Number(r.valor_produto),
      valor_final: Number(r.valor_final),
    };
  });
  if (produtos.length === 0) {
    throw new Error("Este atendimento não possui produtos para emitir NFC-e.");
  }

  const pacRaw = ag.pacientes as
    | {
        cpf: string | null;
        nome_completo: string | null;
        nome_social: string | null;
        cep: string | null;
        logradouro: string | null;
        numero: string | null;
        complemento: string | null;
        bairro: string | null;
        cidade: string | null;
        uf: string | null;
      }
    | {
        cpf: string | null;
        nome_completo: string | null;
        nome_social: string | null;
        cep: string | null;
        logradouro: string | null;
        numero: string | null;
        complemento: string | null;
        bairro: string | null;
        cidade: string | null;
        uf: string | null;
      }[]
    | null;
  const pac = Array.isArray(pacRaw) ? pacRaw[0] : pacRaw;

  const totalProdutos = roundMoney(produtos.reduce((s, p) => s + p.valor_final, 0));
  const pagamentos_nfce = distribuirPagamentosNfceAtendimento(pagamentos, totalProdutos);

  const { data: nfceExistente } = await supabase
    .from("nfe_emissoes")
    .select("id, numero_nf, chave_acesso, protocolo_autorizacao")
    .eq("id_empresa", empresaId)
    .eq("modelo", 65)
    .eq("status", "autorizada")
    .contains("payload_rascunho", { id_agendamento: idAgendamento })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    id_agendamento: idAgendamento,
    id_paciente: ag.id_paciente as number,
    paciente_nome: nomePaciente(pac),
    data_hora_inicio: String(ag.data_hora_inicio),
    valor_total: Number(ag.valor_total),
    produtos,
    paciente: pac
      ? {
          cpf: pac.cpf ? String(pac.cpf).trim() : null,
          nome: nomePaciente(pac),
          cep: pac.cep ? String(pac.cep).trim() : null,
          logradouro: pac.logradouro ? String(pac.logradouro).trim() : null,
          numero: pac.numero ? String(pac.numero).trim() : null,
          complemento: pac.complemento ? String(pac.complemento).trim() : null,
          bairro: pac.bairro ? String(pac.bairro).trim() : null,
          cidade: pac.cidade ? String(pac.cidade).trim() : null,
          uf: pac.uf ? String(pac.uf).trim().toUpperCase().slice(0, 2) : null,
        }
      : null,
    nfce_autorizada: nfceExistente
      ? {
          id: nfceExistente.id as string,
          numero_nf:
            typeof nfceExistente.numero_nf === "number" ? nfceExistente.numero_nf : null,
          chave_acesso: nfceExistente.chave_acesso
            ? String(nfceExistente.chave_acesso)
            : null,
          protocolo_autorizacao: nfceExistente.protocolo_autorizacao
            ? String(nfceExistente.protocolo_autorizacao)
            : null,
        }
      : null,
    pagamentos,
    pagamentos_nfce,
  };
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}
