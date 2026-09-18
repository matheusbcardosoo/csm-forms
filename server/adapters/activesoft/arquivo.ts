// Adaptador de arquivo (RF-INT-09): CSV com colunas nomeadas como o
// contrato canônico. Plano B se a API não cobrir tudo; usa o mesmo
// pipeline de validação. Delimitador , ou ; detectado automaticamente.
import type { AdaptadorAcademico, AlunoOrigem, MatriculaOrigem, NotaOrigem, FiltroImportacao, ResultadoBusca, Capacidades } from './tipos';

export interface ArquivosImportacao { alunos?: string; matriculas?: string; notas?: string }

export const COLUNAS_MODELO = {
  alunos: ['codigoOrigem', 'nome', 'nomeSocial', 'dataNascimento', 'municipioNascimento', 'ufNascimento', 'paisNascimento', 'nacionalidade', 'sexo', 'rg', 'rgOrgao', 'rgUf', 'cpf', 'cin', 'ra', 'filiacao1', 'filiacao2', 'situacao'],
  matriculas: ['codigoOrigem', 'alunoCodigoOrigem', 'anoLetivo', 'serieCodigoOrigem', 'serieDescricao', 'turma', 'numeroMatricula', 'dataMatricula', 'dataSaida', 'situacaoFinal', 'cargaHorariaTotal'],
  notas: ['matriculaCodigoOrigem', 'disciplinaCodigoOrigem', 'disciplinaDescricao', 'valor', 'conceito', 'cargaHoraria', 'faltas', 'situacao']
} as const;

export function lerCsv(texto: string): Record<string, string>[] {
  const limpo = texto.replace(/^﻿/, '');
  const primeira = limpo.split(/\r?\n/)[0] || '';
  const delim = (primeira.match(/;/g) || []).length > (primeira.match(/,/g) || []).length ? ';' : ',';
  const linhas: string[][] = [];
  let atual: string[] = [];
  let campo = '';
  let aspas = false;
  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];
    if (aspas) {
      if (c === '"') { if (limpo[i + 1] === '"') { campo += '"'; i++; } else aspas = false; }
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === delim) { atual.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && limpo[i + 1] === '\n') i++;
      atual.push(campo); campo = '';
      if (atual.some(v => v.trim() !== '')) linhas.push(atual);
      atual = [];
    } else campo += c;
  }
  if (campo !== '' || atual.length) { atual.push(campo); if (atual.some(v => v.trim() !== '')) linhas.push(atual); }
  if (!linhas.length) return [];
  const cab = linhas[0].map(h => h.trim());
  return linhas.slice(1).map(l => Object.fromEntries(cab.map((h, i) => [h, (l[i] ?? '').trim()])));
}

const num = (v: string | undefined) => (v == null || v === '' ? undefined : Number(String(v).replace(',', '.')));
const txt = (v: string | undefined) => (v == null || v === '' ? undefined : v);

export class AdaptadorArquivo implements AdaptadorAcademico {
  nome = 'Arquivo CSV';
  origem = 'arquivo_csv' as const;
  private alunos: AlunoOrigem[];
  private matriculas: MatriculaOrigem[];
  private notas: NotaOrigem[];

  constructor(arquivos: ArquivosImportacao) {
    this.alunos = lerCsv(arquivos.alunos || '').map(r => ({
      codigoOrigem: r.codigoOrigem, nome: r.nome, nomeSocial: txt(r.nomeSocial), dataNascimento: txt(r.dataNascimento),
      municipioNascimento: txt(r.municipioNascimento), ufNascimento: txt(r.ufNascimento), paisNascimento: txt(r.paisNascimento),
      nacionalidade: txt(r.nacionalidade), sexo: txt(r.sexo) as AlunoOrigem['sexo'], rg: txt(r.rg), rgOrgao: txt(r.rgOrgao), rgUf: txt(r.rgUf),
      cpf: txt(r.cpf), cin: txt(r.cin), ra: txt(r.ra), filiacao1: txt(r.filiacao1), filiacao2: txt(r.filiacao2), situacao: txt(r.situacao)
    })).filter(a => a.codigoOrigem && a.nome);
    this.matriculas = lerCsv(arquivos.matriculas || '').map(r => ({
      codigoOrigem: r.codigoOrigem, alunoCodigoOrigem: r.alunoCodigoOrigem, anoLetivo: Number(r.anoLetivo), serieCodigoOrigem: r.serieCodigoOrigem,
      serieDescricao: txt(r.serieDescricao), turma: txt(r.turma), numeroMatricula: txt(r.numeroMatricula), dataMatricula: txt(r.dataMatricula),
      dataSaida: txt(r.dataSaida), situacaoFinal: txt(r.situacaoFinal), cargaHorariaTotal: num(r.cargaHorariaTotal)
    })).filter(m => m.codigoOrigem && m.alunoCodigoOrigem && m.anoLetivo && m.serieCodigoOrigem);
    this.notas = lerCsv(arquivos.notas || '').map(r => ({
      matriculaCodigoOrigem: r.matriculaCodigoOrigem, disciplinaCodigoOrigem: r.disciplinaCodigoOrigem, disciplinaDescricao: txt(r.disciplinaDescricao),
      valor: num(r.valor), conceito: txt(r.conceito), cargaHoraria: num(r.cargaHoraria), faltas: num(r.faltas), situacao: txt(r.situacao)
    })).filter(n => n.matriculaCodigoOrigem && n.disciplinaCodigoOrigem);
  }

  async testarConexao() { return { ok: true, detalhe: `${this.alunos.length} alunos · ${this.matriculas.length} matrículas · ${this.notas.length} notas no arquivo` }; }

  capacidades(): Capacidades {
    return { delta: false, cargaHoraria: this.notas.some(n => n.cargaHoraria != null), situacaoFinal: this.matriculas.some(m => !!m.situacaoFinal), faltas: this.notas.some(n => n.faltas != null), documentosAluno: this.alunos.some(a => !!a.cpf || !!a.rg), paginacao: false };
  }

  private mats(f: FiltroImportacao) {
    return this.matriculas.filter(m => m.anoLetivo === f.anoLetivo &&
      (!f.serieCodigoOrigem || m.serieCodigoOrigem === f.serieCodigoOrigem) &&
      (!f.turma || (m.turma || '').toUpperCase() === f.turma.toUpperCase()) &&
      (!f.alunoCodigoOrigem || m.alunoCodigoOrigem === f.alunoCodigoOrigem));
  }

  private tudo<T>(itens: T[]): ResultadoBusca<T> { return { itens, paginaAtual: 1, totalPaginas: 1, totalItens: itens.length }; }

  async buscarAlunos(f: FiltroImportacao) {
    const cod = new Set(this.mats(f).map(m => m.alunoCodigoOrigem));
    // Arquivo só de alunos (sem matrículas): importa todos
    return this.tudo(this.matriculas.length ? this.alunos.filter(a => cod.has(a.codigoOrigem)) : this.alunos);
  }
  async buscarMatriculas(f: FiltroImportacao) { return this.tudo(this.mats(f)); }
  async buscarNotas(f: FiltroImportacao) {
    const cod = new Set(this.mats(f).map(m => m.codigoOrigem));
    return this.tudo(this.matriculas.length ? this.notas.filter(n => cod.has(n.matriculaCodigoOrigem)) : this.notas);
  }
}
