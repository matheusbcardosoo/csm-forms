// Componentes de interface compartilhados do painel (04-telas §4).
import { useEffect, useId, useRef, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { Icone, type NomeIcone } from './Icones';
import type { CampoInvalido } from '@/api/cliente';

/* ---------- Botão ---------- */
type Variante = 'padrao' | 'primario' | 'destaque' | 'perigo' | 'fantasma';
const CLASSE_VARIANTE: Record<Variante, string> = { padrao: '', primario: 'btn-1', destaque: 'btn-2', perigo: 'btn-perigo', fantasma: 'btn-fantasma' };

export function Botao({ variante = 'padrao', pequeno, icone, carregando, children, className = '', ...resto }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; pequeno?: boolean; icone?: NomeIcone; carregando?: boolean }) {
  return (
    <button type="button" className={`btn ${CLASSE_VARIANTE[variante]} ${pequeno ? 'btn-sm' : ''} ${className}`} disabled={carregando || resto.disabled} {...resto}>
      {carregando ? <span className="spinner" style={{ width: 14, height: 14 }} /> : icone ? <Icone nome={icone} /> : null}
      {children}
    </button>
  );
}

export function BotaoLink({ to, variante = 'padrao', pequeno, icone, children, className = '' }:
  { to: string; variante?: Variante; pequeno?: boolean; icone?: NomeIcone; children: ReactNode; className?: string }) {
  return (
    <Link to={to} className={`btn ${CLASSE_VARIANTE[variante]} ${pequeno ? 'btn-sm' : ''} ${className}`}>
      {icone ? <Icone nome={icone} /> : null}{children}
    </Link>
  );
}

/* ---------- Etiqueta de estado ---------- */
export function Tag({ tipo = 'neutro', ponto, children }: { tipo?: 'ok' | 'aviso' | 'erro' | 'info' | 'neutro' | 'edit'; ponto?: boolean; children: ReactNode }) {
  return <span className={`tag t-${tipo}`}>{ponto ? <span className="ponto" /> : null}{children}</span>;
}

/* ---------- Cartão ---------- */
export function Card({ titulo, descricao, acoes, children, rodape, className = '', semCorpo }:
  { titulo?: ReactNode; descricao?: ReactNode; acoes?: ReactNode; children?: ReactNode; rodape?: ReactNode; className?: string; semCorpo?: boolean }) {
  return (
    <section className={`card ${className}`}>
      {(titulo || acoes) && (
        <div className="card-cab">
          <div>{titulo ? <h2>{titulo}</h2> : null}{descricao ? <p>{descricao}</p> : null}</div>
          {acoes ? <div className="acoes">{acoes}</div> : null}
        </div>
      )}
      {semCorpo ? children : <div className="card-corpo">{children}</div>}
      {rodape ? <div className="card-rodape">{rodape}</div> : null}
    </section>
  );
}

/* ---------- Cabeçalho de página ---------- */
export function Cabecalho({ titulo, descricao, acoes, voltar }: { titulo: ReactNode; descricao?: ReactNode; acoes?: ReactNode; voltar?: { to: string; rotulo: string } }) {
  return (
    <div className="cab">
      <div>
        {voltar ? <Link className="cab-voltar" to={voltar.to}><Icone nome="setaEsq" />{voltar.rotulo}</Link> : null}
        <h1>{titulo}</h1>
        {descricao ? <p>{descricao}</p> : null}
      </div>
      {acoes ? <div className="acoes">{acoes}</div> : null}
    </div>
  );
}

/* ---------- Indicador ---------- */
export function Kpi({ rotulo, valor, detalhe, tipo = 'azul' }: { rotulo: string; valor: ReactNode; detalhe?: ReactNode; tipo?: 'azul' | 'ok' | 'aviso' | 'erro' | 'neutro' }) {
  const vazio = valor === null || valor === undefined;
  return (
    <dl className={`kpi k-${tipo}`}>
      <dt>{rotulo}</dt>
      <dd className={vazio ? 'vazio' : ''}>{vazio ? 'Disponível na próxima fase' : valor}</dd>
      {detalhe ? <small>{detalhe}</small> : null}
    </dl>
  );
}

