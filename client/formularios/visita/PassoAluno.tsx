import { isFullName, toTitleCase } from '../comum/validadores';
import type { AlunoVisitaForm } from './tipos';

const TURMAS = [
  'Infantil I', 'Infantil II', 'Infantil III', 'Infantil IV',
  'Fundamental I - 1º ano', 'Fundamental I - 2º ano', 'Fundamental I - 3º ano', 'Fundamental I - 4º ano', 'Fundamental I - 5º ano',
  'Fundamental II - 6º ano', 'Fundamental II - 7º ano', 'Fundamental II - 8º ano', 'Fundamental II - 9º ano',
  'Ensino Médio - 1ª série', 'Ensino Médio - 2ª série', 'Ensino Médio - 3ª série'
];

export function novoAlunoVisita(): AlunoVisitaForm {
  return { id: crypto.randomUUID(), nome: '', nascimento: '', turma: '' };
}

export function validarPassoAluno(alunos: AlunoVisitaForm[]): Set<string> {
  const chaves = new Set<string>();
  alunos.forEach(a => {
    if (!isFullName(a.nome)) chaves.add(`${a.id}:nome`);
    if (!a.nascimento) chaves.add(`${a.id}:nascimento`);
    if (!a.turma) chaves.add(`${a.id}:turma`);
  });
  return chaves;
}

export function PassoAluno({ alunos, setAlunos, erros }: {
  alunos: AlunoVisitaForm[];
  setAlunos: (fn: (atual: AlunoVisitaForm[]) => AlunoVisitaForm[]) => void;
  erros: Set<string>;
}) {
  function atualizar(id: string, mudar: (a: AlunoVisitaForm) => AlunoVisitaForm) {
    setAlunos(atual => atual.map(a => a.id === id ? mudar(a) : a));
  }

  return (
    <>
      {alunos.map((aluno, i) => (
        <div key={aluno.id} className="student-block">
          <div className="student-block-header">
            <span>Aluno {i + 1}</span>
            {alunos.length > 1 && (
              <button type="button" className="remove-student-btn" onClick={() => setAlunos(atual => atual.filter(a => a.id !== aluno.id))}>
                <i className="fa-solid fa-circle-minus"></i> Remover
              </button>
            )}
          </div>
          <div className={`field-group${erros.has(`${aluno.id}:nome`) ? ' invalid' : ''}`}>
            <label>Nome completo</label>
            <input type="text" value={aluno.nome} placeholder="Nome completo do aluno"
              onChange={e => atualizar(aluno.id, a => ({ ...a, nome: e.target.value }))}
              onBlur={e => atualizar(aluno.id, a => ({ ...a, nome: toTitleCase(e.target.value) }))} />
            <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> Informe o nome completo (nome e sobrenome).</div>
          </div>
          <div className="field-row">
            <div className={`field-group${erros.has(`${aluno.id}:nascimento`) ? ' invalid' : ''}`}>
              <label>Data de nascimento</label>
              <input type="date" value={aluno.nascimento} onChange={e => atualizar(aluno.id, a => ({ ...a, nascimento: e.target.value }))} />
              <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> Informe a data de nascimento.</div>
            </div>
            <div className={`field-group${erros.has(`${aluno.id}:turma`) ? ' invalid' : ''}`}>
              <label>Turma desejada</label>
              <select value={aluno.turma} onChange={e => atualizar(aluno.id, a => ({ ...a, turma: e.target.value }))}>
                <option value="">Selecione</option>
                {TURMAS.map(t => <option key={t}>{t}</option>)}
              </select>
              <div className="error-text"><i className="fa-solid fa-circle-exclamation"></i> Selecione a turma desejada.</div>
            </div>
          </div>
        </div>
      ))}
      <button type="button" className="add-student-btn" onClick={() => setAlunos(atual => [...atual, novoAlunoVisita()])}>
        + Adicionar mais um aluno
      </button>
    </>
  );
}
