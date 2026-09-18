// Mapa de rotas do painel (04-telas §1). Tudo sob /app é autenticado;
// a visibilidade por papel é aplicada na navegação (Shell) e aqui, na
// guarda de cada rota.
import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSessao } from '@/hooks/useSessao';
import { ProvedorAnoLetivo } from '@/hooks/useAnoLetivo';
import { Shell } from '@/componentes/Shell';
import { PaginaLogin } from '@/auth/Login';
import { Inicio } from '@/app/inicio/Inicio';
import { Alunos } from '@/app/alunos/Alunos';
import { AlunoFicha } from '@/app/alunos/AlunoFicha';
import { Historicos } from '@/app/historicos/Historicos';
import { Importacoes } from '@/app/importacoes/Importacoes';
import { ImportacaoDetalhe } from '@/app/importacoes/ImportacaoDetalhe';
import { Mapeamentos } from '@/app/importacoes/Mapeamentos';
import { Formularios } from '@/app/formularios/Formularios';
import { Instituicao } from '@/app/configuracoes/Instituicao';
import { AtosLegais } from '@/app/configuracoes/AtosLegais';
import { Signatarios } from '@/app/configuracoes/Signatarios';
import { AnosLetivos } from '@/app/configuracoes/AnosLetivos';
import { Cursos } from '@/app/configuracoes/Cursos';
import { Componentes } from '@/app/configuracoes/Componentes';
import { Curriculos } from '@/app/configuracoes/Curriculos';
import { VersaoDetalhe } from '@/app/configuracoes/VersaoDetalhe';
import { Estabelecimentos } from '@/app/configuracoes/Estabelecimentos';
import { Usuarios } from '@/app/configuracoes/Usuarios';
import { EstadoVazio, BotaoLink, Carregando } from '@/componentes/ui';
import type { Papel } from '@shared/types/usuario';

function Protegido() {
  const { carregando, estado } = useSessao();
  const local = useLocation();
  if (carregando) return <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}><Carregando texto="Verificando sessão…" /></div>;
  const ok = estado.loggedIn && !estado.mustChangePassword && estado.authorized;
  if (!ok) return <Navigate to="/app/entrar" replace state={{ de: local.pathname + local.search }} />;
  return <ProvedorAnoLetivo><Shell /></ProvedorAnoLetivo>;
}

function Entrar() {
  const { carregando, estado } = useSessao();
  if (carregando) return <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}><Carregando texto="Verificando sessão…" /></div>;
  if (estado.loggedIn && !estado.mustChangePassword && estado.authorized) return <Navigate to="/app" replace />;
  return <PaginaLogin />;
}

function SoPapel({ papeis }: { papeis: Papel[] }) {
  const { papel } = useSessao();
  if (!papel || !papeis.includes(papel)) {
    return <EstadoVazio icone="cadeado" titulo="Sem permissão para esta área" descricao="Seu perfil não inclui esta tela. Se precisar dela, fale com a administração do colégio." acoes={<BotaoLink to="/app">Voltar ao início</BotaoLink>} />;
  }
  return <Outlet />;
}

function NaoEncontrado() {
  return <EstadoVazio icone="info" titulo="Página não encontrada" descricao="O endereço não corresponde a nenhuma tela do painel." acoes={<BotaoLink to="/app">Ir para o início</BotaoLink>} />;
}

export const roteador = createBrowserRouter([
  { path: '/app/entrar', element: <Entrar /> },
  {
    path: '/app',
    element: <Protegido />,
    children: [
      { index: true, element: <Inicio /> },
      { path: 'alunos', element: <Alunos /> },
      { path: 'alunos/:id', element: <AlunoFicha /> },
      { path: 'historicos', element: <Historicos /> },
      { path: 'importacoes', element: <SoPapel papeis={['admin', 'secretaria']} />, children: [
        { index: true, element: <Importacoes /> },
        { path: 'mapeamentos', element: <Mapeamentos /> },
        { path: ':id', element: <ImportacaoDetalhe /> }
      ] },
      { path: 'formularios', element: <SoPapel papeis={['admin', 'secretaria', 'coordenacao']} />, children: [{ index: true, element: <Formularios /> }] },
      {
        path: 'config',
        element: <SoPapel papeis={['admin', 'secretaria']} />,
        children: [
          { index: true, element: <Navigate to="/app/config/instituicao" replace /> },
          { path: 'instituicao', element: <Instituicao /> },
          { path: 'atos-legais', element: <AtosLegais /> },
          { path: 'signatarios', element: <Signatarios /> },
          { path: 'anos-letivos', element: <AnosLetivos /> },
          { path: 'cursos', element: <Cursos /> },
          { path: 'componentes', element: <Componentes /> },
          { path: 'curriculos', element: <Curriculos /> },
          { path: 'curriculos/:id', element: <VersaoDetalhe /> },
          { path: 'estabelecimentos', element: <Estabelecimentos /> },
          { path: 'usuarios', element: <SoPapel papeis={['admin']} />, children: [{ index: true, element: <Usuarios /> }] }
        ]
      },
      { path: '*', element: <NaoEncontrado /> }
    ]
  },
  { path: '*', element: <Navigate to="/app" replace /> }
]);