/* ---------- Estado vazio ---------- */
export function EstadoVazio({ icone = 'info', titulo, descricao, acoes }: { icone?: NomeIcone; titulo: string; descricao?: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="vazio">
      <div className="vazio-ico"><Icone nome={icone} /></div>
      <h3>{titulo}</h3>
      {descricao ? <p>{descricao}</p> : null}
      {acoes ? <div className="acoes">{acoes}</div> : null}
    </div>
  );
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return <div className="carregando" role="status"><span className="spinner" />{texto}</div>;
}

export function Aviso({ tipo = 'info', children }: { tipo?: 'info' | 'aviso' | 'erro' | 'ok'; children: ReactNode }) {
  return <div className={`nota-lateral n-${tipo}`}>{children}</div>;
}

/* ---------- Campos de formulário ---------- */
function erroDoCampo(campos: CampoInvalido[] | undefined, nome: string | undefined) {
  if (!campos || !nome) return null;
  return campos.find(c => c.campo === nome)?.mensagem || null;
}

interface PropsCampoBase { rotulo: ReactNode; dica?: ReactNode; erros?: CampoInvalido[]; className?: string; obrigatorio?: boolean }

export function CampoTexto({ rotulo, dica, erros, className = '', obrigatorio, ...resto }: PropsCampoBase & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const erro = erroDoCampo(erros, resto.name);
  return (
    <div className={`campo ${erro ? 'invalido' : ''} ${className}`}>
      <label htmlFor={id}>{rotulo}{obrigatorio ? <small> · obrigatório</small> : null}</label>
      <input id={id} aria-invalid={!!erro} aria-describedby={erro ? `${id}-erro` : undefined} {...resto} />
      {erro ? <div className="erro" id={`${id}-erro`}>{erro}</div> : dica ? <div className="dica">{dica}</div> : null}
    </div>
  );
}

export function CampoSelect({ rotulo, dica, erros, className = '', obrigatorio, children, ...resto }: PropsCampoBase & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  const erro = erroDoCampo(erros, resto.name);
  return (
    <div className={`campo ${erro ? 'invalido' : ''} ${className}`}>
      <label htmlFor={id}>{rotulo}{obrigatorio ? <small> · obrigatório</small> : null}</label>
      <select id={id} aria-invalid={!!erro} {...resto}>{children}</select>
      {erro ? <div className="erro">{erro}</div> : dica ? <div className="dica">{dica}</div> : null}
    </div>
  );
}

export function CampoArea({ rotulo, dica, erros, className = '', obrigatorio, ...resto }: PropsCampoBase & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  const erro = erroDoCampo(erros, resto.name);
  return (
    <div className={`campo ${erro ? 'invalido' : ''} ${className}`}>
      <label htmlFor={id}>{rotulo}{obrigatorio ? <small> · obrigatório</small> : null}</label>
      <textarea id={id} aria-invalid={!!erro} {...resto} />
      {erro ? <div className="erro">{erro}</div> : dica ? <div className="dica">{dica}</div> : null}
    </div>
  );
}

export function CampoCheck({ rotulo, className = '', ...resto }: { rotulo: ReactNode; className?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`campo-check ${className}`}>
      <input type="checkbox" {...resto} />
      <span>{rotulo}</span>
    </label>
  );
}

