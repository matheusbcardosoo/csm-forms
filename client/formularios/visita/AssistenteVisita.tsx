import { useState } from 'react';
import { useAssistente } from '@compartilhado/useAssistente';
import { StepperPublico } from '../comum/StepperPublico';
import { NavegacaoWizard } from '../comum/NavegacaoWizard';
import { TelaSucesso } from '../comum/TelaSucesso';
import { PoliticaVisita } from './PoliticaVisita';
import { PassoAluno, novoAlunoVisita, validarPassoAluno } from './PassoAluno';
import { PassoEscola } from './PassoEscola';
import { PassoResponsaveis, validarPassoResponsaveis, type ResponsavelForm } from './PassoResponsaveis';
import { PassoComplementares, validarPassoComplementares, type ExtrasForm } from './PassoComplementares';
import { RevisaoVisitaPublica } from './RevisaoVisitaPublica';
import type { AlunoVisitaForm } from './tipos';

const PASSOS = [
  { icone: 'fa-user-graduate', nome: 'Aluno' },
  { icone: 'fa-school', nome: 'Escola' },
  { icone: 'fa-people-roof', nome: 'Responsáveis' },
  { icone: 'fa-comment-dots', nome: 'Extras' },
  { icone: 'fa-clipboard-check', nome: 'Revisão' }
];

const RESPONSAVEL_VAZIO: ResponsavelForm = { nome: '', whatsapp: '', profissao: '' };
const EXTRAS_VAZIO: ExtrasForm = { bairro: '', motivo: '', indicado: null, indicacaoNome: '', observacoes: '' };

