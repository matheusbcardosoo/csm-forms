-- ==========================================================
-- Semente de CADASTRO ACADÊMICO para um projeto Supabase de TESTE.
--
-- Equivale ao que scripts/ambiente-local/seed.sql faz no banco local,
-- mas escrito para rodar num Supabase que JÁ TEM curso e séries
-- cadastrados: em vez de criar de novo, se encaixa no que existe.
--
-- O que ele cria: componentes, a versão curricular do curso (blocos →
-- agrupamentos → itens por série), os totais anuais, a vigência por ano
-- letivo, o sistema de avaliação e os códigos de série do adaptador.
--
-- O que ele NÃO toca: nada de aluno, matrícula, nota, histórico,
-- visita_respostas, avaliacao_substitutiva_* ou usuario_perfil. Os
-- alunos e as notas do mock NÃO vêm daqui — entram pela tela
-- Importação › Nova importação, com o adaptador `mock` ativo.
--
-- Reexecutável: se a versão curricular já existir, não faz nada.
-- ==========================================================

do $$
declare
  c uuid; v uuid;
  b_fgb uuid; b_if uuid;
  a_ling uuid; a_mat uuid; a_nat uuid; a_hum uuid; a_bil uuid; a_ci uuid;
  comp record; sr record; v_comp uuid;
  n_series int;
begin
  -- ---------- curso ----------
  select id into c from curso where etapa = 'em' order by criado_em limit 1;
  if c is null then
    insert into curso (etapa, nome, razao_aula_hora)
      values ('em', 'Ensino Médio Bilíngue', 0.75) returning id into c;
    raise notice 'curso criado';
  else
    raise notice 'usando o curso que já existe: %', (select nome from curso where id = c);
  end if;

  -- razão aula/hora e critério de promoção só são preenchidos se estiverem vazios
  update curso set razao_aula_hora = coalesce(nullif(razao_aula_hora, 0), 0.75),
                   texto_promocao = coalesce(texto_promocao,
                     'Será considerado promovido o aluno que obtiver, nos diferentes conteúdos curriculares, os seguintes resultados: I – frequência igual ou superior a 75% com nota final mínima 6,0 (seis) inteiros no final do ano letivo.')
   where id = c;

  -- ---------- séries (por código, que é o que o adaptador manda) ----------
  insert into serie (curso_id, codigo, nome, ordem)
  select c, x.codigo, x.nome, x.ordem
    from (values ('EM1', '1ª Série', 1), ('EM2', '2ª Série', 2), ('EM3', '3ª Série', 3)) as x(codigo, nome, ordem)
   where not exists (select 1 from serie s where s.curso_id = c and s.codigo = x.codigo);

  select count(*) into n_series from serie where curso_id = c;
  raise notice 'séries do curso: %', n_series;

  -- ---------- sistema de avaliação ----------
  insert into sistema_avaliacao (curso_id, tipo, media_aprovacao, frequencia_minima)
  select c, 'nota_0_10', 6, 75
   where not exists (select 1 from sistema_avaliacao where curso_id = c);

  -- ---------- versão curricular ----------
  if exists (select 1 from versao_curricular where curso_id = c) then
    raise notice 'já existe versão curricular para este curso — nada a fazer';
    return;
  end if;

  -- nasce em rascunho porque versão publicada é somente leitura (trigger)
  insert into versao_curricular (curso_id, nome, base_legal, status, ano_inicio, criado_por, publicado_por, publicado_em)
    values (c, 'Novo Ensino Médio 2022', 'Resolução CNE/CEB nº 3/2018', 'rascunho', 2022, 'seed-teste', 'seed-teste', now())
    returning id into v;

  insert into versao_bloco (versao_id, nome, ordem) values (v, 'Formação Geral Básica', 0) returning id into b_fgb;
  insert into versao_bloco (versao_id, nome, ordem) values (v, 'Itinerários Formativos', 1) returning id into b_if;

  insert into versao_agrupamento (versao_bloco_id, nome, ordem) values (b_fgb, 'Linguagens e suas Tecnologias', 0) returning id into a_ling;
  insert into versao_agrupamento (versao_bloco_id, nome, ordem) values (b_fgb, 'Matemática e suas Tecnologias', 1) returning id into a_mat;
  insert into versao_agrupamento (versao_bloco_id, nome, ordem) values (b_fgb, 'Ciências da Natureza e suas Tecnologias', 2) returning id into a_nat;
  insert into versao_agrupamento (versao_bloco_id, nome, ordem) values (b_fgb, 'Ciências Humanas e Sociais Aplicadas', 3) returning id into a_hum;
  insert into versao_agrupamento (versao_bloco_id, nome, ordem) values (b_if, 'Ensino Bilíngue', 0) returning id into a_bil;
  insert into versao_agrupamento (versao_bloco_id, nome, ordem) values (b_if, 'Ciclo Integrador', 1) returning id into a_ci;

  -- Os NOMES aqui são os mesmos que o adaptador mock manda na descrição
  -- da disciplina. É isso que faz a importação casar os códigos sozinha,
  -- sem ninguém confirmar mapeamento na mão.
  for comp in select * from (values
    (a_ling, 'Língua Portuguesa',                        'LP',      0, array['EM1','EM2','EM3']),
    (a_ling, 'Arte',                                     'ART',     1, array['EM1','EM2','EM3']),
    (a_ling, 'Educação Física',                          'EDF',     2, array['EM1','EM2']),
    (a_ling, 'Língua Estrangeira Moderna - Inglês',      'ING',     3, array['EM1','EM2']),
    (a_mat,  'Matemática',                               'MAT',     0, array['EM1','EM2','EM3']),
    (a_nat,  'Física',                                   'FIS',     0, array['EM1','EM2']),
    (a_nat,  'Química',                                  'QUI',     1, array['EM1','EM2','EM3']),
    (a_nat,  'Biologia',                                 'BIO',     2, array['EM1','EM2','EM3']),
    (a_hum,  'História',                                 'HIS',     0, array['EM1','EM2','EM3']),
    (a_hum,  'Geografia',                                'GEO',     1, array['EM1','EM2','EM3']),
    (a_hum,  'Filosofia',                                'FIL',     2, array['EM1','EM2']),
    (a_hum,  'Sociologia',                               'SOC',     3, array['EM1','EM2']),
    (a_bil,  'Academic Content Development',             'ACD',     0, array['EM1','EM2','EM3']),
    (a_bil,  'English Language - Linguistic Development','ELD',     1, array['EM1','EM2','EM3']),
    (a_ci,   'Projeto de Vida',                          'PROJ-VD', 0, array['EM1','EM2','EM3'])
  ) as t(agrup, nome, sigla, ordem, series) loop
    insert into componente (nome_canonico, sigla) values (comp.nome, comp.sigla) on conflict (nome_canonico) do nothing;
    select id into v_comp from componente where nome_canonico = comp.nome;
    for sr in select s.id as serie_id from serie s where s.curso_id = c and s.codigo = any (comp.series) loop
      insert into versao_item (versao_agrupamento_id, serie_id, componente_id, nome_impresso, ordem)
        values (comp.agrup, sr.serie_id, v_comp, comp.nome, comp.ordem);
    end loop;
  end loop;

  -- totais anuais (razão 0,75 = aula de 45 min, como no modelo real)
  insert into versao_total (versao_id, serie_id, total_aulas_anuais, total_horas_anuais)
    select v, s.id,
           case when s.codigo = 'EM3' then 1680 else 1760 end,
           case when s.codigo = 'EM3' then 1260 else 1320 end
      from serie s where s.curso_id = c;

  -- publica e define a vigência: sem isso a matrícula entra sem grade e
  -- nenhuma nota pode ser importada (RF-VER-11)
  update versao_curricular set status = 'vigente' where id = v;
  insert into vigencia_curricular (ano_letivo_id, serie_id, versao_id)
    select al.id, s.id, v from ano_letivo al, serie s
     where s.curso_id = c and al.ano between 2021 and 2026
    on conflict (ano_letivo_id, serie_id) do nothing;

  -- códigos de série do adaptador → série local, já confirmados
  insert into mapeamento_activesoft (versao_id, tipo, codigo_origem, descricao_origem, destino_valor, confirmado)
    select null, 'serie', s.codigo, s.nome, s.id::text, true
      from serie s where s.curso_id = c
       and not exists (select 1 from mapeamento_activesoft m where m.tipo = 'serie' and m.codigo_origem = s.codigo and m.versao_id is null);

  raise notice 'currículo publicado com % itens', (select count(*) from versao_item i join versao_agrupamento ag on ag.id = i.versao_agrupamento_id join versao_bloco bl on bl.id = ag.versao_bloco_id where bl.versao_id = v);
