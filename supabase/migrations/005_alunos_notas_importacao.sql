-- ==========================================================
-- 005_alunos_notas_importacao — alunos, matrículas, notas, auditoria
-- e log de importação (F3 + F4). Desenho em 02-arquitetura §3.3/§3.5.
--
-- Invariantes:
--   1. nada aqui é apagado fisicamente (RNF-02) — só inativado
--   2. nota se liga a versao_item (linha da grade), não a disciplina
--   3. valor_importado / dados_importados guardam o que veio da origem,
--      para a reimportação distinguir "origem mudou" de "editado à mão"
--   4. toda edição manual de nota passa por editar_nota(), que grava a
--      auditoria na mesma transação
-- ==========================================================

do $$ begin create type situacao_aluno as enum ('ativo', 'transferido', 'concluinte', 'evadido', 'inativo'); exception when duplicate_object then null; end $$;
do $$ begin create type origem_registro as enum ('activesoft', 'manual', 'importacao_arquivo'); exception when duplicate_object then null; end $$;
do $$ begin create type situacao_matricula as enum ('em_curso', 'aprovado', 'aprovado_conselho', 'reprovado', 'transferido', 'evadido'); exception when duplicate_object then null; end $$;
do $$ begin create type situacao_nota as enum ('aprovado', 'reprovado', 'dispensado', 'cursando', 'sem_registro'); exception when duplicate_object then null; end $$;
do $$ begin create type acao_auditoria as enum ('criar', 'editar', 'excluir', 'emitir', 'cancelar', 'importar', 'resolver'); exception when duplicate_object then null; end $$;
do $$ begin create type origem_importacao as enum ('activesoft_api', 'arquivo_csv', 'arquivo_xlsx', 'mock'); exception when duplicate_object then null; end $$;
do $$ begin create type tipo_importacao as enum ('alunos', 'matriculas', 'notas', 'completo'); exception when duplicate_object then null; end $$;
do $$ begin create type modo_importacao as enum ('simulacao', 'efetiva'); exception when duplicate_object then null; end $$;
do $$ begin create type status_importacao as enum ('pendente', 'executando', 'concluida', 'erro', 'cancelada'); exception when duplicate_object then null; end $$;
do $$ begin create type resolucao_divergencia as enum ('pendente', 'manter_local', 'aceitar_origem', 'ignorada'); exception when duplicate_object then null; end $$;

-- ---------- Aluno ----------
create table if not exists aluno (
  id                    uuid primary key default gen_random_uuid(),
  codigo_activesoft     text unique,
  ra                    text,
  nome                  text not null,
  nome_social           text,
  data_nascimento       date,
  municipio_nascimento  text,
  uf_nascimento         text,
  pais_nascimento       text default 'Brasil',
  nacionalidade         text default 'Brasileira',
  sexo                  text check (sexo is null or sexo in ('M', 'F', 'outro')),
  cin                   text,
  rg                    text,
  rg_orgao              text,
  rg_uf                 text,
  rg_data               date,
  cpf                   text,
  certidao_tipo         text,
  certidao_termo        text,
  certidao_livro        text,
  certidao_folha        text,
  filiacao_1            text,
  filiacao_2            text,
  situacao              situacao_aluno not null default 'ativo',
  origem                origem_registro not null default 'manual',
  dados_importados      jsonb,            -- último AlunoOrigem recebido
  editado               boolean not null default false,
  editado_por           text,
  editado_em            timestamptz,
  sincronizado_em       timestamptz,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);
create index if not exists idx_aluno_nome on aluno (lower(nome));
create index if not exists idx_aluno_ra on aluno (ra);

-- ---------- Matrícula ----------
create table if not exists matricula (
  id                        uuid primary key default gen_random_uuid(),
  aluno_id                  uuid not null references aluno (id),
  ano_letivo_id             uuid not null references ano_letivo (id),
  serie_id                  uuid not null references serie (id),
  curso_id                  uuid not null references curso (id),
  versao_curricular_id      uuid references versao_curricular (id),  -- congelada na criação; null = sem currículo (RF-VER-11)
  turma                     text,
  numero_matricula          text,
  data_matricula            date,
  data_saida                date,
  estabelecimento_externo_id uuid references estabelecimento_externo (id),  -- null = cursado no São Marcos
  situacao_final            situacao_matricula not null default 'em_curso',
  carga_horaria_total       int,
  observacao                text,
  codigo_activesoft         text unique,
  origem                    origem_registro not null default 'manual',
  dados_importados          jsonb,
  editado                   boolean not null default false,
  sincronizado_em           timestamptz,
  criado_em                 timestamptz not null default now(),
  atualizado_em             timestamptz not null default now(),
  unique (aluno_id, ano_letivo_id, serie_id)
);
create index if not exists idx_matricula_aluno on matricula (aluno_id);
create index if not exists idx_matricula_ano on matricula (ano_letivo_id, serie_id, turma);

