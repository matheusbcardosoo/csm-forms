// Revisão somente-leitura de uma resposta já enviada — porta a formatação
// de public/js/review-renderer.js (usada no modal "Ver detalhes" de
// /app/formularios/respostas) para React, com os primitivos do próprio
// painel (Card, CampoLeitura, Tag) em vez das classes .review-* do site
// público, que não existem no bundle do painel.
import { Botao, Card, CampoLeitura, Tag, fmtData } from '@/componentes/ui';

export interface DadosVisita {
  students?: { nome?: string; nascimento?: string; turma?: string }[];
  escola?: { nome?: string; cidadeEstado?: string };
  responsaveis?: {
    pai?: { nome?: string; whatsapp?: string; profissao?: string };
    mae?: { nome?: string; whatsapp?: string; profissao?: string };
  };
  extras?: { bairro?: string; motivo?: string; indicado?: 'sim' | 'nao' | null; indicacaoNome?: string; observacoes?: string };
}

export interface ProvaAvaliacao {
  id: string;
  disciplina?: string;
  segmento?: string;
  data?: string;
  motivo?: { tipo?: string; observacoes?: string };
  anexo?: { path?: string; nome?: string; tipo?: string };
}

export interface DadosAvaliacao {
  alunos?: { id?: string; nome?: string; turma?: string; provas?: ProvaAvaliacao[] }[];
}

const SEGMENTO_LABELS: Record<string, string> = { lingua_materna: 'Língua materna', lingua_inglesa: 'Língua inglesa' };
const MOTIVO_LABELS: Record<string, string> = { medico: 'Atestado médico', outro: 'Outro motivo (pagamento de taxa)' };

export function RevisaoVisita({ data }: { data: DadosVisita }) {
  const escola = data.escola || {};
  const pai = data.responsaveis?.pai || {};
  const mae = data.responsaveis?.mae || {};
  const extras = data.extras || {};

  return (
    <div className="pilha">
      <Card titulo="Aluno(s)">
        {(data.students || []).map((s, i) => (
          <div key={i} className="form-sec">
            <h3>Aluno {i + 1}</h3>
            <div className="form-grade g3">
              <CampoLeitura rotulo="Nome completo" valor={s.nome} />
              <CampoLeitura rotulo="Data de nascimento" valor={s.nascimento ? fmtData(s.nascimento) : undefined} />
              <CampoLeitura rotulo="Turma desejada" valor={s.turma} />
            </div>
          </div>
        ))}
      </Card>

      <Card titulo="Escola de origem">
        <div className="form-grade g3">
          <CampoLeitura rotulo="Nome da escola" valor={escola.nome} />
          <CampoLeitura rotulo="Cidade/Estado" valor={escola.cidadeEstado} />
        </div>
      </Card>

      <Card titulo="Responsáveis">
        <div className="form-sec">
          <h3>Responsável 1</h3>
          <div className="form-grade g3">
            <CampoLeitura rotulo="Nome completo" valor={pai.nome} />
            <CampoLeitura rotulo="WhatsApp" valor={pai.whatsapp} />
            <CampoLeitura rotulo="Profissão" valor={pai.profissao} />
          </div>
        </div>
        <div className="form-sec">
          <h3>Responsável 2</h3>
          <div className="form-grade g3">
            <CampoLeitura rotulo="Nome completo" valor={mae.nome} />
            <CampoLeitura rotulo="WhatsApp" valor={mae.whatsapp} />
            <CampoLeitura rotulo="Profissão" valor={mae.profissao} />
          </div>
        </div>
      </Card>

      <Card titulo="Informações complementares">
        <div className="form-grade g3">
          <CampoLeitura rotulo="Bairro onde reside" valor={extras.bairro} />
          <div className="campo">
            <label>Indicado por alguém</label>
            <div>
              {extras.indicado === 'sim' ? <Tag tipo="ok" ponto>Sim</Tag>
                : extras.indicado === 'nao' ? <Tag tipo="neutro" ponto>Não</Tag>
                : <span className="campo-leitura vazio">—</span>}
            </div>
          </div>
          {extras.indicado === 'sim' ? <CampoLeitura rotulo="Nome da indicação" valor={extras.indicacaoNome} /> : null}
        </div>
        <div className="form-sec"><CampoLeitura rotulo="Motivo da visita" valor={extras.motivo} /></div>
        <div className="form-sec"><CampoLeitura rotulo="Observações" valor={extras.observacoes} /></div>
      </Card>
    </div>
  );
}

