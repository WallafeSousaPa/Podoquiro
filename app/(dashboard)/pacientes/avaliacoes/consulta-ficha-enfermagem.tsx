"use client";

import { type ReactNode } from "react";
import { CRITERIOS_PE, sanitizarFicha, type FichaEnfermagem } from "@/lib/enfermagem/ficha";

function texto(valor: string): string {
  const t = valor.trim();
  if (!t) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const [ano, mes, dia] = t.split("-");
    return `${dia}/${mes}/${ano}`;
  }
  return t;
}

function simNao(marcado: boolean): string {
  return marcado ? "Sim" : "Não";
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mb-3">
      <h6 className="text-primary border-bottom pb-1 mb-2">{titulo}</h6>
      {children}
    </section>
  );
}

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="col-md-6 mb-2">
      <div className="text-muted small">{label}</div>
      <div style={{ whiteSpace: "pre-wrap" }}>{texto(valor)}</div>
    </div>
  );
}

function Marcacoes({ itens }: { itens: { label: string; marcado: boolean }[] }) {
  return (
    <div className="row">
      {itens.map((item) => (
        <div key={item.label} className="col-sm-6 col-md-4 mb-1">
          <span className="text-muted">{item.label}</span>{" "}
          <span className={item.marcado ? "ficha-marca ficha-marca-sim" : "ficha-marca ficha-marca-nao"}>
            {simNao(item.marcado)}
          </span>
        </div>
      ))}
    </div>
  );
}

function lado(valor: string): string {
  if (valor === "sim") return "Sim";
  if (valor === "nao") return "Não";
  return "—";
}

