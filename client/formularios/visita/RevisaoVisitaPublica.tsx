import type { AlunoVisitaForm } from './tipos';
import type { ResponsavelForm } from './PassoResponsaveis';
import type { ExtrasForm } from './PassoComplementares';

function fmtDataOnly(value: string): string {
  if (!value) return '-';
  const [y, m, d] = value.split('-');
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

function Item({ label, value, full }: { label: string; value?: string; full?: boolean }) {
  const temValor = value && value.trim();
  return (
    <div className={`review-item${full ? ' review-item-full' : ''}`}>
      <span className="review-item-label">{label}</span>
      <span className={`review-item-value${temValor ? '' : ' muted'}`}>{temValor ? value : '-'}</span>
    </div>
  );
}

export function RevisaoVisitaPublica({ alunos, escolaNome, escolaCidade, pai, mae, extras }: {
  alunos: AlunoVisitaForm[];
  escolaNome: string; escolaCidade: string;
  pai: ResponsavelForm; mae: ResponsavelForm;
  extras: ExtrasForm;
}) {
  return (
    <>
      <div className="review-card">
        <div className="review-card-header">
          <div className="review-card-icon"><i className="fa-solid fa-user-graduate"></i></div>
          <h3>Aluno(s)</h3>
          <button type="button" className="review-edit-btn" data-goto="1"><i className="fa-solid fa-pen"></i> Editar</button>
        </div>
        <div className="review-card-body">
          {alunos.map((s, i) => (
            <div key={s.id} className="review-student">
              <div className="review-student-header"><i className="fa-solid fa-child-reaching"></i> Aluno {i + 1}</div>
              <div className="review-grid">
                <Item label="Nome completo" value={s.nome} full />
                <Item label="Data de nascimento" value={s.nascimento ? fmtDataOnly(s.nascimento) : ''} />
                <Item label="Turma desejada" value={s.turma} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="review-card">
        <div className="review-card-header">
          <div className="review-card-icon"><i className="fa-solid fa-school"></i></div>
          <h3>Escola de origem</h3>
          <button type="button" className="review-edit-btn" data-goto="2"><i className="fa-solid fa-pen"></i> Editar</button>
        </div>
        <div className="review-card-body">
          <div className="review-grid">
            <Item label="Nome da escola" value={escolaNome} />
            <Item label="Cidade/Estado" value={escolaCidade} />
          </div>
        </div>
      </div>

      <div className="review-card">
        <div className="review-card-header">
          <div className="review-card-icon"><i className="fa-solid fa-people-roof"></i></div>
          <h3>Responsáveis</h3>
          <button type="button" className="review-edit-btn" data-goto="3"><i className="fa-solid fa-pen"></i> Editar</button>
        </div>
        <div className="review-card-body">
          <div className="review-student">
            <div className="review-student-header"><i className="fa-solid fa-user"></i> Responsável 1</div>
            <div className="review-grid">
              <Item label="Nome completo" value={pai.nome} full />
              <Item label="WhatsApp" value={pai.whatsapp} />
              <Item label="Profissão" value={pai.profissao} />
            </div>
          </div>
          <div className="review-student">
            <div className="review-student-header"><i className="fa-solid fa-user"></i> Responsável 2</div>
            <div className="review-grid">
              <Item label="Nome completo" value={mae.nome} full />
              <Item label="WhatsApp" value={mae.whatsapp} />
              <Item label="Profissão" value={mae.profissao} />
            </div>
          </div>
        </div>
      </div>

      <div className="review-card">
        <div className="review-card-header">
          <div className="review-card-icon"><i className="fa-solid fa-comment-dots"></i></div>
          <h3>Informações complementares</h3>
          <button type="button" className="review-edit-btn" data-goto="4"><i className="fa-solid fa-pen"></i> Editar</button>
        </div>
        <div className="review-card-body">
          <div className="review-grid">
            <Item label="Bairro onde reside" value={extras.bairro} full />
            <Item label="Motivo da visita" value={extras.motivo} full />
            <div className="review-item">
              <span className="review-item-label">Indicado por alguém</span>
              {extras.indicado === 'sim'
                ? <span className="review-badge yes"><i className="fa-solid fa-check"></i> Sim</span>
                : extras.indicado === 'nao'
                  ? <span className="review-badge no"><i className="fa-solid fa-xmark"></i> Não</span>
                  : <span className="review-item-value muted">-</span>}
            </div>
            {extras.indicado === 'sim' && <Item label="Nome da indicação" value={extras.indicacaoNome} />}
            <Item label="Observações" value={extras.observacoes} full />
          </div>
        </div>
      </div>
    </>
  );
}
