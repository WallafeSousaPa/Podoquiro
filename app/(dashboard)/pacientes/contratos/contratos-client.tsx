"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ModalContratoEnfermagem } from "../../atendimentos/atendimento/modal-contrato-enfermagem";
import { formatarDataContrato, type ContratoEnfermagem } from "@/lib/enfermagem/contrato";

export type ContratoLista = {
  id: number;
  id_paciente: number;
  id_agendamento: number | null;
  created_at: string;
  paciente_nome: string;
  dados: ContratoEnfermagem;
};

export function ContratosClient({
  loadError,
  contratos,
}: {
  loadError: string | null;
  contratos: ContratoLista[];
}) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [aberto, setAberto] = useState<ContratoLista | null>(null);
  const [excluindo, setExcluindo] = useState<ContratoLista | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [apagando, setApagando] = useState(false);

  const filtrados = useMemo(() => {
    const q = nome.trim().toLowerCase();
    return contratos.filter((c) => {
      const dia = c.created_at.slice(0, 10);
      if (de && dia < de) return false;
      if (ate && dia > ate) return false;
      if (!q) return true;
      const alvo = `${c.paciente_nome} ${c.dados.enfermeira_nome}`.toLowerCase();
      return alvo.includes(q);
    });
  }, [contratos, nome, de, ate]);

  async function excluir() {
    if (!excluindo) return;
    setApagando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/contratos-enfermagem/${excluindo.id}`, { method: "DELETE" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao excluir o contrato.");
      setExcluindo(null);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao excluir o contrato.");
    } finally {
      setApagando(false);
    }
  }

  return (
    <div className="card contratos-lista">
      <div className="card-body">
        {loadError ? <div className="alert alert-danger">{loadError}</div> : null}
        {erro ? <div className="alert alert-danger">{erro}</div> : null}
        <div className="form-row align-items-end mb-3">
          <div className="form-group col-md-4">
            <label htmlFor="contrato-nome">Paciente ou enfermeira</label>
            <input
              id="contrato-nome"
              className="form-control"
              placeholder="Digite parte do nome..."
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div className="form-group col-md-3">
            <label htmlFor="contrato-de">Cadastro de</label>
            <input id="contrato-de" type="date" className="form-control" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className="form-group col-md-3">
            <label htmlFor="contrato-ate">Cadastro até</label>
            <input id="contrato-ate" type="date" className="form-control" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          <div className="form-group col-md-2">
            <button
              type="button"
              className="btn btn-light btn-block"
              onClick={() => {
                setNome("");
                setDe("");
                setAte("");
              }}
            >
              Limpar
            </button>
          </div>
        </div>

        <div className="d-md-none">
          {filtrados.length === 0 ? (
            <p className="text-muted text-center mb-0">Nenhum contrato encontrado.</p>
          ) : (
            filtrados.map((c) => (
              <article key={c.id} className="border rounded p-3 mb-2">
                <strong className="d-block">{c.paciente_nome}</strong>
                <div className="small text-muted mb-2">{formatarDataContrato(c.created_at.slice(0, 10))}</div>
                <div className="small">Enfermeira: {c.dados.enfermeira_nome || "—"}</div>
                <div className="small">
                  Vigência: {formatarDataContrato(c.dados.data_inicio)} a {formatarDataContrato(c.dados.data_fim)}
                </div>
                <div className="small mb-2">
                  1ª consulta {c.dados.valor_primeira_consulta || "—"} · Pacote {c.dados.valor_pacote || "—"}
                </div>
                <div className="d-flex" style={{ gap: 8 }}>
                  <button type="button" className="btn btn-sm btn-outline-secondary flex-fill" onClick={() => setAberto(c)}>
                    Ver
                  </button>
                  <button type="button" className="btn btn-sm btn-outline-danger flex-fill" onClick={() => setExcluindo(c)}>
                    Excluir
                  </button>
                </div>
              </article>
            ))
          )}
        </div>

        <div className="table-responsive d-none d-md-block">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th>Cadastro</th>
                <th>Paciente</th>
                <th>Enfermeira</th>
                <th>Vigência</th>
                <th>1ª consulta</th>
                <th>Pacote</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-muted text-center">
                    Nenhum contrato encontrado.
                  </td>
                </tr>
              ) : (
                filtrados.map((c) => (
                  <tr key={c.id}>
                    <td>{formatarDataContrato(c.created_at.slice(0, 10))}</td>
                    <td>{c.paciente_nome}</td>
                    <td>{c.dados.enfermeira_nome || "—"}</td>
                    <td>
                      {formatarDataContrato(c.dados.data_inicio)} a {formatarDataContrato(c.dados.data_fim)}
                    </td>
                    <td>{c.dados.valor_primeira_consulta || "—"}</td>
                    <td>{c.dados.valor_pacote || "—"}</td>
                    <td className="text-right text-nowrap">
                      <button type="button" className="btn btn-sm btn-outline-secondary mr-2" onClick={() => setAberto(c)}>
                        Ver
                      </button>
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setExcluindo(c)}>
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {aberto ? (
        <ModalContratoEnfermagem
          ag={{
            id: aberto.id_agendamento ?? 0,
            id_paciente: aberto.id_paciente,
            paciente_nome: aberto.paciente_nome,
          }}
          inicio="consulta"
          consulta={{ id: aberto.id, created_at: aberto.created_at, dados: aberto.dados }}
          onClose={() => setAberto(null)}
        />
      ) : null}

      {excluindo ? (
        <div className="modal d-block" style={{ background: "rgba(53, 16, 67, 0.45)", zIndex: 1080 }} role="dialog">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-body">
                <h2 className="h5">Excluir contrato</h2>
                <p className="mb-0">
                  Excluir o contrato de <strong>{excluindo.paciente_nome}</strong> cadastrado em{" "}
                  {formatarDataContrato(excluindo.created_at.slice(0, 10))}?
                </p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-light" onClick={() => setExcluindo(null)} disabled={apagando}>
                  Cancelar
                </button>
                <button type="button" className="btn btn-danger" onClick={() => void excluir()} disabled={apagando}>
                  {apagando ? "Excluindo..." : "Excluir"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
