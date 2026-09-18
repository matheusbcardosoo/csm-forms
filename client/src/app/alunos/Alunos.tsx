// /app/alunos — lista de alunos (F4). Nesta fase não há aluno importado:
// a tela mostra o estado vazio previsto em 04-telas §3.2, com chamada
// para a importação.
import { useSearchParams } from 'react-router-dom';
import { Aviso, BotaoLink, Cabecalho, Card, EstadoVazio } from '@/componentes/ui';
import { useSessao } from '@/hooks/useSessao';

export function Alunos() {
  const [params] = useSearchParams();
  const q = params.get('q');
  const { temPapel } = useSessao();
  return (
    <div className="wrap">
      <Cabecalho titulo="Alunos" descricao="Lista, ficha, trajetória e grade de notas de cada aluno" />
      <div className="filtros">
        <div className="f-campo">Busca: <b>{q || 'todos'}</b></div>
        <div className="f-campo">Série: <b>Todas</b></div>
        <div className="f-campo">Situação: <b>Ativo</b></div>
      </div>
      <Card semCorpo>
        <EstadoVazio icone="alunos" titulo="Nenhum aluno cadastrado ainda"
          descricao="Os alunos entram pela importação do Activesoft (fase 3). A lista, a ficha e a grade de notas editável são a fase 4 e vão aparecer aqui."
          acoes={temPapel('admin', 'secretaria') ? <BotaoLink to="/app/importacoes" variante="primario" icone="importar">Ir para importação</BotaoLink> : undefined} />
      </Card>
      <div style={{ marginTop: 14 }}>
        <Aviso><b>Por que não dá para cadastrar aluno à mão aqui.</b> A v1 cobre alunos com trajetória no Activesoft; o lançamento manual de anos cursados em outra escola (RF-ALU-07) chega junto com a ficha, na fase 4.</Aviso>
      </div>
    </div>
  );
}
