// /app/importacoes — importações do Activesoft (F3). Depende da
// documentação da API (03-integracao §8); a tela já explica o fluxo.
import { Aviso, BotaoLink, Cabecalho, Card, EstadoVazio } from '@/componentes/ui';

export function Importacoes() {
  return (
    <div className="wrap">
      <Cabecalho titulo="Importação do Activesoft" descricao="Alunos, matrículas e notas — com simulação, relatório e divergências" />
      <Card semCorpo>
        <EstadoVazio icone="importar" titulo="Integração ainda não ativada"
          descricao="A fase 3 depende da documentação da API do Activesoft. Enquanto isso, deixe pronto o que a importação vai precisar: cursos, séries e a versão curricular vigente — é nela que os códigos do Activesoft serão mapeados."
          acoes={<>
            <BotaoLink to="/app/config/cursos" icone="livro">Cursos e séries</BotaoLink>
            <BotaoLink to="/app/config/curriculos" variante="primario" icone="grade">Currículos</BotaoLink>
          </>} />
      </Card>
      <div className="grade g2" style={{ marginTop: 14 }}>
        <Aviso><b>Como vai funcionar.</b> Escolhe-se ano letivo, série/turma e o que importar. <b>Simular primeiro</b> mostra o que entraria sem gravar nada; <b>Importar agora</b> grava e gera o relatório.</Aviso>
        <Aviso><b>Regra central.</b> Uma nota corrigida à mão nunca é sobrescrita em silêncio por uma reimportação: vira divergência com os dois valores lado a lado e a decisão é humana.</Aviso>
      </div>
    </div>
  );
}
