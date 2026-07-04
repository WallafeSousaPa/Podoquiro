import type { Metadata } from "next";
import { PagamentoTaxaClient } from "./pagamento-taxa-client";

type PageProps = { params: Promise<{ token: string }> };

export const metadata: Metadata = {
  title: "Pagamento - PODOQUIRO",
  description: "Confirme seu agendamento com pagamento seguro.",
};

export default async function PagamentoTaxaPage({ params }: PageProps) {
  const { token } = await params;
  const ano = new Date().getFullYear();

  return (
    <div className="bg-brand-light min-h-screen flex flex-col justify-between antialiased font-sans">
      <main className="flex-grow flex items-center justify-center p-4">
        <PagamentoTaxaClient token={token} />
      </main>
      <footer className="py-4 text-center text-xs text-gray-400">
        &copy; {ano} PODOQUIRO. Todos os direitos reservados.
      </footer>
    </div>
  );
}
