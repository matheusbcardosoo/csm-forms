// Pré-visualização da ficha de inscrição (RF-CART-16). Par de
// views/pdf-ficha-inscricao.ejs: mesmo `DocFichaInscricao`, mesmo CSS
// (shared/carteirinha-documento.css). Mexeu aqui, mexa lá.
import '@shared/carteirinha-documento.css';
import type { DocFichaInscricao } from '@shared/types/carteirinha';

const MM_PX = 96 / 25.4;
const dois = (n: number) => String(n).padStart(2, '0');

export function PreviaFichaInscricao({ doc, escala = 0.5 }: { doc: DocFichaInscricao; escala?: number }) {
  return (
    <div className="previa-folhas">
      {doc.folhas.map((folha, f) => (
        <figure key={f} className="previa-folha">
          <div className="previa-doc-caixa" style={{ width: 297 * MM_PX * escala, height: 209 * MM_PX * escala }}>
            <div style={{ transform: `scale(${escala})`, transformOrigin: 'top left' }}>
              <section className="folha-ficha">
                <div className="fi-cab">
                  {doc.folhas.length > 1 ? <div className="fi-folha">Folha {f + 1} de {doc.folhas.length}</div> : null}
                  <h1>FICHA DE INSCRIÇÃO ESCOLAR</h1>
                  <h2>{doc.evento.nome} — {doc.subpasta.nome}</h2>
                  <p>Registro Oficial de Inscritos e Homologação da Direção</p>
                  {doc.evento.logo ? <div className="fi-logo"><img src={doc.evento.logo} alt="" /></div> : null}
                </div>

                <div className="fi-grade">
                  {folha.vagas.map(({ numero, inscrito: i }) => (
                    <div key={numero} className="fi-vaga">
                      {i?.foto
                        ? <div className="fi-foto com-foto"><img src={i.foto} alt="" /><span className="fi-numero">#{dois(numero)}</span></div>
                        : <div className="fi-foto">FOTO<br />3x4<span className="fi-numero">#{dois(numero)}</span></div>}
                      <div className="fi-campos">
                        <div className="fi-linha"><b>Nome:</b>{i ? <span className="fi-valor fi-nome">{i.nome}</span> : <span className="fi-pontilhado" />}</div>
                        <div className="fi-linha">
                          <b>Doc:</b>{i ? <span className="fi-valor">{i.cpf}</span> : <span className="fi-pontilhado" />}
                          <b>Nasc:</b>{i ? <span className="fi-nasc">{i.data_nascimento}</span> : <span className="fi-pontilhado" style={{ flex: '0 0 16mm' }} />}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="fi-rodape">
                  <div className="fi-bloco">
                    <h3>Professor(a) responsável</h3>
                    {doc.subpasta.professor
                      ? <p className="fi-texto">Nome: <span className="fi-preenchido">{doc.subpasta.professor}</span></p>
                      : <><p className="fi-texto">Nome:</p><div className="fi-pontilhado" style={{ flex: '0 0 auto' }} /></>}
                    <div className="fi-assinatura">Assinatura do Responsável</div>
                  </div>
                  <div className="fi-bloco">
                    <h3>Direção do colégio</h3>
                    <p className="fi-texto">Atesto a veracidade das informações e documentos apresentados para os <b>{folha.quantidade}</b> alunos inscritos acima.</p>
                    {doc.diretor
                      ? <p className="fi-texto">Diretor(a): <span className="fi-preenchido">{doc.diretor}</span></p>
                      : <><p className="fi-texto">Diretor(a):</p><div className="fi-pontilhado" style={{ flex: '0 0 auto' }} /></>}
                    <div className="fi-assinatura">Assinatura da Direção</div>
                  </div>
                  <div className="fi-bloco">
                    <h3>Carimbo</h3>
                    <div className="fi-carimbo">Espaço reservado para<b>CARIMBO DA ESCOLA</b></div>
                  </div>
                </div>
              </section>
            </div>
          </div>
          <figcaption>Folha {f + 1} de {doc.folhas.length}</figcaption>
        </figure>
      ))}
    </div>
  );
}
