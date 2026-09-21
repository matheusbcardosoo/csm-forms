// /app/config/observacoes — textos-padrão do bloco OBSERVAÇÕES do
// histórico (RF-HIST-04). São os parágrafos que a secretaria insere com
// um clique na pré-visualização; placeholders em {CHAVES} são editados à
// mão no documento, porque dependem do caso do aluno.
import { useState } from 'react';
import { api, ErroApi, mensagemErro, type CampoInvalido } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { useToast } from '@/hooks/useToast';
import { Aviso, Botao, Cabecalho, CampoArea, CampoSelect, CampoTexto, Card, Carregando, Confirmar, EstadoVazio, Modal, Tabela, Tag } from '@/componentes/ui';
import { ROTULO_ETAPA, type EtapaEnsino } from '@shared/types/curriculo';
import type { ObservacaoModelo } from '@shared/types/historico';

type Form = { id?: string; titulo: string; texto: string; base_legal: string; etapa: string; ativo: boolean; ordem: string };

const VAZIO: Form = { titulo: '', texto: '', base_legal: '', etapa: '', ativo: true, ordem: '' };

export function Observacoes() {
  const toast = useToast();
  const { dados, carregando, erro, recarregar } = useRecurso<ObservacaoModelo[]>('/api/historicos/observacoes/modelos');
  const [form, setForm] = useState<Form | null>(null);
  const [campos, setCampos] = useState<CampoInvalido[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [excluir, setExcluir] = useState<ObservacaoModelo | null>(null);

  async function executar(fn: () => Promise<unknown>, ok: string, fechar: () => void) {
    setSalvando(true); setCampos([]);
    try { await fn(); toast.ok(ok); fechar(); recarregar(); }
    catch (err) { if (err instanceof ErroApi && err.campos.length) setCampos(err.campos); toast.erro(mensagemErro(err)); }
    finally { setSalvando(false); }
  }

  const salvar = () => {
    if (!form) return;
    const corpo = { ...form, ordem: form.ordem === '' ? null : Number(form.ordem), etapa: form.etapa || null };
    return executar(
      () => form.id ? api.put(`/api/historicos/observacoes/modelos/${form.id}`, corpo) : api.post('/api/historicos/observacoes/modelos', corpo),
      form.id ? 'Texto atualizado.' : 'Texto criado.',
      () => setForm(null)
    );
  };

  return (
    <div className="wrap">
      <Cabecalho titulo="Textos de observação" descricao="Parágrafos reutilizáveis do bloco OBSERVAÇÕES do histórico"
        acoes={<Botao variante="primario" icone="mais" onClick={() => { setForm({ ...VAZIO }); setCampos([]); }}>Novo texto</Botao>} />

      <div style={{ marginBottom: 14 }}>
        <Aviso><b>Como isso aparece no documento.</b> Cada texto vira um parágrafo do bloco OBSERVAÇÕES, no verso. Na pré-visualização, um clique insere o texto e a secretaria substitui os campos entre chaves — <code>{'{ANO}'}</code>, <code>{'{SÉRIE}'}</code>, <code>{'{COMPONENTE}'}</code> — pelo caso do aluno. O critério de promoção fica no cadastro do <b>curso</b> e já entra sozinho em cada documento novo.</Aviso>
      </div>

      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      <Card semCorpo>
        {carregando && !dados ? <Carregando /> : (
          <Tabela<ObservacaoModelo>
            linhas={dados || []}
            chave={o => o.id}
            vazio={<EstadoVazio icone="documento" titulo="Nenhum texto cadastrado" descricao="Os textos-padrão poupam digitação e mantêm a redação igual em todos os documentos." />}
            colunas={[
              { chave: 'titulo', rotulo: 'Título', principal: true, render: o => <><span className="nome-cel">{o.titulo}</span><span className="sub">{o.texto.slice(0, 110)}{o.texto.length > 110 ? '…' : ''}</span></> },
              { chave: 'etapa', rotulo: 'Etapa', render: o => o.etapa ? ROTULO_ETAPA[o.etapa] : <span className="cel-sub">todas</span> },
              { chave: 'base', rotulo: 'Base legal', render: o => o.base_legal || <span className="cel-sub">—</span> },
              { chave: 'ativo', rotulo: 'Situação', render: o => o.ativo ? <Tag tipo="ok" ponto>Ativo</Tag> : <Tag ponto>Inativo</Tag> },
              { chave: 'a', rotulo: 'Ações', acoes: true, render: o => <>
                <Botao pequeno onClick={() => { setForm({ id: o.id, titulo: o.titulo, texto: o.texto, base_legal: o.base_legal || '', etapa: o.etapa || '', ativo: o.ativo, ordem: String(o.ordem) }); setCampos([]); }}>Editar</Botao>
                <Botao pequeno variante="fantasma" onClick={() => setExcluir(o)}>Excluir</Botao>
              </> }
            ]}
          />
        )}
      </Card>

      <Modal aberto={!!form} titulo={form?.id ? 'Editar texto' : 'Novo texto'} aoFechar={() => setForm(null)}
        rodape={<><Botao onClick={() => setForm(null)}>Cancelar</Botao><Botao variante="primario" icone="check" carregando={salvando} onClick={salvar}>Salvar</Botao></>}>
        {form ? <div className="form-grade">
          <CampoTexto className="col-2" rotulo="Título" name="titulo" value={form.titulo} onChange={e => setForm(f => f && ({ ...f, titulo: e.target.value }))} erros={campos} obrigatorio autoFocus
            dica="Só aparece no painel — é o rótulo do botão que insere o texto." />
          <CampoArea className="col-2" rotulo="Texto" name="texto" rows={4} value={form.texto} onChange={e => setForm(f => f && ({ ...f, texto: e.target.value }))} erros={campos} obrigatorio
            dica="Use {CHAVES} nos trechos que mudam a cada aluno." />
          <CampoTexto rotulo="Base legal" name="base_legal" value={form.base_legal} onChange={e => setForm(f => f && ({ ...f, base_legal: e.target.value }))} erros={campos} placeholder="ex.: Regimento Escolar" />
          <CampoSelect rotulo="Etapa" name="etapa" value={form.etapa} onChange={e => setForm(f => f && ({ ...f, etapa: e.target.value }))} erros={campos}>
            <option value="">Todas</option>
            {(Object.keys(ROTULO_ETAPA) as EtapaEnsino[]).map(e => <option key={e} value={e}>{ROTULO_ETAPA[e]}</option>)}
          </CampoSelect>
          <CampoTexto rotulo="Ordem" name="ordem" type="number" inputMode="numeric" value={form.ordem} onChange={e => setForm(f => f && ({ ...f, ordem: e.target.value }))} erros={campos} />
          <CampoSelect rotulo="Situação" value={form.ativo ? '1' : ''} onChange={e => setForm(f => f && ({ ...f, ativo: !!e.target.value }))}>
            <option value="1">Ativo</option><option value="">Inativo</option>
          </CampoSelect>
        </div> : null}
      </Modal>

      <Confirmar aberto={!!excluir} titulo="Excluir este texto?" perigo rotuloConfirmar="Excluir" carregando={salvando}
        descricao={`"${excluir?.titulo}" deixa de aparecer na pré-visualização. Documentos já emitidos não mudam — o texto está congelado no snapshot deles.`}
        aoFechar={() => setExcluir(null)}
        aoConfirmar={() => excluir && executar(() => api.del(`/api/historicos/observacoes/modelos/${excluir.id}`), 'Texto excluído.', () => setExcluir(null))} />
    </div>
  );
}
