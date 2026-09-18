// Login em React (F0). Mesmos endpoints da central de formulários:
// /api/auth/login → /api/auth/change-password (1º acesso) → sessão.
import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSessao } from '@/hooks/useSessao';
import { mensagemErro } from '@/api/cliente';
import { Icone } from '@/componentes/Icones';
import { Botao, CampoTexto } from '@/componentes/ui';

const SENHA_PADRAO = 'SaoMarcos';

export function PaginaLogin() {
  const { estado, entrar, trocarSenha, sair } = useSessao();
  const navegar = useNavigate();
  const local = useLocation() as { state?: { de?: string } };
  const destino = local.state?.de || '/app';

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const etapa: 'login' | 'senha' | 'negado' =
    !estado.loggedIn ? 'login' : estado.mustChangePassword ? 'senha' : !estado.authorized ? 'negado' : 'login';

  async function aoEntrar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErro('Informe um e-mail válido.');
    if (!senha) return setErro('Informe sua senha.');
    setOcupado(true);
    try {
      const r = await entrar(email.trim(), senha);
      if (!r.mustChangePassword && r.authorized) navegar(destino, { replace: true });
    } catch (err) {
      setErro(mensagemErro(err, 'E-mail ou senha incorretos.'));
    } finally { setOcupado(false); }
  }

  async function aoTrocar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (nova.length < 8) return setErro('A senha precisa ter ao menos 8 caracteres.');
    if (nova === SENHA_PADRAO) return setErro('Escolha uma senha diferente da padrão.');
    if (nova !== confirma) return setErro('As senhas não são iguais.');
    setOcupado(true);
    try {
      await trocarSenha(nova);
      navegar(destino, { replace: true });
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível salvar a nova senha.'));
    } finally { setOcupado(false); }
  }

  return (
    <div className="login-pagina">
      <aside className="login-lado">
        <div className="login-marca">
          <span className="brasao"><img src="/images/logo-brasao.png" alt="" /></span>
          <div><strong>Secretaria Digital</strong><span>Colégio São Marcos</span></div>
        </div>
        <div>
          <h1>Histórico escolar sem redigitação.</h1>
          <p className="chamada">Notas importadas do Activesoft, cadastro institucional único e pré-visualização fiel do documento antes do PDF. Uso restrito à equipe do colégio.</p>
        </div>
        <p className="rodape">Mogi das Cruzes/SP · Diretoria de Ensino — Região de Mogi das Cruzes</p>
      </aside>

      <section className="login-form">
        <div className="login-caixa">
          {etapa === 'login' && (
            <form onSubmit={aoEntrar} noValidate>
              <div className="login-ico"><Icone nome="cadeado" /></div>
              <h2>Entrar no painel</h2>
              <p>Use seu e-mail institucional. No primeiro acesso, a senha é <strong>{SENHA_PADRAO}</strong> — você vai trocá-la em seguida.</p>
              {erro ? <div className="login-erro" role="alert"><Icone nome="alerta" />{erro}</div> : null}
              <CampoTexto rotulo="E-mail" type="email" name="email" autoComplete="username" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nome@saomarcos.com.br" autoFocus />
              <CampoTexto rotulo="Senha" type="password" name="senha" autoComplete="current-password" value={senha} onChange={e => setSenha(e.target.value)} placeholder="Sua senha" />
              <Botao variante="primario" className="btn-bloco" type="submit" carregando={ocupado} icone="seta">Entrar</Botao>
              <p className="login-links"><a href="/">Central de formulários</a> · <a href="/politica-privacidade">Política de privacidade</a></p>
            </form>
          )}

          {etapa === 'senha' && (
            <form onSubmit={aoTrocar} noValidate>
              <div className="login-ico"><Icone nome="chave" /></div>
              <h2>Crie sua senha</h2>
              <p>Esse é seu primeiro acesso. Defina uma senha nova e pessoal antes de continuar.</p>
              {erro ? <div className="login-erro" role="alert"><Icone nome="alerta" />{erro}</div> : null}
              <CampoTexto rotulo="Nova senha" type="password" name="nova" autoComplete="new-password" value={nova} onChange={e => setNova(e.target.value)} placeholder="Mínimo de 8 caracteres" autoFocus />
              <CampoTexto rotulo="Confirme a nova senha" type="password" name="confirma" autoComplete="new-password" value={confirma} onChange={e => setConfirma(e.target.value)} placeholder="Repita a senha" />
              <Botao variante="primario" className="btn-bloco" type="submit" carregando={ocupado} icone="check">Salvar nova senha</Botao>
            </form>
          )}

          {etapa === 'negado' && (
            <div>
              <div className="login-ico negado"><Icone nome="cadeado" /></div>
              <h2>E-mail não autorizado</h2>
              <p>Seu login funcionou, mas esse e-mail não tem um perfil ativo no painel. Peça à administração do colégio para liberar seu acesso.</p>
              <Botao className="btn-bloco" onClick={sair} icone="sair">Sair</Botao>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
