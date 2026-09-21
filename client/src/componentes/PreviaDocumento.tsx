// Pré-visualização fiel do histórico (RF-HIST-02). Renderiza o mesmo
// objeto `HistoricoDocumento` que o template EJS de PDF renderiza, com o
// mesmo CSS (shared/historico-documento.css) — é o par deste arquivo em
// views/pdf-historico.ejs. Mexeu aqui, mexa lá.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import '@shared/historico-documento.css';
import { linhaRegistroSed, type HistoricoDocumento } from '@shared/types/historico';

interface Props {
  doc: HistoricoDocumento;
  /** assinatura_path → URL exibível (assinada). */
  imagens?: Record<string, string>;
  /** escala da folha na tela (1 = tamanho real). */
  escala?: number;
  pagina?: 'ambas' | 1 | 2;
}

// A4 a 96dpi: 210mm × 297mm. A escala é só visual — o documento em si
// continua em milímetros, para o PDF sair no tamanho certo.
const MM_PX = 96 / 25.4;
const LARGURA_PX = 210 * MM_PX;
const ALTURA_PX = 297 * MM_PX;

export function PreviaDocumento({ doc, imagens = {}, escala = 1, pagina = 'ambas' }: Props) {
  const folhas = useRef<(HTMLDivElement | null)[]>([]);
  const [transborda, setTransborda] = useState<number[]>([]);

  // A folha tem altura de papel e corta o que passa dela — igual à
  // impressora. Sem aviso, esse corte seria silencioso e a secretaria só
  // descobriria no PDF que o documento virou três páginas.
  useLayoutEffect(() => {
    const sobrando = folhas.current
      .map((el, i) => (el && el.getBoundingClientRect().height / escala > ALTURA_PX + 4 ? i + 1 : 0))
      .filter(Boolean) as number[];
    setTransborda(atual => (atual.join() === sobrando.join() ? atual : sobrando));
  }, [doc, escala, pagina]);

  const estiloCaixa = { width: LARGURA_PX * escala, height: ALTURA_PX * escala } as const;
  const estiloFolha = { transform: `scale(${escala})`, transformOrigin: 'top left' } as const;

  const folha = (conteudo: ReactNode, chave: string, indice: number) => (
    <div key={chave} className="doc-caixa" style={estiloCaixa}>
      <div className="doc-pagina" style={estiloFolha} ref={el => { folhas.current[indice] = el; }}>{conteudo}</div>
    </div>
  );

  return (
    <>
      {transborda.length ? (
        <div className="nota-lateral n-aviso">
          <b>O conteúdo não cabe na folha {transborda.join(' e ')}.</b> O que passa da margem sai numa página extra do PDF.
          Reduza as observações ou revise a quantidade de componentes da grade.
        </div>
      ) : null}
      <div className="doc-palco">
        {pagina !== 2 ? folha(<Pagina1 doc={doc} />, 'p1', 0) : null}
        {pagina !== 1 ? folha(<Pagina2 doc={doc} imagens={imagens} />, 'p2', 1) : null}
      </div>
    </>
  );
}

function Marcas({ doc }: { doc: HistoricoDocumento }) {
  return (
    <>
      {doc.via > 1 ? <div className="doc-selo-via">{doc.via}ª VIA</div> : null}
      {doc.status !== 'emitido' ? <div className="doc-marca-agua">{doc.status === 'cancelado' ? 'Cancelado' : 'Rascunho'}</div> : null}
    </>
  );
}

