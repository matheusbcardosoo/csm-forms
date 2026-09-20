// Texto legal específico do formulário de avaliação substitutiva,
// transcrito (não reescrito) de views/form-avaliacao.ejs, linhas 115-202
// (modal-body com as 9 seções `policy-section`), envolto no PoliticaModal
// compartilhado.

import { PoliticaModal } from '../comum/PoliticaModal';

export function PoliticaAvaliacao({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  return (
    <PoliticaModal aberto={aberto} aoFechar={aoFechar} titulo="Política de Privacidade e Tratamento de Dados">
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
        Documento elaborado em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).
      </p>

      <section className="policy-section">
        <h3><i className="fa-solid fa-school"></i> 1. Quem somos</h3>
        <p>
          O <strong>Colégio São Marcos</strong> é o controlador dos dados pessoais coletados por meio deste
          formulário de requerimento de avaliação substitutiva.
        </p>
      </section>

      <section className="policy-section">
        <h3><i className="fa-solid fa-list-check"></i> 2. Quais dados coletamos</h3>
        <p>Ao preencher este formulário, coletamos, para cada aluno e cada avaliação informada:</p>
        <ul>
          <li><strong>Dados do aluno:</strong> nome completo e turma.</li>
          <li><strong>Dados de cada avaliação:</strong> disciplina, segmento e data da avaliação perdida.</li>
          <li><strong>Justificativa de cada ausência:</strong> motivo (médico ou outro) e observações opcionais.</li>
          <li><strong>Documento anexado a cada data de avaliação:</strong> atestado médico ou comprovante de pagamento da taxa de aplicação (um por data, mesmo que haja mais de uma avaliação no mesmo dia).</li>
        </ul>
      </section>

      <section className="policy-section">
        <h3><i className="fa-solid fa-bullseye"></i> 3. Para que usamos seus dados</h3>
        <p>Seus dados serão utilizados <strong>exclusivamente para processar este requerimento</strong>, incluindo:</p>
        <ul>
          <li>Encaminhamento de cada avaliação e do respectivo anexo à coordenação responsável pelo seu segmento.</li>
          <li>Organização e agendamento das avaliações substitutivas.</li>
          <li>Registro e arquivamento administrativo interno.</li>
        </ul>
        <p>Não utilizamos seus dados para fins comerciais, marketing de terceiros ou quaisquer outras finalidades além das listadas acima.</p>
      </section>

      <section className="policy-section">
        <h3><i className="fa-solid fa-scale-balanced"></i> 4. Base legal (LGPD)</h3>
        <p>O tratamento dos seus dados pessoais é fundamentado nas seguintes bases legais previstas no Art. 7º da Lei nº 13.709/2018:</p>
        <ul>
          <li><strong>Consentimento (inciso I):</strong> você autoriza expressamente o uso dos seus dados ao marcar a caixa de aceite no formulário.</li>
          <li><strong>Cumprimento de obrigação regulatória/contratual (incisos II e V):</strong> o tratamento é necessário para viabilizar as avaliações substitutivas previstas no regimento escolar.</li>
        </ul>
      </section>

      <section className="policy-section">
        <h3><i className="fa-solid fa-share-nodes"></i> 5. Compartilhamento de dados</h3>
        <p>
          Os dados e os documentos anexados de cada avaliação são compartilhados apenas com a coordenação
          responsável pelo respectivo segmento (Língua materna ou Língua inglesa), internamente ao Colégio São
          Marcos — cada coordenação recebe apenas as informações referentes às avaliações do seu segmento, não
          o requerimento completo. Não há compartilhamento com terceiros para fins comerciais.
        </p>
      </section>

      <section className="policy-section">
        <h3><i className="fa-solid fa-clock"></i> 6. Prazo de retenção</h3>
        <p>
          Seus dados serão mantidos pelo período necessário à conclusão do processo de avaliação substitutiva e,
          posteriormente, pelo prazo mínimo exigido pela legislação brasileira aplicável, sendo então eliminados
          ou anonimizados.
        </p>
      </section>

      <section className="policy-section">
        <h3><i className="fa-solid fa-shield-halved"></i> 7. Segurança dos dados</h3>
        <p>
          Adotamos medidas técnicas e administrativas adequadas para proteger seus dados e os documentos
          anexados contra acesso não autorizado, perda acidental, destruição ou divulgação indevida. O acesso
          às respostas é restrito por autenticação individual aos colaboradores autorizados.
        </p>
      </section>

      <section className="policy-section">
        <h3><i className="fa-solid fa-user-check"></i> 8. Seus direitos como titular</h3>
        <p>Em conformidade com a LGPD, você tem direito a acesso, correção, eliminação e portabilidade dos seus dados, além de poder revogar seu consentimento a qualquer momento, sem prejuízo ao tratamento já realizado.</p>
      </section>

      <section className="policy-section">
        <h3><i className="fa-solid fa-envelope"></i> 9. Contato</h3>
        <p>
          Para exercer seus direitos ou esclarecer dúvidas sobre o tratamento dos seus dados, entre em contato com a secretaria do Colégio São Marcos:
        </p>
        <ul>
          <li><strong>Endereço:</strong> Mogi das Cruzes — SP</li>
          <li><strong>E-mail:</strong> <a href="mailto:secretaria@saomarcos.com.br">secretaria@saomarcos.com.br</a></li>
        </ul>
      </section>
    </PoliticaModal>
  );
}
