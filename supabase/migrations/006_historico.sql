-- ==========================================================
-- 006_historico — documentos emitidos (F5). Desenho em
-- 02-arquitetura §3.4 e anatomia do papel em 05-modelo-historico.
--
-- Invariantes:
--   1. documento emitido é congelado: o snapshot é a verdade, e a linha
--      vira somente leitura (trigger historico_congelado) — só pdf_path,
--      cancelamento e status podem mudar depois
--   2. numeração por ano, sequencial, atribuída dentro da transação de
--      emissão (historico_sequencia)
--   3. nada é apagado (RNF-02): cancelamento é status, 2ª via é linha nova
--      apontando para a original
--   4. histórico de conclusão só emite com o número de publicação da SED
--      preenchido (RF-HIST-15)
-- ==========================================================

do $$ begin create type tipo_historico as enum ('transferencia', 'conclusao_ef', 'conclusao_em', 'parcial', 'declaracao'); exception when duplicate_object then null; end $$;
do $$ begin create type status_historico as enum ('rascunho', 'conferido', 'emitido', 'cancelado'); exception when duplicate_object then null; end $$;

-- ---------- Documento ----------
create table if not exists historico (
  id                       uuid primary key default gen_random_uuid(),
  aluno_id                 uuid not null references aluno (id),
  curso_id                 uuid not null references curso (id),
  tipo                     tipo_historico not null,
  status                   status_historico not null default 'rascunho',
  -- quais anos da trajetória entram no documento (passo 2 do assistente)
  matricula_ids            uuid[] not null default '{}',
  via                      int not null default 1,
  via_de_id                uuid references historico (id),
  numero_registro          int,
  ano_registro             int,
  livro                    text,
  folha                    text,
  -- rótulo impresso "Registro / Visto Confere"; copiado da SED à mão (RF-HIST-15)
  numero_registro_gdae     text,
  com_certificado          boolean not null default false,
  signatario_diretor_id    uuid references instituicao_signatario (id),
  signatario_secretario_id uuid references instituicao_signatario (id),
  observacoes              text,
  snapshot                 jsonb,          -- HistoricoDocumento congelado na emissão
  pdf_path                 text,           -- Storage, bucket privado 'documentos'
  criado_por               text,
  conferido_por            text,
  emitido_por              text,
  cancelado_por            text,
  motivo_cancelamento      text,
  criado_em                timestamptz not null default now(),
  atualizado_em            timestamptz not null default now(),
  conferido_em             timestamptz,
  emitido_em               timestamptz,
  cancelado_em             timestamptz
);
create index if not exists idx_historico_aluno on historico (aluno_id, criado_em desc);
create index if not exists idx_historico_status on historico (status, criado_em desc);
create unique index if not exists uq_historico_registro on historico (ano_registro, numero_registro, via)
  where numero_registro is not null;

-- ---------- Numeração por ano (RF-HIST-07) ----------
create table if not exists historico_sequencia (
  ano            int primary key,
  ultimo_numero  int not null default 0
);

