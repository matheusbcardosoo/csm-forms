// Layout persistente do painel (04-telas §2): barra lateral (drawer em
// telas estreitas), topo com busca global, seletor de ano letivo e menu
// do usuário. Visibilidade dos itens por papel.
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSessao } from '@/hooks/useSessao';
import { useAnoLetivo } from '@/hooks/useAnoLetivo';
import { Icone, type NomeIcone } from './Icones';
import { iniciais } from './ui';
import { ModalTrocarSenha } from './ModalTrocarSenha';
import { ROTULO_PAPEL, type Papel } from '@shared/types/usuario';

interface ItemNav {
  to: string; rotulo: string; icone: NomeIcone; papeis?: Papel[]; fim?: boolean;
  /** Regra própria de "tela atual" quando o prefixo da rota não basta. */
  ativo?: (caminho: string) => boolean;
}

const OPERACAO: ItemNav[] = [
  { to: '/app', rotulo: 'Início', icone: 'inicio', fim: true },
  { to: '/app/alunos', rotulo: 'Alunos', icone: 'alunos' },
  { to: '/app/historicos', rotulo: 'Históricos', icone: 'documento' },
  { to: '/app/carteirinhas', rotulo: 'Carteirinhas', icone: 'cartao', papeis: ['admin', 'secretaria'] },
  { to: '/app/relatorios', rotulo: 'Relatórios', icone: 'grade' },
  { to: '/app/formularios', rotulo: 'Formulários', icone: 'formulario', papeis: ['admin', 'secretaria', 'coordenacao'] }
];

// Configuração em acordeões por assunto: a lista corrida tinha 10 itens.
interface GrupoNav { id: string; rotulo: string; icone: NomeIcone; itens: ItemNav[] }
const SO_EQUIPE: Papel[] = ['admin', 'secretaria'];

const CONFIGURACAO: GrupoNav[] = [
  { id: 'institucional', rotulo: 'Institucional', icone: 'instituicao', itens: [
    { to: '/app/config/instituicao', rotulo: 'Instituição', icone: 'instituicao', papeis: SO_EQUIPE },
    { to: '/app/config/estabelecimentos', rotulo: 'Outras escolas', icone: 'escola', papeis: SO_EQUIPE }
  ] },
  { id: 'juridico', rotulo: 'Jurídico', icone: 'selo', itens: [
    { to: '/app/config/atos-legais', rotulo: 'Atos legais', icone: 'selo', papeis: SO_EQUIPE },
    { to: '/app/config/signatarios', rotulo: 'Signatários', icone: 'assinatura', papeis: SO_EQUIPE },
    { to: '/app/config/observacoes', rotulo: 'Observações do histórico', icone: 'documento', papeis: SO_EQUIPE }
  ] },
  { id: 'pedagogico', rotulo: 'Pedagógico', icone: 'livro', itens: [
    { to: '/app/config/anos-letivos', rotulo: 'Anos letivos', icone: 'calendario', papeis: SO_EQUIPE },
    { to: '/app/config/cursos', rotulo: 'Cursos e séries', icone: 'livro', papeis: SO_EQUIPE },
    { to: '/app/config/componentes', rotulo: 'Componentes', icone: 'grade', papeis: SO_EQUIPE },
    { to: '/app/config/curriculos', rotulo: 'Currículos', icone: 'grade', papeis: SO_EQUIPE }
  ] },
  { id: 'integracao', rotulo: 'Integração', icone: 'importar', itens: [
    // Importação cobre a lista e o detalhe (/app/importacoes/:id), mas não Mapeamentos.
    { to: '/app/importacoes', rotulo: 'Importação de dados', icone: 'importar', papeis: SO_EQUIPE,
      ativo: c => c.startsWith('/app/importacoes') && !c.startsWith('/app/importacoes/mapeamentos') },
    { to: '/app/importacoes/mapeamentos', rotulo: 'Mapeamentos', icone: 'grade', papeis: SO_EQUIPE }
  ] }
];