-- Resolve a versão vigente para (ano letivo, série) — usada ao criar matrícula.
create or replace function resolver_versao(p_ano_letivo_id uuid, p_serie_id uuid)
returns uuid language sql stable as $$
  select versao_id from vigencia_curricular where ano_letivo_id = p_ano_letivo_id and serie_id = p_serie_id;
$$;

create or replace function matricula_congelar_versao()
returns trigger language plpgsql as $$
begin
  if new.versao_curricular_id is null then
    new.versao_curricular_id := resolver_versao(new.ano_letivo_id, new.serie_id);
  end if;
  if new.curso_id is null then
    select curso_id into new.curso_id from serie where id = new.serie_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_matricula_versao on matricula;
create trigger trg_matricula_versao before insert on matricula
  for each row execute function matricula_congelar_versao();

-- ---------- Nota: uma por (matrícula, linha da grade) ----------
create table if not exists nota (
  id               uuid primary key default gen_random_uuid(),
  matricula_id     uuid not null references matricula (id),
  versao_item_id   uuid not null references versao_item (id),
  valor            numeric(5,2) check (valor is null or valor >= 0),
  conceito         text,
  carga_horaria    int,
  faltas           int check (faltas is null or faltas >= 0),
  situacao         situacao_nota not null default 'sem_registro',
  origem           origem_registro not null default 'manual',
  editado          boolean not null default false,
  valor_importado  jsonb,          -- {valor, conceito, faltas, situacao, carga_horaria} como veio da origem
  editado_por      text,
  editado_em       timestamptz,
  sincronizado_em  timestamptz,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  unique (matricula_id, versao_item_id)
);
create index if not exists idx_nota_matricula on nota (matricula_id);

-- ---------- Auditoria ----------
create table if not exists auditoria (
  id              uuid primary key default gen_random_uuid(),
  entidade        text not null,          -- 'aluno' | 'matricula' | 'nota' | 'historico' | 'importacao'
  entidade_id     uuid,
  aluno_id        uuid references aluno (id),   -- atalho para "histórico de alterações do aluno"
  acao            acao_auditoria not null,
  campo           text,
  valor_anterior  jsonb,
  valor_novo      jsonb,
  motivo          text,
  usuario_email   text,
  criado_em       timestamptz not null default now()
);
create index if not exists idx_auditoria_aluno on auditoria (aluno_id, criado_em desc);
create index if not exists idx_auditoria_entidade on auditoria (entidade, entidade_id);

-- ---------- Importação ----------
create table if not exists importacao (
  id                    uuid primary key default gen_random_uuid(),
  origem                origem_importacao not null,
  tipo                  tipo_importacao not null,
  parametros            jsonb not null default '{}'::jsonb,
  modo                  modo_importacao not null,
  status                status_importacao not null default 'pendente',
  lidos                 int not null default 0,
  criados               int not null default 0,
  atualizados           int not null default 0,
  ignorados             int not null default 0,
  com_divergencia       int not null default 0,
  pendentes_mapeamento  int not null default 0,
  erros                 int not null default 0,
  erro                  text,
  relatorio             jsonb,       -- detalhes por registro (amostras, pendências, erros)
  iniciado_por          text,
  iniciado_em           timestamptz not null default now(),
  concluido_em          timestamptz
);
create index if not exists idx_importacao_iniciado on importacao (iniciado_em desc);

create table if not exists importacao_divergencia (
  id             uuid primary key default gen_random_uuid(),
  importacao_id  uuid not null references importacao (id) on delete cascade,
  entidade       text not null,          -- 'aluno' | 'matricula' | 'nota'
  entidade_id    uuid not null,
  aluno_id       uuid references aluno (id),
  descricao      text,                   -- "Ana Souza · 8º ano · Matemática · nota final"
  campo          text not null,
  valor_local    jsonb,
  valor_origem   jsonb,
  contexto       jsonb,                  -- quem editou, quando, motivo; valor anterior na origem
  resolucao      resolucao_divergencia not null default 'pendente',
  resolvido_por  text,
  resolvido_em   timestamptz
);
create index if not exists idx_divergencia_pendente on importacao_divergencia (resolucao) where resolucao = 'pendente';

-- Mapeamento: série/turma/situação não dependem de versão → versao_id passa a ser opcional.
alter table mapeamento_activesoft alter column versao_id drop not null;
alter table mapeamento_activesoft add column if not exists sugestao_item_id uuid references versao_item (id);
alter table mapeamento_activesoft add column if not exists registros_afetados int not null default 0;
alter table mapeamento_activesoft add column if not exists atualizado_em timestamptz not null default now();
create unique index if not exists uq_mapeamento_global on mapeamento_activesoft (tipo, codigo_origem) where versao_id is null;

