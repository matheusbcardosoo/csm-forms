// Cartilha de primeiro acesso: aparece para quem cadastrou (ou gerou nova
// senha provisória) logo depois de salvar. É o único momento em que a senha
// provisória é exibida — o servidor não a guarda. O mesmo conteúdo sai em
// três formatos: na tela, como texto para colar (WhatsApp, e-mail, Teams)
// e como página para imprimir ou salvar em PDF.
import { useMemo, useState } from 'react';
import { useToast } from '@/hooks/useToast';
import { Aviso, Botao, Modal } from '@/componentes/ui';
import { DESCRICAO_PAPEL, ROTULO_PAPEL, type Perfil } from '@shared/types/usuario';

const SISTEMA = 'Painel da Secretaria — Colégio São Marcos';

interface Secao { titulo: string; campos?: [string, string][]; passos?: string[]; paragrafos?: string[]; lista?: string[] }

function montar(perfil: Perfil, senha: string, autor: Perfil | null, link: string): { saudacao: string; secoes: Secao[] } {
  const quemAjuda = autor?.nome ? `${autor.nome} (${autor.email})` : 'a administração do colégio';
  return {
    saudacao: `Olá, ${perfil.nome || perfil.email}! Você recebeu acesso ao ${SISTEMA} com o papel de ${ROTULO_PAPEL[perfil.papel]}: ${DESCRICAO_PAPEL[perfil.papel].charAt(0).toLowerCase()}${DESCRICAO_PAPEL[perfil.papel].slice(1)}.`,
    secoes: [
      {
        titulo: 'Seus dados de acesso',
        campos: [
          ['Endereço do painel', link],
          ['Seu e-mail (login)', perfil.email],
          ['Senha provisória', senha]
        ]
      },
      {
        titulo: 'Primeiro acesso, passo a passo',
        passos: [
          `Abra ${link} no navegador — funciona no computador, no tablet e no celular.`,
          `No campo "E-mail", digite ${perfil.email}. No campo "Senha", digite a senha provisória exatamente como está acima (letras minúsculas, números e hífens).`,
          'O painel vai pedir para você criar a sua senha pessoal: no mínimo 8 caracteres e diferente da senha provisória. Digite a senha nova duas vezes e clique em "Salvar nova senha".',
          'Pronto: você entra no painel. Daqui em diante, use sempre a sua senha nova — a provisória deixa de valer.'
        ]
      },
      {
        titulo: 'Para trocar a senha depois',
        paragrafos: ['A qualquer momento, clique no seu nome, no canto superior direito do painel, e escolha "Trocar senha". A senha nova vale na hora.']
      },
      {
        titulo: 'Esqueceu a senha?',
        paragrafos: [`Ninguém consegue ver a sua senha, nem a administração. Se esquecer, peça a ${quemAjuda} uma nova senha provisória: você recebe uma nova cartilha e cria outra senha pessoal no próximo acesso.`]
      },
      {
        titulo: 'Cuidados',
        lista: [
          'Não compartilhe a sua senha. O acesso é pessoal e o que você faz no painel fica registrado com o seu nome.',
          'Em computador compartilhado, saia ao terminar: clique no seu nome e depois em "Sair".',
          'Guarde esta cartilha só até concluir o primeiro acesso — depois disso a senha provisória não serve para mais nada.'
        ]
      }
    ]
  };
}

function comoTexto(c: ReturnType<typeof montar>): string {
  const linhas = [`CARTILHA DE PRIMEIRO ACESSO — ${SISTEMA}`, '', c.saudacao];
  for (const s of c.secoes) {
    linhas.push('', s.titulo.toUpperCase());
    s.campos?.forEach(([r, v]) => linhas.push(`• ${r}: ${v}`));
    s.passos?.forEach((t, i) => linhas.push(`${i + 1}. ${t}`));
    s.paragrafos?.forEach(t => linhas.push(t));
    s.lista?.forEach(t => linhas.push(`• ${t}`));
  }
  return linhas.join('\n');
}

const esc = (t: string) => t.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));

