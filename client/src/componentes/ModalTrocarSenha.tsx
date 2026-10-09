// "Trocar senha" do menu do usuário: a mesma troca do primeiro acesso
// (/api/auth/change-password), para quem já está dentro do painel.
import { useState, type FormEvent } from 'react';
import { mensagemErro } from '@/api/cliente';
import { useSessao } from '@/hooks/useSessao';
import { useToast } from '@/hooks/useToast';
import { Aviso, Botao, CampoTexto, Modal } from './ui';

export function ModalTrocarSenha({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const { trocarSenha } = useSessao();
  const toast = useToast();
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  function fechar() { setNova(''); setConfirma(''); setErro(null); aoFechar(); }

  async function salvar(e?: FormEvent) {
    e?.preventDefault();
    setErro(null);
    if (nova.length < 8) return setErro('A senha precisa ter ao menos 8 caracteres.');
    if (nova !== confirma) return setErro('As senhas não são iguais.');
    setOcupado(true);
    try {
      await trocarSenha(nova);
      toast.ok('Senha alterada. Use a nova senha no próximo acesso.');
      fechar();
    } catch (err) { setErro(mensagemErro(err, 'Não foi possível salvar a nova senha.')); }
    finally { setOcupado(false); }
  }

  return (
    <Modal aberto={aberto} titulo="Trocar senha" descricao="A senha nova vale a partir de agora, em todos os dispositivos." aoFechar={fechar} tamanho="sm"
      rodape={<><Botao onClick={fechar}>Cancelar</Botao><Botao variante="primario" carregando={ocupado} onClick={() => salvar()} icone="check">Salvar nova senha</Botao></>}>
      <form className="form-grade" onSubmit={salvar}>
        {erro ? <div className="col-2"><Aviso tipo="erro">{erro}</Aviso></div> : null}
        <CampoTexto className="col-2" rotulo="Nova senha" type="password" name="nova" autoComplete="new-password" value={nova} onChange={e => setNova(e.target.value)} placeholder="Mínimo de 8 caracteres" />
        <CampoTexto className="col-2" rotulo="Confirme a nova senha" type="password" name="confirma" autoComplete="new-password" value={confirma} onChange={e => setConfirma(e.target.value)} placeholder="Repita a senha" />
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