-- ---------- Textos-padrão de observação (RF-HIST-04) ----------
create table if not exists observacao_modelo (
  id          uuid primary key default gen_random_uuid(),
  titulo      text not null,
  texto       text not null,
  base_legal  text,
  etapa       etapa_ensino,          -- null = vale para qualquer etapa
  ativo       boolean not null default true,
  ordem       int not null default 0,
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ---------- atualizado_em ----------
do $$
declare t text;
begin
  foreach t in array array['historico', 'observacao_modelo'] loop
    execute format('drop trigger if exists trg_%s_atualizado on %I', t, t);
    execute format('create trigger trg_%s_atualizado before update on %I for each row execute function marcar_atualizado_em()', t, t);
  end loop;
end $$;

-- ==========================================================
-- Congelamento: emitido/cancelado é somente leitura. Só o caminho do
-- PDF, o carimbo de tempo e a transição de status (feita pelas funções
-- abaixo) continuam podendo mudar.
-- ==========================================================
create or replace function historico_congelado()
returns trigger language plpgsql as $$
declare
  ignorar text[] := array['pdf_path', 'atualizado_em', 'status', 'cancelado_por', 'cancelado_em', 'motivo_cancelamento'];
  a jsonb;
  b jsonb;
begin
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

-- ==========================================================
-- emitir_historico(): atribui número, congela o snapshot e audita —
-- tudo na mesma transação (RF-HIST-06, RF-HIST-07).
-- ==========================================================
create or replace function emitir_historico(p_id uuid, p_snapshot jsonb, p_usuario text)
returns historico
language plpgsql
security definer
set search_path = public
as $$
declare
  h historico;
  v_ano int;
  v_num int;
begin
  if not tem_papel('admin', 'secretaria') then
    raise exception 'Seu perfil não emite documentos.' using errcode = 'insufficient_privilege';
  end if;

  select * into h from historico where id = p_id for update;
  if h.id is null then raise exception 'Histórico não encontrado.'; end if;
  if h.status = 'emitido' then raise exception 'Este histórico já foi emitido.' using errcode = 'check_violation'; end if;
  if h.status = 'cancelado' then raise exception 'Este histórico está cancelado.' using errcode = 'check_violation'; end if;
  if h.com_certificado and coalesce(trim(h.numero_registro_gdae), '') = '' then
    raise exception 'Informe o número de publicação da SED (Registro / Visto Confere) antes de emitir.' using errcode = 'check_violation';
  end if;
  if p_snapshot is null or p_snapshot = 'null'::jsonb then
    raise exception 'Documento vazio: nada a congelar.' using errcode = 'check_violation';
  end if;

  v_ano := extract(year from now())::int;
  insert into historico_sequencia (ano, ultimo_numero) values (v_ano, 0) on conflict (ano) do nothing;
  update historico_sequencia set ultimo_numero = ultimo_numero + 1 where ano = v_ano returning ultimo_numero into v_num;

  -- O snapshot chega montado do servidor, mas o número de registro só
  -- existe a partir daqui — é esta função que o atribui. Sem carimbá-lo
  -- no documento congelado, a 2ª via sairia sem o registro no rodapé.
  update historico set
    status = 'emitido', numero_registro = v_num, ano_registro = v_ano,
    snapshot = jsonb_set(p_snapshot, '{registro}', jsonb_build_object(
      'numero', v_num::text || '/' || v_ano::text,
      'livro', h.livro, 'folha', h.folha, 'emitido_em', now()
    )),
    emitido_por = p_usuario, emitido_em = now()
  where id = p_id returning * into h;

  insert into auditoria (entidade, entidade_id, aluno_id, acao, campo, valor_novo, usuario_email)
  values ('historico', h.id, h.aluno_id, 'emitir', 'status',
          jsonb_build_object('numero_registro', v_num, 'ano_registro', v_ano, 'tipo', h.tipo, 'via', h.via), p_usuario);
  return h;
end $$;

revoke all on function emitir_historico(uuid, jsonb, text) from public;
grant execute on function emitir_historico(uuid, jsonb, text) to authenticated;

-- ==========================================================
-- cancelar_historico(): motivo obrigatório; o documento continua
-- existindo (RNF-02), só deixa de valer.
-- ==========================================================
create or replace function cancelar_historico(p_id uuid, p_motivo text, p_usuario text)
returns historico
language plpgsql
security definer
set search_path = public
as $$
declare h historico;
begin
  if not tem_papel('admin', 'secretaria') then
    raise exception 'Seu perfil não cancela documentos.' using errcode = 'insufficient_privilege';
  end if;
  if p_motivo is null or length(trim(p_motivo)) < 5 then
    raise exception 'Informe o motivo do cancelamento (ao menos 5 caracteres).' using errcode = 'check_violation';
  end if;

  select * into h from historico where id = p_id for update;
  if h.id is null then raise exception 'Histórico não encontrado.'; end if;
  if h.status = 'cancelado' then raise exception 'Este histórico já está cancelado.' using errcode = 'check_violation'; end if;

  -- zera o PDF guardado: o arquivo do bucket foi gerado sem a marca de
  -- cancelado, e baixar um documento cancelado que parece válido é
  -- exatamente o erro que não pode acontecer. A próxima baixa regera.
  update historico set status = 'cancelado', cancelado_por = p_usuario, cancelado_em = now(),
                       motivo_cancelamento = trim(p_motivo), pdf_path = null
  where id = p_id returning * into h;

  insert into auditoria (entidade, entidade_id, aluno_id, acao, campo, valor_anterior, valor_novo, motivo, usuario_email)
  values ('historico', h.id, h.aluno_id, 'cancelar', 'status', jsonb_build_object('status', 'emitido'),
          jsonb_build_object('status', 'cancelado'), trim(p_motivo), p_usuario);
  return h;
end $$;

revoke all on function cancelar_historico(uuid, text, text) from public;
grant execute on function cancelar_historico(uuid, text, text) to authenticated;

-- ==========================================================
-- criar_segunda_via(): linha nova, mesmo número de registro, mesma
-- verdade congelada — renderiza o snapshot, não recalcula (RF-HIST-10).
-- ==========================================================
create or replace function criar_segunda_via(p_id uuid, p_usuario text)
returns historico
language plpgsql
security definer
set search_path = public
as $$
declare
  o historico;
  n historico;
  v_via int;
  v_raiz uuid;
begin
  if not tem_papel('admin', 'secretaria') then
    raise exception 'Seu perfil não emite documentos.' using errcode = 'insufficient_privilege';
  end if;

  select * into o from historico where id = p_id;
  if o.id is null then raise exception 'Histórico não encontrado.'; end if;
  if o.status <> 'emitido' then raise exception 'Só um documento emitido tem 2ª via.' using errcode = 'check_violation'; end if;

  v_raiz := coalesce(o.via_de_id, o.id);
  select coalesce(max(via), 1) + 1 into v_via from historico where id = v_raiz or via_de_id = v_raiz;

  insert into historico (
    aluno_id, curso_id, tipo, status, matricula_ids, via, via_de_id,
    numero_registro, ano_registro, livro, folha, numero_registro_gdae, com_certificado,
    signatario_diretor_id, signatario_secretario_id, observacoes, snapshot,
    criado_por, emitido_por, emitido_em
  ) values (
    o.aluno_id, o.curso_id, o.tipo, 'emitido', o.matricula_ids, v_via, v_raiz,
    o.numero_registro, o.ano_registro, o.livro, o.folha, o.numero_registro_gdae, o.com_certificado,
    o.signatario_diretor_id, o.signatario_secretario_id, o.observacoes,
    jsonb_set(coalesce(o.snapshot, '{}'::jsonb), '{via}', to_jsonb(v_via)),
    p_usuario, p_usuario, now()
  ) returning * into n;

  insert into auditoria (entidade, entidade_id, aluno_id, acao, campo, valor_anterior, valor_novo, usuario_email)
  values ('historico', n.id, n.aluno_id, 'emitir', 'via', jsonb_build_object('documento_original', o.id),
          jsonb_build_object('via', v_via, 'numero_registro', n.numero_registro), p_usuario);
  return n;
end $$;

revoke all on function criar_segunda_via(uuid, text) from public;
grant execute on function criar_segunda_via(uuid, text) to authenticated;

-- ---------- RLS ----------
-- historico: leitura para todo papel ativo; criação/edição admin+secretaria;
-- emissão/cancelamento/2ª via só pelas funções acima. Sem delete (RNF-02).
alter table historico enable row level security;
grant select, insert, update on historico to authenticated;
drop policy if exists "historico_select_ativos" on historico;
create policy "historico_select_ativos" on historico for select to authenticated using (usuario_ativo());
drop policy if exists "historico_insert_sec" on historico;
create policy "historico_insert_sec" on historico for insert to authenticated with check (tem_papel('admin', 'secretaria'));
drop policy if exists "historico_update_sec" on historico;
create policy "historico_update_sec" on historico for update to authenticated using (tem_papel('admin', 'secretaria')) with check (tem_papel('admin', 'secretaria'));

alter table historico_sequencia enable row level security;
grant select on historico_sequencia to authenticated;
drop policy if exists "historico_sequencia_select" on historico_sequencia;
create policy "historico_sequencia_select" on historico_sequencia for select to authenticated using (tem_papel('admin', 'secretaria'));

alter table observacao_modelo enable row level security;
grant select, insert, update, delete on observacao_modelo to authenticated;
drop policy if exists "observacao_modelo_select" on observacao_modelo;
create policy "observacao_modelo_select" on observacao_modelo for select to authenticated using (usuario_ativo());
drop policy if exists "observacao_modelo_insert" on observacao_modelo;
create policy "observacao_modelo_insert" on observacao_modelo for insert to authenticated with check (tem_papel('admin', 'secretaria'));
drop policy if exists "observacao_modelo_update" on observacao_modelo;
create policy "observacao_modelo_update" on observacao_modelo for update to authenticated using (tem_papel('admin', 'secretaria')) with check (tem_papel('admin', 'secretaria'));
drop policy if exists "observacao_modelo_delete" on observacao_modelo;
create policy "observacao_modelo_delete" on observacao_modelo for delete to authenticated using (tem_papel('admin', 'secretaria'));

-- ---------- Storage: PDFs emitidos ----------
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

drop policy if exists "documentos_read_ativos" on storage.objects;
create policy "documentos_read_ativos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'documentos' and usuario_ativo());

drop policy if exists "documentos_write_sec" on storage.objects;
create policy "documentos_write_sec"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'documentos' and tem_papel('admin', 'secretaria'));

