// /app/config/instituicao (04-telas §3.8): formulário em seções com a
// pré-visualização do cabeçalho ao lado, atualizando conforme se digita.
import { useEffect, useState, type FormEvent } from 'react';
import { api, ErroApi, mensagemErro, type CampoInvalido } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { useSessao } from '@/hooks/useSessao';
import { useToast } from '@/hooks/useToast';
import { Aviso, Botao, BotaoLink, Cabecalho, CampoTexto, Card, Carregando } from '@/componentes/ui';
import { CabecalhoDocumento } from '@/componentes/CabecalhoDocumento';
import type { AtoLegal, Instituicao as TInstituicao, Signatario } from '@shared/types/instituicao';

interface Resposta { instituicao: TInstituicao | null; atos: AtoLegal[]; signatarios: Signatario[] }

const VAZIO: Partial<TInstituicao> = { nome_fantasia: 'Colégio São Marcos', municipio: 'Mogi das Cruzes', uf: 'SP' };

export function Instituicao() {
  const { ehAdmin } = useSessao();
  const toast = useToast();
  const { dados, carregando, erro, recarregar } = useRecurso<Resposta>('/api/instituicao');
  const [form, setForm] = useState<Partial<TInstituicao>>(VAZIO);
  const [sujo, setSujo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [campos, setCampos] = useState<CampoInvalido[]>([]);

  useEffect(() => { if (dados) { setForm(dados.instituicao || VAZIO); setSujo(false); } }, [dados]);

  const def = (k: keyof TInstituicao) => (e: { target: { value: string } }) => { setForm(f => ({ ...f, [k]: e.target.value })); setSujo(true); };
  const v = (k: keyof TInstituicao) => (form[k] as string | null | undefined) ?? '';

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true); setCampos([]);
    try {
      await api.put('/api/instituicao', form);
      toast.ok('Dados da instituição salvos.');
      setSujo(false);
      recarregar();
    } catch (err) {
      if (err instanceof ErroApi && err.campos.length) setCampos(err.campos);
      toast.erro(mensagemErro(err));
    } finally { setSalvando(false); }
  }

  const so = !ehAdmin;

  return (
    <div className="wrap">
      <Cabecalho titulo="Instituição" descricao="Estes dados alimentam o cabeçalho de todo documento emitido. Digite uma vez, use sempre." />
      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}
      {so ? <div style={{ marginBottom: 14 }}><Aviso>Somente administradores alteram o cadastro da instituição. Você pode consultar.</Aviso></div> : null}

      <div className="conf">
        <form onSubmit={salvar} noValidate>
          <Card semCorpo>
            <div className="card-corpo">
              {carregando && !dados ? <Carregando /> : null}
              <fieldset disabled={so || salvando} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
                <div className="form-sec"><h3>Identificação</h3><div className="form-grade">
                  <CampoTexto className="col-2" rotulo="Nome fantasia" dica="É o que sai no topo do documento, em maiúsculas." name="nome_fantasia" value={v('nome_fantasia')} onChange={def('nome_fantasia')} erros={campos} obrigatorio />
                  <CampoTexto className="col-2" rotulo="Razão social" name="razao_social" value={v('razao_social')} onChange={def('razao_social')} erros={campos} />
                  <CampoTexto rotulo="CNPJ" name="cnpj" inputMode="numeric" value={v('cnpj')} onChange={def('cnpj')} erros={campos} />
                  <CampoTexto rotulo="Código INEP" name="codigo_inep" inputMode="numeric" value={v('codigo_inep')} onChange={def('codigo_inep')} erros={campos} />
                </div></div>

                <div className="form-sec"><h3>Vinculação e mantenedora</h3><div className="form-grade">
                  <CampoTexto className="col-2" rotulo={<>Diretoria de Ensino <small>— sai no cabeçalho</small></>} name="orgao_regional" value={v('orgao_regional')} onChange={def('orgao_regional')} erros={campos} />
                  <CampoTexto rotulo={<>Mantenedora <small>— sai no cabeçalho</small></>} name="mantenedora_nome" value={v('mantenedora_nome')} onChange={def('mantenedora_nome')} erros={campos} />
                  <CampoTexto rotulo="CNPJ da mantenedora" name="mantenedora_cnpj" inputMode="numeric" value={v('mantenedora_cnpj')} onChange={def('mantenedora_cnpj')} erros={campos} />
                </div></div>

                <div className="form-sec"><h3>Endereço</h3><div className="form-grade">
                  <CampoTexto className="col-2" rotulo="Logradouro" name="endereco_logradouro" value={v('endereco_logradouro')} onChange={def('endereco_logradouro')} erros={campos} />
                  <CampoTexto rotulo="Número" name="endereco_numero" value={v('endereco_numero')} onChange={def('endereco_numero')} erros={campos} />
                  <CampoTexto rotulo="Complemento" name="endereco_complemento" value={v('endereco_complemento')} onChange={def('endereco_complemento')} erros={campos} />
                  <CampoTexto rotulo="Bairro" name="bairro" value={v('bairro')} onChange={def('bairro')} erros={campos} />
                  <CampoTexto rotulo="CEP" name="cep" inputMode="numeric" value={v('cep')} onChange={def('cep')} erros={campos} />
                  <CampoTexto rotulo="Município" name="municipio" value={v('municipio')} onChange={def('municipio')} erros={campos} />
                  <CampoTexto rotulo="UF" name="uf" maxLength={2} value={v('uf')} onChange={def('uf')} erros={campos} />
                </div></div>

                <div className="form-sec"><h3>Contato</h3><div className="form-grade">
                  <CampoTexto rotulo="Telefone" name="telefone" inputMode="tel" value={v('telefone')} onChange={def('telefone')} erros={campos} />
                  <CampoTexto rotulo="Telefone secundário" name="telefone_secundario" inputMode="tel" value={v('telefone_secundario')} onChange={def('telefone_secundario')} erros={campos} />
                  <CampoTexto rotulo="E-mail" name="email" type="email" inputMode="email" value={v('email')} onChange={def('email')} erros={campos} />
                  <CampoTexto rotulo="Site" name="site" inputMode="url" value={v('site')} onChange={def('site')} erros={campos} />
                </div></div>
              </fieldset>
            </div>
            {!so ? (
              <div className="barra-fixa">
                <span className="estado">{sujo ? 'Alterações não salvas' : dados?.instituicao?.atualizado_em ? 'Salvo' : ''}</span>
                <Botao onClick={() => { setForm(dados?.instituicao || VAZIO); setSujo(false); setCampos([]); }} disabled={!sujo}>Descartar</Botao>
                <Botao variante="primario" type="submit" carregando={salvando} disabled={!sujo} icone="check">Salvar</Botao>
              </div>
            ) : null}
          </Card>
        </form>

        <aside className="conf-lado">
          <Card titulo="Como sai no documento" descricao="Atualiza enquanto você digita" semCorpo>
            <div className="card-corpo" style={{ background: 'var(--superficie-2)', borderRadius: '0 0 var(--r-lg) var(--r-lg)' }}>
              <CabecalhoDocumento instituicao={form} atos={dados?.atos || []} compacto />
            </div>
          </Card>
          <Aviso><b>O histórico não imprime endereço, CNPJ, INEP nem logotipo.</b> Esses campos ficam guardados para outros documentos — o cabeçalho do histórico é só nome, mantenedora, atos e Diretoria de Ensino.</Aviso>
          <div className="acoes">
            <BotaoLink to="/app/config/atos-legais" pequeno icone="selo">Atos legais ({dados?.atos.filter(a => a.ativo).length ?? 0})</BotaoLink>
            <BotaoLink to="/app/config/signatarios" pequeno icone="assinatura">Signatários ({dados?.signatarios.filter(s => s.ativo).length ?? 0})</BotaoLink>
          </div>
        </aside>
      </div>
    </div>
  );
}