export function ConsultaFichaEnfermagem({ dados }: { dados: unknown }) {
  const f: FichaEnfermagem = sanitizarFicha(dados);
  const historico =
    f.historicoLesao === "primeira" ? "Primeira vez" : f.historicoLesao === "recidiva" ? "Recidiva" : "—";
  const evolucaoLesao =
    f.evolucaoLesao === "aguda" ? "Aguda" : f.evolucaoLesao === "cronica" ? "Crônica" : "—";
  const nutricional =
    f.avNutricional === "inadequada"
      ? "Inadequada"
      : f.avNutricional === "adequada"
        ? "Adequada"
        : f.avNutricional === "excelente"
          ? "Excelente"
          : "—";

  return (
    <div>
      <Secao titulo="1. Identificação gravada do cadastro">
        <div className="row">
          <Campo label="Nome" valor={f.nome} />
          <Campo label="Prontuário" valor={f.prontuario} />
          <Campo label="Data de admissão" valor={f.dataAdmissao} />
          <Campo label="Sexo" valor={f.sexo} />
          <Campo label="Raça" valor={f.raca} />
          <Campo label="Idade" valor={f.idade} />
          <Campo label="Data de nascimento" valor={f.dn} />
          <Campo label="Religião" valor={f.religiao} />
          <Campo label="Ocupação" valor={f.ocupacao} />
          <Campo label="Telefone" valor={f.telefone} />
          <Campo label="Endereço" valor={f.endereco} />
          <Campo label="Escolaridade" valor={f.escolaridade} />
          <Campo label="Responsável" valor={f.responsavel} />
        </div>
      </Secao>

      <Secao titulo="2. Antecedentes pessoais">
        <Marcacoes
          itens={[
            { label: "HAS", marcado: f.hasPes },
            { label: "DM", marcado: f.dmPes },
            { label: "Tabagista", marcado: f.tabagista },
            { label: "Etilista", marcado: f.etilista },
          ]}
        />
        <div className="row mt-1">
          <Campo label="Cirurgias anteriores" valor={f.cirurgiasAnteriores} />
          <Campo label="Outras doenças" valor={f.outrasDoencasPes} />
        </div>
      </Secao>

      <Secao titulo="3. Antecedentes familiares">
        <Marcacoes
          itens={[
            { label: "HAS", marcado: f.hasFam },
            { label: "DM", marcado: f.dmFam },
          ]}
        />
        <div className="row mt-1">
          <Campo label="Outras doenças" valor={f.outrasDoencasFam} />
        </div>
      </Secao>

      <Secao titulo="4. Tipo de lesão">
        <Marcacoes
          itens={[
            { label: "Lesão por pressão", marcado: f.lesaoPressao },
            { label: "Queimaduras", marcado: f.queimaduras },
            { label: "Sítio cirúrgico", marcado: f.sitioCirurgico },
            { label: "Deiscências", marcado: f.deiscencias },
            { label: "Úlcera venosa", marcado: f.ulceraVenosa },
            { label: "Pé diabético", marcado: f.peDiabetico },
            { label: "Feridas traumáticas", marcado: f.feridasTraumaticas },
            { label: "Úlcera arterial", marcado: f.ulceraArterial },
            { label: "Ferida operatória", marcado: f.feridaOperatoria },
            { label: "Dermatites", marcado: f.dermatites },
          ]}
        />
        <div className="row mt-1">
          <Campo label="Outras" valor={f.outrasLesoes} />
        </div>
      </Secao>

      <Secao titulo="5. História da lesão">
        <div className="row">
          <Campo label="Ocorrência" valor={historico === "—" ? "" : historico} />
          <Campo label="Evolução" valor={evolucaoLesao === "—" ? "" : evolucaoLesao} />
        </div>
        <Marcacoes
          itens={[
            { label: "Trauma", marcado: f.etiologiaTrauma },
            { label: "Cirúrgica", marcado: f.etiologiaCirurgica },
            { label: "Espontânea", marcado: f.etiologiaEspontanea },
          ]}
        />
        <div className="row mt-1">
          <Campo label="Outras — quais" valor={f.outrasEtiologias} />
        </div>
      </Secao>

      <Secao titulo="6. Comorbidades">
        <Marcacoes
          itens={[
            { label: "Diabetes compensada", marcado: f.dmCompensada },
            { label: "Diabetes descompensada", marcado: f.dmDescompensada },
            { label: "Hipertensão arterial sistêmica", marcado: f.hasSistemica },
            { label: "Doença cardiovascular", marcado: f.doencaCardiovascular },
            { label: "Doença vascular", marcado: f.doencaVascular },
            { label: "Neoplasia", marcado: f.neoplasia },
          ]}
        />
        <div className="row mt-1">
          <Campo label="Outros" valor={f.outrasComorbidades} />
        </div>
      </Secao>

      <Secao titulo="7. Medicação contínua">
        <div style={{ whiteSpace: "pre-wrap" }}>{texto(f.medicacaoContinua)}</div>
      </Secao>

      <Secao titulo="8. Exame físico">
        <div className="row">
          <Campo label="PA (mmHg)" valor={f.pa} />
          <Campo label="T (ºC)" valor={f.temperatura} />
          <Campo label="P (bpm)" valor={f.pulso} />
          <Campo label="R (irpm)" valor={f.respiracao} />
          <Campo label="SapO2" valor={f.sapo2} />
          <Campo label="Pulso pedioso" valor={f.pulsoPedioso} />
          <Campo label="Pulso tibial posterior" valor={f.pulsoTibialPosterior} />
          <Campo label="Peso" valor={f.peso} />
          <Campo label="Altura" valor={f.altura} />
          <Campo label="IMC" valor={f.imc} />
          <Campo label="Ausculta cardíaca" valor={f.auscultaCardiaca} />
          <Campo label="Ausculta pulmonar" valor={f.auscultaPulmonar} />
        </div>
      </Secao>

      <Secao titulo="9. Sistema neurológico">
        <Marcacoes
          itens={[
            { label: "Consciente", marcado: f.neuroConsciente },
            { label: "Agitado", marcado: f.neuroAgitado },
            { label: "Orientado", marcado: f.neuroOrientado },
            { label: "Sonolento", marcado: f.neuroSonolento },
            { label: "Inconsciente", marcado: f.neuroInconsciente },
            { label: "Torporoso", marcado: f.neuroTorporoso },
            { label: "Confuso", marcado: f.neuroConfuso },
            { label: "Comatoso", marcado: f.neuroComatoso },
          ]}
        />
      </Secao>

      <Secao titulo="10. Pele e mucosas">
        <Marcacoes
          itens={[
            { label: "Corado", marcado: f.peleCorado },
            { label: "Cianótico", marcado: f.peleCianotico },
            { label: "Palidez", marcado: f.pelePalidez },
            { label: "Ictérico", marcado: f.peleIcterico },
            { label: "Manchas escuras", marcado: f.peleManchas },
            { label: "Bolhas", marcado: f.peleBolhas },
            { label: "Hidratado", marcado: f.peleHidratado },
            { label: "Desidratado", marcado: f.peleDesidratado },
            { label: "Hiperemia", marcado: f.peleHiperemia },
            { label: "Varizes", marcado: f.peleVarizes },
            { label: "Porta de entrada", marcado: f.pelePortaEntrada },
            { label: "Descamação da pele", marcado: f.peleDescamacao },
            { label: "Fungos interdigital", marcado: f.peleFungosInterdigital },
            { label: "Fungo ungueal", marcado: f.peleFungoUngueal },
          ]}
        />
      </Secao>

      <Secao titulo="11. Sistema sensitivo / motor">
        <Marcacoes
          itens={[
            { label: "Força preservada", marcado: f.forcaPreservada },
            { label: "Força diminuída", marcado: f.forcaDiminuida },
            { label: "Parestesia", marcado: f.parestesia },
            { label: "Paresia", marcado: f.paresia },
            { label: "Plegia", marcado: f.plegia },
          ]}
        />
      </Secao>

      <Secao titulo="12. Avaliação de dor">
        <Marcacoes
          itens={[
            { label: "Expressão facial de dor", marcado: f.expressaoDor },
            { label: "Dor a estimulação tátil", marcado: f.dorEstimulacao },
            { label: "Relato verbal de dor", marcado: f.relatoVerbal },
          ]}
        />
        <div className="row mt-1">
          <Campo label="Escala (0 a 10)" valor={f.escalaDor} />
          <Campo label="Local" valor={f.localDor} />
        </div>
      </Secao>

      <Secao titulo="13. Sistema respiratório">
        <Marcacoes
          itens={[
            { label: "Ventilação espontânea", marcado: f.ventilacaoEspontanea },
            { label: "Oxigenoterapia", marcado: f.oxigenoterapia },
            { label: "VM", marcado: f.vm },
            { label: "Traqueostomia", marcado: f.traqueostomia },
          ]}
        />
      </Secao>

      <Secao titulo="14. Sistema cardiovascular / perfusão">
        <Marcacoes
          itens={[
            { label: "Edema de MMII", marcado: f.edemaMMII },
            { label: "Hipoxemia", marcado: f.hipoxemia },
            { label: "IRpA", marcado: f.irpa },
            { label: "Cianose de extremidades", marcado: f.cianoseExtremidades },
            { label: "Baixa saturação", marcado: f.baixaSaturacao },
            { label: "Hipotensão", marcado: f.hipotensao },
            { label: "Uso de drogas vasoativas", marcado: f.usoDrogasVasoativas },
            { label: "Hipóxia", marcado: f.hipoxia },
            { label: "Hipovolemia", marcado: f.hipovolemia },
            { label: "Pele fria e úmida", marcado: f.peleFriaUmida },
          ]}
        />
      </Secao>

      <Secao titulo="15. Nutrição">
        <Marcacoes
          itens={[
            { label: "Nutrido", marcado: f.nutrido },
            { label: "Anemia", marcado: f.anemia },
            { label: "Emagrecido", marcado: f.emagrecido },
            { label: "Obeso", marcado: f.obeso },
            { label: "Caquético", marcado: f.caquetico },
          ]}
        />
        <div className="small text-muted mt-2 mb-1">15.1. Dieta</div>
        <Marcacoes
          itens={[
            { label: "VO", marcado: f.dietaVO },
            { label: "SNG", marcado: f.dietaSNG },
            { label: "SNE", marcado: f.dietaSNE },
            { label: "NPP/NPT", marcado: f.dietaNPPNPT },
            { label: "Gastrostomia", marcado: f.dietaGastrostomia },
          ]}
        />
        <div className="row mt-1">
          <Campo label="15.2. Avaliação nutricional" valor={nutricional === "—" ? "" : nutricional} />
        </div>
      </Secao>

      <Secao titulo="16. Avaliação de risco para lesão dos pés">
        <div className="table-responsive">
          <table className="table table-sm table-bordered mb-2">
            <thead>
              <tr>
                <th>Critério</th>
                <th>Pé direito</th>
                <th>Pé esquerdo</th>
              </tr>
            </thead>
            <tbody>
              {CRITERIOS_PE.map((criterio) => {
                const linha = f.pe[criterio.key];
                return (
                  <tr key={criterio.key}>
                    <td>
                      {criterio.grupo ? <div className="small text-muted">{criterio.grupo}</div> : null}
                      {criterio.label}
                    </td>
                    <td>{lado(linha?.direito ?? "")}</td>
                    <td>{lado(linha?.esquerdo ?? "")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="row">
          <Campo label="Classificação" valor={f.classificacao} />
          <Campo label="SINBAD" valor={f.sinbad} />
          <Campo label="ITB" valor={f.itb} />
        </div>
      </Secao>

      <Secao titulo="17. Características da lesão / ferida">
        <div className="row">
          <Campo label="Tipo de tecido" valor={f.tipoTecido} />
          <Campo label="Contaminação" valor={f.contaminacao} />
          <Campo label="Quantidade de exsudato" valor={f.qtdExsudato} />
          <Campo label="Característica do exsudato" valor={f.caracExsudato} />
          <Campo label="Odor do exsudato" valor={f.odorExsudato} />
          <Campo label="Bordas" valor={f.bordas} />
          <Campo label="Pele perilesional" valor={f.pelePerilesional} />
          <Campo label="Comprimento (cm)" valor={f.comprimento} />
          <Campo label="Altura (cm)" valor={f.alturaLesao} />
          <Campo label="Profundidade (cm)" valor={f.profundidade} />
          <Campo label="Escala PUSH" valor={f.escalaPush} />
        </div>
      </Secao>

      <Secao titulo="18. Diagnósticos e condutas">
        <div className="row">
          <Campo label="Diagnósticos de enfermagem" valor={f.diagEnfermagem} />
          <Campo label="Solução de limpeza" valor={f.solucaoLimpeza} />
          <Campo label="Cobertura primária" valor={f.coberturaPrimaria} />
          <Campo label="Cobertura secundária/terciária" valor={f.coberturaSecundaria} />
          <Campo label="Terapia compressiva" valor={f.terapiaCompressiva} />
          <Campo label="Terapia adjuvante" valor={f.terapiaAdjuvante} />
          <Campo label="Tempo de troca" valor={f.tempoTroca} />
          <Campo label="Evolução" valor={f.evolucao} />
          <Campo label="Planos de cuidado" valor={f.planosCuidado} />
          <Campo label="Próxima consulta" valor={f.proximaConsulta} />
        </div>
      </Secao>
    </div>
  );
}
