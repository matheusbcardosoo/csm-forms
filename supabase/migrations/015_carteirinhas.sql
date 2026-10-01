-- ==========================================================
-- 015_carteirinhas — pastas de eventos, subpastas, inscritos e log de
-- emissão das carteirinhas e fichas de inscrição (docs/08-carteirinhas.md
-- §3.2–3.5, §6.1).
--
-- Pasta = o evento (nome, logo, validade). Subpasta = a turma do evento,
-- que gera os documentos e sai impressa como "turma" no cartão.
--
-- Diferente do histórico, de propósito:
--   * sem snapshot e sem numeração — são documentos operacionais e
--     reimprimíveis; saem sempre com o dado atual;
--   * o PDF não é guardado — o log de emissão responde "quem imprimiu o quê";
--   * cascade de pasta → subpasta → inscrito — são listas de trabalho,
--     não registro escolar (a pasta só é excluída vazia, regra da rota).
--
-- ACESSO: só admin e secretaria, em tudo — tabelas e bucket. Foto,
-- nascimento e CPF de menor juntos são dado sensível (LGPD art. 14), e
-- quem não emite não precisa vê-los em massa (RNF-CART-01). É mais
-- fechado que o histórico de propósito.
-- ==========================================================

create table if not exists carteirinha_pasta (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,              -- nome do evento, impresso no cartão e na ficha
  descricao        text,
  logo_evento_path text,                       -- bucket 'carteirinhas'; frente, verso e ficha
  validade         date,                       -- "Válida até"; obrigatória para emitir (RF-CART-15)
  ano_letivo_id    uuid references ano_letivo (id),
  arquivada        boolean not null default false,
  criado_por       text,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

create table if not exists carteirinha_subpasta (
  id                    uuid primary key default gen_random_uuid(),
  pasta_id              uuid not null references carteirinha_pasta (id) on delete cascade,
  nome                  text not null,         -- "Sub 12 Vôlei": a "turma" do cartão
  professor_responsavel text,                  -- impresso na ficha de inscrição
  ordem                 int  not null default 0,
  ordenacao             text not null default 'alfabetica' check (ordenacao in ('alfabetica', 'manual')),
  criado_por            text,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  unique (pasta_id, nome)
);
create index if not exists idx_carteirinha_subpasta_pasta on carteirinha_subpasta (pasta_id);

create table if not exists carteirinha_inscrito (
  subpasta_id    uuid not null references carteirinha_subpasta (id) on delete cascade,
  aluno_id       uuid not null references aluno (id),          -- sem cascade: aluno nunca é apagado (RNF-02)
  ordem          int  not null default 0,
  adicionado_por text,
  adicionado_em  timestamptz not null default now(),
  primary key (subpasta_id, aluno_id)                          -- RF-CART-05: uma vez em cada subpasta
);
create index if not exists idx_carteirinha_inscrito_aluno on carteirinha_inscrito (aluno_id);

create table if not exists carteirinha_emissao (                -- RF-CART-17, só log
  id           uuid primary key default gen_random_uuid(),
  pasta_id     uuid references carteirinha_pasta (id) on delete set null,
  subpasta_id  uuid references carteirinha_subpasta (id) on delete set null,
  documento    text not null check (documento in ('carteirinhas', 'ficha_inscricao')),
  escopo       text not null check (escopo in ('subpasta', 'selecao', 'avulsa', 'pasta')),
  aluno_ids    uuid[] not null,
  emitido_por  text,
  emitido_em   timestamptz not null default now()
);
create index if not exists idx_carteirinha_emissao_subpasta on carteirinha_emissao (subpasta_id, emitido_em desc);
create index if not exists idx_carteirinha_emissao_pasta on carteirinha_emissao (pasta_id, emitido_em desc);

-- ---------- atualizado_em ----------
do $$
declare t text;
begin
  foreach t in array array['carteirinha_pasta', 'carteirinha_subpasta'] loop
    execute format('drop trigger if exists trg_%s_atualizado on %I', t, t);
    execute format('create trigger trg_%s_atualizado before update on %I for each row execute function marcar_atualizado_em()', t, t);
  end loop;
end $$;

-- ---------- RLS: só admin e secretaria, nas quatro operações ----------
do $$
declare t text;
begin
  foreach t in array array['carteirinha_pasta', 'carteirinha_subpasta', 'carteirinha_inscrito', 'carteirinha_emissao'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "%s_select_sec" on %I', t, t);
    execute format('create policy "%s_select_sec" on %I for select to authenticated using (tem_papel(''admin'', ''secretaria''))', t, t);
    execute format('drop policy if exists "%s_insert_sec" on %I', t, t);
    execute format('create policy "%s_insert_sec" on %I for insert to authenticated with check (tem_papel(''admin'', ''secretaria''))', t, t);
    execute format('drop policy if exists "%s_update_sec" on %I', t, t);
    execute format('create policy "%s_update_sec" on %I for update to authenticated using (tem_papel(''admin'', ''secretaria'')) with check (tem_papel(''admin'', ''secretaria''))', t, t);
    execute format('drop policy if exists "%s_delete_sec" on %I', t, t);
    execute format('create policy "%s_delete_sec" on %I for delete to authenticated using (tem_papel(''admin'', ''secretaria''))', t, t);
  end loop;
end $$;

-- o log de emissão é só de inserção: ninguém reescreve quem imprimiu o quê
drop policy if exists "carteirinha_emissao_update_sec" on carteirinha_emissao;
drop policy if exists "carteirinha_emissao_delete_sec" on carteirinha_emissao;

grant select, insert, update, delete on carteirinha_pasta, carteirinha_subpasta, carteirinha_inscrito to authenticated;
grant select, insert on carteirinha_emissao to authenticated;

-- ---------- Storage: logos dos eventos ----------
insert into storage.buckets (id, name, public)
values ('carteirinhas', 'carteirinhas', false)
on conflict (id) do nothing;

drop policy if exists "carteirinhas_read_sec" on storage.objects;
create policy "carteirinhas_read_sec"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'carteirinhas' and tem_papel('admin', 'secretaria'));

drop policy if exists "carteirinhas_insert_sec" on storage.objects;
create policy "carteirinhas_insert_sec"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'carteirinhas' and tem_papel('admin', 'secretaria'));

drop policy if exists "carteirinhas_update_sec" on storage.objects;
create policy "carteirinhas_update_sec"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'carteirinhas' and tem_papel('admin', 'secretaria'));

drop policy if exists "carteirinhas_delete_sec" on storage.objects;
create policy "carteirinhas_delete_sec"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'carteirinhas' and tem_papel('admin', 'secretaria'));
