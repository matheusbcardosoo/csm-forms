// /app/formularios — os formulários atuais, preservados (RF-FORM), agora
// acessíveis pelo painel. Wizards continuam em EJS até o Incremento B da
// F6; a tela de respostas já é React (Incremento A).
import { BotaoLink, Cabecalho, Card, Tag } from '@/componentes/ui';
import { Icone } from '@/componentes/Icones';

const FORMULARIOS = [
  {
    id: 'visitas' as const, nome: 'Cadastro de visitas', descricao: 'Wizard público · PDF automático · envio ao n8n',
    abrir: '/form-visitas', modelo: '/api/blank/visita/pdf'
  },
  {
    id: 'avaliacao-substitutiva' as const, nome: 'Avaliação substitutiva', descricao: 'Múltiplos alunos e provas · anexos até 8 MB',
    abrir: '/form-avaliacao-substitutiva', modelo: '/api/blank/avaliacao/pdf'
  }
];

export function Formularios() {
  return (
    <div className="wrap">
      <Cabecalho titulo="Formulários" descricao="Os formulários atuais continuam como estão — agora dentro do painel"
        acoes={<BotaoLink to="/app/formularios/respostas" icone="documento">Ver respostas</BotaoLink>} />
      <div className="grade g2">
        {FORMULARIOS.map(f => (
          <Card key={f.id} titulo={f.nome} descricao={f.descricao} acoes={<Tag tipo="ok" ponto>Ativo</Tag>}>
            <div className="acoes">
              <a className="btn btn-sm" href={f.abrir} target="_blank" rel="noopener"><Icone nome="externo" />Abrir formulário</a>
              <a className="btn btn-sm" href={f.modelo}><Icone nome="documento" />Modelo em branco (PDF)</a>
              <BotaoLink to={`/app/formularios/respostas?form=${f.id}`} variante="primario" pequeno>Respostas</BotaoLink>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
