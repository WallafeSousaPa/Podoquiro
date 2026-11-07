import {
  formatarDataContrato,
  type ContratoEnfermagem,
} from "@/lib/enfermagem/contrato";

function valor(texto: string): string {
  const t = texto.trim();
  return t || "—";
}

function rubrica(src: string | undefined): string {
  return src && src.startsWith("data:image/jpeg;base64,") ? src : "";
}

export function ContratoDocumento({ dados }: { dados: ContratoEnfermagem }) {
  const cidadeUf = [dados.paciente_cidade, dados.paciente_uf].filter((p) => p.trim()).join(" – ");
  return (
    <article className="contrato-doc">
      <h2>Contrato particular de prestação de serviços</h2>
      <p>
        Pelo presente instrumento particular de Contrato de Prestação de Serviços de Enfermagem, de um
        lado, Sra <strong className="contrato-valor">{valor(dados.enfermeira_nome)}</strong>, situada
        em <strong className="contrato-valor">{valor(dados.enfermeira_endereco)}</strong>, portadora do
        CPF nº <strong className="contrato-valor">{valor(dados.enfermeira_cpf)}</strong>, doravante
        designada ENFERMEIRA e, de outro lado, Sra.{" "}
        <strong className="contrato-valor">{valor(dados.paciente_nome)}</strong>, estado civil{" "}
        <strong className="contrato-valor">{valor(dados.paciente_estado_civil)}</strong>, profissão{" "}
        <strong className="contrato-valor">{valor(dados.paciente_profissao)}</strong>, residente na Rua{" "}
        <strong className="contrato-valor">{valor(dados.paciente_rua)}</strong>, Bairro{" "}
        <strong className="contrato-valor">{valor(dados.paciente_bairro)}</strong>, Cidade – UF{" "}
        <strong className="contrato-valor">{valor(cidadeUf)}</strong>, portadora do CPF nº{" "}
        <strong className="contrato-valor">{valor(dados.paciente_cpf)}</strong>, doravante designada
        simplesmente PACIENTE, têm entre si justo e contratado, na melhor forma do direito, o abaixo
        clausulado:
      </p>

      <h3>Cláusula 1ª</h3>
      <p>
        O ENFERMEIRO obriga-se a prestar seus serviços profissionais ao PACIENTE, devendo
        desincumbir-se com zelo das atividades a seu cargo, desempenhando as seguintes tarefas:
      </p>
      <ul>
        <li>Realização de avaliação de lesões de pele de várias etiologias;</li>
        <li>Realização de limpeza e preparo do leito da ferida;</li>
        <li>Realização de prescrição de curativos especiais para o tratamento da ferida;</li>
        <li>Encaminhamento para avaliação de outros profissionais da área de saúde.</li>
      </ul>

      <h3>Cláusula 2ª</h3>
      <p>
        O ENFERMEIRO fará os curativos de acordo com a análise da primeira consulta, com duração a ser
        determinada de acordo com o tipo de lesão, nos horários e dias da semana a combinar.
      </p>

      <h3>Cláusula 3ª</h3>
      <p>
        O PACIENTE pagará ao ENFERMEIRO o valor de R${" "}
        <strong className="contrato-valor">{valor(dados.valor_primeira_consulta)}</strong> (reais) na
        primeira consulta.
      </p>

      <h3>Cláusula 4ª</h3>
      <p>
        O PACIENTE pagará ao ENFERMEIRO o valor de R${" "}
        <strong className="contrato-valor">{valor(dados.valor_pacote)}</strong> (reais) por pacote a
        cada 5 curativos.
      </p>

      <h3>Cláusula 5ª</h3>
      <p>
        O presente contrato terá a duração de 1 ano, a começar em{" "}
        <strong className="contrato-valor">{formatarDataContrato(dados.data_inicio) || "—"}</strong> e
        terminar em{" "}
        <strong className="contrato-valor">{formatarDataContrato(dados.data_fim) || "—"}</strong>.
      </p>

      <h3>Cláusula 6ª</h3>
      <p>
        Ficará a cargo do PACIENTE algum material exigido para a realização dos curativos, como
        coberturas e curativos especiais, ficando por conta do ENFERMEIRO os instrumentos, equipamentos
        e materiais de rotina para exercício do encargo.
      </p>

      <h3>Cláusula 7ª</h3>
      <p>
        Este contrato se dissolverá, de pleno direito, caso haja suspensão do referido tratamento pelo
        ENFERMEIRO responsável.
      </p>

      <h3>Cláusula 8ª</h3>
      <p>
        Fica eleito o foro desta cidade de Ilhéus para dirimir quaisquer dúvidas referentes a este
        contrato, renunciando-se expressamente a qualquer outro por mais privilegiado que seja ou possa
        vir a ser.
      </p>

      <p>
        E assim, por estarem justos e contratados na forma acima, assinam o presente contrato em duas
        vias de igual teor e forma, que a tudo assistiram e conhecimento tiveram.
      </p>

      <p className="contrato-local">
        {valor(dados.local_assinatura)}, {formatarDataContrato(dados.data_assinatura) || "—"}
      </p>

      <div className="contrato-assinaturas">
        <div>
          <Rubrica imagem={rubrica(dados.assinatura_enfermeira)} alt="Assinatura da enfermeira" />
          <div className="contrato-linha" />
          <div className="contrato-papel">Nome completo da enfermeira</div>
          <strong>{valor(dados.enfermeira_nome)}</strong>
        </div>
        <div>
          <Rubrica imagem={rubrica(dados.assinatura_paciente)} alt="Assinatura do paciente" />
          <div className="contrato-linha" />
          <div className="contrato-papel">Nome completo do paciente</div>
          <strong>{valor(dados.paciente_nome)}</strong>
        </div>
      </div>
    </article>
  );
}

function Rubrica({ imagem, alt }: { imagem: string; alt: string }) {
  return (
    <div className="contrato-rubrica">
      {imagem ? <img src={imagem} alt={alt} /> : null}
    </div>
  );
}