drop policy if exists "documentos_update_sec" on storage.objects;
create policy "documentos_update_sec"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'documentos' and tem_papel('admin', 'secretaria'));

-- ---------- Semente: textos-padrão do modelo real (05-modelo §2.1) ----------
insert into observacao_modelo (titulo, texto, base_legal, etapa, ordem)
select * from (values
  ('Conclusão da etapa anterior',
   'O(a) referido(a) aluno(a) concluiu o {ETAPA ANTERIOR} no {ESTABELECIMENTO} de {MUNICÍPIO}/{UF} no ano letivo de {ANO}.',
   null::text, null::etapa_ensino, 0),
  ('Certificação de nível (programa bilíngue)',
   '{ANO} - O(a) aluno(a) concluiu o componente {COMPONENTE} no nível {NÍVEL} (CEFR).',
   null, null, 1),
  ('Critério de promoção (Regimento Escolar)',
   'Será considerado promovido o aluno que obtiver, nos diferentes conteúdos curriculares, os seguintes resultados: I – frequência igual ou superior a 75% com nota final mínima 6,0 (seis) inteiros no final do ano letivo.',
   'Regimento Escolar', null, 2),
  ('Transferência no curso do ano letivo',
   'O(a) referido(a) aluno(a) foi transferido(a) em {DATA}, cursando o(a) {SÉRIE}, sem conclusão do ano letivo.',
   null, null, 3)
) as m(titulo, texto, base_legal, etapa, ordem)
where not exists (select 1 from observacao_modelo);