export function RevisaoAvaliacao({ data, aoAbrirAnexo, carregandoAnexos }: {
  data: DadosAvaliacao;
  aoAbrirAnexo: (provaId: string) => void;
  carregandoAnexos: Set<string>;
}) {
  return (
    <div className="pilha">
      {(data.alunos || []).map((aluno, alunoIdx) => {
        const provas = aluno.provas || [];
        const grupos: { data?: string; provas: ProvaAvaliacao[] }[] = [];
        const porData = new Map<string, { data?: string; provas: ProvaAvaliacao[] }>();
        provas.forEach(prova => {
          const chave = prova.data || `_sem-data-${grupos.length}`;
          let grupo = porData.get(chave);
          if (!grupo) { grupo = { data: prova.data, provas: [] }; porData.set(chave, grupo); grupos.push(grupo); }
          grupo.provas.push(prova);
        });

        let contador = 0;

        return (
          <Card key={aluno.id || alunoIdx} titulo={`Aluno ${alunoIdx + 1}${aluno.nome ? ' — ' + aluno.nome : ''}`}>
            <div className="form-grade g3">
              <CampoLeitura rotulo="Nome completo" valor={aluno.nome} />
              <CampoLeitura rotulo="Turma" valor={aluno.turma} />
            </div>

            {grupos.map((grupo, gi) => {
              const anexosUnicos: { nome?: string; provaId: string }[] = [];
              const vistos = new Set<string>();
              grupo.provas.forEach(prova => {
                if (!prova.anexo?.nome) return;
                const chave = `${prova.anexo.nome}|${prova.anexo.tipo}`;
                if (vistos.has(chave)) return;
                vistos.add(chave);
                anexosUnicos.push({ nome: prova.anexo.nome, provaId: prova.id });
              });
              const disciplinasGrupo = grupo.provas.map(p => p.disciplina).filter(Boolean).join(', ');
              const sufixo = (grupo.data ? ` — ${fmtData(grupo.data)}` : '') + (disciplinasGrupo ? ` (${disciplinasGrupo})` : '');

              return (
                <div key={gi} className="form-sec">
                  {grupo.provas.map(prova => {
                    contador += 1;
                    return (
                      <div key={prova.id} style={{ marginBottom: 10 }}>
                        <h3>Avaliação {contador}</h3>
                        <div className="form-grade g3">
                          <CampoLeitura rotulo="Disciplina" valor={prova.disciplina} />
                          <CampoLeitura rotulo="Segmento" valor={prova.segmento ? (SEGMENTO_LABELS[prova.segmento] || prova.segmento) : undefined} />
                          <CampoLeitura rotulo="Data da avaliação perdida" valor={prova.data ? fmtData(prova.data) : undefined} />
                          <CampoLeitura rotulo="Motivo" valor={prova.motivo?.tipo ? (MOTIVO_LABELS[prova.motivo.tipo] || prova.motivo.tipo) : undefined} />
                          <CampoLeitura rotulo="Observações" valor={prova.motivo?.observacoes} />
                        </div>
                      </div>
                    );
                  })}
                  <div className="campo">
                    <label>Documento anexado{sufixo}</label>
                    {anexosUnicos.length
                      ? anexosUnicos.map(anexo => (
                          <div key={anexo.provaId} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span className="campo-leitura" style={{ flex: 1 }}>{anexo.nome}</span>
                            <Botao pequeno icone="olho" carregando={carregandoAnexos.has(anexo.provaId)} onClick={() => aoAbrirAnexo(anexo.provaId)}>Ver anexo</Botao>
                          </div>
                        ))
                      : <div className="campo-leitura vazio">Nenhum documento anexado.</div>}
                  </div>
                </div>
              );
            })}
          </Card>
        );
      })}
    </div>
  );
}
