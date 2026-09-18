// /app/historicos — documentos emitidos (F5).
import { Aviso, BotaoLink, Cabecalho, Card, EstadoVazio } from '@/componentes/ui';

export function Historicos() {
  return (
    <div className="wrap">
      <Cabecalho titulo="Históricos escolares" descricao="Documentos gerados, com status e 2ª via" />
      <Card semCorpo>
        <EstadoVazio icone="documento" titulo="Nenhum histórico gerado"
          descricao="A geração, pré-visualização fiel e emissão com número de registro são a fase 5. O que você configura hoje em Instituição, Atos legais, Signatários e Currículos é exatamente o que o documento vai imprimir."
          acoes={<BotaoLink to="/app/config/instituicao" icone="instituicao">Conferir cabeçalho do documento</BotaoLink>} />
      </Card>
      <div style={{ marginTop: 14 }}>
        <Aviso tipo="aviso"><b>Guarda da v1 (RF-VER-11).</b> Quando um pedido cair num ano letivo sem currículo cadastrado, a emissão será bloqueada com aviso — nunca sai documento com a grade de hoje para um aluno de outra época.</Aviso>
      </div>
    </div>
  );
}
