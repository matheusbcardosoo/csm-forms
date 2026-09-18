-- Semente de desenvolvimento: usuários, curso "Ensino Médio Bilíngue" com
-- 3 séries, versão curricular vigente com alguns componentes, vigência
-- 2022–2026, mapeamento das séries do adaptador mock e signatários.
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;

insert into usuario_perfil (email, nome, papel) values
  ('admin@local', 'Administrador local', 'admin'),
  ('secretaria@local', 'Secretaria local', 'secretaria'),
  ('coordenacao@local', 'Coordenação local', 'coordenacao')
on conflict (email) do nothing;

insert into ano_letivo (ano, situacao) select a, 'encerrado' from generate_series(2019, 2025) a on conflict (ano) do nothing;
insert into ano_letivo (ano, situacao) values (2026, 'aberto') on conflict (ano) do nothing;

do $$
declare c uuid; v uuid; b1 uuid; b2 uuid; a_ling uuid; a_mat uuid; a_nat uuid; a_hum uuid; a_bil uuid; a_ci uuid; sr record; comp record; v_comp uuid;
begin
  insert into curso (etapa, nome, razao_aula_hora, texto_promocao) values ('em', 'Ensino Médio Bilíngue', 0.75,
    'Será considerado promovido o aluno que obtiver, nos diferentes conteúdos curriculares, os seguintes resultados: I – frequência igual ou superior a 75% com nota final mínima 6,0 (seis) inteiros no final do ano letivo.')
  returning id into c;
  insert into serie (curso_id, codigo, nome, ordem) values (c, '1', '1ª série', 1), (c, '2', '2ª série', 2), (c, '3', '3ª série', 3);
  insert into sistema_avaliacao (curso_id, tipo, media_aprovacao, frequencia_minima) values (c, 'nota_0_10', 6, 75);

  insert into versao_curricular (curso_id, nome, base_legal, status, ano_inicio, criado_por, publicado_por, publicado_em)
    values (c, 'Novo Ensino Médio 2022', 'Resolução CNE/CEB nº 3/2018', 'rascunho', 2022, 'seed', 'seed', now()) returning id into v;
  insert into versao_bloco (versao_id, nome, ordem) values (v, 'Formação Geral Básica', 0) returning id into b1;
  insert into versao_bloco (versao_id, nome, ordem) values (v, 'Itinerários Formativos', 1) returning id into b2;
  insert into versao_agrupamento (versao_bloco_id, nome, ordem) values (b1, 'Linguagens e suas Tecnologias', 0) returning id into a_ling;
  insert into versao_agrupamento (versao_bloco_id, nome, ordem) values (b1, 'Matemática e suas Tecnologias', 1) returning id into a_mat;
  insert into versao_agrupamento (versao_bloco_id, nome, ordem) values (b1, 'Ciências da Natureza e suas Tecnologias', 2) returning id into a_nat;
  insert into versao_agrupamento (versao_bloco_id, nome, ordem) values (b1, 'Ciências Humanas e Sociais Aplicadas', 3) returning id into a_hum;
  insert into versao_agrupamento (versao_bloco_id, nome, ordem) values (b2, 'Ensino Bilíngue', 0) returning id into a_bil;
  insert into versao_agrupamento (versao_bloco_id, nome, ordem) values (b2, 'Ciclo Integrador', 1) returning id into a_ci;

  for comp in select * from (values
    (a_ling, 'Língua Portuguesa', 'LP', 0, array['1','2','3']), (a_ling, 'Arte', 'ART', 1, array['1','2','3']),
    (a_ling, 'Educação Física', 'EF', 2, array['1','2']), (a_ling, 'Língua Estrangeira Moderna - Inglês', 'ING', 3, array['1','2']),
    (a_mat, 'Matemática', 'MAT', 0, array['1','2','3']),
    (a_nat, 'Física', 'FIS', 0, array['1','2']), (a_nat, 'Química', 'QUI', 1, array['1','2','3']), (a_nat, 'Biologia', 'BIO', 2, array['1','2','3']),
    (a_hum, 'História', 'HIS', 0, array['1','2','3']), (a_hum, 'Geografia', 'GEO', 1, array['1','2','3']), (a_hum, 'Filosofia', 'FIL', 2, array['1','2']), (a_hum, 'Sociologia', 'SOC', 3, array['1','2']),
    (a_bil, 'Academic Content Development', 'ACD', 0, array['1','2','3']), (a_bil, 'English Language - Linguistic Development', 'ELD', 1, array['1','2','3']),
    (a_ci, 'Projeto de Vida', 'PV', 0, array['1','2','3'])
  ) as t(agrup, nome, sigla, ordem, series) loop
    insert into componente (nome_canonico, sigla) values (comp.nome, comp.sigla) on conflict (nome_canonico) do nothing;
    select componente.id into v_comp from componente where componente.nome_canonico = comp.nome;
    for sr in select serie.id as serie_id from serie where serie.curso_id = c and serie.codigo = any (comp.series) loop
      insert into versao_item (versao_agrupamento_id, serie_id, componente_id, nome_impresso, ordem)
        values (comp.agrup, sr.serie_id, v_comp, comp.nome, comp.ordem);
    end loop;
  end loop;
  insert into versao_total (versao_id, serie_id, total_aulas_anuais, total_horas_anuais)
    select v, serie.id, case when serie.codigo = '3' then 1680 else 1760 end, case when serie.codigo = '3' then 1260 else 1320 end from serie where serie.curso_id = c;

  update versao_curricular set status = 'vigente' where id = v;
  insert into vigencia_curricular (ano_letivo_id, serie_id, versao_id)
    select al.id, se.id, v from ano_letivo al, serie se where al.ano between 2022 and 2026 and se.curso_id = c;

  -- códigos de série do adaptador mock já confirmados; disciplinas entram como pendência na 1ª importação
  insert into mapeamento_activesoft (versao_id, tipo, codigo_origem, descricao_origem, destino_valor, confirmado)
    select null, 'serie', 'EM' || serie.codigo, serie.nome, serie.id::text, true from serie where serie.curso_id = c;
end $$;

update instituicao set mantenedora_nome = 'Associação de Desenvolvimento Educacional CSM';
insert into instituicao_ato (instituicao_id, rotulo, data_ato, data_publicacao, ordem) select id, 'Autorização de Funcionamento', '2012-03-16', '2012-03-28', 0 from instituicao;
insert into instituicao_ato (instituicao_id, tipo, rotulo, data_ato, data_publicacao, ordem, curso_id) select i.id, 'programa', 'Ensino Bilíngue', '2022-01-11', '2022-01-12', 1, c.id from instituicao i, curso c;
insert into instituicao_signatario (instituicao_id, nome, cargo, cargo_impresso, rg) select id, 'Maria Aparecida Ferreira', 'diretor', 'Diretora', '0.000.000-0' from instituicao;
insert into instituicao_signatario (instituicao_id, nome, cargo, cargo_impresso, rg, registro_autorizacao) select id, 'Marina Santos', 'secretario', 'Secretária', '00.000.000-0', '0000' from instituicao;
