import type { FocusAmbiente } from "./types";

export function baseUrlFocusNfe(ambiente: FocusAmbiente): string {
  return ambiente === "producao"
    ? "https://api.focusnfe.com.br/v2"
    : "https://homologacao.focusnfe.com.br/v2";
}

export function labelAmbienteFocus(ambiente: FocusAmbiente): string {
  return ambiente === "producao" ? "Produção" : "Homologação";
}
