// Página pública de verificação de autenticidade (RF-HIST-14).
// Desenho em docs/superpowers/specs/2026-09-21-f7-refino-design.md §3.2.
//
// É a única rota do sistema que responde sem sessão, e responde sobre
// documento de aluno — então tudo aqui é escrito para dar o mínimo: a
// consulta seleciona coluna a coluna, a página não mostra nota, CPF,
// nascimento nem endereço, e o nome do aluno sai parcialmente ocultado.
// Quem está conferindo tem o papel na mão e só precisa bater o que lê;
// quem caiu no link por acaso não recebe uma ficha de aluno.
import { Router } from 'express';
import { getServiceClient } from '../../lib/supabase';
import { ROTULO_TIPO_HISTORICO, type TipoHistorico } from '../../shared/types/historico';
import { nomeParcial } from '../servicos/historico/verificacao';

export const verificacaoRouter = Router();

/* ---------- limite de tentativas ----------
   Um código de 22 caracteres não cai por força bruta, mas não há razão
   para deixar alguém tentar. Contador em memória: é um processo só
   (mesma premissa do agendador), e o custo de errar para mais aqui é
   uma pessoa esperar dez minutos, não um documento deixar de ser
   verificado. */
const JANELA_MS = 10 * 60 * 1000;
const LIMITE = 30;
const tentativas = new Map<string, { contagem: number; expira: number }>();

function excedeu(ip: string): boolean {
  const agora = Date.now();
  const atual = tentativas.get(ip);
  if (!atual || atual.expira < agora) {
    tentativas.set(ip, { contagem: 1, expira: agora + JANELA_MS });
    return false;
  }
  atual.contagem++;
  return atual.contagem > LIMITE;
}

// a limpeza evita o mapa crescer para sempre num processo de vida longa
setInterval(() => {
  const agora = Date.now();
  for (const [ip, v] of tentativas) if (v.expira < agora) tentativas.delete(ip);
}, JANELA_MS).unref();

function dataBR(iso: string | null): string | null {
  if (!iso) return null;
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : null;
}

verificacaoRouter.get('/verificar/:codigo', async (req, res) => {
  // a página nunca deve ser indexada: o código é o que protege o documento
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');

  const ip = req.ip || req.socket.remoteAddress || 'desconhecido';
  if (excedeu(ip)) {
    return res.status(429).render('verificacao', {
      resultado: null,
      mensagem: 'Muitas consultas seguidas deste endereço. Espere alguns minutos e tente de novo.'
    });
  }

  const codigo = String(req.params.codigo || '');
  if (!/^[0-9A-Za-z]{22}$/.test(codigo)) {
    return res.status(404).render('verificacao', { resultado: null, mensagem: null });
  }

  try {
    const client = getServiceClient();
    const { data, error } = await client.from('historico')
      .select('tipo, status, via, numero_registro, ano_registro, emitido_em, cancelado_em, aluno(nome)')
      .eq('codigo_verificacao', codigo)
      .maybeSingle();
    if (error) throw error;

    // Rascunho e conferido não existem para o mundo: não há papel na rua
    // com esse código ainda. Responde igual a código inexistente — a
    // página não é oráculo de "já existiu".
    const h = data as unknown as {
      tipo: TipoHistorico; status: string; via: number;
      numero_registro: number | null; ano_registro: number | null;
      emitido_em: string | null; cancelado_em: string | null;
      aluno: { nome: string } | null;
    } | null;
    if (!h || (h.status !== 'emitido' && h.status !== 'cancelado')) {
      return res.status(404).render('verificacao', { resultado: null, mensagem: null });
    }

    const { data: inst } = await client.from('instituicao').select('nome_fantasia, razao_social').maybeSingle();

    res.render('verificacao', {
      mensagem: null,
      resultado: {
        escola: inst?.nome_fantasia || inst?.razao_social || 'Colégio São Marcos',
        tipo: ROTULO_TIPO_HISTORICO[h.tipo] || 'Documento escolar',
        aluno: nomeParcial(h.aluno?.nome || ''),
        via: h.via,
        registro: h.numero_registro != null && h.ano_registro != null ? `${h.numero_registro}/${h.ano_registro}` : null,
        emitido_em: dataBR(h.emitido_em),
        cancelado: h.status === 'cancelado',
        cancelado_em: dataBR(h.cancelado_em)
      }
    });
  } catch (err) {
    console.error('verificação', (err as Error).message);
    res.status(500).render('verificacao', {
      resultado: null,
      mensagem: 'Não foi possível consultar agora. Tente de novo em alguns minutos.'
    });
  }
});
