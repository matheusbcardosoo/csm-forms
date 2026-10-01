// Peças compartilhadas pelas telas de carteirinhas (08-carteirinhas §7).
import { useEffect, useLayoutEffect, useState, type ReactNode, type RefObject } from 'react';
import { api, baixarArquivo, ErroApi, mensagemErro, type CampoInvalido } from '@/api/cliente';
import { useToast } from '@/hooks/useToast';
import { Aviso, Botao, CampoArea, CampoTexto, Modal, Tag } from '@/componentes/ui';
import { Icone } from '@/componentes/Icones';
import { PreviaTira } from '@/componentes/PreviaCarteirinhas';
import { prepararLogo, type ImagemPronta } from '@/compartilhado/imagem';
import type { CarteirinhaPasta, Contadores, DocCarteirinhas } from '@shared/types/carteirinha';

export const urlLogoPasta = (p: Pick<CarteirinhaPasta, 'id' | 'logo_evento_path' | 'atualizado_em'>) =>
  p.logo_evento_path ? `/api/carteirinhas/pastas/${p.id}/logo?v=${encodeURIComponent(p.atualizado_em)}` : null;

export function fmtValidade(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/** Escala que faz uma folha de `larguraMm` caber na largura do contêiner. */
export function useEscalaParaCaber(ref: RefObject<HTMLElement | null>, larguraMm: number, maximo = 1): number {
  const [escala, setEscala] = useState(0.5);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => {
      const px = larguraMm * 96 / 25.4;
      setEscala(Math.max(0.2, Math.min(maximo, (el.clientWidth - 8) / px)));
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, larguraMm, maximo]);
  return escala;
}

/** Pendências da conferência (RF-CART-07): não bloqueiam, só avisam. */
export function TagsPendencias({ c, vazioOk = true }: { c: Contadores; vazioOk?: boolean }) {
  const itens = [
    c.sem_foto ? <Tag key="f" tipo="aviso" ponto>{c.sem_foto} sem foto</Tag> : null,
    c.sem_ra ? <Tag key="r" tipo="aviso" ponto>{c.sem_ra} sem R.A.</Tag> : null,
    c.sem_nascimento ? <Tag key="n" tipo="aviso" ponto>{c.sem_nascimento} sem nascimento</Tag> : null
  ].filter(Boolean);
  if (itens.length) return <span className="tags" style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>{itens}</span>;
  if (!c.inscritos) return <span className="cel-sub">sem inscritos</span>;
  return vazioOk ? <Tag tipo="ok" ponto>pronta</Tag> : null;
}

/**
 * Confirmação antes de baixar (§7.4): lembra o tamanho real — a impressora
 * que "ajusta à página" encolhe o cartão e tira a dobra do meio.
 */
export function ModalImprimir({ aberto, documento, aoFechar, url, nomeArquivo, extra, aoBaixar }: {
  aberto: boolean; documento: 'carteirinhas' | 'ficha' | 'zip'; aoFechar: () => void; url: string; nomeArquivo: string; extra?: ReactNode; aoBaixar?: () => void;
}) {
  const toast = useToast();
  const [baixando, setBaixando] = useState(false);
  async function baixar() {
    setBaixando(true);
    try { await baixarArquivo(url, nomeArquivo); aoFechar(); aoBaixar?.(); }
    catch (err) { toast.erro(mensagemErro(err)); }
    finally { setBaixando(false); }
  }
  const titulo = documento === 'ficha' ? 'Baixar a ficha de inscrição' : documento === 'zip' ? 'Baixar as carteirinhas da pasta' : 'Baixar as carteirinhas';
  return (
    <Modal aberto={aberto} titulo={titulo} aoFechar={aoFechar} tamanho="sm"
      rodape={<><Botao onClick={aoFechar}>Cancelar</Botao><Botao variante="primario" icone="documento" carregando={baixando} onClick={baixar}>Baixar {documento === 'zip' ? 'ZIP' : 'PDF'}</Botao></>}>
      <Aviso tipo="aviso"><b>Imprima em tamanho real (100%).</b> Desmarque “ajustar à página” na janela de impressão{documento === 'ficha' ? '' : ': com o ajuste, o cartão encolhe e a dobra sai fora do meio'}.</Aviso>
      {documento === 'ficha' ? (
        <p className="cel-sub" style={{ marginTop: 10, fontSize: 13 }}>A ficha sai com o <b>R.A.</b> e a data de nascimento de cada aluno, para a direção atestar. É documento de controle: guarde a via assinada na secretaria.</p>
      ) : (
        <ol className="passos">
          <li>Recorte cada tira inteira pelas marcas dos cantos (frente e verso juntos).</li>
          <li>Dobre na linha tracejada do meio, com o verso para trás.</li>
          <li>Plastifique, se quiser, e coloque no porta-crachá.</li>
        </ol>
      )}
      {extra}
    </Modal>
  );
}

/* ---------------- Nova / editar pasta (§7.2) ---------------- */

interface FormPasta { nome: string; validade: string; descricao: string }

/** Documento de exemplo para a prévia do modal: atualiza enquanto se digita. */
function docExemplo(form: FormPasta, logo: string | null): DocCarteirinhas {
  const nome = form.nome.trim() || 'Nome do evento';
  return {
    evento: { nome, logo, validade: fmtValidade(form.validade), tamanho_nome: nome.length <= 30 ? 9 : nome.length <= 40 ? 8 : 7 },
    colegio: { nome: 'Colégio São Marcos', logo: '/api/carteirinhas/logo-colegio' },
    cartoes: [{ aluno_id: 'exemplo', turma: 'Sub 12 Vôlei', nome: 'Ana Beatriz Souza Lima', tamanho_nome: 9, ra: '000.123.456-7', data_nascimento: '09/04/2014', foto: null }]
  };
}

