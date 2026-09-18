// Adaptador Mock: fixtures determinísticas para desenvolver e testar a
// importação sem credenciais do Activesoft. Os códigos de série e de
// disciplina imitam o que uma API escolar costuma expor, para exercitar
// o fluxo de mapeamento (pendência → confirmação).
import type { AdaptadorAcademico, AlunoOrigem, MatriculaOrigem, NotaOrigem, FiltroImportacao, ResultadoBusca, Capacidades } from './tipos';

const SERIES = [
  { codigo: 'EM1', descricao: '1ª Série - Ensino Médio' },
  { codigo: 'EM2', descricao: '2ª Série - Ensino Médio' },
  { codigo: 'EM3', descricao: '3ª Série - Ensino Médio' }
];

const DISCIPLINAS: { codigo: string; descricao: string; series: string[] }[] = [
  { codigo: 'LP', descricao: 'Língua Portuguesa', series: ['EM1', 'EM2', 'EM3'] },
  { codigo: 'ART', descricao: 'Arte', series: ['EM1', 'EM2', 'EM3'] },
  { codigo: 'EDF', descricao: 'Educação Física', series: ['EM1', 'EM2'] },
  { codigo: 'ING', descricao: 'Língua Estrangeira Moderna - Inglês', series: ['EM1', 'EM2'] },
  { codigo: 'MAT', descricao: 'Matemática', series: ['EM1', 'EM2', 'EM3'] },
  { codigo: 'FIS', descricao: 'Física', series: ['EM1', 'EM2'] },
  { codigo: 'QUI', descricao: 'Química', series: ['EM1', 'EM2', 'EM3'] },
  { codigo: 'BIO', descricao: 'Biologia', series: ['EM1', 'EM2', 'EM3'] },
  { codigo: 'HIS', descricao: 'História', series: ['EM1', 'EM2', 'EM3'] },
  { codigo: 'GEO', descricao: 'Geografia', series: ['EM1', 'EM2', 'EM3'] },
  { codigo: 'FIL', descricao: 'Filosofia', series: ['EM1', 'EM2'] },
  { codigo: 'SOC', descricao: 'Sociologia', series: ['EM1', 'EM2'] },
  { codigo: 'ACD', descricao: 'Academic Content Development', series: ['EM1', 'EM2', 'EM3'] },
  { codigo: 'ELD', descricao: 'English Language - Linguistic Development', series: ['EM1', 'EM2', 'EM3'] },
  { codigo: 'PROJ-VD', descricao: 'Projeto de Vida', series: ['EM1', 'EM2', 'EM3'] }
];

const NOMES = [
  ['Ana Beatriz Lima', 'F', '2009-03-14'], ['Rafael de Souza Alves', 'M', '2008-07-02'], ['Pedro Henrique Martins', 'M', '2008-11-21'],
  ['Larissa Nunes Prado', 'F', '2009-05-30'], ['Júlia Ferreira Campos', 'F', '2008-01-08'], ['Miguel Tavares Rocha', 'M', '2009-09-19'],
  ['Helena Duarte Pinto', 'F', '2008-04-27'], ['Gabriel Moreira Castro', 'M', '2009-02-11'], ['Beatriz Correia Alencar', 'F', '2007-05-12'],
  ['Lucas Andrade Ribeiro', 'M', '2008-08-15'], ['Mariana Costa Oliveira', 'F', '2009-12-03'], ['Enzo Barbosa Freitas', 'M', '2008-06-24']
];

// gerador pseudoaleatório determinístico (mesma semente → mesmas notas)
function semente(s: string): () => number {
  let h = 2166136261;
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1000) / 1000; };
}

interface Fixture { alunos: AlunoOrigem[]; matriculas: MatriculaOrigem[]; notas: NotaOrigem[] }

