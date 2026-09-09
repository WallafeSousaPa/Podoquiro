"use client";

import { MENUS_LATERAIS } from "@/lib/dashboard/menus-catalogo";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type GrupoOpt = { id: number; grupo_usuarios: string; ativo: boolean };
type UsuarioOpt = {
  id: number;
  usuario: string;
  nome_completo: string | null;
  id_grupo_usuarios: number | null;
};

type Alvo = "grupo" | "usuario";

function nomeUsuario(u: UsuarioOpt) {
  return (u.nome_completo ?? "").trim() || u.usuario;
}

export function MenusPermissoesClient() {
  const router = useRouter();
  const [alvo, setAlvo] = useState<Alvo>("grupo");
  const [grupos, setGrupos] = useState<GrupoOpt[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioOpt[]>([]);
  const [idAlvo, setIdAlvo] = useState("");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [origem, setOrigem] = useState<"grupo" | "usuario">("grupo");
  const [grupoNome, setGrupoNome] = useState<string | null>(null);
  const [loadingLista, setLoadingLista] = useState(true);
  const [loadingPerm, setLoadingPerm] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const carregarListas = useCallback(async () => {
    setLoadingLista(true);
    setError(null);
    try {
      const [gRes, uRes] = await Promise.all([
        fetch("/api/usuarios-grupos", { credentials: "include" }),
        fetch("/api/usuarios", { credentials: "include" }),
      ]);
      const gJson = (await gRes.json()) as { data?: GrupoOpt[]; error?: string };
      const uJson = (await uRes.json()) as { data?: UsuarioOpt[]; error?: string };
      if (!gRes.ok) throw new Error(gJson.error ?? "Falha ao carregar tipos de usuário.");
      if (!uRes.ok) throw new Error(uJson.error ?? "Falha ao carregar usuários.");
      const gs = (gJson.data ?? []).filter((g) => g.ativo);
      setGrupos(gs);
      setUsuarios(uJson.data ?? []);
      if (!idAlvo && gs[0]) setIdAlvo(String(gs[0].id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally {
      setLoadingLista(false);
    }
  }, [idAlvo]);

  useEffect(() => {
    void carregarListas();
    // só na montagem
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const carregarPermissoes = useCallback(async () => {
    if (!idAlvo) return;
    setLoadingPerm(true);
    setError(null);
    setSucesso(null);
    try {
      const qs = new URLSearchParams({ alvo, id: idAlvo });
      const res = await fetch(`/api/usuarios/menus?${qs}`, { credentials: "include" });
      const j = (await res.json()) as {
        menus?: string[];
        origem?: "grupo" | "usuario";
        grupoNome?: string | null;
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Falha ao carregar menus.");
      setMarcados(new Set(j.menus ?? []));
      setOrigem(j.origem ?? "grupo");
      setGrupoNome(j.grupoNome ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar menus.");
      setMarcados(new Set());
    } finally {
      setLoadingPerm(false);
    }
  }, [alvo, idAlvo]);

  useEffect(() => {
    void carregarPermissoes();
  }, [carregarPermissoes]);

  function trocarAlvo(prox: Alvo) {
    setAlvo(prox);
    if (prox === "grupo") {
      setIdAlvo(grupos[0] ? String(grupos[0].id) : "");
    } else {
      setIdAlvo(usuarios[0] ? String(usuarios[0].id) : "");
    }
  }

  function toggleChave(chave: string, on: boolean) {
    setMarcados((prev) => {
      const n = new Set(prev);
      if (on) n.add(chave);
      else n.delete(chave);
      return n;
    });
  }

  function chavesDoGrupo(grupoId: string): string[] {
    const g = MENUS_LATERAIS.find((x) => x.id === grupoId);
    if (!g) return [];
    if (g.item) return [g.item.chave];
    return (g.itens ?? []).map((i) => i.chave);
  }

  function grupoTodosMarcados(grupoId: string): boolean {
    const chaves = chavesDoGrupo(grupoId);
    return chaves.length > 0 && chaves.every((c) => marcados.has(c));
  }

  function grupoAlgunsMarcados(grupoId: string): boolean {
    const chaves = chavesDoGrupo(grupoId);
    const n = chaves.filter((c) => marcados.has(c)).length;
    return n > 0 && n < chaves.length;
  }

  function toggleGrupo(grupoId: string, on: boolean) {
    const chaves = chavesDoGrupo(grupoId);
    setMarcados((prev) => {
      const n = new Set(prev);
      for (const c of chaves) {
        if (on) n.add(c);
        else n.delete(c);
      }
      return n;
    });
  }

  async function salvar() {
    if (!idAlvo) return;
    setSalvando(true);
    setError(null);
    setSucesso(null);
    try {
      const res = await fetch("/api/usuarios/menus", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alvo, id: Number(idAlvo), menus: [...marcados] }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Não foi possível salvar.");
      setOrigem(alvo === "usuario" ? "usuario" : "grupo");
      setSucesso("Menus salvos. Recarregue as telas abertas para ver o menu atualizado.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function herdarDoTipo() {
    if (alvo !== "usuario" || !idAlvo) return;
    setSalvando(true);
    setError(null);
    setSucesso(null);
    try {
      const res = await fetch("/api/usuarios/menus", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alvo: "usuario", id: Number(idAlvo), limpar_personalizacao: true }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Não foi possível herdar o tipo.");
      setSucesso("Personalização removida. O usuário volta a herdar o tipo.");
      await carregarPermissoes();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível herdar o tipo.");
    } finally {
      setSalvando(false);
    }
  }

  const tituloAlvo = useMemo(() => {
    if (alvo === "grupo") {
      const g = grupos.find((x) => String(x.id) === idAlvo);
      return g?.grupo_usuarios ?? "tipo de usuário";
    }
    const u = usuarios.find((x) => String(x.id) === idAlvo);
    return u ? nomeUsuario(u) : "usuário";
  }, [alvo, idAlvo, grupos, usuarios]);

  return (
    <>
      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}
      {sucesso ? (
        <div className="alert alert-success" role="alert">
          {sucesso}
        </div>
      ) : null}

      <div className="card card-outline card-primary">
        <div className="card-header">
          <h3 className="card-title mb-0">Quem recebe os menus</h3>
        </div>
        <div className="card-body">
          <div className="form-group">
            <div className="custom-control custom-radio custom-control-inline">
              <input
                id="alvo-grupo"
                type="radio"
                name="alvo-menu"
                className="custom-control-input"
                checked={alvo === "grupo"}
                onChange={() => trocarAlvo("grupo")}
              />
              <label className="custom-control-label" htmlFor="alvo-grupo">
                Tipo de usuário
              </label>
            </div>
            <div className="custom-control custom-radio custom-control-inline">
              <input
                id="alvo-usuario"
                type="radio"
                name="alvo-menu"
                className="custom-control-input"
                checked={alvo === "usuario"}
                onChange={() => trocarAlvo("usuario")}
              />
              <label className="custom-control-label" htmlFor="alvo-usuario">
                Usuário
              </label>
            </div>
          </div>

          <div className="form-group mb-0" style={{ maxWidth: "28rem" }}>
            <label htmlFor="select-alvo">{alvo === "grupo" ? "Tipo" : "Usuário"}</label>
            <select
              id="select-alvo"
              className="form-control"
              value={idAlvo}
              disabled={loadingLista}
              onChange={(e) => setIdAlvo(e.target.value)}
            >
              {alvo === "grupo"
                ? grupos.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.grupo_usuarios}
                    </option>
                  ))
                : usuarios.map((u) => (
                    <option key={u.id} value={u.id}>
                      {nomeUsuario(u)}
                    </option>
                  ))}
            </select>
          </div>

          {alvo === "usuario" ? (
            <p className="small text-muted mt-2 mb-0">
              {origem === "usuario" ? (
                <>
                  Este usuário tem menus <strong>personalizados</strong>
                  {grupoNome ? <> (o tipo {grupoNome} não é usado até limpar a personalização)</> : null}.
                </>
              ) : (
                <>
                  Herdando o tipo {grupoNome ? <strong>{grupoNome}</strong> : "do usuário"}. Salvar
                  cria uma personalização só para esta pessoa.
                </>
              )}
            </p>
          ) : (
            <p className="small text-muted mt-2 mb-0">
              Quem estiver neste tipo vê estes menus, salvo se o usuário tiver personalização.
            </p>
          )}
        </div>
      </div>

      <div className="card card-outline card-secondary">
        <div className="card-header d-flex flex-wrap justify-content-between align-items-center">
          <h3 className="card-title mb-2 mb-sm-0">Menus laterais — {tituloAlvo}</h3>
          <div>
            {alvo === "usuario" && origem === "usuario" ? (
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm mr-2"
                disabled={salvando || loadingPerm}
                onClick={() => void herdarDoTipo()}
              >
                Usar padrão do tipo
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={salvando || loadingPerm || !idAlvo}
              onClick={() => void salvar()}
            >
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
        <div className="card-body">
          {loadingLista || loadingPerm ? (
            <p className="text-muted mb-0">Carregando…</p>
          ) : (
            <div className="row">
              {MENUS_LATERAIS.map((g) => (
                <div key={g.id} className="col-12 col-md-6 col-xl-4 mb-3">
                  <div className="border rounded p-2 h-100">
                    <div className="custom-control custom-checkbox mb-2">
                      <input
                        id={`g-${g.id}`}
                        type="checkbox"
                        className="custom-control-input"
                        checked={grupoTodosMarcados(g.id)}
                        ref={(el) => {
                          if (el) el.indeterminate = grupoAlgunsMarcados(g.id);
                        }}
                        onChange={(e) => toggleGrupo(g.id, e.target.checked)}
                      />
                      <label className="custom-control-label font-weight-bold" htmlFor={`g-${g.id}`}>
                        <i className={`${g.icon} mr-1`} aria-hidden />
                        {g.label}
                      </label>
                    </div>
                    {(g.item ? [g.item] : g.itens ?? []).map((item) =>
                      g.item ? null : (
                        <div key={item.chave} className="custom-control custom-checkbox ml-3 mb-1">
                          <input
                            id={`m-${item.chave}`}
                            type="checkbox"
                            className="custom-control-input"
                            checked={marcados.has(item.chave)}
                            onChange={(e) => toggleChave(item.chave, e.target.checked)}
                          />
                          <label className="custom-control-label" htmlFor={`m-${item.chave}`}>
                            {item.label}
                            {item.somenteAcao ? (
                              <span className="text-muted small"> (permissão)</span>
                            ) : null}
                          </label>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