export function ModalPasta({ aberto, pasta, aoFechar, aoSalvar }: {
  aberto: boolean; pasta: CarteirinhaPasta | null; aoFechar: () => void; aoSalvar: (p: CarteirinhaPasta) => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<FormPasta>({ nome: '', validade: '', descricao: '' });
  const [logoNova, setLogoNova] = useState<ImagemPronta | null>(null);
  const [removerLogo, setRemoverLogo] = useState(false);
  const [campos, setCampos] = useState<CampoInvalido[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [lendo, setLendo] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setForm({ nome: pasta?.nome || '', validade: pasta?.validade || '', descricao: pasta?.descricao || '' });
    setLogoNova(null); setRemoverLogo(false); setCampos([]);
  }, [aberto, pasta]);

  const logoAtual = removerLogo ? null : logoNova?.dataUrl || (pasta ? urlLogoPasta(pasta) : null);

  async function escolherLogo(arquivo: File | undefined) {
    if (!arquivo) return;
    setLendo(true);
    try { setLogoNova(await prepararLogo(arquivo)); setRemoverLogo(false); }
    catch (err) { toast.erro(mensagemErro(err)); }
    finally { setLendo(false); }
  }

  async function salvar() {
    setSalvando(true); setCampos([]);
    try {
      const corpo = { nome: form.nome, validade: form.validade, descricao: form.descricao };
      let salva = pasta
        ? await api.put<CarteirinhaPasta>(`/api/carteirinhas/pastas/${pasta.id}`, corpo)
        : await api.post<CarteirinhaPasta>('/api/carteirinhas/pastas', corpo);
      if (logoNova) salva = await api.post<CarteirinhaPasta>(`/api/carteirinhas/pastas/${salva.id}/logo`, { base64: logoNova.base64 });
      else if (removerLogo && pasta?.logo_evento_path) salva = await api.del<CarteirinhaPasta>(`/api/carteirinhas/pastas/${salva.id}/logo`);
      toast.ok(pasta ? 'Pasta atualizada.' : 'Pasta criada.');
      aoSalvar(salva);
    } catch (err) {
      if (err instanceof ErroApi && err.campos.length) setCampos(err.campos);
      toast.erro(mensagemErro(err));
    } finally { setSalvando(false); }
  }

  return (
    <Modal aberto={aberto} titulo={pasta ? 'Editar pasta' : 'Nova pasta'} tamanho="lg" aoFechar={aoFechar}
      descricao="A pasta é o evento: o nome, a logo e a validade saem em todo cartão das subpastas dela."
      rodape={<><Botao onClick={aoFechar}>Cancelar</Botao><Botao variante="primario" icone="check" carregando={salvando} disabled={lendo} onClick={salvar}>{pasta ? 'Salvar' : 'Criar pasta'}</Botao></>}>
      <div className="modal-pasta">
        <div className="form-grade" style={{ gridTemplateColumns: '1fr' }}>
          <CampoTexto rotulo="Nome do evento" name="nome" value={form.nome} obrigatorio erros={campos} autoFocus
            dica="Sai no cabeçalho do cartão (até duas linhas) e na ficha de inscrição." onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
          <CampoTexto rotulo="Válida até" name="validade" type="date" value={form.validade} erros={campos}
            dica="Obrigatória para emitir as carteirinhas." onChange={e => setForm(f => ({ ...f, validade: e.target.value }))} />
          <div className="campo">
            <label>Logo do evento <small>· frente, verso e ficha</small></label>
            <div className="logo-campo">
              <div className="pasta-logo" style={{ width: 56, height: 56 }}>{logoAtual ? <img src={logoAtual} alt="" /> : <Icone nome="cartao" />}</div>
              <label className={`btn btn-sm ${lendo ? 'desabilitado' : ''}`}>
                {lendo ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Icone nome="upload" />}{logoAtual ? 'Trocar logo' : 'Enviar logo'}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg" className="sr-only"
                  onChange={e => { escolherLogo(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              {logoAtual ? <Botao pequeno variante="fantasma" icone="lixeira" onClick={() => { setLogoNova(null); setRemoverLogo(true); }}>Remover</Botao> : null}
            </div>
            <div className="dica">PNG, JPG, WebP ou SVG. O SVG é convertido em imagem antes de subir.</div>
          </div>
          <CampoArea rotulo="Descrição" name="descricao" rows={2} value={form.descricao} erros={campos} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
        </div>
        <div>
          <div className="campo"><label>Como sai o cartão <small>· aluno de exemplo</small></label></div>
          <div className="previa-rolagem"><PreviaTira doc={docExemplo(form, logoAtual)} escala={0.42} /></div>
          {!form.validade || !logoAtual ? <div style={{ marginTop: 10 }}><Aviso tipo="aviso">Sem {[!form.validade && 'validade', !logoAtual && 'logo'].filter(Boolean).join(' e ')}, a pasta pode ser montada, mas as carteirinhas só são emitidas depois de completar.</Aviso></div> : null}
        </div>
      </div>
    </Modal>
  );
}