-- ---------- atualizado_em ----------
do $$
declare t text;
begin
  foreach t in array array['aluno', 'matricula', 'nota', 'mapeamento_activesoft'] loop
    execute format('drop trigger if exists trg_%s_atualizado on %I', t, t);
    execute format('create trigger trg_%s_atualizado before update on %I for each row execute function marcar_atualizado_em()', t, t);
  end loop;
end $$;

-- ==========================================================
-- editar_nota(): única porta de edição manual (RF-ALU-05). Grava a
-- nota e a auditoria (autor, data, valor anterior, motivo) juntas.
-- ==========================================================
create or replace function editar_nota(
  p_matricula_id uuid, p_versao_item_id uuid,
  p_valor numeric, p_conceito text, p_faltas int, p_situacao situacao_nota,
  p_motivo text, p_usuario text
) returns nota
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ant nota;
  v_nova nota;
  v_aluno uuid;
begin
  if not tem_papel('admin', 'secretaria') then
    raise exception 'Seu perfil não edita notas.' using errcode = 'insufficient_privilege';
  end if;
  if p_motivo is null or length(trim(p_motivo)) < 5 then
    raise exception 'Informe o motivo da alteração (ao menos 5 caracteres).' using errcode = 'check_violation';
  end if;

  select aluno_id into v_aluno from matricula where id = p_matricula_id;
  if v_aluno is null then raise exception 'Matrícula não encontrada.'; end if;

  select * into v_ant from nota where matricula_id = p_matricula_id and versao_item_id = p_versao_item_id;

  insert into nota (matricula_id, versao_item_id, valor, conceito, faltas, situacao, origem, editado, editado_por, editado_em, carga_horaria, valor_importado, sincronizado_em)
  values (p_matricula_id, p_versao_item_id, p_valor, p_conceito, p_faltas, p_situacao, 'manual', true, p_usuario, now(), v_ant.carga_horaria, v_ant.valor_importado, v_ant.sincronizado_em)
  on conflict (matricula_id, versao_item_id) do update
     set valor = excluded.valor, conceito = excluded.conceito, faltas = excluded.faltas, situacao = excluded.situacao,
         editado = true, editado_por = excluded.editado_por, editado_em = excluded.editado_em
  returning * into v_nova;

  insert into auditoria (entidade, entidade_id, aluno_id, acao, campo, valor_anterior, valor_novo, motivo, usuario_email)
  values ('nota', v_nova.id, v_aluno, (case when v_ant.id is null then 'criar' else 'editar' end)::acao_auditoria, 'nota',
          case when v_ant.id is null then null else jsonb_build_object('valor', v_ant.valor, 'conceito', v_ant.conceito, 'faltas', v_ant.faltas, 'situacao', v_ant.situacao) end,
          jsonb_build_object('valor', v_nova.valor, 'conceito', v_nova.conceito, 'faltas', v_nova.faltas, 'situacao', v_nova.situacao),
          trim(p_motivo), p_usuario);
  return v_nova;
end $$;

revoke all on function editar_nota(uuid, uuid, numeric, text, int, situacao_nota, text, text) from public;
grant execute on function editar_nota(uuid, uuid, numeric, text, int, situacao_nota, text, text) to authenticated;

