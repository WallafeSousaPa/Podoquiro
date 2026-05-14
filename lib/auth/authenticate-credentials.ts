import bcrypt from "bcryptjs";
import { createAdminClient } from "@/lib/supabase/admin";

export type UsuarioAutenticado = {
  id: number;
  usuario: string;
  id_empresa: number;
};

export async function validarCredenciaisLogin(
  loginRaw: string,
  password: string,
): Promise<
  | { ok: true; user: UsuarioAutenticado }
  | { ok: false; error: string; status: number }
> {
  const trimmed = loginRaw.trim();
  if (!trimmed || !password) {
    return {
      ok: false,
      error: "Informe usuário ou e-mail e a senha.",
      status: 400,
    };
  }

  const admin = createAdminClient();

  const { data: byUsuario, error: errUsuario } = await admin
    .from("usuarios")
    .select("id, usuario, senha_hash, email, id_empresa")
    .eq("ativo", true)
    .eq("usuario", trimmed)
    .maybeSingle();

  let row = byUsuario;

  if (!row && trimmed.includes("@")) {
    const { data: byEmail, error: errEmail } = await admin
      .from("usuarios")
      .select("id, usuario, senha_hash, email, id_empresa")
      .eq("ativo", true)
      .ilike("email", trimmed)
      .maybeSingle();
    if (errEmail) {
      console.error(errEmail);
      return {
        ok: false,
        error: "Erro ao validar credenciais.",
        status: 500,
      };
    }
    row = byEmail;
  }

  if (errUsuario && !row) {
    console.error(errUsuario);
    return {
      ok: false,
      error: "Erro ao validar credenciais.",
      status: 500,
    };
  }

  if (!row) {
    return { ok: false, error: "Credenciais inválidas.", status: 401 };
  }

  const hash = row.senha_hash;
  if (typeof hash !== "string" || !hash) {
    return { ok: false, error: "Credenciais inválidas.", status: 401 };
  }

  const senhaOk = await bcrypt.compare(password, hash);
  if (!senhaOk) {
    return { ok: false, error: "Credenciais inválidas.", status: 401 };
  }

  return {
    ok: true,
    user: {
      id: row.id as number,
      usuario: row.usuario as string,
      id_empresa: row.id_empresa as number,
    },
  };
}
