// Pré-visualização das carteirinhas (RF-CART-16). Par de
// views/pdf-carteirinhas.ejs: mesmo `DocCarteirinhas`, mesmo CSS
// (shared/carteirinha-documento.css) e as mesmas marcas
// (shared/carteirinha-folha.ts). Mexeu aqui, mexa lá.
import type { ReactNode } from 'react';
import '@shared/carteirinha-documento.css';
import { CARTOES_POR_FOLHA, type Cartao, type DocCarteirinhas } from '@shared/types/carteirinha';
import { INSTRUCAO_IMPRESSAO, emGrupos, estiloMarca, marcasDaFolha, posicaoRotuloDobra } from '@shared/carteirinha-folha';

const MM_PX = 96 / 25.4;

/** Uma tira: frente à esquerda, verso à direita. Também usada sozinha (prévia do modal da pasta). */
export function TiraCartao({ doc, c }: { doc: DocCarteirinhas; c: Cartao }) {
  return (
    <div className="cc-tira">
      <div className="cc-face cc-frente">
        <div className="cc-cab">
          <div className="cc-logo">{doc.colegio.logo ? <img src={doc.colegio.logo} alt="" /> : null}</div>
          <div className={`cc-evento cc-t${doc.evento.tamanho_nome}`}>{doc.evento.nome}</div>
          <div className="cc-logo">{doc.evento.logo ? <img src={doc.evento.logo} alt="" /> : null}</div>
        </div>
        <div className="cc-faixa">{c.turma}</div>
        <div className="cc-corpo">
          {c.foto ? <div className="cc-foto"><img src={c.foto} alt="" /></div> : <div className="cc-foto vazia">sem foto</div>}
          <dl className="cc-dados">
            <dt>Nome</dt><dd className={`cc-nome cc-t${c.tamanho_nome}`}>{c.nome}</dd>
            <dt>CPF</dt><dd>{c.cpf_censurado}</dd>
            <dt>Data de nascimento</dt><dd>{c.data_nascimento}</dd>
          </dl>
        </div>
        <div className="cc-rodape">Válida até <b>{doc.evento.validade || '—'}</b></div>
      </div>
      <div className="cc-face cc-verso">{doc.evento.logo ? <img src={doc.evento.logo} alt="" /> : null}</div>
    </div>
  );
}

/** Escala só visual: o documento continua em mm, como no PDF. */
function Escalado({ largura, altura, escala, children }: { largura: number; altura: number; escala: number; children: ReactNode }) {
  return (
    <div className="previa-doc-caixa" style={{ width: largura * MM_PX * escala, height: altura * MM_PX * escala }}>
      <div style={{ transform: `scale(${escala})`, transformOrigin: 'top left' }}>{children}</div>
    </div>
  );
}

/** Uma tira avulsa, no tamanho que couber (modal da pasta, ficha do aluno). */
export function PreviaTira({ doc, escala = 0.6 }: { doc: DocCarteirinhas; escala?: number }) {
  const c = doc.cartoes[0];
  if (!c) return null;
  return (
    <Escalado largura={190} altura={60} escala={escala}>
      <div className="folha-cartoes previa-tira" style={{ width: '190mm', height: '60mm' }}><TiraCartao doc={doc} c={c} /></div>
    </Escalado>
  );
}

export function PreviaCarteirinhas({ doc, escala = 0.7 }: { doc: DocCarteirinhas; escala?: number }) {
  const folhas = emGrupos(doc.cartoes, CARTOES_POR_FOLHA);
  const rotulo = posicaoRotuloDobra();
  return (
    <div className="previa-folhas">
      {folhas.map((cartoes, f) => (
        <figure key={f} className="previa-folha">
          <Escalado largura={210} altura={296} escala={escala}>
            <section className="folha-cartoes">
              <div className="cc-instrucao">{INSTRUCAO_IMPRESSAO}</div>
              {marcasDaFolha(cartoes.length).map((m, i) => <div key={i} className={`cc-marca ${m.tipo}`} style={estiloMarca(m)} />)}
              <div className="cc-dobra-rotulo" style={rotulo}>dobre</div>
              <div className="cc-tiras">{cartoes.map(c => <TiraCartao key={c.aluno_id} doc={doc} c={c} />)}</div>
            </section>
          </Escalado>
          <figcaption>Folha {f + 1} de {folhas.length}</figcaption>
        </figure>
      ))}
    </div>
  );
}