function Pagina1({ doc }: { doc: HistoricoDocumento }) {
  const nCols = doc.colunas.length;
  return (
    <>
      <Marcas doc={doc} />
      <div className="doc-cabecalho">
        <strong>{doc.cabecalho.titulo}</strong>
        {doc.cabecalho.linhas.length
          ? doc.cabecalho.linhas.map((l, i) => <span key={i}>{l}</span>)
          : <span className="doc-vazio">— mantenedora, atos legais e Diretoria de Ensino aparecem aqui —</span>}
      </div>

      <div className="doc-faixa">{doc.faixa}</div>

      <table className="doc-tabela doc-identificacao">
        <tbody>
          <tr>
            <th style={{ width: '42mm' }}>Nome do(a) aluno(a)</th>
            <td colSpan={3} className="doc-nome">{doc.aluno.nome}</td>
          </tr>
        </tbody>
      </table>
      <table className="doc-tabela doc-identificacao">
        <thead>
          <tr>
            <th>Data de nascimento</th>
            <th>Município / Estado</th>
            <th>Nacionalidade</th>
            <th>CIN / CPF nº</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{doc.aluno.nascimento || '—'}</td>
            <td>{doc.aluno.naturalidade || '—'}</td>
            <td>{doc.aluno.nacionalidade || '—'}</td>
            <td>{doc.aluno.documento || '—'}</td>
          </tr>
        </tbody>
      </table>

      <table className="doc-tabela doc-grade">
        <thead>
          <tr>
            <th className="doc-col-bloco">Bloco</th>
            <th className="doc-col-agrup">Área do conhecimento</th>
            <th className="doc-col-comp">Componente curricular</th>
            {doc.colunas.map(c => (
              <th key={c.matricula_id} className="doc-col-ano doc-ano-cab">
                <b>{c.ano}</b><span>{c.serie_codigo}</span><span>Nota</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {doc.blocos.length === 0 ? (
            <tr><td colSpan={3 + nCols} style={{ textAlign: 'center', padding: '4mm' }}>Sem componentes — verifique o currículo dos anos selecionados.</td></tr>
          ) : doc.blocos.flatMap(bloco => {
            const totalBloco = bloco.agrupamentos.reduce((n, ag) => n + ag.linhas.length, 0);
            let primeiraDoBloco = true;
            return bloco.agrupamentos.flatMap(ag => ag.linhas.map((linha, i) => {
              const abreBloco = primeiraDoBloco;
              primeiraDoBloco = false;
              return (
                <tr key={linha.chave}>
                  {abreBloco ? <td className="doc-bloco-vert" rowSpan={totalBloco}>{bloco.nome}</td> : null}
                  {i === 0 ? <td className="doc-agrup" rowSpan={ag.linhas.length}>{ag.nome}</td> : null}
                  <td>{linha.nome}</td>
                  {linha.celulas.map((c, j) => <td key={j} className="doc-nota">{c}</td>)}
                </tr>
              );
            }));
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}>Total geral de aulas anuais</td>
            {doc.totais.aulas.map((t, i) => <td key={i} className="doc-nota">{t}</td>)}
          </tr>
          <tr>
            <td colSpan={3}>Total geral de horas anuais</td>
            {doc.totais.horas.map((t, i) => <td key={i} className="doc-nota">{t}</td>)}
          </tr>
        </tfoot>
      </table>

      <table className="doc-tabela doc-estabelecimentos">
        <thead>
          <tr>
            <th style={{ width: '38mm' }}>Ensino</th>
            <th style={{ width: '22mm' }}>Ano / série</th>
            <th style={{ width: '18mm' }}>Ano</th>
            <th>Estabelecimento</th>
            <th style={{ width: '46mm' }}>Município / Estado</th>
          </tr>
        </thead>
        <tbody>
          {doc.estabelecimentos.map((e, i) => (
            <tr key={i}>
              <td>{i === 0 || doc.estabelecimentos[i - 1].ensino !== e.ensino ? e.ensino : ''}</td>
              <td>{e.serie}</td>
              <td>{e.ano}</td>
              <td className="doc-esq">{e.estabelecimento}</td>
              <td>{e.municipio_uf}</td>
            </tr>
          ))}
          {!doc.estabelecimentos.length ? <tr><td colSpan={5} style={{ textAlign: 'center' }}>—</td></tr> : null}
        </tbody>
      </table>
    </>
  );
}

function Pagina2({ doc, imagens }: { doc: HistoricoDocumento; imagens: Record<string, string> }) {
  const sed = linhaRegistroSed(doc.registro_sed);
  return (
    <>
      <Marcas doc={doc} />
      <div className="doc-secao doc-observacoes">
        <h2>Observações:</h2>
        {doc.observacoes.length
          ? doc.observacoes.map((o, i) => <p key={i}>{o}</p>)
          : <p className="doc-vazio">— sem observações —</p>}
      </div>

      {doc.certificado ? (
        <div className="doc-secao doc-certificado">
          <h2>Certificado</h2>
          <p>{doc.certificado.texto}</p>
          <p className="doc-local">{doc.certificado.local_data}</p>
        </div>
      ) : null}

      {sed ? <div className="doc-sed">{sed}</div> : null}

      <div className="doc-assinaturas">
        {doc.assinaturas.map((a, i) => (
          <div key={i}>
            {a.assinatura_path && imagens[a.assinatura_path] ? <img src={imagens[a.assinatura_path]} alt="" /> : null}
            <b>{a.nome}</b>
            <span>{a.cargo}</span>
            {a.rg ? <span>R.G nº {a.rg}</span> : null}
            {a.registro_autorizacao ? <span>Reg. nº {a.registro_autorizacao}</span> : null}
          </div>
        ))}
      </div>

      <div className="doc-rodape">
        {doc.registro ? (
          <div className="doc-registro">
            <span>Registro nº {doc.registro.numero}{doc.registro.livro ? ` · Livro ${doc.registro.livro}` : ''}{doc.registro.folha ? ` · Folha ${doc.registro.folha}` : ''}</span>
            <span>{doc.via > 1 ? `${doc.via}ª via` : '1ª via'}</span>
          </div>
        ) : null}
        <div>{doc.rodape}</div>
      </div>
    </>
  );
}