end $$;

-- ==========================================================
-- COMO ZERAR DEPOIS (rode à mão, na ordem — está comentado de propósito)
--
-- ⚠ Num projeto que também hospeda os formulários públicos, NÃO use
--   "truncate" geral nem apague `visita_*` / `avaliacao_substitutiva_*`:
--   são respostas reais de gente de verdade, com anexos no Storage.
--
-- -- 1) dados de movimento (a ordem importa por causa das FKs)
-- delete from historico;               -- antes de auditoria/aluno
-- delete from historico_sequencia;     -- zera a numeração dos documentos
-- delete from auditoria;
-- delete from importacao_divergencia;
-- delete from nota;
-- delete from matricula;
-- delete from aluno;
-- delete from importacao;
--
-- -- 2) só se quiser derrubar o cadastro acadêmico também:
-- delete from mapeamento_activesoft;
-- delete from vigencia_curricular;
-- update versao_curricular set status = 'rascunho';   -- publicada é somente leitura
-- delete from versao_total; delete from versao_item;
-- delete from versao_agrupamento; delete from versao_bloco;
-- delete from versao_curricular;
-- delete from componente; delete from sistema_avaliacao;
-- -- serie e curso só se quiser recomeçar do zero mesmo
-- ==========================================================

-- ==========================================================
-- Conferência: rode depois e veja se está tudo de pé.
-- ==========================================================
select (select count(*) from versao_curricular where status = 'vigente') as versoes_vigentes,
       (select count(*) from versao_item)                                as itens_da_grade,
       (select count(*) from vigencia_curricular)                        as vigencias,
       (select count(*) from sistema_avaliacao)                          as sistemas_avaliacao,
       (select count(*) from mapeamento_activesoft where tipo = 'serie' and confirmado) as series_mapeadas;
