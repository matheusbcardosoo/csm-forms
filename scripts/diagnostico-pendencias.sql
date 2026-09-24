-- ==========================================================
-- Por que cada código está pendente?
--
-- "Pendente" na tela de Mapeamentos hoje mistura dois problemas muito
-- diferentes, e só um deles se resolve mapeando:
--
--   A. SEM DESTINO         — ninguém disse ainda para onde o código vai.
--                            Resolve-se em Mapeamentos.
--   B. GRADE INCOMPLETA    — o código já tem destino, mas o componente
--                            não está na grade daquele currículo. Mapear
--                            não adianta: falta a disciplina no currículo.
--   B2. FALTA NUMA SÉRIE   — o componente está no currículo, mas não na
--                            série daqueles alunos. A importação resolve
--                            pela linha da SÉRIE, então eles ficam de
--                            fora e a pendência volta a cada execução.
--   C. LINHA SEM IDENTIDADE— a grade tem a disciplina pelo nome, mas a
--                            linha foi criada sem componente, então o
--                            destino global não alcança.
--
-- Só leitura. Rode no SQL Editor do Supabase.
-- ==========================================================

\echo '== 1. Pendências de disciplina, por causa =='
with pend as (
  select m.id, m.codigo_origem, m.descricao_origem, m.versao_id, m.registros_afetados,
         v.nome as curriculo, c.nome as curso
  from mapeamento_activesoft m
  join versao_curricular v on v.id = m.versao_id
  join curso c on c.id = v.curso_id
  where m.tipo = 'disciplina' and not m.confirmado
),
global as (
  select g.codigo_origem, g.componente_id, co.nome_canonico
  from mapeamento_activesoft g
  join componente co on co.id = g.componente_id
  where g.tipo = 'disciplina' and g.versao_id is null and g.confirmado
),
grade as (   -- linhas da grade de cada versão
  select vb.versao_id, vi.serie_id, vi.componente_id, vi.nome_impresso
  from versao_item vi
  join versao_agrupamento ag on ag.id = vi.versao_agrupamento_id
  join versao_bloco vb on vb.id = ag.versao_bloco_id
)
select p.curso, p.curriculo, p.codigo_origem, coalesce(p.descricao_origem, '—') as descricao,
       p.registros_afetados as registros,
       coalesce(g.nome_canonico, '(sem destino)') as destino_global,
       case
         when g.codigo_origem is null then 'A · sem destino — resolve em Mapeamentos'
         when not exists (select 1 from grade x where x.versao_id = p.versao_id and x.componente_id = g.componente_id)
              then 'B · a grade deste currículo não tem esse componente em série nenhuma'
         when exists (
           -- série coberta pela versão que NÃO tem linha desse componente:
           -- os alunos dela ficam sem destino, e a pendência é verdadeira
           select 1 from (select distinct versao_id, serie_id from grade) sv
           where sv.versao_id = p.versao_id
             and not exists (select 1 from grade x
                             where x.versao_id = sv.versao_id and x.serie_id = sv.serie_id
                               and x.componente_id = g.componente_id)
         ) then 'B2 · falta em alguma série — os alunos dessa série ficam de fora'
         when exists (select 1 from grade x where x.versao_id = p.versao_id and x.componente_id is null
                        and lower(x.nome_impresso) = lower(g.nome_canonico))
              then 'C · a grade tem a disciplina, mas a linha está sem componente'
         else '? · destino em todas as séries — não deveria estar pendente'
       end as causa
from pend p
left join global g on g.codigo_origem = p.codigo_origem
order by causa, p.curso, p.codigo_origem;

\echo ''
\echo '== 2. Linhas da grade sem componente (causa C) =='
select c.nome as curso, v.nome as curriculo, v.status,
       count(*) filter (where vi.componente_id is null) as linhas_sem_componente,
       count(*) as linhas_no_total
from versao_item vi
join versao_agrupamento ag on ag.id = vi.versao_agrupamento_id
join versao_bloco vb on vb.id = ag.versao_bloco_id
join versao_curricular v on v.id = vb.versao_id
join curso c on c.id = v.curso_id
group by c.nome, v.nome, v.status
having count(*) filter (where vi.componente_id is null) > 0
order by 1, 2;

\echo ''
\echo '== 3. Componentes com nome parecido (destino duplicado por engano) =='
select a.nome_canonico, b.nome_canonico as parecido_com
from componente a join componente b
  on a.id < b.id
 and (lower(b.nome_canonico) like '%' || lower(a.nome_canonico) || '%'
   or lower(a.nome_canonico) like '%' || lower(b.nome_canonico) || '%')
order by 1;

\echo ''
\echo '== 4. O que a origem manda e a grade não tem (o buraco real) =='
select m.codigo_origem, coalesce(m.descricao_origem, '—') as descricao_na_origem,
       m.registros_afetados as registros_parados
from mapeamento_activesoft m
where m.tipo = 'disciplina' and not m.confirmado
  and not exists (
    select 1 from mapeamento_activesoft g
    where g.tipo = 'disciplina' and g.versao_id is null and g.confirmado
      and g.codigo_origem = m.codigo_origem
  )
order by m.registros_afetados desc nulls last;
