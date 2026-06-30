import { PagamentoTaxaClient } from "./pagamento-taxa-client";

type PageProps = { params: Promise<{ token: string }> };

export default async function PagamentoTaxaPage({ params }: PageProps) {
  const { token } = await params;

  return (
    <div
      className="min-vh-100 d-flex align-items-center justify-content-center py-4"
      style={{ background: "#f4f6f9" }}
    >
      <div className="container" style={{ maxWidth: 420 }}>
        <PagamentoTaxaClient token={token} />
      </div>
    </div>
  );
}
