-- ==========================================================
-- 002_usuario_perfil — papéis de acesso (F0)
--
-- Substitui a lista binária `staff_emails` por `usuario_perfil`, que
-- carrega o papel de cada pessoa (admin · secretaria · coordenacao ·
-- leitura). Quem já estava em staff_emails é migrado como `secretaria`.
-- staff_emails NÃO é apagada — fica como registro histórico e para
-- compatibilidade com scripts antigos; nada mais deve consultá-la.
-- ==========================================================

do $$ begin
  create type papel_usuario as enum ('admin', 'secretaria', 'coordenacao', 'leitura');
exception when duplicate_object then null; end $$;

create table if not exists usuario_perfil (
  email             text primary key,
  nome              text,
  papel             papel_usuario not null default 'leitura',
  ativo             boolean not null default true,
  criado_em         timestamptz not null default now(),
  ultimo_acesso_em  timestamptz
);

-- Migra quem já tinha acesso. Idempotente: quem já existe em usuario_perfil
-- não é tocado (preserva papel ajustado depois).
insert into usuario_perfil (email, nome, papel, ativo, criado_em)
select lower(email), nome, 'secretaria', true, created_at
from staff_emails
on conflict (email) do nothing;

-- ---------- Funções auxiliares usadas pelas policies ----------
-- security definer: a policy precisa ler usuario_perfil mesmo para quem só
-- pode enxergar a própria linha. `stable` permite ao planner cachear o
-- resultado dentro da mesma consulta.
create or replace function papel_atual()
returns papel_usuario
language sql
stable
security definer
set search_path = public
as $$
  select papel from usuario_perfil
  where email = lower(auth.email()) and ativo
  limit 1;
$$;

create or replace function usuario_ativo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from usuario_perfil
    where email = lower(auth.email()) and ativo
  );
$$;

create or replace function tem_papel(variadic papeis text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(papel_atual()::text = any (papeis), false);
$$;

revoke all on function papel_atual() from public;
revoke all on function usuario_ativo() from public;
revoke all on function tem_papel(text[]) from public;
grant execute on function papel_atual() to authenticated;
grant execute on function usuario_ativo() to authenticated;
grant execute on function tem_papel(text[]) to authenticated;

-- ---------- RLS de usuario_perfil ----------
alter table usuario_perfil enable row level security;
grant select, insert, update on usuario_perfil to authenticated;

drop policy if exists "perfil_select_proprio_ou_admin" on usuario_perfil;
create policy "perfil_select_proprio_ou_admin"
  on usuario_perfil for select
  to authenticated
  using (email = lower(auth.email()) or tem_papel('admin'));

drop policy if exists "perfil_insert_admin" on usuario_perfil;
create policy "perfil_insert_admin"
  on usuario_perfil for insert
  to authenticated
  with check (tem_papel('admin'));

drop policy if exists "perfil_update_admin" on usuario_perfil;
create policy "perfil_update_admin"
  on usuario_perfil for update
  to authenticated
  using (tem_papel('admin'))
  with check (tem_papel('admin'));

-- Sem delete para ninguém (RNF-02): desativar é `ativo = false`.

-- ---------- Respostas dos formulários passam a olhar usuario_perfil ----------
drop policy if exists "staff_select_visita_respostas" on visita_respostas;
create policy "staff_select_visita_respostas"
  on visita_respostas for select
  to authenticated
  using (usuario_ativo());

drop policy if exists "staff_select_visita_alunos" on visita_alunos;
create policy "staff_select_visita_alunos"
  on visita_alunos for select
  to authenticated
  using (usuario_ativo());

drop policy if exists "staff_select_avaliacao_substitutiva" on avaliacao_substitutiva_respostas;
create policy "staff_select_avaliacao_substitutiva"
  on avaliacao_substitutiva_respostas for select
  to authenticated
  using (usuario_ativo());

drop policy if exists "staff_select_avaliacao_substitutiva_alunos" on avaliacao_substitutiva_alunos;
create policy "staff_select_avaliacao_substitutiva_alunos"
  on avaliacao_substitutiva_alunos for select
  to authenticated
  using (usuario_ativo());

drop policy if exists "staff_select_avaliacao_substitutiva_provas" on avaliacao_substitutiva_provas;
create policy "staff_select_avaliacao_substitutiva_provas"
  on avaliacao_substitutiva_provas for select
  to authenticated
  using (usuario_ativo());

drop policy if exists "staff_read_avaliacao_anexos" on storage.objects;
create policy "staff_read_avaliacao_anexos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'avaliacao-anexos' and usuario_ativo());

-- Exemplo de como liberar alguém:
-- insert into usuario_perfil (email, nome, papel)
--   values ('secretaria@saomarcos.com.br', 'Secretaria', 'secretaria');
-- update usuario_perfil set papel = 'admin' where email = 'ti@saomarcos.com.br';
