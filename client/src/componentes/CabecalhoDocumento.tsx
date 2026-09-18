// Pré-visualização do cabeçalho do histórico (RF-INST-07): mesma função
// linhasCabecalho() que o template de PDF vai usar (RNF-04).
import { linhasCabecalho, type AtoLegal, type Instituicao } from '@shared/types/instituicao';

export function CabecalhoDocumento({ instituicao, atos, curso, compacto }:
  { instituicao: Partial<Instituicao> | null; atos: AtoLegal[]; curso?: string; compacto?: boolean }) {
  const { titulo, linhas } = linhasCabecalho(instituicao as Instituicao | null, atos);
  return (
    <article className="folha" style={{ maxWidth: 'none', padding: compacto ? '16px 18px' : undefined }}>
      <div className="folha-topo" style={{ marginBottom: 9 }}>
        <strong>{titulo}</strong>
        {linhas.length ? linhas.map((l, i) => <span key={i}>{l}</span>) : <span className="vazio-linha">— mantenedora, atos legais e Diretoria de Ensino aparecem aqui —</span>}
      </div>
      <div className="folha-faixa">HISTÓRICO ESCOLAR - {(curso || 'ENSINO MÉDIO BILÍNGUE').toUpperCase()}</div>
    </article>
  );
}
