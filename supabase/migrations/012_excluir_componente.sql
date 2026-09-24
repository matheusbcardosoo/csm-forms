-- ==========================================================
-- 012_excluir_componente — exclusão de componente numa transação só.
--
-- Dois defeitos deram as caras juntos.
--
-- 1. A rota fazia TRÊS escritas em sequência, sem transação: soltava os
--    mapeamentos, apagava as linhas de grade em rascunho e só então
--    apagava o componente. Falhando a última, as duas primeiras já
--    tinham acontecido — o componente ficava vivo, sem linhas e sem
--    códigos apontando para ele. É o pior desfecho possível: nem
--    excluiu, nem manteve.
--
-- 2. `componente` é a única tabela da lista da 004 sem política de
--    DELETE em produção. O loop da 004 declara uma para cada tabela,
--    então o banco recebeu uma versão anterior daquele arquivo.
--
-- A correção do 1 resolve o 2 de graça, e melhor do que criar a política
-- faltante resolveria: `security definer` com `tem_papel('admin')` dentro
-- obriga toda exclusão a passar pelas checagens daqui. Uma política de
-- DELETE aberta deixaria o mesmo admin apagar o componente direto pelo
-- PostgREST, pulando a checagem de currículo publicado e de nota
-- gravada. A ausência da política, aqui, é o que fecha essa porta.
-- ==========================================================

create or replace function excluir_componente(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nome       text;
  v_publicadas int;
  v_notas      int;
  v_linhas     int;
  v_maps       int;
begin
  if not tem_papel('admin') then
    raise exception 'Apenas administradores excluem componentes.' using errcode = 'insufficient_privilege';
  end if;

  select nome_canonico into v_nome from componente where id = p_id;
  if v_nome is null then
    raise exception 'Componente não encontrado.' using errcode = 'no_data_found';
  end if;

  -- Currículo em uso é identidade de coluna de histórico já emitido.
  select count(*) into v_publicadas
  from versao_item vi
  join versao_agrupamento ag on ag.id = vi.versao_agrupamento_id
  join versao_bloco vb on vb.id = ag.versao_bloco_id
  join versao_curricular v on v.id = vb.versao_id
  where vi.componente_id = p_id and v.status <> 'rascunho';

  if v_publicadas > 0 then
    raise exception 'Está em % linha(s) de currículo já publicado — apagá-lo reescreveria documento antigo. Remova a linha do currículo (duplicando a versão) antes.', v_publicadas
      using errcode = 'P0001';
  end if;

  -- Nota gravada some junto com a linha; isso não pode passar calado.
  select count(*) into v_notas
  from nota n join versao_item vi on vi.id = n.versao_item_id
  where vi.componente_id = p_id;

  if v_notas > 0 then
    raise exception 'Há % nota(s) gravada(s) nas linhas que seriam removidas. Apague ou remaneje essas notas antes.', v_notas
      using errcode = 'P0001';
  end if;

  update mapeamento_activesoft
     set componente_id = null, confirmado = false,
         observacao = format('O componente "%s", que era o destino deste código, foi excluído. Escolha outro.', v_nome)
   where componente_id = p_id;
  get diagnostics v_maps = row_count;

  delete from versao_item where componente_id = p_id;
  get diagnostics v_linhas = row_count;

  delete from componente where id = p_id;

  return jsonb_build_object('removido', true, 'nome', v_nome, 'linhas', v_linhas, 'mapeamentos', v_maps);
end $$;

revoke execute on function excluir_componente(uuid) from public, anon;
grant execute on function excluir_componente(uuid) to authenticated;
