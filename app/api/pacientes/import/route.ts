import { NextResponse } from "next/server";
import { normalizeCpfDigits, isCpfLengthOk } from "@/lib/pacientes";
import {
  buildPrimeiraLinhaPorNomeECpf,
  chaveNomeNormalizada,
  parseArquivoImportPacientes,
  type IgnoradoImport,
} from "@/lib/pacientes-import";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_BYTES = 12 * 1024 * 1024;

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Formulário inválido." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Envie um arquivo CSV ou Excel (.csv, .xlsx ou .xls)." },
      { status: 400 },
    );
  }

  const name = file.name.toLowerCase();
  if (!name.endsWith(".csv") && !name.endsWith(".xlsx") && !name.endsWith(".xls")) {
    return NextResponse.json(
      {
        error:
          "Formato inválido. Use CSV (valores separados por vírgula) ou planilha Excel (.xlsx / .xls).",
      },
      { status: 400 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length === 0) {
    return NextResponse.json({ error: "Arquivo vazio." }, { status: 400 });
  }
  if (buf.length > MAX_BYTES) {
    return NextResponse.json({ error: "Arquivo muito grande (máx. 12 MB)." }, { status: 400 });
  }

  const { linhas, ignorados: ignoradosParse } = parseArquivoImportPacientes(buf, file.name);
  const ignorados: IgnoradoImport[] = [...ignoradosParse];

  if (linhas.length === 0) {
    return NextResponse.json({
      importados: 0,
      ignorados,
      mensagem: "Nenhuma linha válida para importar.",
    });
  }

  const { porNome, porCpf } = buildPrimeiraLinhaPorNomeECpf(linhas);

  const supabase = createAdminClient();
  const { data: existentes, error: exErr } = await supabase
    .from("pacientes")
    .select("cpf, nome_completo")
    .eq("id_empresa", empresaId);

  if (exErr) {
    console.error(exErr);
    return NextResponse.json({ error: exErr.message }, { status: 500 });
  }

  const existingNome = new Set<string>();
  const existingCpf = new Set<string>();
  for (const p of existentes ?? []) {
    const nc = p.nome_completo?.trim();
    if (nc) existingNome.add(chaveNomeNormalizada(nc));
    if (p.cpf) {
      const d = normalizeCpfDigits(String(p.cpf));
      if (isCpfLengthOk(d)) existingCpf.add(d);
    }
  }

  let importados = 0;

  for (const item of linhas) {
    const { indicePlanilha, dados } = item;
    const nk = chaveNomeNormalizada(dados.nome_completo);
    const c = dados.cpf;

    if (porNome.get(nk) !== indicePlanilha) {
      ignorados.push({
        linha: indicePlanilha,
        motivo: `Nome duplicado na planilha (mantida a primeira linha ${porNome.get(nk)}).`,
      });
      continue;
    }
    if (c && porCpf.get(c) !== indicePlanilha) {
      ignorados.push({
        linha: indicePlanilha,
        motivo: `CPF duplicado na planilha (mantida a primeira linha ${porCpf.get(c)}).`,
      });
      continue;
    }

    if (existingNome.has(nk)) {
      ignorados.push({
        linha: indicePlanilha,
        motivo: "Nome completo já cadastrado para esta empresa.",
      });
      continue;
    }
    if (c && existingCpf.has(c)) {
      ignorados.push({
        linha: indicePlanilha,
        motivo: "CPF já cadastrado para esta empresa.",
      });
      continue;
    }

    const insertRow = {
      id_empresa: empresaId,
      cpf: c,
      nome_completo: dados.nome_completo,
      nome_social: null as string | null,
      genero: dados.genero,
      data_nascimento: dados.data_nascimento,
      estado_civil: dados.estado_civil,
      email: dados.email,
      telefone: dados.telefone,
      cep: dados.cep,
      logradouro: dados.logradouro,
      numero: dados.numero,
      complemento: dados.complemento,
      bairro: dados.bairro,
      cidade: dados.cidade,
      uf: dados.uf,
      ativo: true,
    };

    const { error: insErr } = await supabase.from("pacientes").insert(insertRow);

    if (insErr) {
      console.error(insErr);
      if (insErr.code === "23505") {
        ignorados.push({
          linha: indicePlanilha,
          motivo: "Conflito de unicidade (CPF ou nome já existente no banco).",
        });
      } else {
        ignorados.push({
          linha: indicePlanilha,
          motivo: insErr.message,
        });
      }
      continue;
    }

    importados++;
    existingNome.add(nk);
    if (c) existingCpf.add(c);
  }

  return NextResponse.json({
    importados,
    ignorados,
    mensagem:
      importados > 0
        ? `${importados} paciente(s) importado(s).`
        : "Nenhum registro novo importado.",
  });
}