function gerar(anoLetivo: number): Fixture {
  const alunos: AlunoOrigem[] = [];
  const matriculas: MatriculaOrigem[] = [];
  const notas: NotaOrigem[] = [];
  NOMES.forEach(([nome, sexo, nasc], i) => {
    const codigo = `AS-${10000 + i}`;
    // aluno i entra na EM1 em (2023 + i % 3): cada ano letivo tem gente nas 3 séries
    const anoEntrada = 2023 + (i % 3);
    const indiceSerie = anoLetivo - anoEntrada;
    if (indiceSerie < 0 || indiceSerie > 2) return;
    const serie = SERIES[indiceSerie];
    const rnd = semente(`${codigo}-${anoLetivo}`);
    alunos.push({
      codigoOrigem: codigo, nome, sexo: sexo as 'M' | 'F', dataNascimento: nasc,
      municipioNascimento: i % 4 === 3 ? undefined : 'Mogi das Cruzes', ufNascimento: i % 4 === 3 ? undefined : 'SP',
      nacionalidade: 'Brasileira', cpf: `${String(100 + i).padStart(3, '0')}.${String(200 + i).padStart(3, '0')}.${String(300 + i).padStart(3, '0')}-0${i % 10}`,
      ra: i % 5 === 4 ? undefined : `000.${String(123 + i * 7).padStart(3, '0')}.${String(456 + i).padStart(3, '0')}-${i % 10}`,
      filiacao1: `Responsável ${i + 1}`, situacao: 'Matriculado'
    });
    const codMat = `${codigo}/${anoLetivo}`;
    matriculas.push({
      codigoOrigem: codMat, alunoCodigoOrigem: codigo, anoLetivo, serieCodigoOrigem: serie.codigo, serieDescricao: serie.descricao,
      turma: i % 2 === 0 ? 'A' : 'B', numeroMatricula: `${anoLetivo}${String(i + 1).padStart(4, '0')}`,
      dataMatricula: `${anoLetivo}-02-01`, situacaoFinal: anoLetivo < 2026 ? 'Aprovado' : 'Cursando', cargaHorariaTotal: indiceSerie === 2 ? 1260 : 1320
    });
    for (const d of DISCIPLINAS) {
      if (!d.series.includes(serie.codigo)) continue;
      const valor = Math.round((5.5 + rnd() * 4.5) * 10) / 10;
      const faltas = Math.floor(rnd() * 12);
      const ainda = anoLetivo >= 2026;
      notas.push({
        matriculaCodigoOrigem: codMat, disciplinaCodigoOrigem: d.codigo, disciplinaDescricao: d.descricao,
        valor: ainda ? undefined : valor, faltas, situacao: ainda ? 'Cursando' : valor >= 6 ? 'Aprovado' : 'Reprovado'
      });
    }
  });
  return { alunos, matriculas, notas };
}

function paginar<T>(itens: T[], pagina: number, tamanho = 50): ResultadoBusca<T> {
  const totalPaginas = Math.max(1, Math.ceil(itens.length / tamanho));
  return { itens: itens.slice((pagina - 1) * tamanho, pagina * tamanho), paginaAtual: pagina, totalPaginas, totalItens: itens.length };
}

export class AdaptadorMock implements AdaptadorAcademico {
  nome = 'Mock (dados de exemplo)';
  origem = 'mock' as const;

  async testarConexao() { return { ok: true, detalhe: 'Fixtures locais — nenhuma conexão externa.' }; }

  capacidades(): Capacidades {
    return { delta: false, cargaHoraria: false, situacaoFinal: true, faltas: true, documentosAluno: true, paginacao: true };
  }

  private filtrar(f: FiltroImportacao) {
    const fx = gerar(f.anoLetivo);
    const mats = fx.matriculas.filter(m =>
      (!f.serieCodigoOrigem || m.serieCodigoOrigem === f.serieCodigoOrigem) &&
      (!f.turma || (m.turma || '').toUpperCase() === f.turma.toUpperCase()) &&
      (!f.alunoCodigoOrigem || m.alunoCodigoOrigem === f.alunoCodigoOrigem));
    const codAlunos = new Set(mats.map(m => m.alunoCodigoOrigem));
    const codMats = new Set(mats.map(m => m.codigoOrigem));
    return {
      alunos: fx.alunos.filter(a => codAlunos.has(a.codigoOrigem)),
      matriculas: mats,
      notas: fx.notas.filter(n => codMats.has(n.matriculaCodigoOrigem))
    };
  }

  async buscarAlunos(f: FiltroImportacao, pagina = 1) { return paginar(this.filtrar(f).alunos, pagina); }
  async buscarMatriculas(f: FiltroImportacao, pagina = 1) { return paginar(this.filtrar(f).matriculas, pagina); }
  async buscarNotas(f: FiltroImportacao, pagina = 1) { return paginar(this.filtrar(f).notas, pagina); }
}
