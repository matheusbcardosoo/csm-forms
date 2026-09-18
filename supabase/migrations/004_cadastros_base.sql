-- ==========================================================
-- 004_cadastros_base — cursos, séries, componentes e estrutura
-- curricular versionada (F2). Desenho em 06-versionamento-curricular.md.
--
-- Invariantes garantidas AQUI, no banco:
--   1. versão em uso (status <> rascunho) é somente leitura — trigger
--   2. nome_impresso vive na versão; componente guarda só a identidade
--   3. vigência é resolvida por (ano letivo, série)
-- ==========================================================

do $$ begin
  create type etapa_ensino as enum ('ei', 'ef_iniciais', 'ef_finais', 'em');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_versao_curricular as enum ('rascunho', 'vigente', 'encerrada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_sistema_avaliacao as enum ('nota_0_10', 'nota_0_100', 'conceito');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_mapeamento_activesoft as enum ('disciplina', 'serie', 'turma', 'situacao');
exception when duplicate_object then null; end $$;

-- ---------- Curso: é o que nomeia o documento ----------
-- "HISTÓRICO ESCOLAR - ENSINO MÉDIO BILÍNGUE": curso, não etapa.
create table if not exists curso (
  id               uuid primary key default gen_random_uuid(),
  etapa            etapa_ensino not null,
  nome             text not null unique,
  razao_aula_hora  numeric(5,3) not null default 0.750 check (razao_aula_hora > 0 and razao_aula_hora <= 2),
  texto_promocao   text,          -- critério do Regimento, impresso em Observações
  ativo            boolean not null default true,
  ordem            int not null default 0,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

create table if not exists serie (
  id         uuid primary key default gen_random_uuid(),
  curso_id   uuid not null references curso (id),
  codigo     text not null,       -- "1", "2", "3" / "6" ... ordem estável
  nome       text not null,       -- "1ª série", "6º ano"
  ordem      int not null default 0,
  ativo      boolean not null default true,
  unique (curso_id, codigo)
);

-- ---------- Componente: identidade entre versões, NÃO nome impresso ----------
create table if not exists componente (
  id              uuid primary key default gen_random_uuid(),
  nome_canonico   text not null unique,
  sigla           text,
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now()
);

-- ---------- Estrutura curricular versionada ----------
create table if not exists versao_curricular (
  id               uuid primary key default gen_random_uuid(),
  curso_id         uuid not null references curso (id),
  nome             text not null,
  base_legal       text,
  status           status_versao_curricular not null default 'rascunho',
  ano_inicio       int,
  ano_fim          int,
  duplicada_de_id  uuid references versao_curricular (id),
  criado_por       text,
  criado_em        timestamptz not null default now(),
  publicado_por    text,
  publicado_em     timestamptz,
  atualizado_em    timestamptz not null default now(),
  unique (curso_id, nome),
  check (ano_fim is null or ano_inicio is null or ano_fim >= ano_inicio)
);

create table if not exists versao_bloco (          -- "Formação Geral Básica"
  id         uuid primary key default gen_random_uuid(),
  versao_id  uuid not null references versao_curricular (id) on delete cascade,
  nome       text not null,
  ordem      int not null default 0
);

create table if not exists versao_agrupamento (    -- "Linguagens e suas Tecnologias", "Ciclo Integrador"
  id               uuid primary key default gen_random_uuid(),
  versao_bloco_id  uuid not null references versao_bloco (id) on delete cascade,
  nome             text not null,
  ordem            int not null default 0
);

create table if not exists versao_item (           -- UMA LINHA do histórico, nesta versão, nesta série
  id                     uuid primary key default gen_random_uuid(),
  versao_agrupamento_id  uuid not null references versao_agrupamento (id) on delete cascade,
  serie_id               uuid not null references serie (id),
  componente_id          uuid references componente (id),   -- null = componente novo, sem antecessor
  nome_impresso          text not null,
  ordem                  int not null default 0,
  carga_horaria          int check (carga_horaria is null or carga_horaria >= 0)
);

-- unique parcial: com componente_id nulo, não há como colidir por identidade
create unique index if not exists uq_versao_item_identidade
  on versao_item (versao_agrupamento_id, serie_id, componente_id)
  where componente_id is not null;

create table if not exists versao_total (          -- as duas linhas de total da grade
  versao_id            uuid not null references versao_curricular (id) on delete cascade,
  serie_id             uuid not null references serie (id),
  total_aulas_anuais   int check (total_aulas_anuais is null or total_aulas_anuais >= 0),
  total_horas_anuais   int check (total_horas_anuais is null or total_horas_anuais >= 0),
  primary key (versao_id, serie_id)
);

create table if not exists vigencia_curricular (   -- resolve (ano letivo, série) → versão
  ano_letivo_id  uuid not null references ano_letivo (id),
  serie_id       uuid not null references serie (id),
  versao_id      uuid not null references versao_curricular (id),
  primary key (ano_letivo_id, serie_id)
);

-- ---------- Sistema de avaliação por curso ----------
create table if not exists sistema_avaliacao (
  id                  uuid primary key default gen_random_uuid(),
  curso_id            uuid not null unique references curso (id),
  tipo                tipo_sistema_avaliacao not null default 'nota_0_10',
  media_aprovacao     numeric(5,2),
  frequencia_minima   numeric(5,2) default 75,
  escala_conceitos    jsonb,       -- [{"conceito":"A","descricao":"..."}]
  legenda             text,
  atualizado_em       timestamptz not null default now()
);

-- ---------- Estabelecimentos externos (anos cursados em outra escola) ----------
create table if not exists estabelecimento_externo (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  municipio    text,
  uf           text,
  cnpj         text,
  codigo_inep  text,
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now()
);

-- ---------- Mapeamento Activesoft (por versão; usado a partir da F3) ----------
-- Criado aqui porque `duplicar_versao()` precisa herdá-lo (06 §5).
create table if not exists mapeamento_activesoft (
  id                uuid primary key default gen_random_uuid(),
  versao_id         uuid not null references versao_curricular (id) on delete cascade,
  tipo              tipo_mapeamento_activesoft not null,
  codigo_origem     text not null,
  descricao_origem  text,
  versao_item_id    uuid references versao_item (id),
  destino_valor     text,
  confirmado        boolean not null default false,
  observacao        text,
  unique (versao_id, tipo, codigo_origem)
);

-- Atos legais podem ser de um curso específico (ex.: programa bilíngue)
alter table instituicao_ato add column if not exists curso_id uuid references curso (id);

-- ---------- atualizado_em ----------
do $$
declare t text;
begin
  foreach t in array array['curso', 'versao_curricular', 'sistema_avaliacao'] loop
    execute format('drop trigger if exists trg_%s_atualizado on %I', t, t);
    execute format('create trigger trg_%s_atualizado before update on %I for each row execute function marcar_atualizado_em()', t, t);
  end loop;
end $$;

-- ==========================================================
-- INVARIANTE 1: versão em uso é somente leitura
-- ==========================================================
create or replace function versao_esta_em_rascunho(p_versao_id uuid)
returns boolean language sql stable as $$
  select status = 'rascunho' from versao_curricular where id = p_versao_id;
$$;

create or replace function bloquear_edicao_versao_em_uso()
returns trigger language plpgsql as $$
declare
  v_versao uuid;
  v_linha record;
begin
  if tg_op = 'DELETE' then v_linha := old; else v_linha := new; end if;
  if tg_table_name = 'versao_bloco' then
    v_versao := v_linha.versao_id;
  elsif tg_table_name = 'versao_total' then
    v_versao := v_linha.versao_id;
  elsif tg_table_name = 'versao_agrupamento' then
    select b.versao_id into v_versao from versao_bloco b where b.id = v_linha.versao_bloco_id;
  elsif tg_table_name = 'versao_item' then
    select b.versao_id into v_versao
      from versao_agrupamento a join versao_bloco b on b.id = a.versao_bloco_id
      where a.id = v_linha.versao_agrupamento_id;
  end if;

  if v_versao is not null and not versao_esta_em_rascunho(v_versao) then
    raise exception 'Versão curricular em uso é somente leitura. Duplique-a para editar.'
      using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['versao_bloco', 'versao_agrupamento', 'versao_item', 'versao_total'] loop
    execute format('drop trigger if exists trg_%s_bloqueio on %I', t, t);
    execute format('create trigger trg_%s_bloqueio before insert or update or delete on %I for each row execute function bloquear_edicao_versao_em_uso()', t, t);
  end loop;
end $$;

-- Na própria versão, fora de rascunho só mudam status/vigência/publicação.
create or replace function bloquear_edicao_cabecalho_versao()
returns trigger language plpgsql as $$
begin
  if old.status <> 'rascunho' and (
    new.curso_id <> old.curso_id
    or new.nome <> old.nome
    or new.base_legal is distinct from old.base_legal
    or new.duplicada_de_id is distinct from old.duplicada_de_id
  ) then
    raise exception 'Versão curricular em uso é somente leitura. Duplique-a para editar.'
      using errcode = 'check_violation';
  end if;
  if old.status = 'encerrada' and new.status <> 'encerrada' then
    raise exception 'Versão encerrada não volta a ser vigente.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_versao_curricular_bloqueio on versao_curricular;
create trigger trg_versao_curricular_bloqueio before update on versao_curricular
  for each row execute function bloquear_edicao_cabecalho_versao();

-- Sem delete de versão que já foi publicada (histórico depende dela).
create or replace function bloquear_delete_versao_publicada()
returns trigger language plpgsql as $$
begin
  if old.status <> 'rascunho' then
    raise exception 'Só versões em rascunho podem ser excluídas.' using errcode = 'check_violation';
  end if;
  return old;
end $$;

drop trigger if exists trg_versao_curricular_delete on versao_curricular;
create trigger trg_versao_curricular_delete before delete on versao_curricular
  for each row execute function bloquear_delete_versao_publicada();

-- ==========================================================
-- Duplicar versão: copia blocos, agrupamentos, itens, totais E os
-- mapeamentos do Activesoft, reapontados para os itens novos (06 §3, §5).
-- ==========================================================
create or replace function duplicar_versao(p_origem_id uuid, p_nome text, p_usuario text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nova uuid;
  v_curso uuid;
  r_bloco record;
  r_agrup record;
  r_item record;
  v_bloco_novo uuid;
  v_agrup_novo uuid;
  v_item_novo uuid;
  mapa_itens jsonb := '{}'::jsonb;
begin
  if not tem_papel('admin') then
    raise exception 'Apenas administradores duplicam versões curriculares.' using errcode = 'insufficient_privilege';
  end if;

  select curso_id into v_curso from versao_curricular where id = p_origem_id;
  if v_curso is null then
    raise exception 'Versão de origem não encontrada.';
  end if;

  insert into versao_curricular (curso_id, nome, base_legal, status, duplicada_de_id, criado_por)
  select curso_id, p_nome, base_legal, 'rascunho', id, p_usuario
  from versao_curricular where id = p_origem_id
  returning id into v_nova;

  for r_bloco in select * from versao_bloco where versao_id = p_origem_id order by ordem loop
    insert into versao_bloco (versao_id, nome, ordem) values (v_nova, r_bloco.nome, r_bloco.ordem)
    returning id into v_bloco_novo;

    for r_agrup in select * from versao_agrupamento where versao_bloco_id = r_bloco.id order by ordem loop
      insert into versao_agrupamento (versao_bloco_id, nome, ordem) values (v_bloco_novo, r_agrup.nome, r_agrup.ordem)
      returning id into v_agrup_novo;

      for r_item in select * from versao_item where versao_agrupamento_id = r_agrup.id order by ordem loop
        insert into versao_item (versao_agrupamento_id, serie_id, componente_id, nome_impresso, ordem, carga_horaria)
        values (v_agrup_novo, r_item.serie_id, r_item.componente_id, r_item.nome_impresso, r_item.ordem, r_item.carga_horaria)
        returning id into v_item_novo;
        mapa_itens := mapa_itens || jsonb_build_object(r_item.id::text, v_item_novo::text);
      end loop;
    end loop;
  end loop;

  insert into versao_total (versao_id, serie_id, total_aulas_anuais, total_horas_anuais)
  select v_nova, serie_id, total_aulas_anuais, total_horas_anuais
  from versao_total where versao_id = p_origem_id;

  -- Herança dos mapeamentos: item copiado → reaponta; item extinto → pendência com aviso.
  insert into mapeamento_activesoft (versao_id, tipo, codigo_origem, descricao_origem, versao_item_id, destino_valor, confirmado, observacao)
  select v_nova, m.tipo, m.codigo_origem, m.descricao_origem,
         case when m.versao_item_id is not null then (mapa_itens ->> m.versao_item_id::text)::uuid end,
         m.destino_valor,
         case when m.versao_item_id is not null and (mapa_itens ? m.versao_item_id::text) then m.confirmado else false end,
         case when m.versao_item_id is not null and not (mapa_itens ? m.versao_item_id::text)
              then 'Existia na versão anterior, mas o item não foi copiado.' else m.observacao end
  from mapeamento_activesoft m where m.versao_id = p_origem_id;

  return v_nova;
end $$;

-- ==========================================================
-- Publicar versão: rascunho → vigente. Encerra a vigente anterior do
-- mesmo curso (ano_fim = ano_inicio - 1) e registra a vigência de
-- (ano letivo de início, cada série do curso). Reformas escalonadas
-- ajustam vigencia_curricular à mão depois.
-- ==========================================================
create or replace function publicar_versao(p_versao_id uuid, p_ano_inicio int, p_usuario text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curso uuid;
  v_ano_letivo uuid;
begin
  if not tem_papel('admin') then
    raise exception 'Apenas administradores publicam versões curriculares.' using errcode = 'insufficient_privilege';
  end if;

  select curso_id into v_curso from versao_curricular where id = p_versao_id and status = 'rascunho';
  if v_curso is null then
    raise exception 'Só versões em rascunho podem ser publicadas.';
  end if;

  if not exists (
    select 1 from versao_item i
    join versao_agrupamento a on a.id = i.versao_agrupamento_id
    join versao_bloco b on b.id = a.versao_bloco_id
    where b.versao_id = p_versao_id
  ) then
    raise exception 'A versão não tem nenhum item — cadastre a estrutura antes de publicar.';
  end if;

  update versao_curricular
     set status = 'encerrada', ano_fim = coalesce(ano_fim, p_ano_inicio - 1)
   where curso_id = v_curso and status = 'vigente' and id <> p_versao_id;

  update versao_curricular
     set status = 'vigente', ano_inicio = p_ano_inicio, ano_fim = null,
         publicado_por = p_usuario, publicado_em = now()
   where id = p_versao_id;

  insert into ano_letivo (ano) values (p_ano_inicio) on conflict (ano) do nothing;
  select id into v_ano_letivo from ano_letivo where ano = p_ano_inicio;

  insert into vigencia_curricular (ano_letivo_id, serie_id, versao_id)
  select v_ano_letivo, s.id, p_versao_id from serie s where s.curso_id = v_curso and s.ativo
  on conflict (ano_letivo_id, serie_id) do update set versao_id = excluded.versao_id;
end $$;

revoke all on function duplicar_versao(uuid, text, text) from public;
revoke all on function publicar_versao(uuid, int, text) from public;
grant execute on function duplicar_versao(uuid, text, text) to authenticated;
grant execute on function publicar_versao(uuid, int, text) to authenticated;

-- ---------- RLS: leitura para todo usuário ativo, escrita só admin ----------
do $$
declare t text;
begin
  foreach t in array array[
    'curso', 'serie', 'componente', 'versao_curricular', 'versao_bloco', 'versao_agrupamento',
    'versao_item', 'versao_total', 'vigencia_curricular', 'sistema_avaliacao',
    'estabelecimento_externo', 'mapeamento_activesoft'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('drop policy if exists "%s_select_ativos" on %I', t, t);
    execute format('create policy "%s_select_ativos" on %I for select to authenticated using (usuario_ativo())', t, t);
    execute format('drop policy if exists "%s_insert_admin" on %I', t, t);
    execute format('create policy "%s_insert_admin" on %I for insert to authenticated with check (tem_papel(''admin''))', t, t);
    execute format('drop policy if exists "%s_update_admin" on %I', t, t);
    execute format('create policy "%s_update_admin" on %I for update to authenticated using (tem_papel(''admin'')) with check (tem_papel(''admin''))', t, t);
    execute format('drop policy if exists "%s_delete_admin" on %I', t, t);
    execute format('create policy "%s_delete_admin" on %I for delete to authenticated using (tem_papel(''admin''))', t, t);
  end loop;
end $$;

-- Escolas externas são cadastro operacional: a secretaria também escreve
-- (aparecem ao lançar anos cursados fora, RF-ALU-07). Sem delete.
drop policy if exists "estabelecimento_externo_insert_admin" on estabelecimento_externo;
create policy "estabelecimento_externo_insert_admin" on estabelecimento_externo for insert to authenticated
  with check (tem_papel('admin', 'secretaria'));
drop policy if exists "estabelecimento_externo_update_admin" on estabelecimento_externo;
create policy "estabelecimento_externo_update_admin" on estabelecimento_externo for update to authenticated
  using (tem_papel('admin', 'secretaria')) with check (tem_papel('admin', 'secretaria'));
drop policy if exists "estabelecimento_externo_delete_admin" on estabelecimento_externo;
revoke delete on estabelecimento_externo from authenticated;

-- Curso e componente nunca são apagados fisicamente (RNF-02) — só inativados.
revoke delete on curso, componente, serie from authenticated;
drop policy if exists "curso_delete_admin" on curso;
drop policy if exists "componente_delete_admin" on componente;
drop policy if exists "serie_delete_admin" on serie;
