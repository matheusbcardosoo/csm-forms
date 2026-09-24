-- ==========================================================
-- 010_mapeamento_por_componente — mapeamento de disciplina que
-- atravessa curso e versão curricular.
--
-- O problema: `mapeamento_activesoft` de disciplina aponta para
-- `versao_item`, que é (agrupamento, série, componente) dentro de UMA
-- versão, e versão pertence a UM curso. Então o mesmo código da origem
-- — "117 Language Practice - A1" — precisa ser mapeado à mão outra vez
-- em cada curso, e outra vez em cada versão que não tenha sido
-- duplicada da anterior (a `duplicar_versao()` já herda; entre cursos
-- não há o que herdar).
--
-- A saída já estava no modelo, sem uso: `componente` é a identidade
-- estável, global, sem curso e sem versão. O mapeamento passa a poder
-- apontar para ele. A importação resolve componente → linha da grade
-- pela versão e pela série da matrícula, que é o que ela já fazia para
-- atravessar séries dentro da mesma versão.
--
-- Precedência na importação (a mais específica vence):
--   1. mapeamento da versão, com versao_item_id  — exceção de um curso
--   2. mapeamento global, com componente_id      — o caso normal
--   3. casamento automático por nome idêntico
--   4. pendência
-- ==========================================================

alter table mapeamento_activesoft
  add column if not exists componente_id uuid references componente (id);

create index if not exists idx_mapeamento_componente
  on mapeamento_activesoft (componente_id) where componente_id is not null;

-- Disciplina sem versão é o mapeamento global: o destino dele é o
-- componente, nunca um `versao_item_id` — o item pertence a uma versão
-- só, e apontar para ele de um mapeamento global seria contradição. O
-- componente pode estar vazio enquanto o código está pendente.
alter table mapeamento_activesoft drop constraint if exists ck_mapeamento_disciplina_global;
alter table mapeamento_activesoft add constraint ck_mapeamento_disciplina_global check (
  tipo <> 'disciplina'
  or versao_id is not null
  or versao_item_id is null
);

comment on column mapeamento_activesoft.componente_id is
  'Destino global de disciplina: vale para todo curso e toda versão. A importação resolve a linha da grade pela versão e série da matrícula. Com versao_id preenchido, o versao_item_id continua valendo como exceção daquela versão.';

-- ==========================================================
-- Aproveita o que já foi mapeado à mão.
--
-- Um código cujos mapeamentos confirmados hoje apontam TODOS para o
-- mesmo componente não tem ambiguidade nenhuma: vira global e passa a
-- valer nos outros cursos também. Código que aponta para componentes
-- diferentes conforme a versão fica como está — ali a divergência é
-- deliberada, e adivinhar qual vence seria trocar nota de aluno.
--
-- Itens sem componente_id ('componente novo, sem antecessor') não
-- entram: não há identidade estável para promover.
-- ==========================================================
insert into mapeamento_activesoft (versao_id, tipo, codigo_origem, descricao_origem, componente_id, confirmado, observacao)
select null, 'disciplina', c.codigo_origem, min(c.descricao_origem), (array_agg(c.componente_id))[1],
       true, 'Promovido a global pela migration 010: todos os currículos já apontavam para o mesmo componente. Vale para todo curso — troque aqui se não for isso.'
from (
  select m.codigo_origem, m.descricao_origem, vi.componente_id
  from mapeamento_activesoft m
  join versao_item vi on vi.id = m.versao_item_id
  where m.tipo = 'disciplina' and m.confirmado and vi.componente_id is not null
) c
group by c.codigo_origem
having count(distinct c.componente_id) = 1
   and not exists (
     select 1 from mapeamento_activesoft g
     where g.tipo = 'disciplina' and g.versao_id is null and g.codigo_origem = c.codigo_origem
   );

-- Promovido o código, a linha presa ao currículo vira ruído: aponta para
-- o mesmo componente que o global e perde sempre para ele na precedência.
-- Some com ela, senão a tela de Mapeamentos segue mostrando o mesmo
-- código uma vez por currículo — que é justamente o que a 010 resolve.
-- Só sai a linha que é de fato redundante: confirmada, e apontando para
-- o mesmo componente do global. Exceção de verdade fica.
delete from mapeamento_activesoft m
using versao_item vi, mapeamento_activesoft g
where m.tipo = 'disciplina'
  and m.versao_id is not null
  and m.confirmado
  and vi.id = m.versao_item_id
  and g.tipo = 'disciplina'
  and g.versao_id is null
  and g.codigo_origem = m.codigo_origem
  and g.componente_id = vi.componente_id;

-- Fantasma: linha presa a um currículo, ainda PENDENTE, para um código
-- que já tem destino global — e cujo componente existe naquela grade.
-- A importação resolve pelo global e nunca olha para ela, mas a tela de
-- Mapeamentos a mostra como pendência, e escolher um destino ali esbarra
-- no índice único do global. Não há decisão guardada nessas linhas: o
-- que elas tinham era contagem, que a próxima importação refaz.
--
-- O que separa o fantasma da pendência legítima é a SÉRIE, não a versão.
-- A importação resolve pela linha da grade da série do aluno: um
-- componente que existe na 1ª e na 2ª série mas não na 3ª deixa os
-- alunos da 3ª sem destino, e a pendência deles é verdadeira. Olhar só
-- "o componente está nesta versão?" apagaria essa pendência, e a próxima
-- importação a recriaria — que foi exatamente o que aconteceu aqui.
--
-- Então: só é fantasma o código cujo componente tem linha em TODAS as
-- séries que aquela versão cobre. Conservador de propósito; na dúvida a
-- pendência fica, e a tela agora sabe explicá-la.
delete from mapeamento_activesoft m
where m.tipo = 'disciplina'
  and m.versao_id is not null
  and not m.confirmado
  and exists (
    select 1 from mapeamento_activesoft g
    where g.tipo = 'disciplina' and g.versao_id is null and g.confirmado
      and g.codigo_origem = m.codigo_origem
      and g.componente_id is not null
      and not exists (
        -- alguma série da grade desta versão sem linha desse componente?
        select 1
        from (
          select distinct vi.serie_id
          from versao_item vi
          join versao_agrupamento ag on ag.id = vi.versao_agrupamento_id
          join versao_bloco vb on vb.id = ag.versao_bloco_id
          where vb.versao_id = m.versao_id
        ) series_da_versao
        where not exists (
          select 1
          from versao_item vi2
          join versao_agrupamento ag2 on ag2.id = vi2.versao_agrupamento_id
          join versao_bloco vb2 on vb2.id = ag2.versao_bloco_id
          where vb2.versao_id = m.versao_id
            and vi2.serie_id = series_da_versao.serie_id
            and vi2.componente_id = g.componente_id
        )
      )
  );
