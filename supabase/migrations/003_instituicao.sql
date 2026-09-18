-- ==========================================================
-- 003_instituicao — configuração institucional (F1)
--
-- instituicao (linha única) · instituicao_ato · instituicao_signatario ·
-- ano_letivo · bucket "institucional" (logotipos e assinaturas).
-- Leitura: qualquer usuário ativo. Escrita: só admin (02-arquitetura §3.7).
-- ==========================================================

do $$ begin
  create type tipo_ato_legal as enum ('criacao', 'autorizacao', 'reconhecimento', 'renovacao', 'programa', 'outro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type cargo_signatario as enum ('diretor', 'vice_diretor', 'secretario');
exception when duplicate_object then null; end $$;

do $$ begin
  create type situacao_ano_letivo as enum ('aberto', 'encerrado');
exception when duplicate_object then null; end $$;

-- ---------- Instituição (uma só; RF-INST-09 multiunidade é Could) ----------
create table if not exists instituicao (
  id                    uuid primary key default gen_random_uuid(),
  -- garante linha única: todo insert tem unico=true e a coluna é unique
  unico                 boolean not null default true unique check (unico),

  razao_social          text,
  nome_fantasia         text not null default 'Colégio São Marcos',
  cnpj                  text,
  codigo_inep           text,

  endereco_logradouro   text,
  endereco_numero       text,
  endereco_complemento  text,
  bairro                text,
  municipio             text default 'Mogi das Cruzes',
  uf                    text default 'SP',
  cep                   text,

  telefone              text,
  telefone_secundario   text,
  email                 text,
  site                  text,

  mantenedora_nome      text,
  mantenedora_cnpj      text,
  orgao_regional        text default 'Diretoria de Ensino - Região Mogi das Cruzes',

  logo_path             text,
  brasao_path           text,

  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

-- ---------- Atos legais: cada um vira UMA linha do cabeçalho ----------
-- 05-modelo-historico §1.1: "Autorização de Funcionamento - Portaria de
-- 16-03-2012 - DOE 28-03-2012". Número é opcional; data do ato e data de
-- publicação sempre existem. `texto_impresso` sobrescreve a linha gerada
-- quando o formato padrão não serve.
create table if not exists instituicao_ato (
  id                    uuid primary key default gen_random_uuid(),
  instituicao_id        uuid not null references instituicao (id) on delete cascade,
  tipo                  tipo_ato_legal not null default 'autorizacao',
  rotulo                text not null,              -- "Autorização de Funcionamento", "Ensino Bilíngue"
  instrumento           text not null default 'Portaria',
  numero                text,
  orgao_emissor         text,
  data_ato              date,
  veiculo_publicacao    text not null default 'DOE',
  data_publicacao       date,
  texto_impresso        text,                       -- null = gerado a partir dos campos
  observacao            text,
  ordem                 int not null default 0,
  ativo                 boolean not null default true,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

create index if not exists idx_instituicao_ato_ordem on instituicao_ato (instituicao_id, ordem);

-- ---------- Signatários ----------
-- 05-modelo-historico §2.3: nome · cargo · R.G. `cargo_impresso` é o rótulo
-- como sai no papel ("Diretora", "Secretária") — o enum serve só para o
-- sistema saber quem é diretor e quem é secretário.
create table if not exists instituicao_signatario (
  id                    uuid primary key default gen_random_uuid(),
  instituicao_id        uuid not null references instituicao (id) on delete cascade,
  nome                  text not null,
  cargo                 cargo_signatario not null,
  cargo_impresso        text not null,
  rg                    text,
  registro_autorizacao  text,                       -- nº de autorização do secretário escolar
  assinatura_path       text,
  ativo                 boolean not null default true,
  ordem                 int not null default 0,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

-- ---------- Anos letivos ----------
create table if not exists ano_letivo (
  id            uuid primary key default gen_random_uuid(),
  ano           int not null unique check (ano between 1900 and 2200),
  data_inicio   date,
  data_fim      date,
  dias_letivos  int check (dias_letivos is null or dias_letivos between 0 and 366),
  situacao      situacao_ano_letivo not null default 'aberto',
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ---------- atualizado_em automático ----------
create or replace function marcar_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['instituicao', 'instituicao_ato', 'instituicao_signatario', 'ano_letivo'] loop
    execute format('drop trigger if exists trg_%s_atualizado on %I', t, t);
    execute format('create trigger trg_%s_atualizado before update on %I for each row execute function marcar_atualizado_em()', t, t);
  end loop;
end $$;

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['instituicao', 'instituicao_ato', 'instituicao_signatario', 'ano_letivo'] loop
    execute format('alter table %I enable row level security', t);
    execute format('grant select, insert, update on %I to authenticated', t);
    execute format('drop policy if exists "%s_select_ativos" on %I', t, t);
    execute format('create policy "%s_select_ativos" on %I for select to authenticated using (usuario_ativo())', t, t);
    execute format('drop policy if exists "%s_insert_admin" on %I', t, t);
    execute format('create policy "%s_insert_admin" on %I for insert to authenticated with check (tem_papel(''admin''))', t, t);
    execute format('drop policy if exists "%s_update_admin" on %I', t, t);
    execute format('create policy "%s_update_admin" on %I for update to authenticated using (tem_papel(''admin'')) with check (tem_papel(''admin''))', t, t);
  end loop;
end $$;

-- Atos e signatários podem ser removidos (não são documento emitido):
grant delete on instituicao_ato, instituicao_signatario to authenticated;
drop policy if exists "instituicao_ato_delete_admin" on instituicao_ato;
create policy "instituicao_ato_delete_admin" on instituicao_ato for delete to authenticated using (tem_papel('admin'));
drop policy if exists "instituicao_signatario_delete_admin" on instituicao_signatario;
create policy "instituicao_signatario_delete_admin" on instituicao_signatario for delete to authenticated using (tem_papel('admin'));

-- ---------- Storage: logotipos, brasão, assinaturas ----------
insert into storage.buckets (id, name, public)
values ('institucional', 'institucional', false)
on conflict (id) do nothing;

drop policy if exists "institucional_read_ativos" on storage.objects;
create policy "institucional_read_ativos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'institucional' and usuario_ativo());

drop policy if exists "institucional_write_admin" on storage.objects;
create policy "institucional_write_admin"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'institucional' and tem_papel('admin'));

drop policy if exists "institucional_update_admin" on storage.objects;
create policy "institucional_update_admin"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'institucional' and tem_papel('admin'));

-- ---------- Semente: a instituição nasce com os dados conhecidos ----------
insert into instituicao (nome_fantasia, mantenedora_nome, orgao_regional, municipio, uf)
select 'Colégio São Marcos', 'Associação de Desenvolvimento Educacional CSM',
       'Diretoria de Ensino - Região Mogi das Cruzes', 'Mogi das Cruzes', 'SP'
where not exists (select 1 from instituicao);

insert into ano_letivo (ano, situacao)
select a, case when a < extract(year from now())::int then 'encerrado' else 'aberto' end::situacao_ano_letivo
from generate_series(extract(year from now())::int - 5, extract(year from now())::int) as a
on conflict (ano) do nothing;
