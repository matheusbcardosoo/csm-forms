'use strict';
const express = require('express');
const { randomUUID } = require('crypto');
const { getAnonClient, getAuthenticatedClient } = require('../lib/supabase');
const { shapeVisitaRow, pdfFilename } = require('../lib/visita');
const { shapeAvaliacaoRow, pdfFilename: avaliacaoPdfFilename } = require('../lib/avaliacao');
const { renderVisitaPdf, renderVisitaBlankPdf, renderAvaliacaoPdf, renderAvaliacaoBlankPdf } = require('../lib/pdf');
const { notifyN8n, notifyN8nAvaliacao } = require('../lib/n8n');

// Anexos aceitos no formulário de avaliação substitutiva (atestado médico ou
// comprovante de pagamento) — imagens comuns de foto/scan e PDF.
const ANEXO_TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
const ANEXO_TAMANHO_MAX_BYTES = 8 * 1024 * 1024; // 8MB

const router = express.Router();

const COOKIE_OPTS = {
  httpOnly: true,
  signed: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000
};

function getTokens(req) {
  return { at: req.signedCookies.sb_at, rt: req.signedCookies.sb_rt };
}

function clearAuthCookies(res) {
  res.clearCookie('sb_at');
  res.clearCookie('sb_rt');
}

function setAuthCookies(res, session) {
  res.cookie('sb_at', session.access_token, COOKIE_OPTS);
  res.cookie('sb_rt', session.refresh_token, COOKIE_OPTS);
}

// Obtém cliente autenticado e renova cookies se os tokens foram rotacionados.
async function requireAuth(req, res) {
  const { at, rt } = getTokens(req);
  if (!at || !rt) {
    res.status(401).json({ error: 'Não autenticado.' });
    return null;
  }
  try {
    const { client, newSession } = await getAuthenticatedClient(at, rt);
    if (newSession) setAuthCookies(res, newSession);
    return client;
  } catch (_) {
    clearAuthCookies(res);
    res.status(401).json({ error: 'Sessão inválida. Faça login novamente.' });
    return null;
  }
}

/* ================================================================
   AUTH
   ================================================================ */

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const client = getAnonClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: error.message });

    const { session, user } = data;

    // session e null quando o e-mail nao foi confirmado (email_confirm: false na criacao)
    if (!session || !user) {
      return res.status(401).json({
        error: 'E-mail nao confirmado ou credenciais invalidas. Use o script de provisionamento para criar contas.'
      });
    }

    setAuthCookies(res, session);

    const mustChangePassword = !!(
      user.user_metadata && user.user_metadata.must_change_password
    );

    let authorized = false;
    if (!mustChangePassword) {
      const { client: authClient } = await getAuthenticatedClient(
        session.access_token,
        session.refresh_token
      );
      const { data: staffData } = await authClient
        .from('staff_emails')
        .select('email')
        .maybeSingle();
      authorized = !!staffData;
    }

    res.json({ success: true, mustChangePassword, authorized });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/auth/logout', async (req, res) => {
  const { at, rt } = getTokens(req);
  if (at && rt) {
    try {
      const { client } = await getAuthenticatedClient(at, rt);
      await client.auth.signOut();
    } catch (_) {}
  }
  clearAuthCookies(res);
  res.json({ success: true });
});

