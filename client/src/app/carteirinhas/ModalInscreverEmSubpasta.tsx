// Inscrever alunos escolhidos na lista de alunos (RF-CART-10, §7.6):
// seletor pasta › subpasta, com criação rápida de subpasta.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, mensagemErro } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { useToast } from '@/hooks/useToast';
import { Botao, CampoSelect, CampoTexto, Carregando, EstadoVazio, Modal } from '@/componentes/ui';

interface NoArvore { id: string; nome: string; subpastas: { id: string; nome: string }[] }
const NOVA = '__nova__';

export function ModalInscreverEmSubpasta({ aberto, alunoIds, aoFechar, aoInscrever }: { aberto: boolean; alunoIds: string[]; aoFechar: () => void; aoInscrever: () => void }) {
  const toast = useToast();
  const arvore = useRecurso<NoArvore[]>(aberto ? '/api/carteirinhas/arvore' : null);
  const [pastaId, setPastaId] = useState('');
  const [subpastaId, setSubpastaId] = useState('');
  const [nomeNova, setNomeNova] = useState('');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { if (aberto) { setPastaId(''); setSubpastaId(''); setNomeNova(''); } }, [aberto]);
  const pasta = (arvore.dados || []).find(p => p.id === pastaId);

  async function inscrever() {
    setSalvando(true);
    try {
      let alvo = subpastaId;
      if (alvo === NOVA) alvo = (await api.post<{ id: string }>(`/api/carteirinhas/pastas/${pastaId}/subpastas`, { nome: nomeNova })).id;
      const r = await api.post<{ adicionados: number; ja_estavam: number }>(`/api/carteirinhas/subpastas/${alvo}/inscritos`, { aluno_ids: alunoIds });
      toast.ok(`${r.adicionados} aluno(s) inscrito(s)${r.ja_estavam ? ` · ${r.ja_estavam} já estavam` : ''}.`);
      aoInscrever();
    } catch (err) { toast.erro(mensagemErro(err)); }
    finally { setSalvando(false); }
  }

  const pronto = !!pastaId && !!subpastaId && (subpastaId !== NOVA || !!nomeNova.trim());
  return (
    <Modal aberto={aberto} tamanho="sm" titulo={`Inscrever ${alunoIds.length} aluno(s) em subpasta`} aoFechar={aoFechar}
      descricao="Quem já estiver na subpasta é ignorado."
      rodape={<><Botao onClick={aoFechar}>Cancelar</Botao><Botao variante="primario" icone="mais" disabled={!pronto} carregando={salvando} onClick={inscrever}>Inscrever</Botao></>}>
      {arvore.carregando && !arvore.dados ? <Carregando /> : !arvore.dados?.length ? (
        <EstadoVazio icone="cartao" titulo="Nenhuma pasta de evento" acoes={<Link className="btn btn-1" to="/app/carteirinhas">Criar pasta</Link>} />
      ) : (
        <div className="form-grade" style={{ gridTemplateColumns: '1fr' }}>
          <CampoSelect rotulo="Pasta (evento)" value={pastaId} onChange={e => { setPastaId(e.target.value); setSubpastaId(''); }}>
            <option value="">Escolha</option>
            {arvore.dados.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </CampoSelect>
          <CampoSelect rotulo="Subpasta" value={subpastaId} disabled={!pasta} onChange={e => setSubpastaId(e.target.value)}>
            <option value="">Escolha</option>
            {(pasta?.subpastas || []).map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
            <option value={NOVA}>+ Nova subpasta…</option>
          </CampoSelect>
          {subpastaId === NOVA ? <CampoTexto rotulo="Nome da nova subpasta" value={nomeNova} autoFocus placeholder="ex.: Sub 12 Vôlei" onChange={e => setNomeNova(e.target.value)} /> : null}
        </div>
      )}
    </Modal>
  );
}
