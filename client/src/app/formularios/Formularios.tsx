// /app/formularios — os formulários atuais, preservados (RF-FORM), agora
// acessíveis pelo painel. Wizards e tela de respostas continuam em EJS
// até a fase 6; aqui só se abre cada um.
import { Cabecalho, Card, Tag } from '@/componentes/ui';
import { Icone } from '@/componentes/Icones';

const FORMULARIOS = [
  {
    id: 'visitas', nome: 'Cadastro de visitas', descricao: 'Wizard público · PDF automático · envio ao n8n',
    abrir: '/form-visitas', respostas: '/respostas?form=visitas', modelo: '/api/blank/visita/pdf'
  },
  {
    id: 'avaliacao-substitutiva', nome: 'Avaliação substitutiva', descricao: 'Múltiplos alunos e provas · anexos até 8 MB',
    abrir: '/form-avaliacao-substitutiva', respostas: '/respostas?form=avaliacao-substitutiva', modelo: '/api/blank/avaliacao/pdf'
  }
];

export function Formularios() {
  return (
    <div className="wrap">
      <Cabecalho titulo="Formulários" descricao="Os formulários atuais continuam como estão — agora dentro do painel"
        acoes={<a className="btn" href="/respostas" target="_blank" rel="noopener"><Icone nome="externo" />Ver respostas</a>} />
      <div className="grade g2">
        {FORMULARIOS.map(f => (
          <Card key={f.id} titulo={f.nome} descricao={f.descricao} acoes={<Tag tipo="ok" ponto>Ativo</Tag>}>
            <div className="acoes">
              <a className="btn btn-sm" href={f.abrir} target="_blank" rel="noopener"><Icone nome="externo" />Abrir formulário</a>
              <a className="btn btn-sm" href={f.modelo}><Icone nome="documento" />Modelo em branco (PDF)</a>
              <a className="btn btn-sm btn-1" href={f.respostas} target="_blank" rel="noopener">Respostas</a>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