export function AssistenteVisita() {
  const assistente = useAssistente(5);
  const [alunos, setAlunos] = useState<AlunoVisitaForm[]>([novoAlunoVisita()]);
  const [escolaNome, setEscolaNome] = useState('');
  const [escolaCidade, setEscolaCidade] = useState('');
  const [pai, setPai] = useState<ResponsavelForm>(RESPONSAVEL_VAZIO);
  const [mae, setMae] = useState<ResponsavelForm>(RESPONSAVEL_VAZIO);
  const [extras, setExtras] = useState<ExtrasForm>(EXTRAS_VAZIO);
  const [erros, setErros] = useState<Set<string>>(new Set());
  const [nenhumResponsavel, setNenhumResponsavel] = useState(false);
  const [consentimento, setConsentimento] = useState(false);
  const [consentInvalido, setConsentInvalido] = useState(false);
  const [politicaAberta, setPoliticaAberta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  function validarPassoAtual(): boolean {
    if (assistente.passo === 1) {
      const e = validarPassoAluno(alunos);
      setErros(e);
      return e.size === 0;
    }
    if (assistente.passo === 2) {
      const e = new Set<string>();
      if (!escolaNome.trim()) e.add('escola-nome');
      if (!escolaCidade.trim()) e.add('escola-cidade');
      setErros(e);
      return e.size === 0;
    }
    if (assistente.passo === 3) {
      const { chaves, nenhumPreenchido } = validarPassoResponsaveis(pai, mae);
      setErros(chaves);
      setNenhumResponsavel(nenhumPreenchido);
      return chaves.size === 0 && !nenhumPreenchido;
    }
    if (assistente.passo === 4) {
      const e = validarPassoComplementares(extras);
      setErros(e);
      return e.size === 0;
    }
    return true;
  }

  async function aoClicarProximo() {
    if (assistente.passo < 5) {
      if (!validarPassoAtual()) return;
      assistente.avancar();
      return;
    }

    if (!consentimento) {
      setConsentInvalido(true);
      return;
    }

    setEnviando(true);
    setErroEnvio(null);
    try {
      const payload = {
        students: alunos.map(a => ({ nome: a.nome, nascimento: a.nascimento, turma: a.turma })),
        escola: { nome: escolaNome, cidadeEstado: escolaCidade },
        responsaveis: { pai, mae },
        extras: {
          bairro: extras.bairro, motivo: extras.motivo, indicado: extras.indicado,
          indicacaoNome: extras.indicado === 'sim' ? extras.indicacaoNome : '',
          observacoes: extras.observacoes
        }
      };
      const apiRes = await fetch('/api/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!apiRes.ok) {
        const errData = await apiRes.json();
        throw new Error(errData.error || 'Erro ao enviar formulario.');
      }
      setEnviado(true);
    } catch (err) {
      setErroEnvio(err instanceof Error ? err.message : 'Não foi possível enviar o formulário. Verifique sua conexão e tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <main className="page">
        <div className="wizard-card">
          <Cabecalho />
          <TelaSucesso titulo="Formulário enviado!" descricao="Recebemos os dados da visita com sucesso. Em breve nossa equipe entrará em contato." />
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="wizard-card">
        <Cabecalho />
        <StepperPublico passos={PASSOS} passoAtual={assistente.passo} />

        <form noValidate onSubmit={e => e.preventDefault()}>
          {assistente.passo === 1 && (
            <section className="wizard-step" data-step="1">
              <h2 className="wizard-title">Dados do aluno</h2>
              <p className="wizard-desc">Informe os dados do aluno interessado na vaga. Você pode adicionar mais de um aluno, se necessário.</p>
              <PassoAluno alunos={alunos} setAlunos={setAlunos} erros={erros} />
            </section>
          )}

          {assistente.passo === 2 && (
            <section className="wizard-step" data-step="2">
              <h2 className="wizard-title">Escola de origem</h2>
              <p className="wizard-desc">Dados da escola em que o aluno está matriculado atualmente.</p>
              <PassoEscola nome={escolaNome} setNome={setEscolaNome} cidade={escolaCidade} setCidade={setEscolaCidade} erros={erros} />
            </section>
          )}

          {assistente.passo === 3 && (
            <section className="wizard-step" data-step="3">
              <h2 className="wizard-title">Dados dos responsáveis</h2>
              <p className="wizard-desc">Informe os dados de contato dos responsáveis.</p>
              <PassoResponsaveis pai={pai} setPai={setPai} mae={mae} setMae={setMae} erros={erros} nenhumPreenchido={nenhumResponsavel} />
            </section>
          )}

          {assistente.passo === 4 && (
            <section className="wizard-step" data-step="4">
              <h2 className="wizard-title">Informações complementares</h2>
              <p className="wizard-desc">Nos ajude a entender melhor o seu contexto.</p>
              <PassoComplementares extras={extras} setExtras={setExtras} erros={erros} />
            </section>
          )}

          {assistente.passo === 5 && (
            <section className="wizard-step" data-step="5">
              <h2 className="wizard-title">Revise suas respostas</h2>
              <p className="wizard-desc">Confira se está tudo certo antes de enviar.</p>
              <RevisaoVisitaPublica alunos={alunos} escolaNome={escolaNome} escolaCidade={escolaCidade} pai={pai} mae={mae} extras={extras} />

              <div className={`field-group consent-group${consentInvalido ? ' invalid' : ''}`}>
                <label className="consent-label">
                  <input type="checkbox" checked={consentimento} onChange={e => { setConsentimento(e.target.checked); if (e.target.checked) setConsentInvalido(false); }} />
                  <span>
                    Li e concordo com a <a href="#" className="policy-link" onClick={e => { e.preventDefault(); setPoliticaAberta(true); }}>Política de Privacidade</a> do
                    Colégio São Marcos e autorizo o uso dos meus dados pessoais exclusivamente para fins administrativos internos da instituição, como elaboração de
                    relatórios, solicitações de vaga e documentos institucionais.
                  </span>
                </label>
                <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> É necessário aceitar a política de privacidade para enviar o formulário.</div>
              </div>

              {erroEnvio && (
                <div className="error-banner">
                  <i className="fa-solid fa-triangle-exclamation"></i>
                  <span>Não foi possível enviar o formulário: {erroEnvio}</span>
                </div>
              )}
            </section>
          )}

          <NavegacaoWizard
            podeVoltar={assistente.podeVoltar}
            aoVoltar={assistente.voltar}
            rotuloProximo={assistente.passo === 5 ? 'Enviar' : 'Próximo'}
            carregando={enviando}
            aoProximo={aoClicarProximo}
          />
        </form>
      </div>

      <PoliticaVisita aberto={politicaAberta} aoFechar={() => setPoliticaAberta(false)} />
    </main>
  );
}

function Cabecalho() {
  return (
    <div style={{ textAlign: 'center', marginBottom: 20, alignItems: 'center', display: 'flex', justifyContent: 'center' }}>
      <img src="/images/logo.jpg" alt="Logotipo do Colégio São Marcos" className="header-logo" />
    </div>
  );
}
