export interface ProvaForm {
  id: string;
  disciplina: string;
  data: string;
  segmento: 'lingua_materna' | 'lingua_inglesa' | null;
  motivo: 'medico' | 'outro' | null;
  observacoes: string;
}

export interface AlunoForm {
  id: string;
  nome: string;
  turma: string;
  provas: ProvaForm[];
}

// Um arquivo por DATA distinta entre as provas do aluno (não um por
// prova) — ver renderAnexoGroups() no wizard.js original.
export interface AnexoPorData {
  data: string;
  arquivoOriginal: File | null;
  arquivoPreparado: File | null; // depois da compressão (Step 7); igual ao original se não for imagem grande
}
