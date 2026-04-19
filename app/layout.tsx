import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  weight: ["300", "400", "600"],
  subsets: ["latin"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Podoquiro",
  description: "Cuidando de cada passo seu com excelência.",
  icons: {
    icon: [{ url: "/IconePodoquiro.png", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={poppins.variable}>
      <body className={poppins.className}>{children}</body>
    </html>
  );
}
