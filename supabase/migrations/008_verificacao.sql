-- ==========================================================
-- 008_verificacao — código de verificação de autenticidade do
-- documento (RF-HIST-14). Desenho em
-- docs/superpowers/specs/2026-09-21-f7-refino-design.md §3.2.
--
-- Numerada 008 e não 007 de propósito: a 007 é o endurecimento dos
-- RPCs SECURITY DEFINER, escrita em paralelo a esta. Migration é
-- imutável e aplicada em ordem — duas com o mesmo número é um conflito
-- que só aparece na hora de aplicar.
--
-- Esta migration não toca em `emitir_historico`, `cancelar_historico`
-- nem `criar_segunda_via`: o código é atribuído pela aplicação, não
-- pelas funções de emissão. A única função recriada aqui é o gatilho de
-- congelamento, e ela repete o `set search_path` que a 007 fixou —
-- `create or replace` substitui a definição inteira e derruba as
-- configurações da função, então omitir aquela linha desfaria a 007 em
-- silêncio (os GRANTs, esses, sobrevivem ao replace).
-- ==========================================================

-- Identificador público do documento. NÃO é o número de registro: o
-- registro é sequencial e está impresso no papel, então usá-lo na URL
-- deixaria qualquer um varrer /verificar/1, /verificar/2 e listar o que
-- a escola emitiu. Este é aleatório (22 caracteres base62, ~95 bits),
-- o que torna a URL adivinhável só por quem tem o documento na mão.
alter table historico add column if not exists codigo_verificacao text;

create unique index if not exists uq_historico_codigo_verificacao
  on historico (codigo_verificacao) where codigo_verificacao is not null;

-- ---------- Congelamento (substitui a versão da 006) ----------
-- Muda só a lista de campos que podem mudar depois de emitido: o código
-- entra nela para que um documento emitido ANTES desta migration possa
-- ganhar o seu sem ser reemitido — o código identifica a via impressa,
-- não o conteúdo, e por isso não faz parte do snapshot.
--
-- Uma vez preenchido, porém, nunca muda: trocar o código de um documento
-- já emitido invalidaria o QR do papel que já está na rua.
create or replace function historico_congelado()
returns trigger language plpgsql
set search_path = public, pg_temp   -- mantém o que a 007 fixou
as $$
declare
  ignorar text[] := array['pdf_path', 'atualizado_em', 'status', 'cancelado_por', 'cancelado_em', 'motivo_cancelamento', 'codigo_verificacao'];
  a jsonb;
  b jsonb;
begin
  if old.codigo_verificacao is not null and new.codigo_verificacao is distinct from old.codigo_verificacao then
    raise exception 'O código de verificação de um documento não pode ser alterado.'
      using errcode = 'check_violation';
  end if;

  a := to_jsonb(old) - ignorar;
  b := to_jsonb(new) - ignorar;
  if old.status in ('emitido', 'cancelado') and a is distinct from b then
    raise exception 'Documento % é somente leitura. Gere uma 2ª via ou cancele o documento.', old.status
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_historico_congelado on historico;
create trigger trg_historico_congelado before update on historico
  for each row execute function historico_congelado();

-- reafirma o que a 007 revogou: `create or replace` preserva as
-- permissões, mas deixar explícito evita que a próxima releitura desta
-- migration conclua que o gatilho voltou a ser alcançável por anon
revoke execute on function historico_congelado() from public, anon;
