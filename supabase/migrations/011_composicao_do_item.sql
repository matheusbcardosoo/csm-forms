-- ==========================================================
-- 011_composicao_do_item — quais disciplinas da origem compõem
-- cada linha da grade, e em quais séries.
--
-- O problema: no Activesoft uma linha do histórico costuma ser várias
-- disciplinas. "Língua Portuguesa" é Literatura + Gramática + Redação +
-- Interpretação Textual; "Língua Estrangeira Moderna - Inglês" é uma
-- fila de Language Practice A1…C1. E a correspondência muda por série:
-- eletivas que só existem no 9º ano, turmas multisseriadas do bilíngue
-- em que o mesmo nível atende 7º, 8º e 9º.
--
-- Até aqui isso morava só em `mapeamento_activesoft`, que é global e não
-- tem noção de série: ou o código apontava para o componente em todas as
-- séries, ou em nenhuma. O resultado era nota de eletiva caindo em série
-- que não a oferece, e nível de inglês entrando na média do aluno errado.
--
-- A composição fica por VERSÃO, não global: `versao_item` já é
-- (versão, série, componente), então é o lugar exato. Uma reforma que
-- muda quais disciplinas compõem Inglês não mexe no que a versão
-- anterior entende.
--
-- NÃO entra no bloqueio de "versão em uso é somente leitura". O trigger
-- protege o que o documento IMPRIME — nome, ordem, carga horária —, e a
-- composição não imprime nada: ela diz como a origem alimenta a linha.
-- Mudá-la não altera nenhum histórico já emitido, porque as notas
-- daqueles documentos já estão gravadas. Travá-la obrigaria a duplicar
-- um currículo inteiro para corrigir um código de disciplina.
-- ==========================================================

create table if not exists versao_item_disciplina (
  id                uuid primary key default gen_random_uuid(),
  versao_item_id    uuid not null references versao_item (id) on delete cascade,
  codigo_origem     text not null,
  descricao_origem  text,
  -- desligada nesta série: continua documentada (a secretaria vê que o
  -- código existe e foi recusado de propósito), mas a nota não entra
  habilitado        boolean not null default true,
  ordem             int not null default 0,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  unique (versao_item_id, codigo_origem)
);

create index if not exists idx_versao_item_disciplina_item on versao_item_disciplina (versao_item_id);
create index if not exists idx_versao_item_disciplina_codigo on versao_item_disciplina (codigo_origem);

drop trigger if exists trg_versao_item_disciplina_atualizado on versao_item_disciplina;
create trigger trg_versao_item_disciplina_atualizado before update on versao_item_disciplina
  for each row execute function marcar_atualizado_em();

-- ---------- RLS: mesmo padrão das demais tabelas de currículo ----------
alter table versao_item_disciplina enable row level security;
grant select, insert, update, delete on versao_item_disciplina to authenticated;

drop policy if exists "versao_item_disciplina_select_ativos" on versao_item_disciplina;
create policy "versao_item_disciplina_select_ativos" on versao_item_disciplina
  for select to authenticated using (usuario_ativo());
drop policy if exists "versao_item_disciplina_insert_admin" on versao_item_disciplina;
create policy "versao_item_disciplina_insert_admin" on versao_item_disciplina
  for insert to authenticated with check (tem_papel('admin'));
drop policy if exists "versao_item_disciplina_update_admin" on versao_item_disciplina;
create policy "versao_item_disciplina_update_admin" on versao_item_disciplina
  for update to authenticated using (tem_papel('admin')) with check (tem_papel('admin'));
drop policy if exists "versao_item_disciplina_delete_admin" on versao_item_disciplina;
create policy "versao_item_disciplina_delete_admin" on versao_item_disciplina
  for delete to authenticated using (tem_papel('admin'));

-- ---------- Duplicar versão leva a composição junto ----------
-- Sem isto, duplicar um currículo perderia silenciosamente a
-- configuração de eletivas e multisseriadas, e a primeira importação na
-- versão nova mandaria tudo para o lugar errado.
create or replace function duplicar_composicao(p_origem_id uuid, p_destino_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_copiadas int;
begin
  if not tem_papel('admin') then
    raise exception 'Apenas administradores duplicam currículos.' using errcode = 'insufficient_privilege';
  end if;

  -- casa item de origem com item de destino pela identidade
  -- (agrupamento equivalente, série, componente); quando o componente é
  -- nulo, pelo nome impresso, que é o que a duplicação preserva
  with origem as (
    select vi.id, vi.serie_id, vi.componente_id, vi.nome_impresso
    from versao_item vi
    join versao_agrupamento ag on ag.id = vi.versao_agrupamento_id
    join versao_bloco vb on vb.id = ag.versao_bloco_id
    where vb.versao_id = p_origem_id
  ), destino as (
    select vi.id, vi.serie_id, vi.componente_id, vi.nome_impresso
    from versao_item vi
    join versao_agrupamento ag on ag.id = vi.versao_agrupamento_id
    join versao_bloco vb on vb.id = ag.versao_bloco_id
    where vb.versao_id = p_destino_id
  )
  insert into versao_item_disciplina (versao_item_id, codigo_origem, descricao_origem, habilitado, ordem)
  select d.id, x.codigo_origem, x.descricao_origem, x.habilitado, x.ordem
  from versao_item_disciplina x
  join origem o on o.id = x.versao_item_id
  join destino d on d.serie_id = o.serie_id
                and (
                  (o.componente_id is not null and d.componente_id = o.componente_id)
                  or (o.componente_id is null and d.componente_id is null and d.nome_impresso = o.nome_impresso)
                )
  on conflict (versao_item_id, codigo_origem) do nothing;

  get diagnostics v_copiadas = row_count;
  return v_copiadas;
end $$;

revoke execute on function duplicar_composicao(uuid, uuid) from public, anon;
grant execute on function duplicar_composicao(uuid, uuid) to authenticated;
