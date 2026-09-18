// /app/config/signatarios (RF-INST-05): nome, cargo, RG, registro do
// secretário escolar e assinatura digitalizada.
import { useEffect, useState } from 'react';
import { api, ErroApi, mensagemErro, type CampoInvalido } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { useSessao } from '@/hooks/useSessao';
import { useToast } from '@/hooks/useToast';
import { Aviso, Botao, Cabecalho, CampoCheck, CampoSelect, CampoTexto, Card, Carregando, Confirmar, EstadoVazio, Modal, Tabela, Tag } from '@/componentes/ui';
import { Icone } from '@/componentes/Icones';
import { ROTULO_CARGO, type CargoSignatario, type Signatario } from '@shared/types/instituicao';

interface Resposta { signatarios: Signatario[] }
type Form = Partial<Signatario> & { arquivo?: File | null };

const NOVO: Form = { nome: '', cargo: 'diretor', cargo_impresso: 'Diretor(a)', rg: '', registro_autorizacao: '', ativo: true };
const SUGESTAO_CARGO: Record<CargoSignatario, string> = { diretor: 'Diretor(a)', vice_diretor: 'Vice-diretor(a)', secretario: 'Secretário(a)' };

export function Signatarios() {
  const { ehAdmin } = useSessao();
  const toast = useToast();
  const { dados, carregando, erro, recarregar } = useRecurso<Resposta>('/api/instituicao');
  const [editando, setEditando] = useState<Form | null>(null);
  const [campos, setCampos] = useState<CampoInvalido[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [excluir, setExcluir] = useState<Signatario | null>(null);

  const lista = [...(dados?.signatarios || [])].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));

  async function salvar() {
    if (!editando) return;
    setSalvando(true); setCampos([]);
    try {
      const { arquivo, ...corpo } = editando;
      const salvo = editando.id
        ? await api.put<Signatario>(`/api/instituicao/signatarios/${editando.id}`, corpo)
        : await api.post<Signatario>('/api/instituicao/signatarios', corpo);
      if (arquivo) {
        const base64 = await lerBase64(arquivo);
        await api.post(`/api/instituicao/signatarios/${salvo.id}/assinatura`, { nome: arquivo.name, tipo: arquivo.type, base64 });
      }
      toast.ok('Signatário salvo.');
      setEditando(null);
      recarregar();
    } catch (err) {
      if (err instanceof ErroApi && err.campos.length) setCampos(err.campos);
      toast.erro(mensagemErro(err));
    } finally { setSalvando(false); }
  }

  async function confirmarExclusao() {
    if (!excluir) return;
    setSalvando(true);
    try { await api.del(`/api/instituicao/signatarios/${excluir.id}`); toast.ok('Signatário removido.'); setExcluir(null); recarregar(); }
    catch (err) { toast.erro(mensagemErro(err)); }
    finally { setSalvando(false); }
  }

  const def = (k: keyof Signatario) => (e: { target: { value: string } }) => setEditando(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="wrap">
      <Cabecalho titulo="Signatários" descricao="Quem assina o histórico: diretor(a) e secretário(a) escolar, com RG e assinatura digitalizada"
        acoes={ehAdmin ? <Botao variante="primario" icone="mais" onClick={() => { setEditando({ ...NOVO }); setCampos([]); }}>Adicionar signatário</Botao> : undefined} />
      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      <Card semCorpo rodape={<span>No documento saem <b>nome · cargo · R.G.</b>, em duas colunas (secretário(a) à esquerda, diretor(a) à direita). O cargo impresso é livre para respeitar o gênero: "Diretora", "Secretária".</span>}>
        {carregando && !dados ? <Carregando /> : (
          <Tabela<Signatario>
            linhas={lista}
            chave={s => s.id}
            classeLinha={s => s.ativo ? undefined : 'linha-inativa'}
            vazio={<EstadoVazio icone="assinatura" titulo="Nenhum signatário" descricao="O histórico exige ao menos um(a) diretor(a) e um(a) secretário(a) escolar ativos." acoes={ehAdmin ? <Botao variante="primario" icone="mais" onClick={() => setEditando({ ...NOVO })}>Adicionar</Botao> : undefined} />}
            colunas={[
              { chave: 'nome', rotulo: 'Nome', principal: true, render: s => <><span className="nome-cel">{s.nome}</span><span className="sub">{s.cargo_impresso} · {ROTULO_CARGO[s.cargo]}</span></> },
              { chave: 'rg', rotulo: 'R.G.', render: s => s.rg || '—' },
              { chave: 'reg', rotulo: 'Registro', render: s => s.registro_autorizacao || '—' },
              { chave: 'ass', rotulo: 'Assinatura', render: s => s.assinatura_path ? <Assinatura caminho={s.assinatura_path} /> : <Tag>Pendente</Tag> },
              { chave: 'status', rotulo: 'Status', render: s => s.ativo ? <Tag tipo="ok" ponto>Ativo</Tag> : <Tag ponto>Inativo</Tag> },
              { chave: 'acoes', rotulo: 'Ações', acoes: true, render: s => ehAdmin ? <>
                <Botao pequeno onClick={() => { setEditando({ ...s }); setCampos([]); }}>Editar</Botao>
                <Botao pequeno variante="perigo" className="btn-ico" aria-label="Remover" onClick={() => setExcluir(s)}><Icone nome="lixeira" /></Botao>
              </> : null }
            ]}
          />
        )}
      </Card>

      <Modal aberto={!!editando} titulo={editando?.id ? 'Editar signatário' : 'Novo signatário'} aoFechar={() => setEditando(null)}
        rodape={<><Botao onClick={() => setEditando(null)}>Cancelar</Botao><Botao variante="primario" carregando={salvando} onClick={salvar} icone="check">Salvar</Botao></>}>
        {editando ? (
          <div className="form-grade">
            <CampoTexto className="col-2" rotulo="Nome completo" name="nome" value={editando.nome || ''} onChange={def('nome')} erros={campos} obrigatorio autoFocus />
            <CampoSelect rotulo="Função" name="cargo" value={editando.cargo || 'diretor'} erros={campos}
              onChange={e => { const c = e.target.value as CargoSignatario; setEditando(f => ({ ...f, cargo: c, cargo_impresso: f?.id ? f.cargo_impresso : SUGESTAO_CARGO[c] })); }}>
              {(Object.keys(ROTULO_CARGO) as CargoSignatario[]).map(c => <option key={c} value={c}>{ROTULO_CARGO[c]}</option>)}
            </CampoSelect>
            <CampoTexto rotulo="Cargo impresso" name="cargo_impresso" placeholder="Diretora · Secretária" value={editando.cargo_impresso || ''} onChange={def('cargo_impresso')} erros={campos} obrigatorio />
            <CampoTexto rotulo="R.G." name="rg" value={editando.rg || ''} onChange={def('rg')} erros={campos} />
            <CampoTexto rotulo={<>Nº de registro/autorização <small>— secretário escolar</small></>} name="registro_autorizacao" value={editando.registro_autorizacao || ''} onChange={def('registro_autorizacao')} erros={campos} />
            <div className="campo col-2">
              <label htmlFor="assinatura-arquivo">Assinatura digitalizada <small>— PNG, JPG ou WebP até 2 MB</small></label>
              <input id="assinatura-arquivo" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setEditando(f => ({ ...f, arquivo: e.target.files?.[0] || null }))} />
              {editando.assinatura_path && !editando.arquivo ? <div className="dica">Já existe uma assinatura enviada. Escolher um arquivo substitui.</div> : null}
            </div>
            <div className="col-2"><CampoCheck rotulo="Ativo (disponível para assinar documentos)" checked={editando.ativo !== false} onChange={e => setEditando(f => ({ ...f, ativo: e.target.checked }))} /></div>
          </div>
        ) : null}
      </Modal>

      <Confirmar aberto={!!excluir} titulo="Remover signatário?" descricao={excluir ? `${excluir.nome} deixa de estar disponível. Documentos já emitidos não mudam. Se a pessoa saiu do cargo, prefira desmarcar "Ativo".` : ''}
        rotuloConfirmar="Remover" perigo carregando={salvando} aoFechar={() => setExcluir(null)} aoConfirmar={confirmarExclusao} />
    </div>
  );
}

function Assinatura({ caminho }: { caminho: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    api.get<{ url: string }>(`/api/instituicao/arquivo?caminho=${encodeURIComponent(caminho)}`).then(r => { if (vivo) setUrl(r.url); }).catch(() => {});
    return () => { vivo = false; };
  }, [caminho]);
  return url ? <img src={url} alt="Assinatura" style={{ maxHeight: 34, maxWidth: 140, background: '#fff', borderRadius: 4, padding: 2, border: '1px solid var(--linha)' }} /> : <Tag tipo="ok">Enviada</Tag>;
}

function lerBase64(arquivo: File): Promise<string> {
  return new Promise((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1] || '');
    r.onerror = () => falha(new Error('Não foi possível ler o arquivo.'));
    r.readAsDataURL(arquivo);
  });
}
