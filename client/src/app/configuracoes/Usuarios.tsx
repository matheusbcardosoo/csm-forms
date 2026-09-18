// /app/config/usuarios — equipe e papéis (só admin).
import { useState } from 'react';
import { api, ErroApi, mensagemErro, type CampoInvalido } from '@/api/cliente';
import { useRecurso } from '@/hooks/useRecurso';
import { useSessao } from '@/hooks/useSessao';
import { useToast } from '@/hooks/useToast';
import { Aviso, Botao, Cabecalho, CampoCheck, CampoSelect, CampoTexto, Card, Carregando, EstadoVazio, Modal, Tabela, Tag, fmtDataHora } from '@/componentes/ui';
import { PAPEIS, ROTULO_PAPEL, type Papel, type Perfil } from '@shared/types/usuario';

const DESCRICAO_PAPEL: Record<Papel, string> = {
  admin: 'Tudo, incluindo configuração da instituição, currículos e usuários',
  secretaria: 'Importa, edita notas, gera e emite históricos, vê formulários',
  coordenacao: 'Consulta alunos, notas e históricos; não emite nem edita nota',
  leitura: 'Somente consulta'
};

export function Usuarios() {
  const { perfil: eu } = useSessao();
  const toast = useToast();
  const { dados, carregando, erro, recarregar } = useRecurso<Perfil[]>('/api/usuarios');
  const [editando, setEditando] = useState<Partial<Perfil> | null>(null);
  const [campos, setCampos] = useState<CampoInvalido[]>([]);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!editando) return;
    setSalvando(true); setCampos([]);
    try {
      const existente = (dados || []).some(u => u.email === editando.email);
      if (existente) await api.put(`/api/usuarios/${encodeURIComponent(editando.email!)}`, { nome: editando.nome, papel: editando.papel, ativo: editando.ativo });
      else await api.post('/api/usuarios', editando);
      toast.ok('Perfil salvo.'); setEditando(null); recarregar();
    } catch (err) { if (err instanceof ErroApi && err.campos.length) setCampos(err.campos); toast.erro(mensagemErro(err)); }
    finally { setSalvando(false); }
  }

  return (
    <div className="wrap-estreito">
      <Cabecalho titulo="Usuários e papéis" descricao="Quem acessa o painel e o que cada um pode fazer"
        acoes={<Botao variante="primario" icone="mais" onClick={() => { setEditando({ email: '', nome: '', papel: 'secretaria', ativo: true }); setCampos([]); }}>Adicionar pessoa</Botao>} />
      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      <Card semCorpo>
        {carregando && !dados ? <Carregando /> : (
          <Tabela<Perfil>
            linhas={dados || []}
            chave={u => u.email}
            classeLinha={u => u.ativo ? undefined : 'linha-inativa'}
            vazio={<EstadoVazio icone="usuarios" titulo="Nenhum perfil" />}
            colunas={[
              { chave: 'nome', rotulo: 'Pessoa', principal: true, render: u => <><span className="nome-cel">{u.nome || u.email}{u.email === eu?.email ? <Tag tipo="info"> você</Tag> : null}</span><span className="sub">{u.email}</span></> },
              { chave: 'papel', rotulo: 'Papel', render: u => <Tag tipo={u.papel === 'admin' ? 'info' : 'neutro'}>{ROTULO_PAPEL[u.papel]}</Tag> },
              { chave: 'acesso', rotulo: 'Último acesso', className: 'cel-sub', render: u => fmtDataHora(u.ultimo_acesso_em) },
              { chave: 'status', rotulo: 'Status', render: u => u.ativo ? <Tag tipo="ok" ponto>Ativo</Tag> : <Tag ponto>Inativo</Tag> },
              { chave: 'acoes', rotulo: 'Ações', acoes: true, render: u => <Botao pequeno onClick={() => { setEditando({ ...u }); setCampos([]); }}>Editar</Botao> }
            ]}
          />
        )}
      </Card>

      <div style={{ marginTop: 14 }}>
        <Aviso><b>A conta de login é criada à parte.</b> Depois de adicionar a pessoa aqui, rode <code>node scripts/provision-staff-users.mjs</code> para criar a conta no Supabase Auth com a senha padrão. Quem já tem conta continua com a mesma senha.</Aviso>
      </div>

      <Modal aberto={!!editando} titulo={editando && (dados || []).some(u => u.email === editando.email) ? 'Editar perfil' : 'Nova pessoa'} aoFechar={() => setEditando(null)} tamanho="sm"
        rodape={<><Botao onClick={() => setEditando(null)}>Cancelar</Botao><Botao variante="primario" carregando={salvando} onClick={salvar} icone="check">Salvar</Botao></>}>
        {editando ? (
          <div className="form-grade">
            <CampoTexto className="col-2" rotulo="E-mail institucional" name="email" type="email" inputMode="email" value={editando.email || ''} onChange={e => setEditando(f => ({ ...f, email: e.target.value }))} erros={campos} obrigatorio disabled={(dados || []).some(u => u.email === editando.email) && !!editando.criado_em} autoFocus />
            <CampoTexto className="col-2" rotulo="Nome" name="nome" value={editando.nome || ''} onChange={e => setEditando(f => ({ ...f, nome: e.target.value }))} erros={campos} />
            <CampoSelect className="col-2" rotulo="Papel" name="papel" value={editando.papel || 'secretaria'} onChange={e => setEditando(f => ({ ...f, papel: e.target.value as Papel }))} erros={campos} dica={DESCRICAO_PAPEL[(editando.papel || 'secretaria') as Papel]}>
              {PAPEIS.map(p => <option key={p} value={p}>{ROTULO_PAPEL[p]}</option>)}
            </CampoSelect>
            <div className="col-2"><CampoCheck rotulo="Acesso ativo" checked={editando.ativo !== false} onChange={e => setEditando(f => ({ ...f, ativo: e.target.checked }))} /></div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
