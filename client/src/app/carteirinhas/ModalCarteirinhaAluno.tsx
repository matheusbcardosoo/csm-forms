// Carteirinha pela ficha do aluno (RF-CART-11, §7.5). O cartão sempre
// pertence a um evento: o seletor pasta › subpasta define evento, turma,
// logo e validade. Saídas: baixar avulsa ou inscrever na subpasta.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, baixarArquivo, mensagemErro } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { useToast } from '@/hooks/useToast';
import { Aviso, Botao, CampoSelect, Carregando, EstadoVazio, Modal } from '@/componentes/ui';
import { PreviaTira } from '@/componentes/PreviaCarteirinhas';
import type { DocCarteirinhas, InscricaoDoAluno } from '@shared/types/carteirinha';

interface NoArvore { id: string; nome: string; validade: string | null; logo_evento_path: string | null; subpastas: { id: string; nome: string }[] }

export function ModalCarteirinhaAluno({ aberto, aluno, aoFechar }: { aberto: boolean; aluno: { id: string; nome: string }; aoFechar: () => void }) {
  const toast = useToast();
  const arvore = useRecurso<NoArvore[]>(aberto ? '/api/carteirinhas/arvore' : null);
  const inscricoes = useRecurso<InscricaoDoAluno[]>(aberto ? `/api/alunos/${aluno.id}/carteirinhas` : null);
  const [pastaId, setPastaId] = useState('');
  const [subpastaId, setSubpastaId] = useState('');
  const [ocupado, setOcupado] = useState<'baixar' | 'inscrever' | null>(null);

  // abre já na inscrição mais recente do aluno, se houver
  useEffect(() => {
    if (!aberto || !arvore.dados || pastaId) return;
    const ativa = (inscricoes.dados || []).find(i => !i.arquivada);
    if (ativa) { setPastaId(ativa.pasta_id); setSubpastaId(ativa.subpasta_id); }
  }, [aberto, arvore.dados, inscricoes.dados, pastaId]);
  useEffect(() => { if (!aberto) { setPastaId(''); setSubpastaId(''); } }, [aberto]);

  const pasta = useMemo(() => (arvore.dados || []).find(p => p.id === pastaId) || null, [arvore.dados, pastaId]);
  const previa = useRecurso<DocCarteirinhas>(aberto && subpastaId ? `/api/carteirinhas/subpastas/${subpastaId}/previa?doc=carteirinhas&alunos=${aluno.id}` : null);
  const jaInscrito = (inscricoes.dados || []).some(i => i.subpasta_id === subpastaId);
  const incompleta = !!pasta && (!pasta.validade || !pasta.logo_evento_path);

  async function baixar() {
    setOcupado('baixar');
    try { await baixarArquivo(`/api/alunos/${aluno.id}/carteirinha.pdf?subpasta=${subpastaId}`, 'carteirinha.pdf'); }
    catch (err) { toast.erro(mensagemErro(err)); }
    finally { setOcupado(null); }
  }

  async function inscrever() {
    setOcupado('inscrever');
    try {
      await api.post(`/api/carteirinhas/subpastas/${subpastaId}/inscritos`, { aluno_ids: [aluno.id] });
      toast.ok('Aluno inscrito na subpasta.');
      inscricoes.recarregar();
    } catch (err) { toast.erro(mensagemErro(err)); }
    finally { setOcupado(null); }
  }

  return (
    <Modal aberto={aberto} titulo={`Carteirinha · ${aluno.nome}`} tamanho="lg" aoFechar={aoFechar}
      descricao="Escolha o evento e a turma do evento: é o que sai no cartão."
      rodape={<>
        <Botao onClick={aoFechar}>Fechar</Botao>
        {subpastaId && !jaInscrito ? <Botao icone="mais" carregando={ocupado === 'inscrever'} onClick={inscrever}>Inscrever nesta subpasta</Botao> : null}
        <Botao variante="primario" icone="cartao" disabled={!subpastaId || incompleta} carregando={ocupado === 'baixar'} onClick={baixar}>Baixar avulsa</Botao>
      </>}>
      {arvore.carregando && !arvore.dados ? <Carregando /> : !arvore.dados?.length ? (
        <EstadoVazio icone="cartao" titulo="Nenhuma pasta de evento" descricao="A carteirinha pertence a um evento. Crie a pasta do evento e a subpasta da turma primeiro."
          acoes={<Link className="btn btn-1" to="/app/carteirinhas">Ir para Carteirinhas</Link>} />
      ) : (
        <>
          <div className="form-grade">
            <CampoSelect rotulo="Pasta (evento)" value={pastaId} onChange={e => { setPastaId(e.target.value); setSubpastaId(''); }}>
              <option value="">Escolha</option>
              {arvore.dados.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </CampoSelect>
            <CampoSelect rotulo="Subpasta (turma do evento)" value={subpastaId} disabled={!pasta} onChange={e => setSubpastaId(e.target.value)}>
              <option value="">{pasta && !pasta.subpastas.length ? 'A pasta não tem subpastas' : 'Escolha'}</option>
              {(pasta?.subpastas || []).map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </CampoSelect>
          </div>

          {incompleta ? <div style={{ marginTop: 12 }}><Aviso tipo="erro">A pasta está sem {[!pasta!.validade && 'validade', !pasta!.logo_evento_path && 'logo'].filter(Boolean).join(' e ')}. Complete-a em <Link to={`/app/carteirinhas/${pasta!.id}`}>Carteirinhas</Link> para emitir.</Aviso></div> : null}

          {subpastaId ? (
            <div style={{ marginTop: 14 }}>
              {previa.carregando && !previa.dados ? <Carregando /> : previa.dados ? <div className="previa-rolagem" style={{ display: 'flex', justifyContent: 'center' }}><PreviaTira doc={previa.dados} escala={0.95} /></div> : null}
              <p className="cel-sub" style={{ marginTop: 8, textAlign: 'center' }}>Frente à esquerda, verso à direita. O documento do cartão é o R.A.</p>
            </div>
          ) : null}

          <div style={{ marginTop: 14 }}>
            <b style={{ fontSize: 13 }}>Inscrito em:</b>{' '}
            {inscricoes.dados?.length
              ? inscricoes.dados.map((i, k) => <span key={i.subpasta_id}>{k ? ' · ' : ''}<Link to={`/app/carteirinhas/${i.pasta_id}/${i.subpasta_id}`}>{i.pasta} › {i.subpasta}</Link>{i.arquivada ? ' (arquivada)' : ''}</span>)
              : <span className="cel-sub">nenhuma subpasta</span>}
          </div>
        </>
      )}
    </Modal>
  );
}