-- ==========================================================
-- resolver_divergencia(): manter local | aceitar origem | ignorar.
-- "aceitar origem" grava o valor da origem e marca a nota como não
-- editada; tudo auditado.
-- ==========================================================
create or replace function resolver_divergencia(p_id uuid, p_resolucao resolucao_divergencia, p_usuario text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d importacao_divergencia;
  v jsonb;
begin
  if not tem_papel('admin', 'secretaria') then
    raise exception 'Seu perfil não resolve divergências.' using errcode = 'insufficient_privilege';
  end if;
  select * into d from importacao_divergencia where id = p_id and resolucao = 'pendente';
  if d.id is null then raise exception 'Divergência não encontrada ou já resolvida.'; end if;

  if p_resolucao = 'aceitar_origem' then
    v := d.valor_origem;
    if d.entidade = 'nota' then
      update nota set
        valor = case when d.campo in ('valor', 'nota') then (v ->> 'valor')::numeric else valor end,
        conceito = case when d.campo in ('valor', 'nota') then v ->> 'conceito' else conceito end,
        faltas = case when d.campo = 'faltas' then (v ->> 'faltas')::int else faltas end,
        situacao = case when d.campo = 'situacao' then (v ->> 'situacao')::situacao_nota else situacao end,
        carga_horaria = case when d.campo = 'carga_horaria' then (v ->> 'carga_horaria')::int else carga_horaria end,
        editado = false, editado_por = null, editado_em = null,
        valor_importado = coalesce(valor_importado, '{}'::jsonb) || v
      where id = d.entidade_id;
    elsif d.entidade = 'aluno' then
      execute format('update aluno set %I = $1, editado = false, dados_importados = coalesce(dados_importados, ''{}''::jsonb) || $2 where id = $3', d.campo)
        using v ->> d.campo, v, d.entidade_id;
    elsif d.entidade = 'matricula' then
      execute format('update matricula set %I = $1, editado = false, dados_importados = coalesce(dados_importados, ''{}''::jsonb) || $2 where id = $3', d.campo)
        using v ->> d.campo, v, d.entidade_id;
    end if;
  elsif p_resolucao = 'manter_local' then
    -- registra que a origem tem esse valor, para a próxima importação não reabrir a mesma divergência
    if d.entidade = 'nota' then
      update nota set valor_importado = coalesce(valor_importado, '{}'::jsonb) || d.valor_origem where id = d.entidade_id;
    elsif d.entidade = 'aluno' then
      update aluno set dados_importados = coalesce(dados_importados, '{}'::jsonb) || d.valor_origem where id = d.entidade_id;
    elsif d.entidade = 'matricula' then
      update matricula set dados_importados = coalesce(dados_importados, '{}'::jsonb) || d.valor_origem where id = d.entidade_id;
    end if;
  end if;

  update importacao_divergencia set resolucao = p_resolucao, resolvido_por = p_usuario, resolvido_em = now() where id = p_id;
  insert into auditoria (entidade, entidade_id, aluno_id, acao, campo, valor_anterior, valor_novo, motivo, usuario_email)
  values (d.entidade, d.entidade_id, d.aluno_id, 'resolver', d.campo, d.valor_local, d.valor_origem, 'Divergência de importação: ' || p_resolucao::text, p_usuario);
end $$;

revoke all on function resolver_divergencia(uuid, resolucao_divergencia, text) from public;
grant execute on function resolver_divergencia(uuid, resolucao_divergencia, text) to authenticated;

-- ---------- RLS ----------
-- aluno / matricula / nota: leitura para todo papel; escrita admin+secretaria; sem delete
do $$
declare t text;
begin
  foreach t in array array['aluno', 'matricula', 'nota'] loop
    execute format('alter table %I enable row level security', t);
    execute format('grant select, insert, update on %I to authenticated', t);
    execute format('drop policy if exists "%s_select_ativos" on %I', t, t);
    execute format('create policy "%s_select_ativos" on %I for select to authenticated using (usuario_ativo())', t, t);
    execute format('drop policy if exists "%s_insert_sec" on %I', t, t);
    execute format('create policy "%s_insert_sec" on %I for insert to authenticated with check (tem_papel(''admin'', ''secretaria''))', t, t);
    execute format('drop policy if exists "%s_update_sec" on %I', t, t);
    execute format('create policy "%s_update_sec" on %I for update to authenticated using (tem_papel(''admin'', ''secretaria'')) with check (tem_papel(''admin'', ''secretaria''))', t, t);
  end loop;
end $$;

-- auditoria: leitura admin+secretaria+coordenacao; escrita só pelas funções (security definer) e service_role
alter table auditoria enable row level security;
grant select on auditoria to authenticated;
drop policy if exists "auditoria_select" on auditoria;
create policy "auditoria_select" on auditoria for select to authenticated using (tem_papel('admin', 'secretaria', 'coordenacao'));

-- importacao / divergência: leitura admin+secretaria; escrita via service_role (servidor) e funções
alter table importacao enable row level security;
alter table importacao_divergencia enable row level security;
grant select on importacao, importacao_divergencia to authenticated;
drop policy if exists "importacao_select" on importacao;
create policy "importacao_select" on importacao for select to authenticated using (tem_papel('admin', 'secretaria'));
drop policy if exists "divergencia_select" on importacao_divergencia;
create policy "divergencia_select" on importacao_divergencia for select to authenticated using (tem_papel('admin', 'secretaria'));

-- mapeamento: secretaria também confirma mapeamentos (é operação de importação, não de currículo)
drop policy if exists "mapeamento_activesoft_insert_admin" on mapeamento_activesoft;
create policy "mapeamento_activesoft_insert_admin" on mapeamento_activesoft for insert to authenticated with check (tem_papel('admin', 'secretaria'));
drop policy if exists "mapeamento_activesoft_update_admin" on mapeamento_activesoft;
create policy "mapeamento_activesoft_update_admin" on mapeamento_activesoft for update to authenticated using (tem_papel('admin', 'secretaria')) with check (tem_papel('admin', 'secretaria'));