function comoHtml(c: ReturnType<typeof montar>): string {
  const corpo = c.secoes.map(s => `
    <h2>${esc(s.titulo)}</h2>
    ${s.campos ? `<dl>${s.campos.map(([r, v]) => `<dt>${esc(r)}</dt><dd${r === 'Senha provisória' ? ' class="senha"' : ''}>${esc(v)}</dd>`).join('')}</dl>` : ''}
    ${s.passos ? `<ol>${s.passos.map(t => `<li>${esc(t)}</li>`).join('')}</ol>` : ''}
    ${(s.paragrafos || []).map(t => `<p>${esc(t)}</p>`).join('')}
    ${s.lista ? `<ul>${s.lista.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cartilha de primeiro acesso</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  /* Cabe numa folha A4: margens e espaçamentos medidos para isso. */
  @page { size: A4; margin: 15mm 16mm; }
  body { font-family: Inter, system-ui, sans-serif; color: #1c2430; background: #fff; margin: 0 auto; max-width: 720px; padding: 24px 16px; font-size: 12.5px; line-height: 1.5; }
  @media print { body { padding: 0; max-width: none; } }
  header { display: flex; align-items: center; gap: 14px; border-bottom: 3px solid #0F385A; padding-bottom: 10px; margin-bottom: 12px; }
  header img { height: 46px; }
  header small { display: block; color: #c5251a; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; font-size: 10.5px; }
  h1 { font-size: 19px; margin: 0; color: #0F385A; }
  h2 { font-size: 13px; color: #0F385A; margin: 14px 0 5px; break-after: avoid; }
  p { margin: 0 0 4px; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 5px 14px; margin: 0; padding: 10px 14px; border: 1px solid #c9d4e0; border-radius: 8px; background: #f4f7fa; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  dt { font-weight: 600; } dd { margin: 0; word-break: break-all; }
  dd.senha { font-family: ui-monospace, Consolas, monospace; font-size: 15px; font-weight: 700; letter-spacing: .06em; }
  ol, ul { margin: 0; padding-left: 20px; } li { margin-bottom: 3px; }
</style></head><body>
<header><img src="/api/carteirinhas/logo-colegio" alt="" onerror="this.remove()"><div><small>${esc(SISTEMA)}</small><h1>Cartilha de primeiro acesso</h1></div></header>
<p>${esc(c.saudacao)}</p>
${corpo}
<script>
  // Imprime assim que a logo carregar e fecha a guia quando a impressão
  // termina (ou é cancelada) — a guia só existe para isso.
  window.addEventListener('afterprint', function () { window.close(); });
  window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 150); });
</script>
</body></html>`;
}

export function CartilhaPrimeiroAcesso({ perfil, senha, autor, aoFechar }: { perfil: Perfil; senha: string; autor: Perfil | null; aoFechar: () => void }) {
  const toast = useToast();
  const [copiado, setCopiado] = useState(false);
  const link = `${window.location.origin}/app/entrar`;
  const conteudo = useMemo(() => montar(perfil, senha, autor, link), [perfil, senha, autor, link]);
  const texto = useMemo(() => comoTexto(conteudo), [conteudo]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // http sem contexto seguro: cai no método antigo
      const area = document.createElement('textarea');
      area.value = texto; area.style.position = 'fixed'; area.style.opacity = '0';
      document.body.appendChild(area); area.select();
      const ok = document.execCommand('copy');
      area.remove();
      if (!ok) return toast.erro('Não foi possível copiar. Selecione o texto da cartilha e copie manualmente.');
    }
    setCopiado(true);
    toast.ok('Cartilha copiada. Cole no WhatsApp, Teams ou e-mail da pessoa.');
  }

  function imprimir() {
    const janela = window.open('', '_blank');
    if (!janela) return toast.erro('O navegador bloqueou a nova janela. Permita pop-ups para este site e tente de novo.');
    janela.document.open();
    janela.document.write(comoHtml(conteudo));
    janela.document.close();
  }

  const mailto = `mailto:${encodeURIComponent(perfil.email)}?subject=${encodeURIComponent(`Seu acesso ao ${SISTEMA}`)}&body=${encodeURIComponent(texto)}`;

  return (
    <Modal aberto titulo="Cartilha de primeiro acesso" descricao={`Para ${perfil.nome || perfil.email}`} aoFechar={aoFechar} tamanho="lg"
      rodape={<>
        <Botao icone="copiar" onClick={copiar}>{copiado ? 'Copiado' : 'Copiar texto'}</Botao>
        <a className="btn" href={mailto}>Enviar por e-mail</a>
        <Botao icone="documento" onClick={imprimir}>Imprimir ou salvar PDF</Botao>
        <Botao variante="primario" icone="check" onClick={aoFechar}>Concluído</Botao>
      </>}>
      <div style={{ marginBottom: 14 }}>
        <Aviso tipo="aviso"><b>A senha provisória aparece só agora.</b> Envie a cartilha à pessoa antes de fechar esta janela. Se ela se perder, use <b>Nova senha</b> na lista para gerar outra.</Aviso>
      </div>
      <article className="cartilha">
        <p>{conteudo.saudacao}</p>
        {conteudo.secoes.map(s => (
          <section key={s.titulo}>
            <h3>{s.titulo}</h3>
            {s.campos ? <dl>{s.campos.map(([r, v]) => <div key={r}><dt>{r}</dt><dd className={r === 'Senha provisória' ? 'cartilha-senha' : undefined}>{v}</dd></div>)}</dl> : null}
            {s.passos ? <ol>{s.passos.map(t => <li key={t}>{t}</li>)}</ol> : null}
            {s.paragrafos?.map(t => <p key={t}>{t}</p>)}
            {s.lista ? <ul>{s.lista.map(t => <li key={t}>{t}</li>)}</ul> : null}
          </section>
        ))}
      </article>
    </Modal>
  );
}
