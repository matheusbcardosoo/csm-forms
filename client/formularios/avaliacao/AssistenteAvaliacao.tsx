// Orquestra os 2 passos, usando useAssistente(2). Monta o payload final
// (com fileToBase64) e envia pra POST /api/avaliacoes — porta
// collectData() + o nextBtn handler de wizard-avaliacao.js.

import { useState } from 'react';
import { useAssistente } from '@compartilhado/useAssistente';
import { StepperPublico } from '../comum/StepperPublico';
import { NavegacaoWizard } from '../comum/NavegacaoWizard';
import { TelaSucesso } from '../comum/TelaSucesso';
import { PoliticaAvaliacao } from './PoliticaAvaliacao';
import { PassoAlunosEProvas, novoAluno, validarPassoAlunos } from './PassoAlunosEProvas';
import { RevisaoAvaliacaoPublica } from './RevisaoAvaliacaoPublica';
import { fileToBase64 } from './arquivo';
import type { AlunoForm, AnexoPorData } from './tipos';

const PASSOS = [
  { icone: 'fa-user-graduate', nome: 'Alunos e Provas' },
  { icone: 'fa-clipboard-check', nome: 'Revisão' }
];

export function AssistenteAvaliacao() {
  const assistente = useAssistente(2);
  const [alunos, setAlunos] = useState<AlunoForm[]>([novoAluno()]);
  const [anexos, setAnexos] = useState<Map<string, AnexoPorData[]>>(new Map());
  const [erros, setErros] = useState<Set<string>>(new Set());
  const [consentimento, setConsentimento] = useState(false);
  const [consentInvalido, setConsentInvalido] = useState(false);
  const [politicaAberta, setPoliticaAberta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  async function aoClicarProximo() {
    if (assistente.passo === 1) {
      const errosPasso = validarPassoAlunos(alunos, anexos);
      setErros(errosPasso);
      if (errosPasso.size > 0) return;
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
      const alunosPayload = [];
      for (const aluno of alunos) {
        const provasPayload = [];
        for (const prova of aluno.provas) {
          const anexoDoDia = (anexos.get(aluno.id) || []).find(a => a.data === prova.data);
          const arquivo = anexoDoDia?.arquivoPreparado ?? null;
          const anexo = arquivo ? { nome: arquivo.name, tipo: arquivo.type, base64: await fileToBase64(arquivo) } : null;
          provasPayload.push({
            disciplina: prova.disciplina,
            segmento: prova.segmento,
            data: prova.data,
            motivo: { tipo: prova.motivo, observacoes: prova.observacoes },
            anexo
          });
        }
        alunosPayload.push({ nome: aluno.nome, turma: aluno.turma, provas: provasPayload });
      }

      const apiRes = await fetch('/api/avaliacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alunos: alunosPayload })
      });
      if (!apiRes.ok) {
        const errData = await apiRes.json();
        throw new Error(errData.error || 'Erro ao enviar requerimento.');
      }
      setEnviado(true);
    } catch (err) {
      setErroEnvio(err instanceof Error ? err.message : 'Não foi possível enviar o requerimento. Verifique sua conexão e tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <main className="page">
        <div className="wizard-card">
          <Cabecalho />
          <TelaSucesso titulo="Requerimento enviado!" descricao="Recebemos seu requerimento de avaliação substitutiva. As coordenações responsáveis foram notificadas e entrarão em contato se necessário." />
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="wizard-card">
        <Cabecalho />
        <StepperPublico passos={PASSOS} passoAtual={assistente.passo} mostrarLabelPasso />

        <form noValidate onSubmit={e => e.preventDefault()}>
          {assistente.passo === 1 && (
            <section className="wizard-step" data-step="1">
              <h2 className="wizard-title">Alunos e avaliações perdidas</h2>
              <p className="wizard-desc">Informe os dados de cada aluno e, para cada um, adicione as avaliações que ele perdeu — com a disciplina, o segmento, a data e o motivo de cada uma. Se mais de um filho precisa de avaliação substitutiva, adicione quantos alunos forem necessários.</p>
              <PassoAlunosEProvas alunos={alunos} setAlunos={setAlunos} anexos={anexos} setAnexos={setAnexos} erros={erros} />
            </section>
          )}

          {assistente.passo === 2 && (
            <section className="wizard-step" data-step="2">
              <h2 className="wizard-title">Revise seu requerimento</h2>
              <p className="wizard-desc">Confira se está tudo certo, incluindo os documentos anexados, antes de enviar.</p>
              <RevisaoAvaliacaoPublica alunos={alunos} anexosPorAlunoEData={anexos} />

              <div className={`field-group consent-group${consentInvalido ? ' invalid' : ''}`}>
                <label className="consent-label">
                  <input type="checkbox" checked={consentimento} onChange={e => { setConsentimento(e.target.checked); if (e.target.checked) setConsentInvalido(false); }} />
                  <span>
                    Li e concordo com a <a href="#" className="policy-link" onClick={e => { e.preventDefault(); setPoliticaAberta(true); }}>Política de Privacidade</a> do
                    Colégio São Marcos, autorizo o uso dos meus dados pessoais exclusivamente para o processamento deste requerimento, e declaro que as informações
                    prestadas e os documentos anexados (atestados médicos e/ou comprovantes de pagamento) são verdadeiros, estando ciente de que a veracidade poderá
                    ser verificada pelas coordenações.
                  </span>
                </label>
                <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> É necessário aceitar os termos para enviar o requerimento.</div>
              </div>

              {erroEnvio && (
                <div className="error-banner">
                  <i className="fa-solid fa-triangle-exclamation"></i>
                  <span>Não foi possível enviar o requerimento: {erroEnvio}</span>
                </div>
              )}
            </section>
          )}

          <NavegacaoWizard
            podeVoltar={assistente.podeVoltar}
            aoVoltar={assistente.voltar}
            rotuloProximo={assistente.passo === 2 ? 'Enviar' : 'Próximo'}
            carregando={enviando}
            aoProximo={aoClicarProximo}
          />
        </form>
      </div>

      <PoliticaAvaliacao aberto={politicaAberta} aoFechar={() => setPoliticaAberta(false)} />
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
