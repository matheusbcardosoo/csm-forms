-- ==========================================================
-- Schema do Formulário de Visitas — Colégio São Marcos
-- Execute este script no SQL Editor do painel do Supabase
-- (Project > SQL Editor > New query).
-- ==========================================================

create extension if not exists pgcrypto;

-- ---------- Tabela principal: uma linha por resposta enviada ----------
create table if not exists visita_respostas (
  id                  uuid primary key default gen_random_uuid(),
  submitted_at        timestamptz not null default now(),

  escola_nome         text,
  escola_cidade_estado text,

  pai_nome            text,
  pai_whatsapp        text,
  pai_profissao       text,

  mae_nome            text,
  mae_whatsapp        text,
  mae_profissao       text,

  motivo              text,
  indicado            text check (indicado in ('sim', 'nao')),
  indicacao_nome      text,
  observacoes         text
);

create index if not exists idx_visita_respostas_submitted_at
  on visita_respostas (submitted_at desc);

-- ---------- Alunos (1 para N por resposta) ----------
create table if not exists visita_alunos (
  id           uuid primary key default gen_random_uuid(),
  visita_id    uuid not null references visita_respostas (id) on delete cascade,
  nome         text not null,
  nascimento   date,
  turma        text,
  ordem        int not null default 0
);

create index if not exists idx_visita_alunos_visita_id
  on visita_alunos (visita_id);

-- ---------- Lista de e-mails autorizados a ver as respostas ----------
-- Adicione aqui os e-mails da equipe que podem acessar "Ver respostas".
-- O login em si (magic link) é aberto a qualquer e-mail — quem não
-- estiver nesta lista consegue entrar, mas não vê nenhum dado (RLS
-- abaixo bloqueia o select nas tabelas de resposta).
create table if not exists staff_emails (
  email       text primary key,
  nome        text,
  created_at  timestamptz not null default now()
);

alter table staff_emails enable row level security;

-- Cada usuário autenticado só enxerga a própria linha (usado pelo
-- front-end pra checar "meu e-mail está autorizado?").
drop policy if exists "self_select_staff_emails" on staff_emails;
create policy "self_select_staff_emails"
  on staff_emails for select
  to authenticated
  using (email = auth.email());

-- Exemplo de como liberar acesso pra alguém da equipe:
-- insert into staff_emails (email, nome) values ('secretaria@saomarcos.com.br', 'Secretaria');

-- ---------- RLS: visita_respostas / visita_alunos ----------
-- O envio do formulário é público: qualquer pessoa pode enviar,
-- esteja ela logada (ex: um funcionário testando) ou não — por isso
-- o insert é liberado tanto pra "anon" quanto "authenticated".
-- A leitura das respostas exige login (magic link) E e-mail presente
-- em staff_emails.
alter table visita_respostas enable row level security;
alter table visita_alunos enable row level security;

-- Garante os privilégios de base nas tabelas (o Supabase costuma
-- configurar isso automaticamente, mas reforçar não tem efeito colateral).
grant usage on schema public to anon, authenticated;
grant select, insert on visita_respostas to anon, authenticated;
grant select, insert on visita_alunos to anon, authenticated;
grant select on staff_emails to authenticated;

drop policy if exists "anon_insert_visita_respostas" on visita_respostas;
drop policy if exists "public_insert_visita_respostas" on visita_respostas;
create policy "public_insert_visita_respostas"
  on visita_respostas for insert
  to anon, authenticated
  with check (true);

drop policy if exists "anon_select_visita_respostas" on visita_respostas;
drop policy if exists "staff_select_visita_respostas" on visita_respostas;
create policy "staff_select_visita_respostas"
  on visita_respostas for select
  to authenticated
  using (exists (
    select 1 from staff_emails se where se.email = auth.email()
  ));

drop policy if exists "anon_insert_visita_alunos" on visita_alunos;
drop policy if exists "public_insert_visita_alunos" on visita_alunos;
create policy "public_insert_visita_alunos"
  on visita_alunos for insert
  to anon, authenticated
  with check (true);

drop policy if exists "anon_select_visita_alunos" on visita_alunos;
drop policy if exists "staff_select_visita_alunos" on visita_alunos;
create policy "staff_select_visita_alunos"
  on visita_alunos for select
  to authenticated
  using (exists (
    select 1 from staff_emails se where se.email = auth.email()
  ));

-- ==========================================================
-- Schema do Formulário de Requerimento de Avaliação Substitutiva
--
-- Estrutura em 3 níveis, pra suportar um requerimento com mais de um
-- aluno (ex.: irmãos) e, pra cada aluno, mais de uma avaliação perdida:
--   avaliacao_substitutiva_respostas  (1 por envio do formulário)
--     -> avaliacao_substitutiva_alunos       (1 para N por requerimento)
--          -> avaliacao_substitutiva_provas  (1 para N por aluno)
-- Cada prova tem sua própria disciplina/segmento/data/motivo/anexo —
-- é a prova, não o aluno nem o requerimento, que define pra qual
-- coordenação (língua materna/inglesa) a informação é relevante.
-- ==========================================================

