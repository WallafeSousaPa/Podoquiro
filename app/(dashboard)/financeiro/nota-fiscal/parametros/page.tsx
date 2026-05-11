import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getConfigNfeGlobal,
  getNfeEndpointsEmitentePa,
  obterMetadataCertificadoNfe,
} from "@/lib/sefaz/nfe";
import { NfeCertificadoForm } from "./nfe-certificado-form";

function parseEmpresaId(idEmpresa: string) {
  const n = Number(idEmpresa);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default async function NfeParametrosPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const empresaId = parseEmpresaId(session.idEmpresa);
  if (!empresaId) {
    redirect("/login");
  }

  const cfg = getConfigNfeGlobal();
  const endpoints = getNfeEndpointsEmitentePa(cfg.ambiente);
  const ambienteLabel = cfg.ambiente === 1 ? "Produção (1)" : "Homologação (2)";

  const supabase = createAdminClient();
  let metaCert: { atualizadoEm: string } | null = null;
  let metaErr: string | null = null;
  try {
    metaCert = await obterMetadataCertificadoNfe(supabase, empresaId);
  } catch (e) {
    metaErr =
      e instanceof Error ? e.message : "Não foi possível ler metadados do certificado.";
  }

  const certificadoLegadoEnv =
    cfg.certificadoPath.length > 0 && cfg.certificadoSenha.length > 0;
  const certificadoNoBanco = Boolean(metaCert);

  return (
    <>
      <div className="content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1 className="m-0 text-dark">Parâmetros — NF-e</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item">
                  <a href="/inicio">Início</a>
                </li>
                <li className="breadcrumb-item">Financeiro</li>
                <li className="breadcrumb-item">Nota Fiscal</li>
                <li className="breadcrumb-item active">Parâmetros</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid">
          <div className="row">
            <div className="col-lg-8">
              <div className="card card-outline card-primary">
                <div className="card-header">
                  <h3 className="card-title mb-0">Ambiente e emitente</h3>
                </div>
                <div className="card-body">
                  <dl className="row mb-0">
                    <dt className="col-sm-4">UF emitente</dt>
                    <dd className="col-sm-8">{cfg.ufEmitente}</dd>
                    <dt className="col-sm-4">Autorizadora NF-e</dt>
                    <dd className="col-sm-8">{cfg.autorizadoraNfe}</dd>
                    <dt className="col-sm-4">Ambiente SEFAZ</dt>
                    <dd className="col-sm-8">{ambienteLabel}</dd>
                    <dt className="col-sm-4">Certificado</dt>
                    <dd className="col-sm-8">
                      {metaErr ? (
                        <span className="text-danger small">{metaErr}</span>
                      ) : certificadoNoBanco ? (
                        <>
                          <span className="badge badge-success mr-2">Armazenado no banco</span>
                          <span className="text-muted small">(cifrado)</span>
                        </>
                      ) : certificadoLegadoEnv ? (
                        <>
                          <span className="badge badge-info mr-2">Variáveis de ambiente</span>
                          <span className="text-muted small">{cfg.certificadoPath}</span>
                        </>
                      ) : (
                        <span className="badge badge-warning">
                          Configure o certificado abaixo ou NFE_CERT_PATH
                        </span>
                      )}
                    </dd>
                  </dl>
                </div>
              </div>

              <NfeCertificadoForm
                certificadoNoBanco={certificadoNoBanco}
                atualizadoEm={metaCert?.atualizadoEm ?? null}
              />

              <div className="card card-outline card-secondary mt-3">
                <div className="card-header">
                  <h3 className="card-title mb-0">Webservices (SVRS — PA)</h3>
                </div>
                <div className="card-body p-0">
                  <table className="table table-sm mb-0">
                    <thead>
                      <tr>
                        <th>Serviço</th>
                        <th>URL</th>
                      </tr>
                    </thead>
                    <tbody className="small">
                      <tr>
                        <td>Autorização</td>
                        <td className="text-break">{endpoints.autorizacao}</td>
                      </tr>
                      <tr>
                        <td>Retorno autorização</td>
                        <td className="text-break">{endpoints.retAutorizacao}</td>
                      </tr>
                      <tr>
                        <td>Consulta protocolo</td>
                        <td className="text-break">{endpoints.consultaProtocolo}</td>
                      </tr>
                      <tr>
                        <td>Status serviço</td>
                        <td className="text-break">{endpoints.statusServico}</td>
                      </tr>
                      <tr>
                        <td>Recepção evento</td>
                        <td className="text-break">{endpoints.recepcaoEvento}</td>
                      </tr>
                      <tr>
                        <td>Consulta cadastro</td>
                        <td className="text-break">{endpoints.cadConsultaCadastro}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="col-lg-4">
              <div className="card card-outline card-info">
                <div className="card-header">
                  <h3 className="card-title mb-0">Variáveis (.env)</h3>
                </div>
                <div className="card-body small">
                  <ul className="mb-0 pl-3">
                    <li>
                      <code>NFE_UF</code> — ex.: PA
                    </li>
                    <li>
                      <code>NFE_AMBIENTE</code> — 1 produção, 2 homologação
                    </li>
                    <li>
                      <code className="text-danger">NFE_CERT_MASTER_KEY</code> — obrigatória para
                      cifrar certificado/senha no banco (guarde em segredo)
                    </li>
                    <li className="text-muted">
                      <code>NFE_CERT_PATH</code> / <code>NFE_CERT_PASSWORD</code> — opcional,
                      legado
                    </li>
                  </ul>
                  <p className="text-muted mt-3 mb-0">
                    Em produção use cofre de segredos e backups cifrados do Postgres.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
