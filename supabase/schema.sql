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
-- O envio do formulário continua público (chave "anon" pode inserir).
-- A leitura das respostas exige login (magic link) E e-mail presente
-- em staff_emails.
alter table visita_respostas enable row level security;
alter table visita_alunos enable row level security;

drop policy if exists "anon_insert_visita_respostas" on visita_respostas;
create policy "anon_insert_visita_respostas"
  on visita_respostas for insert
  to anon
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
create policy "anon_insert_visita_alunos"
  on visita_alunos for insert
  to anon
  with check (true);

drop policy if exists "anon_select_visita_alunos" on visita_alunos;
drop policy if exists "staff_select_visita_alunos" on visita_alunos;
create policy "staff_select_visita_alunos"
  on visita_alunos for select
  to authenticated
  using (exists (
    select 1 from staff_emails se where se.email = auth.email()
  ));
