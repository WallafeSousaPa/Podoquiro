"use client";

import type { CSSProperties } from "react";
import type { DadosPacienteTermo, RodapeDataLocal } from "@/lib/termo-consentimento/texto-podoquiro";
import {
  CLAUSULAS_TERMO_MODELO,
  formatarLinhaDataLocalTermo,
  segmentosIntroTermoModelo,
  SUBTITULO_TERMO,
  TEXTO_DECLARACAO_ASSINATURA_PLATAFORMA,
  textoCampoTabelaTermo,
  TITULO_TERMO_PRINCIPAL,
} from "@/lib/termo-consentimento/texto-podoquiro";

const C = {
  body: "#2c3e50",
  titulo: "#1a365d",
  sub: "#718096",
  texto: "#4a5568",
  tituloClausula: "#2b6cb0",
  bordaHeader: "#e1e8ed",
  bordaCel: "#e2e8f0",
  fundoLabel: "#f7fafc",
  caixaDecl: "#ebf8ff",
  bordaDecl: "#3182ce",
} as const;

function renderizarLinhaComRotuloABC(linha: string) {
  const t = linha.trim();
  const m = t.match(/^(a\)|b\)|c\))\s*(.*)$/i);
  if (m) {
    return (
      <>
        <strong>{m[1]}</strong> {m[2]}
      </>
    );
  }
  return <>{linha}</>;
}

type Props = {
  dados: DadosPacienteTermo;
  rodape: RodapeDataLocal;
};

/**
 * Pré-visualização do termo com o mesmo layout do modelo HTML (logo, tabela, cláusulas, caixa de declaração).
 */
export function TermoConsentimentoPreview({ dados, rodape }: Props) {
  const nome = textoCampoTabelaTermo(dados.nomePaciente);
  const cpf = textoCampoTabelaTermo(dados.cpf);
  const tel = textoCampoTabelaTermo(dados.telefone);
  const em = textoCampoTabelaTermo(dados.email);
  const end = textoCampoTabelaTermo(dados.endereco);

  const tdLabel: CSSProperties = {
    fontWeight: 700,
    backgroundColor: C.fundoLabel,
    color: C.texto,
    width: "20%",
    padding: "10px 12px",
    border: `1px solid ${C.bordaCel}`,
    verticalAlign: "top",
  };
  const tdVal: CSSProperties = {
    padding: "10px 12px",
    border: `1px solid ${C.bordaCel}`,
    color: C.texto,
    verticalAlign: "top",
  };

  const tdEnderecoValor: CSSProperties = {
    ...tdVal,
    width: "80%",
  };

  return (
    <div
      style={{
        maxWidth: 800,
        margin: "0 auto",
        background: "#fff",
        fontFamily: "'Segoe UI', Arial, sans-serif",
        lineHeight: 1.6,
        color: C.body,
        padding: "0 4px",
      }}
    >
      <header
        style={{
          textAlign: "center",
          marginBottom: 35,
          borderBottom: `2px solid ${C.bordaHeader}`,
          paddingBottom: 20,
        }}
      >
        <img
          src="/IconePodoquiro.png"
          alt=""
          style={{ display: "block", margin: "0 auto 16px", maxHeight: 72, maxWidth: 140, width: "auto", height: "auto" }}
        />
        <h2
          style={{
            fontSize: 22,
            color: C.titulo,
            margin: "0 0 8px 0",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            fontWeight: 700,
          }}
        >
          {TITULO_TERMO_PRINCIPAL}
        </h2>
        <p style={{ fontSize: 14, color: C.sub, margin: 0 }}>{SUBTITULO_TERMO}</p>
      </header>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginBottom: 30,
          fontSize: 14,
        }}
      >
        <tbody>
          <tr>
            <td style={tdLabel}>Paciente:</td>
            <td style={tdVal}>{nome}</td>
            <td style={tdLabel}>CPF:</td>
            <td style={tdVal}>{cpf}</td>
          </tr>
          <tr>
            <td style={tdLabel}>Telefone:</td>
            <td style={tdVal}>{tel}</td>
            <td style={tdLabel}>E-mail:</td>
            <td style={tdVal}>{em}</td>
          </tr>
          <tr>
            <td style={tdLabel}>Endereço:</td>
            <td colSpan={3} style={tdEnderecoValor}>
              {end}
            </td>
          </tr>
        </tbody>
      </table>

      <div
        style={{
          fontSize: 14,
          textAlign: "justify",
          marginBottom: 25,
          color: C.texto,
        }}
      >
        <p style={{ margin: 0 }}>
          {segmentosIntroTermoModelo().map((seg, i) =>
            seg.bold ? (
              <strong key={i}>{seg.text}</strong>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )}
        </p>
      </div>

      {CLAUSULAS_TERMO_MODELO.map((cl) => {
        const partes = cl.corpo
          .split(/\n+/)
          .map((p) => p.trim())
          .filter(Boolean);
        const isSeis = cl.titulo.startsWith("6.");
        return (
          <div key={cl.titulo} style={{ marginBottom: 20, textAlign: "justify", fontSize: 14, color: C.texto }}>
            <h3
              style={{
                fontSize: 15,
                color: C.tituloClausula,
                margin: "0 0 6px 0",
                fontWeight: 600,
              }}
            >
              {cl.titulo}
            </h3>
            {isSeis ? (
              <p style={{ margin: 0, color: C.texto }}>
                {partes.map((par, idx) => (
                  <span key={idx}>
                    {idx > 0 ? (
                      <>
                        <br />
                        <br />
                      </>
                    ) : null}
                    {idx === 0 ? par : renderizarLinhaComRotuloABC(par)}
                  </span>
                ))}
              </p>
            ) : (
              <p style={{ margin: 0, color: C.texto }}>{cl.corpo}</p>
            )}
          </div>
        );
      })}

      <div
        style={{
          marginTop: 35,
          padding: 15,
          backgroundColor: C.caixaDecl,
          borderLeft: `4px solid ${C.bordaDecl}`,
          fontSize: 14,
          fontWeight: 500,
          textAlign: "justify",
          color: C.texto,
        }}
      >
        {TEXTO_DECLARACAO_ASSINATURA_PLATAFORMA}
      </div>

      <div
        style={{
          marginTop: 30,
          textAlign: "right",
          fontSize: 14,
          fontWeight: 700,
          color: C.texto,
        }}
      >
        {formatarLinhaDataLocalTermo(rodape)}
      </div>
    </div>
  );
}
