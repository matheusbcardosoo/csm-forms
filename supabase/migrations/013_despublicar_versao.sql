-- ==========================================================
-- 013_despublicar_versao — devolver uma versão curricular ao rascunho
-- enquanto ela ainda não serviu documento nenhum.
--
-- Por que isto precisa existir. A montagem de um currículo não acaba na
-- publicação: a primeira importação de verdade é que revela o que ficou
-- faltando. No Ensino Médio foi a 3ª série sem Física, Filosofia,
-- Sociologia e Educação Física — 17 alunos com nota que não tinha onde
-- cair, e a pendência voltando a cada execução.
--
-- Os dois caminhos que existiam não serviam:
--
--   * editar a versão publicada — o trigger recusa, e com razão;
--   * duplicar e publicar a cópia — `matricula.versao_curricular_id` é
--     congelado na inserção, então as matrículas já importadas
--     continuariam apontando para a versão antiga. Consertar exigiria
--     repontar matrícula, que é mexer em dado de aluno para resolver um
--     problema de cadastro.
--
-- A TRAVA é o que torna isto seguro: só volta ao rascunho a versão que
-- nunca serviu um histórico emitido ou cancelado. A regra de
-- somente-leitura existe para que um documento impresso jamais seja
-- reescrito; onde não há documento, não há o que proteger. Havendo um só,
-- a função recusa e o caminho volta a ser duplicar.
--
-- A vigência NÃO é mexida de propósito. Apagá-la faria `resolver_versao`
-- devolver nulo e as matrículas novas entrarem sem grade — trocaria um
-- problema por outro pior. A versão continua sendo a que vale para o
-- período; só volta a ser editável.
-- ==========================================================

create or replace function despublicar_versao(p_versao_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nome      text;
  v_status    text;
  v_emitidos  int;
  v_rascunhos int;
  v_matriculas int;
begin
  if not tem_papel('admin') then
    raise exception 'Apenas administradores despublicam versões curriculares.' using errcode = 'insufficient_privilege';
  end if;

  select nome, status::text into v_nome, v_status from versao_curricular where id = p_versao_id;
  if v_nome is null then
    raise exception 'Versão curricular não encontrada.' using errcode = 'no_data_found';
  end if;
  if v_status = 'rascunho' then
    raise exception '"%" já está em rascunho.', v_nome using errcode = 'P0001';
  end if;

  -- Documento emitido (ou cancelado, que também foi impresso um dia)
  -- congela a grade que o gerou. Aqui a porta fecha.
  select count(*) into v_emitidos
  from historico h
  where h.status in ('emitido', 'cancelado')
    and exists (
      select 1 from matricula m
      where m.id = any (h.matricula_ids) and m.versao_curricular_id = p_versao_id
    );

  if v_emitidos > 0 then
    raise exception '"%" já serviu % histórico(s) emitido(s) — a grade de um documento impresso não se altera. Duplique a versão e corrija na cópia.', v_nome, v_emitidos
      using errcode = 'P0001';
  end if;

  -- Rascunho de histórico não trava, mas quem confirma merece saber que
  -- existe: o snapshot dele é remontado na emissão, com a grade nova.
  select count(*) into v_rascunhos
  from historico h
  where h.status in ('rascunho', 'conferido')
    and exists (
      select 1 from matricula m
      where m.id = any (h.matricula_ids) and m.versao_curricular_id = p_versao_id
    );

  select count(*) into v_matriculas from matricula where versao_curricular_id = p_versao_id;

  update versao_curricular
     set status = 'rascunho', publicado_por = null, publicado_em = null
   where id = p_versao_id;

  return jsonb_build_object(
    'despublicada', true, 'nome', v_nome, 'status_anterior', v_status,
    'matriculas', v_matriculas, 'historicos_em_andamento', v_rascunhos
  );
end $$;

revoke execute on function despublicar_versao(uuid) from public, anon;
grant execute on function despublicar_versao(uuid) to authenticated;