-- ---------- Requerimento (raiz) ----------
create table if not exists avaliacao_substitutiva_respostas (
  id             uuid primary key default gen_random_uuid(),
  submitted_at   timestamptz not null default now()
);

create index if not exists idx_avaliacao_substitutiva_submitted_at
  on avaliacao_substitutiva_respostas (submitted_at desc);

-- ---------- Alunos (1 para N por requerimento) ----------
create table if not exists avaliacao_substitutiva_alunos (
  id           uuid primary key default gen_random_uuid(),
  avaliacao_id uuid not null references avaliacao_substitutiva_respostas (id) on delete cascade,
  nome         text not null,
  turma        text not null,
  ordem        int not null default 0
);

create index if not exists idx_avaliacao_substitutiva_alunos_avaliacao_id
  on avaliacao_substitutiva_alunos (avaliacao_id);

-- ---------- Provas perdidas (1 para N por aluno) ----------
create table if not exists avaliacao_substitutiva_provas (
  id             uuid primary key default gen_random_uuid(),
  aluno_id       uuid not null references avaliacao_substitutiva_alunos (id) on delete cascade,

  disciplina     text not null,
  segmento       text not null check (segmento in ('lingua_materna', 'lingua_inglesa')),
  data_avaliacao date not null,

  motivo_tipo    text not null check (motivo_tipo in ('medico', 'outro')),
  observacoes    text,

  -- Anexo (atestado médico ou comprovante de pagamento) guardado no Storage
  -- bucket "avaliacao-anexos" — ver policies mais abaixo. Cada prova tem o
  -- seu próprio anexo (o pagamento é por prova perdida).
  anexo_path     text not null,
  anexo_nome     text not null,
  anexo_tipo     text not null,

  ordem          int not null default 0
);

create index if not exists idx_avaliacao_substitutiva_provas_aluno_id
  on avaliacao_substitutiva_provas (aluno_id);

alter table avaliacao_substitutiva_respostas enable row level security;
alter table avaliacao_substitutiva_alunos enable row level security;
alter table avaliacao_substitutiva_provas enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert on avaliacao_substitutiva_respostas to anon, authenticated;
grant select, insert on avaliacao_substitutiva_alunos to anon, authenticated;
grant select, insert on avaliacao_substitutiva_provas to anon, authenticated;

-- Envio público (mesma lógica de visita_respostas): qualquer pessoa com o
-- link do formulário pode enviar um requerimento, sem precisar de login.
drop policy if exists "public_insert_avaliacao_substitutiva" on avaliacao_substitutiva_respostas;
create policy "public_insert_avaliacao_substitutiva"
  on avaliacao_substitutiva_respostas for insert
  to anon, authenticated
  with check (true);

drop policy if exists "public_insert_avaliacao_substitutiva_alunos" on avaliacao_substitutiva_alunos;
create policy "public_insert_avaliacao_substitutiva_alunos"
  on avaliacao_substitutiva_alunos for insert
  to anon, authenticated
  with check (true);

drop policy if exists "public_insert_avaliacao_substitutiva_provas" on avaliacao_substitutiva_provas;
create policy "public_insert_avaliacao_substitutiva_provas"
  on avaliacao_substitutiva_provas for insert
  to anon, authenticated
  with check (true);

-- Leitura das respostas exige login (magic link/senha) E e-mail presente
-- em staff_emails — mesma regra da tela "Ver respostas" de visitas.
drop policy if exists "staff_select_avaliacao_substitutiva" on avaliacao_substitutiva_respostas;
create policy "staff_select_avaliacao_substitutiva"
  on avaliacao_substitutiva_respostas for select
  to authenticated
  using (exists (
    select 1 from staff_emails se where se.email = auth.email()
  ));

drop policy if exists "staff_select_avaliacao_substitutiva_alunos" on avaliacao_substitutiva_alunos;
create policy "staff_select_avaliacao_substitutiva_alunos"
  on avaliacao_substitutiva_alunos for select
  to authenticated
  using (exists (
    select 1 from staff_emails se where se.email = auth.email()
  ));

drop policy if exists "staff_select_avaliacao_substitutiva_provas" on avaliacao_substitutiva_provas;
create policy "staff_select_avaliacao_substitutiva_provas"
  on avaliacao_substitutiva_provas for select
  to authenticated
  using (exists (
    select 1 from staff_emails se where se.email = auth.email()
  ));

-- ---------- Storage: bucket para os anexos (atestado / comprovante) ----------
-- Bucket privado — nada é servido publicamente. Upload é público (o próprio
-- envio do formulário), leitura só para a equipe autorizada (staff_emails)
-- ou para o service_role (usado pela rota interna de PDF e pelo envio ao n8n).
insert into storage.buckets (id, name, public)
values ('avaliacao-anexos', 'avaliacao-anexos', false)
on conflict (id) do nothing;

drop policy if exists "public_upload_avaliacao_anexos" on storage.objects;
create policy "public_upload_avaliacao_anexos"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'avaliacao-anexos');

drop policy if exists "staff_read_avaliacao_anexos" on storage.objects;
create policy "staff_read_avaliacao_anexos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avaliacao-anexos'
    and exists (select 1 from staff_emails se where se.email = auth.email())
  );
