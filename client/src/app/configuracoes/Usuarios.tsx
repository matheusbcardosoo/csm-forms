// /app/config/usuarios — equipe e papéis (admin e secretaria).
// Adicionar alguém cria também o login (Supabase Auth) com senha provisória
// e abre a cartilha de primeiro acesso. Secretaria não mexe em admin.
import { useState } from 'react';
import { api, ErroApi, mensagemErro, type CampoInvalido } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { useSessao } from '@/hooks/useSessao';
import { useToast } from '@/hooks/useToast';
import { Aviso, Botao, Cabecalho, CampoCheck, CampoSelect, CampoTexto, Card, Carregando, Confirmar, EstadoVazio, Modal, Tabela, Tag, fmtDataHora } from '@/componentes/ui';
import { DESCRICAO_PAPEL, PAPEIS, ROTULO_PAPEL, type AcessoCriado, type Papel, type Perfil, type PerfilEquipe } from '@shared/types/usuario';
import { CartilhaPrimeiroAcesso } from './CartilhaPrimeiroAcesso';

export function Usuarios() {
  const { perfil: eu, ehAdmin } = useSessao();
  const toast = useToast();
  const { dados, carregando, erro, recarregar } = useRecurso<PerfilEquipe[]>('/api/usuarios');
  const [editando, setEditando] = useState<Partial<Perfil> | null>(null);
  const [campos, setCampos] = useState<CampoInvalido[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [novaSenha, setNovaSenha] = useState<PerfilEquipe | null>(null);
  const [gerando, setGerando] = useState(false);
  const [cartilha, setCartilha] = useState<AcessoCriado | null>(null);

  const existente = !!editando && (dados || []).some(u => u.email === editando.email) && !!editando.criado_em;
  // Secretaria cadastra a equipe, mas não administradores (o servidor confere de novo).
  const papeisPermitidos = ehAdmin ? PAPEIS : PAPEIS.filter(p => p !== 'admin');
  const podeMexer = (u: Perfil) => ehAdmin || u.papel !== 'admin';

  async function salvar() {
    if (!editando) return;
    setSalvando(true); setCampos([]);
    try {
      if (existente) {
        await api.put(`/api/usuarios/${encodeURIComponent(editando.email!)}`, { nome: editando.nome, papel: editando.papel, ativo: editando.ativo });
        toast.ok('Perfil salvo.');
      } else {
        const r = await api.post<AcessoCriado>('/api/usuarios', editando);
        toast.ok('Pessoa cadastrada e login criado.');
        setCartilha(r);
      }
      setEditando(null); recarregar();
    } catch (err) { if (err instanceof ErroApi && err.campos.length) setCampos(err.campos); toast.erro(mensagemErro(err)); }
    finally { setSalvando(false); }
  }

  async function gerarSenha() {
    if (!novaSenha) return;
    setGerando(true);
    try {
      const r = await api.post<AcessoCriado>(`/api/usuarios/${encodeURIComponent(novaSenha.email)}/senha-provisoria`);
      setNovaSenha(null); setCartilha(r); recarregar();
    } catch (err) { toast.erro(mensagemErro(err)); }
    finally { setGerando(false); }
  }

  function situacaoAcesso(u: PerfilEquipe) {
    if (!u.tem_login) return <Tag tipo="aviso" ponto>Sem login</Tag>;
    if (u.primeiro_acesso_pendente) return <Tag tipo="info" ponto>Aguardando 1º acesso</Tag>;
    return <span className="cel-sub">{u.ultimo_acesso_em ? fmtDataHora(u.ultimo_acesso_em) : 'Nunca entrou'}</span>;
  }

  return (
    <div className="wrap-estreito">
      <Cabecalho titulo="Usuários e papéis" descricao="Quem acessa o painel e o que cada um pode fazer"
        acoes={<Botao variante="primario" icone="mais" onClick={() => { setEditando({ email: '', nome: '', papel: 'secretaria', ativo: true }); setCampos([]); }}>Adicionar pessoa</Botao>} />
      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      <Card semCorpo>
        {carregando && !dados ? <Carregando /> : (
          <Tabela<PerfilEquipe>
            linhas={dados || []}
            chave={u => u.email}
            classeLinha={u => u.ativo ? undefined : 'linha-inativa'}
            vazio={<EstadoVazio icone="usuarios" titulo="Nenhum perfil" />}
            colunas={[
              { chave: 'nome', rotulo: 'Pessoa', principal: true, render: u => <><span className="nome-cel">{u.nome || u.email}{u.email === eu?.email ? <Tag tipo="info"> você</Tag> : null}</span><span className="sub">{u.email}</span></> },
              { chave: 'papel', rotulo: 'Papel', render: u => <Tag tipo={u.papel === 'admin' ? 'info' : 'neutro'}>{ROTULO_PAPEL[u.papel]}</Tag> },
              { chave: 'acesso', rotulo: 'Último acesso', render: situacaoAcesso },
              { chave: 'status', rotulo: 'Status', render: u => u.ativo ? <Tag tipo="ok" ponto>Ativo</Tag> : <Tag ponto>Inativo</Tag> },
              { chave: 'acoes', rotulo: 'Ações', acoes: true, render: u => podeMexer(u) ? <>
                {/* Editar sempre por último: fica alinhado na borda direita em todas as linhas */}
                {u.email !== eu?.email && u.ativo ? <Botao pequeno style={{ minWidth: 96 }} onClick={() => setNovaSenha(u)}>{u.tem_login ? 'Nova senha' : 'Criar login'}</Botao> : null}
                <Botao pequeno onClick={() => { setEditando({ ...u }); setCampos([]); }}>Editar</Botao>
              </> : <span className="cel-sub">Só administrador</span> }
            ]}
          />
        )}
      </Card>

      <div style={{ marginTop: 14 }}>
        <Aviso><b>O login é criado na hora.</b> Ao adicionar uma pessoa, o painel cria a conta dela com uma <b>senha provisória</b> e mostra a <b>cartilha de primeiro acesso</b> para você enviar. No primeiro acesso ela troca a senha por uma pessoal. Esqueceu a senha? Use <b>Nova senha</b> na linha da pessoa.</Aviso>
      </div>

      <Modal aberto={!!editando} titulo={existente ? 'Editar perfil' : 'Nova pessoa'} aoFechar={() => setEditando(null)} tamanho="sm"
        descricao={existente ? undefined : 'O login é criado ao salvar, e a cartilha de primeiro acesso aparece em seguida.'}
        rodape={<><Botao onClick={() => setEditando(null)}>Cancelar</Botao><Botao variante="primario" carregando={salvando} onClick={salvar} icone="check">{existente ? 'Salvar' : 'Cadastrar e criar login'}</Botao></>}>
        {editando ? (
          <div className="form-grade">
            <CampoTexto className="col-2" rotulo="E-mail institucional" name="email" type="email" inputMode="email" value={editando.email || ''} onChange={e => setEditando(f => ({ ...f, email: e.target.value }))} erros={campos} obrigatorio disabled={existente} autoFocus />
            <CampoTexto className="col-2" rotulo="Nome" name="nome" value={editando.nome || ''} onChange={e => setEditando(f => ({ ...f, nome: e.target.value }))} erros={campos} />
            <CampoSelect className="col-2" rotulo="Papel" name="papel" value={editando.papel || 'secretaria'} onChange={e => setEditando(f => ({ ...f, papel: e.target.value as Papel }))} erros={campos} dica={DESCRICAO_PAPEL[(editando.papel || 'secretaria') as Papel]}>
              {papeisPermitidos.map(p => <option key={p} value={p}>{ROTULO_PAPEL[p]}</option>)}
            </CampoSelect>
            <div className="col-2"><CampoCheck rotulo="Acesso ativo" checked={editando.ativo !== false} onChange={e => setEditando(f => ({ ...f, ativo: e.target.checked }))} /></div>
          </div>
        ) : null}
      </Modal>

      <Confirmar aberto={!!novaSenha} aoFechar={() => setNovaSenha(null)} aoConfirmar={gerarSenha} carregando={gerando}
        titulo={novaSenha?.tem_login ? 'Gerar nova senha provisória?' : 'Criar login?'}
        rotuloConfirmar={novaSenha?.tem_login ? 'Gerar nova senha' : 'Criar login'}
        descricao={novaSenha?.tem_login
          ? <>A senha atual de <b>{novaSenha?.nome || novaSenha?.email}</b> deixa de funcionar agora. Ela entra com a senha provisória da nova cartilha e cria outra senha pessoal no próximo acesso.</>
          : <>Cria a conta de login de <b>{novaSenha?.nome || novaSenha?.email}</b> com uma senha provisória e mostra a cartilha de primeiro acesso.</>} />

      {cartilha ? <CartilhaPrimeiroAcesso perfil={cartilha.perfil} senha={cartilha.senha_provisoria} autor={eu} aoFechar={() => setCartilha(null)} /> : null}
    </div>
  );
}
