// Texto legal específico do formulário de visita, transcrito (não
// reescrito) de views/form-visitas.ejs, linhas 233-329 (modal-body com as
// 9 seções `policy-section`), envolto no PoliticaModal compartilhado.

import { PoliticaModal } from '../comum/PoliticaModal';

export function PoliticaVisita({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  return (
    <PoliticaModal aberto={aberto} aoFechar={aoFechar} titulo="Política de Privacidade e Tratamento de Dados">
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
        Documento elaborado em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).
      </p>

      <section className="policy-section">
        <h3><i className="fa-solid fa-school"></i> 1. Quem somos</h3>
        <p>
          O <strong>Colégio São Marcos</strong> é o controlador dos dados pessoais coletados por meio deste formulário de visita.
          Somos uma instituição de ensino privada localizada em Mogi das Cruzes — SP, comprometida com a transparência
          e com o uso ético das informações que nos são confiadas.
        </p>
      </section>

      <section className="policy-section">
        <h3><i className="fa-solid fa-list-check"></i> 2. Quais dados coletamos</h3>
        <p>Ao preencher o formulário de visita, coletamos as seguintes informações:</p>
        <ul>
          <li><strong>Dados do aluno:</strong> nome completo, data de nascimento e turma de interesse.</li>
          <li><strong>Escola de origem:</strong> nome da instituição e cidade/estado.</li>
          <li><strong>Dados dos responsáveis:</strong> nome completo, número de WhatsApp e profissão (Responsável 1 e/ou Responsável 2).</li>
          <li><strong>Informações contextuais:</strong> motivo da visita, indicação de terceiros, bairro onde reside (opcional) e observações livres.</li>
        </ul>
      </section>

      <section className="policy-section">
        <h3><i className="fa-solid fa-bullseye"></i> 3. Para que usamos seus dados</h3>
        <p>Seus dados serão utilizados <strong>exclusivamente para finalidades administrativas internas</strong> do Colégio São Marcos, incluindo:</p>
        <ul>
          <li>Elaboração de relatórios internos de visitas e prospects.</li>
          <li>Preparação de documentos de solicitação de liberação de vaga.</li>
          <li>Elaboração de fichas e documentos para solicitação de desconto institucional.</li>
          <li>Contato pelos canais informados para dar continuidade ao processo de matrícula.</li>
          <li>Organização e controle interno do processo seletivo da instituição.</li>
        </ul>
        <p>Não utilizamos seus dados para fins comerciais, marketing de terceiros ou quaisquer outras finalidades além das listadas acima.</p>
      </section>

      <section className="policy-section">
        <h3><i className="fa-solid fa-scale-balanced"></i> 4. Base legal (LGPD)</h3>
        <p>O tratamento dos seus dados pessoais é fundamentado nas seguintes bases legais previstas no Art. 7º da Lei nº 13.709/2018:</p>
        <ul>
          <li><strong>Consentimento (inciso I):</strong> você autoriza expressamente o uso dos seus dados ao marcar a caixa de consentimento no formulário.</li>
          <li><strong>Legítimo interesse (inciso IX):</strong> o tratamento é necessário para a execução das atividades administrativas da instituição de ensino.</li>
        </ul>
      </section>

      <section className="policy-section">
        <h3><i className="fa-solid fa-share-nodes"></i> 5. Compartilhamento de dados</h3>
        <p>
          Os dados coletados <strong>não são compartilhados com terceiros</strong> para fins comerciais.
          O acesso é restrito aos colaboradores do Colégio São Marcos diretamente envolvidos no processo de matrícula e atendimento às famílias.
        </p>
      </section>

      <section className="policy-section">
        <h3><i className="fa-solid fa-clock"></i> 6. Prazo de retenção</h3>
        <p>
          Seus dados serão mantidos pelo período necessário à conclusão do processo de avaliação de matrícula e,
          posteriormente, pelo prazo mínimo exigido pela legislação brasileira aplicável.
          Após esse período, as informações serão eliminadas ou anonimizadas.
        </p>
      </section>

      <section className="policy-section">
        <h3><i className="fa-solid fa-shield-halved"></i> 7. Segurança dos dados</h3>
        <p>
          Adotamos medidas técnicas e administrativas adequadas para proteger seus dados contra acesso não autorizado,
          perda acidental, destruição ou divulgação indevida. O acesso às respostas do formulário é restrito
          por autenticação com senha individual aos colaboradores autorizados.
        </p>
      </section>

      <section className="policy-section">
        <h3><i className="fa-solid fa-user-check"></i> 8. Seus direitos como titular</h3>
        <p>Em conformidade com a LGPD, você tem direito a:</p>
        <ul>
          <li><strong>Acesso:</strong> saber quais dados seus estão armazenados.</li>
          <li><strong>Correção:</strong> solicitar a atualização de dados incorretos ou desatualizados.</li>
          <li><strong>Eliminação:</strong> pedir a exclusão dos seus dados, quando cabível.</li>
          <li><strong>Portabilidade:</strong> receber seus dados em formato estruturado.</li>
          <li><strong>Revogação do consentimento:</strong> retirar sua autorização a qualquer momento, sem prejuízo ao tratamento já realizado.</li>
        </ul>
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
        <p style={{ marginTop: 16, fontSize: 13, color: 'var(--text-muted)' }}>
          Esta política pode ser atualizada periodicamente. Recomendamos que você a consulte antes de preencher novos formulários.
        </p>
      </section>
    </PoliticaModal>
  );
}