const GERENCIAMENTO: ItemNav[] = [
  { to: '/app/config/usuarios', rotulo: 'Usuários', icone: 'usuarios', papeis: SO_EQUIPE },
  { to: '/app/auditoria', rotulo: 'Auditoria', icone: 'relogio', papeis: ['admin'] }
];

const CHAVE_ABERTOS = 'csm-nav-abertos';
function lerAbertos(): string[] {
  try { return JSON.parse(localStorage.getItem(CHAVE_ABERTOS) || '[]'); } catch { return []; }
}

function visivel(item: ItemNav, papel: Papel | null): boolean {
  return !item.papeis || (!!papel && item.papeis.includes(papel));
}

export function Shell() {
  const { perfil, papel, sair } = useSessao();
  const { anos, ano, setAno } = useAnoLetivo();
  const [aberta, setAberta] = useState(false);
  const [menu, setMenu] = useState(false);
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const local = useLocation();
  const navegar = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);
  const [busca, setBusca] = useState('');

  // fecha o drawer e volta ao topo ao navegar (SPA não faz isso sozinha)
  useEffect(() => { setAberta(false); setMenu(false); window.scrollTo({ top: 0 }); }, [local.pathname]);

  useEffect(() => {
    if (!menu) return;
    const fora = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [menu]);

  useEffect(() => {
    if (!aberta) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberta(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [aberta]);

  const [tema, setTema] = useState<string>(() => { try { return localStorage.getItem('csm-tema') || 'auto'; } catch { return 'auto'; } });
  useEffect(() => {
    if (tema === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', tema);
    try { localStorage.setItem('csm-tema', tema); } catch { /* sem storage */ }
  }, [tema]);

  const operacao = OPERACAO.filter(i => visivel(i, papel));
  const configuracao = CONFIGURACAO.map(g => ({ ...g, itens: g.itens.filter(i => visivel(i, papel)) })).filter(g => g.itens.length);
  const gerenciamento = GERENCIAMENTO.filter(i => visivel(i, papel));

  // Acordeões: o que a pessoa abriu fica lembrado; o grupo da tela atual
  // abre sozinho ao navegar (por link, busca ou URL digitada).
  const [abertos, setAbertos] = useState<string[]>(lerAbertos);
  useEffect(() => { try { localStorage.setItem(CHAVE_ABERTOS, JSON.stringify(abertos)); } catch { /* sem storage */ } }, [abertos]);
  const grupoAtual = CONFIGURACAO.find(g => g.itens.some(i => local.pathname.startsWith(i.to)))?.id;
  useEffect(() => { if (grupoAtual) setAbertos(a => a.includes(grupoAtual) ? a : [...a, grupoAtual]); }, [grupoAtual]);
  const alternar = (id: string) => setAbertos(a => a.includes(id) ? a.filter(x => x !== id) : [...a, id]);

  const item = (i: ItemNav) => i.ativo ? (
    <Link key={i.to} to={i.to} className="nav-item" aria-current={i.ativo(local.pathname) ? 'page' : undefined}>
      <Icone nome={i.icone} />{i.rotulo}
    </Link>
  ) : (
    <NavLink key={i.to} to={i.to} end={i.fim} className="nav-item">
      <Icone nome={i.icone} />{i.rotulo}
    </NavLink>
  );

  return (
    <div className="app">
      <aside className={`sidebar ${aberta ? 'aberta' : ''}`} id="menu-lateral" aria-label="Menu principal">
        <NavLink to="/app" className="marca" end>
          <span className="brasao"><img src="/images/logo-brasao.png" alt="" /></span>
          <div><strong>Secretaria Digital</strong><span>Colégio São Marcos</span></div>
          <button type="button" className="sidebar-fechar" aria-label="Fechar menu" onClick={e => { e.preventDefault(); setAberta(false); }}><Icone nome="fechar" /></button>
        </NavLink>

        {operacao.length ? <div><div className="nav-grupo">Operação</div>{operacao.map(item)}</div> : null}

        {configuracao.length ? (
          <div>
            <div className="nav-grupo">Configuração</div>
            {configuracao.map(g => {
              const aberto = abertos.includes(g.id);
              return (
                <div key={g.id} className="nav-acordeao">
                  <button type="button" className={`nav-item nav-acordeao-botao ${g.id === grupoAtual ? 'contem-atual' : ''}`}
                    aria-expanded={aberto} aria-controls={`nav-${g.id}`} onClick={() => alternar(g.id)}>
                    <Icone nome={g.icone} />{g.rotulo}
                    <Icone nome="setaBaixo" className="nav-seta" />
                  </button>
                  <div id={`nav-${g.id}`} className="nav-sub" hidden={!aberto}>{g.itens.map(item)}</div>
                </div>
              );
            })}
          </div>
        ) : null}

        {gerenciamento.length ? <div><div className="nav-grupo">Gerenciamento</div>{gerenciamento.map(item)}</div> : null}

        <div className="sidebar-rodape">
          <b title={perfil?.email}>{perfil?.nome || perfil?.email}</b>
          {papel ? ROTULO_PAPEL[papel] : ''}
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button type="button" className="hamburguer" aria-label="Abrir menu" aria-controls="menu-lateral" aria-expanded={aberta} onClick={() => setAberta(v => !v)}>
            <Icone nome="menu" />
          </button>

          <form className="busca" role="search" onSubmit={e => { e.preventDefault(); if (busca.trim()) navegar(`/app/alunos?q=${encodeURIComponent(busca.trim())}`); }}>
            <Icone nome="buscar" />
            <input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar aluno por nome, código ou RA" aria-label="Buscar aluno" />
          </form>

          <div className="topbar-espaco" />

          <label className="pill-sel pill-ano">
            <small>Ano letivo</small>
            <select value={ano ?? ''} onChange={e => setAno(Number(e.target.value))} aria-label="Ano letivo">
              {anos.map(a => <option key={a} value={a}>{a}</option>)}
              {ano && !anos.includes(ano) ? <option value={ano}>{ano}</option> : null}
            </select>
          </label>

          <div className="menu-usuario" ref={menuRef}>
            <button type="button" className="pill-sel" style={{ gap: 9 }} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(v => !v)}>
              <span className="avatar">{iniciais(perfil?.nome, perfil?.email)}</span>
              <b className="nome-usuario">{(perfil?.nome || perfil?.email || '').split(' ')[0]}</b>
              <Icone nome="setaBaixo" style={{ width: 12, height: 12 }} />
            </button>
            {menu ? (
              <div className="menu" role="menu">
                <div className="menu-cab"><b>{perfil?.nome || perfil?.email}</b>{perfil?.email}<br />{papel ? ROTULO_PAPEL[papel] : ''}</div>
                <button type="button" role="menuitem" onClick={() => setTema(t => t === 'dark' ? 'light' : t === 'light' ? 'auto' : 'dark')}>
                  <Icone nome="tema" />Tema: {tema === 'auto' ? 'automático' : tema === 'dark' ? 'escuro' : 'claro'}
                </button>
                <button type="button" role="menuitem" onClick={() => { setMenu(false); setTrocandoSenha(true); }}><Icone nome="chave" />Trocar senha</button>
                <a role="menuitem" href="/" ><Icone nome="externo" />Central de formulários</a>
                <button type="button" role="menuitem" onClick={sair}><Icone nome="sair" />Sair</button>
              </div>
            ) : null}
          </div>
        </header>

        <main className="conteudo" id="conteudo">
          <Outlet />
        </main>
        <ModalTrocarSenha aberto={trocandoSenha} aoFechar={() => setTrocandoSenha(false)} />
      </div>
    </div>
  );
}