/* ---------- Modal ---------- */
export function Modal({ aberto, titulo, descricao, aoFechar, children, rodape, tamanho }:
  { aberto: boolean; titulo: ReactNode; descricao?: ReactNode; aoFechar: () => void; children: ReactNode; rodape?: ReactNode; tamanho?: 'sm' | 'lg' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar(); };
    document.addEventListener('keydown', aoTeclar);
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const foco = ref.current?.querySelector<HTMLElement>('input, select, textarea, button');
    foco?.focus();
    return () => { document.removeEventListener('keydown', aoTeclar); document.body.style.overflow = anterior; };
  }, [aberto, aoFechar]);

  if (!aberto) return null;
  return (
    <div className="modal-fundo" onMouseDown={e => { if (e.target === e.currentTarget) aoFechar(); }}>
      <div className={`modal ${tamanho ? `m-${tamanho}` : ''}`} role="dialog" aria-modal="true" ref={ref}>
        <div className="modal-cab">
          <div style={{ flex: 1 }}><h2>{titulo}</h2>{descricao ? <p>{descricao}</p> : null}</div>
          <Botao variante="fantasma" className="btn-ico" aria-label="Fechar" onClick={aoFechar}><Icone nome="fechar" /></Botao>
        </div>
        <div className="modal-corpo">{children}</div>
        {rodape ? <div className="modal-rodape">{rodape}</div> : null}
      </div>
    </div>
  );
}

/* ---------- Confirmação ---------- */
export function Confirmar({ aberto, titulo, descricao, rotuloConfirmar = 'Confirmar', perigo, carregando, aoFechar, aoConfirmar }:
  { aberto: boolean; titulo: ReactNode; descricao?: ReactNode; rotuloConfirmar?: string; perigo?: boolean; carregando?: boolean; aoFechar: () => void; aoConfirmar: () => void }) {
  return (
    <Modal aberto={aberto} titulo={titulo} aoFechar={aoFechar} tamanho="sm"
      rodape={<>
        <Botao onClick={aoFechar}>Cancelar</Botao>
        <Botao variante={perigo ? 'destaque' : 'primario'} carregando={carregando} onClick={aoConfirmar}>{rotuloConfirmar}</Botao>
      </>}>
      <p style={{ fontSize: 13.5, color: 'var(--texto-2)', lineHeight: 1.55 }}>{descricao}</p>
    </Modal>
  );
}

/* ---------- Tabela responsiva ---------- */
export interface Coluna<T> {
  chave: string;
  rotulo: string;
  render: (linha: T) => ReactNode;
  className?: string;
  principal?: boolean;   // no celular vira o título do cartão
  acoes?: boolean;       // coluna de botões
}

export function Tabela<T>({ colunas, linhas, chave, vazio, classeLinha }:
  { colunas: Coluna<T>[]; linhas: T[]; chave: (l: T) => string; vazio?: ReactNode; classeLinha?: (l: T) => string | undefined }) {
  if (!linhas.length && vazio) return <>{vazio}</>;
  return (
    <div className="tab-box">
      <table className="responsiva">
        <thead><tr>{colunas.map(c => <th key={c.chave} className={c.className}>{c.acoes ? <span className="sr-only">{c.rotulo}</span> : c.rotulo}</th>)}</tr></thead>
        <tbody>
          {linhas.map(l => (
            <tr key={chave(l)} className={classeLinha?.(l)}>
              {colunas.map(c => (
                <td key={c.chave} data-rotulo={c.acoes || c.principal ? '' : c.rotulo}
                  className={`${c.className || ''} ${c.acoes ? 'cel-acoes' : ''} ${c.principal ? 'cel-principal' : ''}`}>
                  {c.render(l)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Abas por rota ---------- */
export function AbasRota({ itens }: { itens: { to: string; rotulo: string; fim?: boolean }[] }) {
  return (
    <nav className="abas" role="tablist">
      {itens.map(i => (
        <AbaLink key={i.to} to={i.to} fim={i.fim}>{i.rotulo}</AbaLink>
      ))}
    </nav>
  );
}

import { NavLink } from 'react-router-dom';
function AbaLink({ to, fim, children }: { to: string; fim?: boolean; children: ReactNode }) {
  return <NavLink to={to} end={fim} className="aba" role="tab">{children}</NavLink>;
}

/* ---------- utilitários de formatação ---------- */
export function fmtData(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : iso;
}

export function fmtDataHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function iniciais(nome: string | null | undefined, email?: string): string {
  const base = (nome || email || '?').trim();
  const partes = base.split(/[\s@.]+/).filter(Boolean);
  const a = partes[0]?.[0] || '?';
  const b = partes.length > 1 ? partes[1][0] : '';
  return (a + b).toUpperCase();
}
