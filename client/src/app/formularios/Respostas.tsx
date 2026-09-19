// /app/formularios/respostas — lista e detalhe das respostas enviadas
// pelos formulários públicos (F6, Incremento A). Substitui
// views/respostas.ejs + public/js/respostas.js; os endpoints
// (/api/responses*) não mudam.
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, baixarArquivo, mensagemErro } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { useToast } from '@/hooks/useToast';
import { Botao, Cabecalho, Card, Carregando, EstadoVazio, Modal, fmtDataHora } from '@/componentes/ui';
import { RevisaoAvaliacao, RevisaoVisita, type DadosAvaliacao, type DadosVisita } from './RevisaoResposta';

type FormId = 'visitas' | 'avaliacao-substitutiva';
interface Resposta { id: string; submittedAt: string; data: DadosVisita | DadosAvaliacao }

const FORMULARIOS: { id: FormId; nome: string }[] = [
  { id: 'visitas', nome: 'Cadastro de visitas' },
  { id: 'avaliacao-substitutiva', nome: 'Avaliação substitutiva' }
];

function resumoResposta(formId: FormId, data: DadosVisita | DadosAvaliacao): { titulo: string; subtitulo: string } {
  if (formId === 'avaliacao-substitutiva') {
    const alunos = (data as DadosAvaliacao).alunos || [];
    const primeiro = alunos[0]?.nome || 'Sem nome';
    const extra = alunos.length > 1 ? ` (+${alunos.length - 1})` : '';
    const totalProvas = alunos.reduce((soma, a) => soma + (a.provas?.length || 0), 0);
    return { titulo: primeiro + extra, subtitulo: `${totalProvas} ${totalProvas === 1 ? 'avaliação solicitada' : 'avaliações solicitadas'}` };
  }
  const students = (data as DadosVisita).students || [];
  const primeiro = students[0]?.nome || 'Sem nome';
  const extra = students.length > 1 ? ` (+${students.length - 1})` : '';
  return { titulo: primeiro + extra, subtitulo: '' };
}

export function Respostas() {
  const [params, setParams] = useSearchParams();
  const formId: FormId = params.get('form') === 'avaliacao-substitutiva' ? 'avaliacao-substitutiva' : 'visitas';
  const toast = useToast();

  const url = useMemo(() => `/api/responses?form=${formId}`, [formId]);
  const { dados, carregando, erro } = useRecurso<Resposta[]>(url);

  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [baixandoPdf, setBaixandoPdf] = useState(false);
  const [enviandoWhatsapp, setEnviandoWhatsapp] = useState(false);
  const [anexosCarregando, setAnexosCarregando] = useState<Set<string>>(new Set());

  const respostaAberta = dados?.find(r => r.id === abertoId) || null;

  function trocarFormulario(novo: FormId) {
    const p = new URLSearchParams(params);
    p.set('form', novo);
    setParams(p);
    setAbertoId(null);
  }

  async function baixarPdf(resposta: Resposta) {
    setBaixandoPdf(true);
    try {
      await baixarArquivo(`/api/responses/${resposta.id}/pdf?form=${formId}`, `${formId}.pdf`);
    } catch (err) {
      toast.erro(mensagemErro(err, 'Não foi possível gerar o PDF.'));
    } finally {
      setBaixandoPdf(false);
    }
  }

  async function enviarWhatsapp(resposta: Resposta) {
    setEnviandoWhatsapp(true);
    try {
      await api.post(`/api/responses/${resposta.id}/whatsapp?form=${formId}`);
      toast.ok('Enviado por WhatsApp.');
    } catch (err) {
      toast.erro(mensagemErro(err, 'Não foi possível enviar pelo WhatsApp.'));
    } finally {
      setEnviandoWhatsapp(false);
    }
  }

  async function abrirAnexo(resposta: Resposta, provaId: string) {
    setAnexosCarregando(s => new Set(s).add(provaId));
    try {
      const r = await api.get<{ url: string }>(`/api/responses/${resposta.id}/anexo/${provaId}?form=avaliacao-substitutiva`);
      window.open(r.url, '_blank', 'noopener');
    } catch (err) {
      toast.erro(mensagemErro(err, 'Não foi possível abrir o anexo.'));
    } finally {
      setAnexosCarregando(s => { const n = new Set(s); n.delete(provaId); return n; });
    }
  }

  return (
    <div className="wrap">
      <Cabecalho titulo="Respostas" descricao="Formulários enviados pelo site público" />

      <div className="acoes" style={{ marginBottom: 16 }}>
        {FORMULARIOS.map(f => (
          <Botao key={f.id} variante={formId === f.id ? 'primario' : 'padrao'} onClick={() => trocarFormulario(f.id)}>{f.nome}</Botao>
        ))}
      </div>

      {carregando ? <Carregando texto="Carregando respostas…" /> : erro ? (
        <EstadoVazio icone="alerta" titulo="Não foi possível carregar as respostas" descricao={erro} />
      ) : !dados || dados.length === 0 ? (
        <EstadoVazio icone="documento" titulo="Nenhuma resposta enviada ainda" descricao="Assim que alguém enviar este formulário, a resposta aparece aqui." />
      ) : (
        <div className="grade g2">
          {dados.map(r => {
            const { titulo, subtitulo } = resumoResposta(formId, r.data);
            return (
              <Card key={r.id} titulo={titulo}
                descricao={subtitulo ? `${subtitulo} · Enviado em ${fmtDataHora(r.submittedAt)}` : `Enviado em ${fmtDataHora(r.submittedAt)}`}
                acoes={<Botao pequeno onClick={() => setAbertoId(r.id)}>Ver detalhes</Botao>} />
            );
          })}
        </div>
      )}

      <Modal aberto={!!respostaAberta} titulo="Detalhes da resposta"
        descricao={respostaAberta ? `Enviado em ${fmtDataHora(respostaAberta.submittedAt)}` : undefined}
        aoFechar={() => setAbertoId(null)} tamanho="lg"
        rodape={respostaAberta ? <>
          <Botao onClick={() => setAbertoId(null)}>Fechar</Botao>
          <Botao carregando={enviandoWhatsapp} onClick={() => enviarWhatsapp(respostaAberta)}>Enviar por WhatsApp</Botao>
          <Botao variante="primario" icone="documento" carregando={baixandoPdf} onClick={() => baixarPdf(respostaAberta)}>Baixar PDF</Botao>
        </> : null}>
        {respostaAberta ? (
          formId === 'avaliacao-substitutiva'
            ? <RevisaoAvaliacao data={respostaAberta.data as DadosAvaliacao} aoAbrirAnexo={provaId => abrirAnexo(respostaAberta, provaId)} carregandoAnexos={anexosCarregando} />
            : <RevisaoVisita data={respostaAberta.data as DadosVisita} />
        ) : null}
      </Modal>
    </div>
  );
}