router.post('/auth/change-password', async (req, res) => {
  const client = await requireAuth(req, res);
  if (!client) return;

  try {
    const { password } = req.body;

    // Obtem e-mail antes de alterar (necessario para re-login em seguida)
    const { data: userData } = await client.auth.getUser();
    const email = userData?.user?.email;

    const { error } = await client.auth.updateUser({
      password,
      data: { must_change_password: false }
    });
    if (error) return res.status(400).json({ error: error.message });

    // Re-login com a nova senha: garante JWT fresco com must_change_password: false.
    // Mais confiavel do que refreshSession() para propagar metadados atualizados.
    if (email) {
      const freshClient = getAnonClient();
      const { data: newData, error: loginErr } = await freshClient.auth.signInWithPassword({
        email,
        password
      });
      if (!loginErr && newData.session) {
        setAuthCookies(res, newData.session);
        return res.json({ success: true });
      }
    }

    // Fallback: tenta refreshSession caso o re-login nao seja possivel
    const { data: refreshData, error: refreshErr } = await client.auth.refreshSession();
    if (!refreshErr && refreshData.session) {
      setAuthCookies(res, refreshData.session);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/auth/session', async (req, res) => {
  const { at, rt } = getTokens(req);
  if (!at || !rt) return res.json({ loggedIn: false });

  try {
    const { client, newSession } = await getAuthenticatedClient(at, rt);
    if (newSession) setAuthCookies(res, newSession);

    const { data, error } = await client.auth.getUser();
    if (error || !data.user) {
      clearAuthCookies(res);
      return res.json({ loggedIn: false });
    }

    const mustChangePassword = !!(
      data.user.user_metadata && data.user.user_metadata.must_change_password
    );

    let authorized = false;
    if (!mustChangePassword) {
      const { data: staffData } = await client
        .from('staff_emails')
        .select('email')
        .maybeSingle();
      authorized = !!staffData;
    }

    res.json({ loggedIn: true, mustChangePassword, authorized });
  } catch (_) {
    clearAuthCookies(res);
    res.json({ loggedIn: false });
  }
});

/* ================================================================
   RESPOSTAS
   ================================================================ */

router.get('/responses', async (req, res) => {
  const client = await requireAuth(req, res);
  if (!client) return;

  try {
    const { data: staffData } = await client
      .from('staff_emails')
      .select('email')
      .maybeSingle();
    if (!staffData) return res.status(403).json({ error: 'Não autorizado.' });

    const form = req.query.form || 'visitas';

    if (form === 'avaliacao-substitutiva') {
      const { data: rows, error } = await client
        .from('avaliacao_substitutiva_respostas')
        .select('*, avaliacao_substitutiva_alunos(*, avaliacao_substitutiva_provas(*))')
        .order('submitted_at', { ascending: false });
      if (error) throw error;
      return res.json((rows || []).map(shapeAvaliacaoRow));
    }

    const { data: rows, error } = await client
      .from('visita_respostas')
      .select('*, visita_alunos(*)')
      .order('submitted_at', { ascending: false });

    if (error) throw error;

    res.json((rows || []).map(shapeVisitaRow));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PDF de uma resposta — usada pelo botao "Baixar PDF" na tela de respostas.
// Reaproveita a mesma renderVisitaPdf() (Puppeteer) usada no envio
// automatico ao n8n, entao o arquivo baixado aqui e sempre identico ao
// que o workflow recebe.
router.get('/responses/:id/pdf', async (req, res) => {
  const client = await requireAuth(req, res);
  if (!client) return;

  try {
    const { data: staffData } = await client
      .from('staff_emails')
      .select('email')
      .maybeSingle();
    if (!staffData) return res.status(403).json({ error: 'Não autorizado.' });

    const baseUrl = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

    if (req.query.form === 'avaliacao-substitutiva') {
      const { data: row, error } = await client
        .from('avaliacao_substitutiva_respostas')
        .select('*, avaliacao_substitutiva_alunos(*, avaliacao_substitutiva_provas(*))')
        .eq('id', req.params.id)
        .maybeSingle();
      if (error) throw error;
      if (!row) return res.status(404).json({ error: 'Resposta não encontrada.' });

      const avaliacao = shapeAvaliacaoRow(row);
      const pdfBuffer = await renderAvaliacaoPdf({
        baseUrl,
        avaliacaoId: avaliacao.id,
        internalToken: process.env.INTERNAL_PDF_SECRET
      });

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${avaliacaoPdfFilename(avaliacao)}"`
      });
      return res.send(pdfBuffer);
    }

    const { data: row, error } = await client
      .from('visita_respostas')
      .select('*, visita_alunos(*)')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!row) return res.status(404).json({ error: 'Resposta não encontrada.' });

    const visita = shapeVisitaRow(row);
    const pdfBuffer = await renderVisitaPdf({
      baseUrl,
      visitaId: visita.id,
      internalToken: process.env.INTERNAL_PDF_SECRET
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${pdfFilename(visita)}"`
    });
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// URL assinada (temporária) pro anexo de UMA prova especifica de um
// requerimento de avaliação substitutiva — usada pelo botão "Ver anexo" na
// tela de respostas. Cada prova tem o seu próprio anexo (aluno pode ter
// mais de uma avaliação perdida, cada uma com seu atestado/comprovante), por
// isso a URL é por prova, não por requerimento. O bucket é privado (ver
// supabase/schema.sql), então staff precisa dessa URL pra visualizar/baixar
// o arquivo original.
router.get('/responses/:id/anexo/:provaId', async (req, res) => {
  const client = await requireAuth(req, res);
  if (!client) return;

  try {
    const { data: staffData } = await client
      .from('staff_emails')
      .select('email')
      .maybeSingle();
    if (!staffData) return res.status(403).json({ error: 'Não autorizado.' });

    // O join com avaliacao_substitutiva_alunos!inner garante que a prova
    // pertence mesmo ao requerimento :id (não só que o id da prova existe).
    const { data: row, error } = await client
      .from('avaliacao_substitutiva_provas')
      .select('anexo_path, avaliacao_substitutiva_alunos!inner(avaliacao_id)')
      .eq('id', req.params.provaId)
      .eq('avaliacao_substitutiva_alunos.avaliacao_id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!row) return res.status(404).json({ error: 'Anexo não encontrado.' });

    const { data: signed, error: signError } = await client.storage
      .from('avaliacao-anexos')
      .createSignedUrl(row.anexo_path, 120);
    if (signError) throw signError;

    res.json({ url: signed.signedUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Envio manual pelo botao "Enviar por WhatsApp" na tela de respostas.
// Reaproveita o mesmo notifyN8n() usado no envio automatico logo apos o
// cadastro (routes/api.js POST /responses) — mesma geracao de PDF, mesmo
// payload pro webhook do n8n. Diferente do automatico, aqui o erro deve
// voltar pro botao (nao e so log de servidor), entao aguardamos e
// respondemos o resultado.
router.post('/responses/:id/whatsapp', async (req, res) => {
  const client = await requireAuth(req, res);
  if (!client) return;

  try {
    const { data: staffData } = await client
      .from('staff_emails')
      .select('email')
      .maybeSingle();
    if (!staffData) return res.status(403).json({ error: 'Não autorizado.' });

    if (req.query.form === 'avaliacao-substitutiva') {
      const { data: row, error } = await client
        .from('avaliacao_substitutiva_respostas')
        .select('id')
        .eq('id', req.params.id)
        .maybeSingle();
      if (error) throw error;
      if (!row) return res.status(404).json({ error: 'Resposta não encontrada.' });

      if (!process.env.N8N_AVALIACAO_WEBHOOK_URL) {
        return res.status(503).json({ error: 'Integração com WhatsApp não está configurada (N8N_AVALIACAO_WEBHOOK_URL vazio).' });
      }

      await notifyN8nAvaliacao(req.params.id);
      return res.json({ success: true });
    }

    const { data: row, error } = await client
      .from('visita_respostas')
      .select('id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!row) return res.status(404).json({ error: 'Resposta não encontrada.' });

    if (!process.env.N8N_WEBHOOK_URL) {
      return res.status(503).json({ error: 'Integração com WhatsApp não está configurada (N8N_WEBHOOK_URL vazio).' });
    }

    await notifyN8n(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Modelo de ficha de visita EM BRANCO, pra imprimir e deixar disponivel a
// quem prefere preencher a mao em vez do formulario online. Fica atras do
// mesmo requireAuth() das respostas — nao e o link publico do formulario,
// e uma ferramenta da secretaria — e reaproveita o mesmo Puppeteer usado
// pra gerar o PDF de uma resposta (lib/pdf.js), so que apontando pra uma
// pagina estatica sem dados de nenhuma visita.
router.get('/blank/visita/pdf', async (req, res) => {
  const client = await requireAuth(req, res);
  if (!client) return;

  try {
    const { data: staffData } = await client
      .from('staff_emails')
      .select('email')
      .maybeSingle();
    if (!staffData) return res.status(403).json({ error: 'Não autorizado.' });

    const pdfBuffer = await renderVisitaBlankPdf({
      baseUrl: process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
      internalToken: process.env.INTERNAL_PDF_SECRET
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="modelo-visita-em-branco.pdf"'
    });
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Modelo de requerimento de avaliação substitutiva EM BRANCO — mesma lógica
// de acesso e mesmo motivo da rota acima (ferramenta da secretaria, não o
// link público do formulário).
router.get('/blank/avaliacao/pdf', async (req, res) => {
  const client = await requireAuth(req, res);
  if (!client) return;

  try {
    const { data: staffData } = await client
      .from('staff_emails')
      .select('email')
      .maybeSingle();
    if (!staffData) return res.status(403).json({ error: 'Não autorizado.' });

    const pdfBuffer = await renderAvaliacaoBlankPdf({
      baseUrl: process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
      internalToken: process.env.INTERNAL_PDF_SECRET
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="modelo-avaliacao-substitutiva-em-branco.pdf"'
    });
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================================================================
   HELPERS DE SANITIZACAO — aplicados antes de gravar no banco
   ================================================================ */

// Title Case com respeito a particulas preposicionais do portugues
function toTitleCase(str) {
  if (!str) return str;
  const particles = new Set(['da', 'das', 'de', 'do', 'dos', 'e', 'a', 'o', 'ao', 'i']);
  return String(str).trim().toLowerCase().split(/\s+/).map((w, i) =>
    w && (i === 0 || !particles.has(w)) ? w[0].toUpperCase() + w.slice(1) : w
  ).join(' ') || null;
}

// Primeira letra maiuscula (paragrafos)
function capFirst(str) {
  if (!str) return str;
  const s = String(str).trim();
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// Title Case "cru" (sem excecao de particulas) - usado pra nome de cidade,
// onde "Das", "Do" etc. devem ficar maiusculos mesmo no meio da frase.
function toWordTitleCase(str) {
  if (!str) return str;
  return String(str).trim().toLowerCase().split(/\s+/).map(w =>
    w ? w[0].toUpperCase() + w.slice(1) : w
  ).join(' ');
}

// "Cidade/Estado": aceita "-" ou "/" como separador, remove os espacos ao
// redor dele (evita desvio de padrao tipo "Mogi das Cruzes / SP" vs
// "Mogi das Cruzes/SP") e deixa a sigla do estado em maiusculo.
function toCityState(str) {
  if (!str) return str;
  const s = String(str).trim();
  if (!s) return null;
  const parts = s.split(/\s*[\/-]\s*/);
  const cidade = toWordTitleCase(parts[0]);
  const estado = parts[1] ? parts[1].trim().toUpperCase() : '';
  return estado ? `${cidade}/${estado}` : cidade;
}

router.post('/responses', async (req, res) => {
  try {
    const data = req.body;
    const client = getAnonClient();
    const visitaId = randomUUID();
    const submittedAt = new Date().toISOString();

    const { error } = await client.from('visita_respostas').insert({
      id: visitaId,
      escola_nome:          toTitleCase(data.escola.nome),
      escola_cidade_estado: toCityState(data.escola.cidadeEstado),
      pai_nome:             toTitleCase(data.responsaveis.pai.nome) || null,
      pai_whatsapp:         data.responsaveis.pai.whatsapp || null,
      pai_profissao:        toTitleCase(data.responsaveis.pai.profissao) || null,
      mae_nome:             toTitleCase(data.responsaveis.mae.nome) || null,
      mae_whatsapp:         data.responsaveis.mae.whatsapp || null,
      mae_profissao:        toTitleCase(data.responsaveis.mae.profissao) || null,
      motivo:               capFirst(data.extras.motivo),
      indicado:             data.extras.indicado,
      indicacao_nome:       toTitleCase(data.extras.indicacaoNome) || null,
      observacoes:          capFirst(data.extras.observacoes) || null
    });
    if (error) throw error;

    const alunosPayload = (data.students || []).map((s, i) => ({
      visita_id: visitaId,
      nome: toTitleCase(s.nome),
      nascimento: s.nascimento || null,
      turma: s.turma,
      ordem: i
    }));

    if (alunosPayload.length) {
      const { error: alunosError } = await client
        .from('visita_alunos')
        .insert(alunosPayload);
      if (alunosError) throw alunosError;
    }

    res.status(201).json({ id: visitaId, submittedAt });

    // Dispara depois de responder ao visitante — geracao de PDF + envio ao
    // n8n nao pode atrasar nem quebrar a confirmacao do cadastro. Erros
    // aqui so vao pro log do servidor.
    notifyN8n(visitaId).catch(err => {
      console.error(`[n8n] Falha ao notificar workflow para visita ${visitaId}:`, err.message);
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================================================================
   AVALIAÇÃO SUBSTITUTIVA
   ================================================================ */

// Nome de arquivo seguro pro Storage — mantém a extensão original, troca
// tudo que não é alfanumérico/ponto/hífen por "-" no nome base.
function sanitizeFileName(name) {
  const raw = String(name || 'anexo');
  const dot = raw.lastIndexOf('.');
  const base = dot > 0 ? raw.slice(0, dot) : raw;
  const ext = dot > 0 ? raw.slice(dot) : '';
  const safeBase = base.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'anexo';
  const safeExt = ext.replace(/[^a-zA-Z0-9.]+/g, '');
  return safeBase + safeExt;
}

// Máximo de avaliações perdidas por aluno em um único requerimento — acima
// disso o solicitante deve enviar um requerimento separado (mesmo limite
// aplicado no wizard, ver public/js/wizard-avaliacao.js).
const MAX_PROVAS_POR_ALUNO = 3;

// Valida os dados de UMA prova (usado em loop abaixo, um requerimento pode
// ter várias). Retorna uma mensagem de erro (string) ou null se estiver ok.
//
// O anexo agora é solicitado por DATA, não por prova (ver
// public/js/wizard-avaliacao.js): provas do mesmo dia compartilham o mesmo
// anexo, e apenas o grupo da data mais antiga do aluno é obrigatório — os
// demais são opcionais. Por isso `prova.anexo` pode legitimamente vir null
// aqui; a validação de "pelo menos um anexo por aluno" é feita à parte,
// logo abaixo, no loop principal.
function validateProva(prova) {
  if (!prova || !prova.disciplina || !prova.segmento || !prova.data) {
    return 'Dados de uma das avaliações estão incompletos.';
  }
  if (!['lingua_materna', 'lingua_inglesa'].includes(prova.segmento)) {
    return 'Segmento inválido em uma das avaliações.';
  }
  const motivo = prova.motivo || {};
  if (!['medico', 'outro'].includes(motivo.tipo)) {
    return 'Motivo da ausência inválido em uma das avaliações.';
  }
  if (prova.anexo) {
    const anexo = prova.anexo;
    if (!anexo.base64 || !anexo.nome || !anexo.tipo) {
      return 'Documento anexado inválido em uma das avaliações.';
    }
    if (!ANEXO_TIPOS_ACEITOS.includes(anexo.tipo)) {
      return 'Tipo de arquivo não suportado em um dos anexos. Envie uma imagem (JPG/PNG) ou PDF.';
    }
  }
  return null;
}

router.post('/avaliacoes', async (req, res) => {
  try {
    const data = req.body || {};
    const alunos = Array.isArray(data.alunos) ? data.alunos : [];

    // Validação mínima do lado do servidor — o wizard já valida tudo isso,
    // mas o endpoint é público (qualquer requisição pode chegar aqui).
    if (!alunos.length) {
      return res.status(400).json({ error: 'Informe ao menos um aluno.' });
    }
    for (const aluno of alunos) {
      if (!aluno.nome || !aluno.turma) {
        return res.status(400).json({ error: 'Dados de um dos alunos estão incompletos.' });
      }
      const provas = Array.isArray(aluno.provas) ? aluno.provas : [];
      if (!provas.length) {
        return res.status(400).json({ error: `Adicione ao menos uma avaliação perdida para ${aluno.nome}.` });
      }
      if (provas.length > MAX_PROVAS_POR_ALUNO) {
        return res.status(400).json({
          error: `${aluno.nome} tem mais de ${MAX_PROVAS_POR_ALUNO} avaliações neste requerimento. Envie um requerimento separado para as demais.`
        });
      }
      let temAnexo = false;
      for (const prova of provas) {
        const provaError = validateProva(prova);
        if (provaError) return res.status(400).json({ error: provaError });

        if (prova.anexo) {
          temAnexo = true;
          const anexoBuffer = Buffer.from(prova.anexo.base64, 'base64');
          if (anexoBuffer.length > ANEXO_TAMANHO_MAX_BYTES) {
            return res.status(400).json({ error: 'Um dos arquivos anexados é muito grande (máximo de 8MB).' });
          }
        }
      }
      // Pelo menos um documento por aluno é sempre obrigatório (o da data
      // mais antiga) — mesmo com o anexo agora sendo opcional por prova.
      if (!temAnexo) {
        return res.status(400).json({ error: `É necessário anexar ao menos um documento (atestado ou comprovante) para ${aluno.nome}.` });
      }
    }

    const client = getAnonClient();
    const avaliacaoId = randomUUID();
    const submittedAt = new Date().toISOString();

    const { error } = await client.from('avaliacao_substitutiva_respostas').insert({ id: avaliacaoId });
    if (error) throw error;

    // Sequencial (não Promise.all) de propósito: mantém a ordem de
    // alunos/provas estável e evita paralelizar dezenas de uploads de uma
    // vez só numa requisição pública sem limite de tamanho de lote.
    for (let alunoIdx = 0; alunoIdx < alunos.length; alunoIdx++) {
      const aluno = alunos[alunoIdx];
      const alunoId = randomUUID();

      const { error: alunoError } = await client.from('avaliacao_substitutiva_alunos').insert({
        id: alunoId,
        avaliacao_id: avaliacaoId,
        nome: toTitleCase(aluno.nome),
        turma: aluno.turma,
        ordem: alunoIdx
      });
      if (alunoError) throw alunoError;

      const provas = aluno.provas || [];
      for (let provaIdx = 0; provaIdx < provas.length; provaIdx++) {
        const prova = provas[provaIdx];

        // prova.anexo pode ser null: o anexo é por data, não por prova (ver
        // validateProva acima), então provas de uma data cujo documento é
        // opcional e não foi enviado ficam sem anexo_path/nome/tipo.
        let anexoPath = null;
        if (prova.anexo) {
          const anexoBuffer = Buffer.from(prova.anexo.base64, 'base64');
          anexoPath = `${avaliacaoId}/${alunoIdx}-${provaIdx}-${sanitizeFileName(prova.anexo.nome)}`;

          const { error: uploadError } = await client.storage
            .from('avaliacao-anexos')
            .upload(anexoPath, anexoBuffer, { contentType: prova.anexo.tipo, upsert: false });
          if (uploadError) throw uploadError;
        }

        const { error: provaError } = await client.from('avaliacao_substitutiva_provas').insert({
          aluno_id: alunoId,
          disciplina: toTitleCase(prova.disciplina),
          segmento: prova.segmento,
          data_avaliacao: prova.data,
          motivo_tipo: prova.motivo.tipo,
          observacoes: capFirst(prova.motivo.observacoes) || null,
          anexo_path: anexoPath,
          anexo_nome: prova.anexo ? prova.anexo.nome : null,
          anexo_tipo: prova.anexo ? prova.anexo.tipo : null,
          ordem: provaIdx
        });
        if (provaError) throw provaError;
      }
    }

    res.status(201).json({ id: avaliacaoId, submittedAt });

    // Mesma lógica do fluxo de visita: dispara depois de responder, erro
    // aqui não pode derrubar a confirmação de envio pro usuário.
    notifyN8nAvaliacao(avaliacaoId).catch(err => {
      console.error(`[n8n] Falha ao notificar workflow para avaliação ${avaliacaoId}:`, err.message);
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
