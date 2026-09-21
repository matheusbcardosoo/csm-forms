-- ==========================================================
-- 007 — Endurecimento das funções do schema public
--
-- Responde aos dois advisors de segurança do Supabase (21/09/2026):
--
--   1. anon/authenticated_security_definer_function_executable
--      As funções `security definer` estão com EXECUTE para `anon` e
--      `authenticated`, ou seja, alcançáveis por /rest/v1/rpc/<nome>
--      sem passar pelo Express nem pelos exigirPapel(...) das rotas.
--
--   2. function_search_path_mutable
--      8 funções não fixam `search_path`.
--
-- POR QUE O `revoke ... from public` DAS MIGRATIONS 002–006 NÃO BASTOU
-- --------------------------------------------------------------------
-- Todo projeto Supabase nasce com
--
--   alter default privileges in schema public
--     grant all on functions to postgres, anon, authenticated, service_role;
--
-- Então cada função criada em `public` já nasce com EXECUTE concedido
-- **explicitamente** a `anon` e `authenticated`. O `revoke all on
-- function ... from public` das migrations anteriores tira só a
-- concessão implícita de PUBLIC — a explícita de `anon` sobrevive.
--
-- São, portanto, DOIS caminhos de concessão, e os dois precisam cair
-- em cada função (§2). Para as funções futuras, o §3 tira o grant
-- default a `anon`, mas o de PUBLIC não tem como ser desligado por
-- default privileges (§3b explica, com o teste que mostra isso) — daí
-- a rede de conferência do §4.
--
-- POR QUE `alter function` E NÃO `create or replace`
-- --------------------------------------------------------------------
-- `alter function ... set search_path` tem o mesmo efeito sem repetir o
-- corpo. Recopiar ~300 linhas de corpo aqui criaria uma segunda cópia
-- da verdade (e reverteria em silêncio qualquer ajuste feito direto no
-- SQL Editor que não tenha voltado para o repo). **Nenhum corpo de
-- função muda nesta migration.**
--
-- O QUE ESTA MIGRATION *NÃO* FAZ, E POR QUÊ
-- --------------------------------------------------------------------
-- Não revoga EXECUTE de `authenticated`. Todas as rotas do painel
-- chamam essas RPCs com o **client autenticado do usuário**
-- (server/lib/autorizacao.ts → ctx(res).client, anon key + JWT do
-- usuário = papel `authenticated`), não com service_role. Revogar
-- quebraria: emitir / cancelar / 2ª via de histórico, editar nota,
-- resolver divergência, duplicar e publicar versão.
--
-- A barreira nesse caso já existe e está DENTRO das funções: as sete
-- RPCs de negócio começam com `tem_papel('admin', ...)` e levantam
-- insufficient_privilege para quem não tem o papel — inclusive para
-- `anon` (auth.email() nulo ⇒ papel_atual() nulo ⇒ false). O advisor
-- não enxerga o corpo da função, então o aviso de `authenticated`
-- permanece aberto de propósito: é um falso positivo conhecido.
--
-- Idempotente: pode reexecutar.
-- ==========================================================


-- ==========================================================
-- §1 — search_path fixo
--
-- `public, pg_temp` com pg_temp POR ÚLTIMO. Quando pg_temp não é
-- nomeado, o Postgres o consulta ANTES de tudo para relações — uma
-- tabela temporária chamada `nota` ou `historico` sequestraria as
-- queries de dentro da função. Nomeando-o no fim, a tabela real vence.
-- Por isso as funções que já tinham `set search_path = public` também
-- entram aqui.
-- ==========================================================

-- security definer que já tinham `set search_path = public` (002–006)
alter function papel_atual()                        set search_path = public, pg_temp;
alter function usuario_ativo()                      set search_path = public, pg_temp;
alter function tem_papel(text[])                    set search_path = public, pg_temp;
alter function duplicar_versao(uuid, text, text)    set search_path = public, pg_temp;
alter function publicar_versao(uuid, int, text)     set search_path = public, pg_temp;
alter function editar_nota(uuid, uuid, numeric, text, int, situacao_nota, text, text)
                                                    set search_path = public, pg_temp;
alter function resolver_divergencia(uuid, resolucao_divergencia, text)
                                                    set search_path = public, pg_temp;
alter function emitir_historico(uuid, jsonb, text)  set search_path = public, pg_temp;
alter function cancelar_historico(uuid, text, text) set search_path = public, pg_temp;
alter function criar_segunda_via(uuid, text)        set search_path = public, pg_temp;

-- as 8 sem search_path nenhum (advisor #2)
alter function marcar_atualizado_em()               set search_path = public, pg_temp;
alter function versao_esta_em_rascunho(uuid)        set search_path = public, pg_temp;
alter function bloquear_edicao_versao_em_uso()      set search_path = public, pg_temp;
alter function bloquear_edicao_cabecalho_versao()   set search_path = public, pg_temp;
alter function bloquear_delete_versao_publicada()   set search_path = public, pg_temp;
alter function resolver_versao(uuid, uuid)          set search_path = public, pg_temp;
alter function matricula_congelar_versao()          set search_path = public, pg_temp;
alter function historico_congelado()                set search_path = public, pg_temp;

-- `rls_auto_enable()` aparece no advisor mas NÃO existe em nenhuma
-- migration deste repo — foi criada à mão no SQL Editor, ou veio de
-- algum template. Sem o corpo, dá para tratar só o que independe dele
-- (search_path e grant). Se ela não existir no banco, o bloco não faz
-- nada. Matheus: vale descobrir de onde ela veio e versioná-la.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  loop
    execute format('alter function %s set search_path = public, pg_temp', f.assinatura);
    execute format('revoke execute on function %s from anon', f.assinatura);
    raise notice '007: rls_auto_enable tratada (%)', f.assinatura;
  end loop;
end $$;


-- ==========================================================
-- §2 — tirar `anon` do alcance das RPCs
--
-- Nenhuma tela pública (form-visitas, respostas) chama /rpc/*: todo
-- `.rpc(` do código está em server/rotas e server/servicos, atrás de
-- exigirPapel(). Logo `anon` não precisa de EXECUTE em nada disso.
--
-- **São dois caminhos de concessão, e os dois precisam cair:**
--
--   a) o grant explícito a `anon`, que vem do default privileges do
--      Supabase (ver cabeçalho) — cai com `revoke ... from anon`;
--   b) o grant implícito de PUBLIC, que o Postgres dá a TODA função
--      nova — cai só com `revoke ... from public`.
--
-- As 10 `security definer` já tinham o (b) revogado nas migrations
-- 002–006; as 8 restantes não, e é por isso que `anon` alcançava
-- resolver_versao() e as funções de gatilho. Revogar dos dois aqui,
-- para as 18, deixa a migration autossuficiente — só o `revoke from
-- anon` sozinho NÃO resolve (verificado no ambiente local).
--
-- `authenticated` fica como está — ver o cabeçalho e o §2b.
-- ==========================================================

revoke execute on function papel_atual()                     from public, anon;
revoke execute on function usuario_ativo()                   from public, anon;
revoke execute on function tem_papel(text[])                 from public, anon;
revoke execute on function duplicar_versao(uuid, text, text) from public, anon;
revoke execute on function publicar_versao(uuid, int, text)  from public, anon;
revoke execute on function editar_nota(uuid, uuid, numeric, text, int, situacao_nota, text, text)
                                                             from public, anon;
revoke execute on function resolver_divergencia(uuid, resolucao_divergencia, text)
                                                             from public, anon;
revoke execute on function emitir_historico(uuid, jsonb, text)  from public, anon;
revoke execute on function cancelar_historico(uuid, text, text) from public, anon;
revoke execute on function criar_segunda_via(uuid, text)        from public, anon;

-- Invoker, mas igualmente sem motivo para viver na API pública.
-- O EXECUTE de `authenticated` volta explícito no §2b.
revoke execute on function versao_esta_em_rascunho(uuid) from public, anon;
revoke execute on function resolver_versao(uuid, uuid)   from public, anon;

-- Funções de gatilho: o PostgREST não expõe função que retorna
-- `trigger`, e o Postgres só checa EXECUTE no CREATE TRIGGER, não a
-- cada disparo — então tirar o EXECUTE de todo mundo aqui não afeta os
-- gatilhos. (Verificado no ambiente local: com PUBLIC revogado, um
-- update como `authenticated` continua disparando marcar_atualizado_em
-- e historico_congelado normalmente.)
revoke execute on function marcar_atualizado_em()             from public, anon;
revoke execute on function bloquear_edicao_versao_em_uso()    from public, anon;
revoke execute on function bloquear_edicao_cabecalho_versao() from public, anon;
revoke execute on function bloquear_delete_versao_publicada() from public, anon;
revoke execute on function matricula_congelar_versao()        from public, anon;
revoke execute on function historico_congelado()              from public, anon;


-- ==========================================================
-- §2b — o que `authenticated` PRECISA manter
--
-- Reafirmado explicitamente para que nenhuma limpeza futura tire sem
-- perceber. As policies de RLS (43 usos em 002–006) chamam estas três
-- em todo `using` / `with check`; sem EXECUTE, todo select do painel
-- vira erro de permissão.
-- ==========================================================
grant execute on function papel_atual()     to authenticated;
grant execute on function usuario_ativo()   to authenticated;
grant execute on function tem_papel(text[]) to authenticated;

-- `resolver_versao` é chamada pelo gatilho trg_matricula_versao, que é
-- security INVOKER: quando a secretaria cria uma matrícula pelo painel
-- (server/rotas/alunos.ts, client autenticado), quem executa a função
-- é o papel `authenticated` — e aí o Postgres CHECA o EXECUTE. Mesma
-- coisa para versao_esta_em_rascunho, chamada de dentro de
-- bloquear_edicao_versao_em_uso(). Revogar estas duas de
-- `authenticated` quebraria cadastro de matrícula e edição de versão.
grant execute on function resolver_versao(uuid, uuid)   to authenticated;
grant execute on function versao_esta_em_rascunho(uuid) to authenticated;


-- ==========================================================
-- §3 — causa raiz, metade 1: o grant default do Supabase a `anon`
--
-- Tira `anon` da regra de default privileges, para que a próxima
-- função criada em `public` (migration 008 em diante) não nasça com o
-- grant EXPLÍCITO a anon. Vale para objetos criados pelo papel que
-- executa este comando — o SQL Editor do Supabase roda como
-- `postgres`, dono da regra atual. Funções que um dia precisarem de
-- anon passam a exigir `grant execute ... to anon` explícito, que é o
-- comportamento certo.
-- ==========================================================
alter default privileges in schema public revoke execute on functions from anon;

-- ==========================================================
-- §3b — causa raiz, metade 2: NÃO dá para automatizar. LEIA.
--
-- O §3 resolve só metade. Toda função nova em Postgres também nasce
-- com EXECUTE para PUBLIC (`=X/owner` no proacl), e disso `anon`
-- herda. E — verificado no ambiente local, Postgres 16 —
--
--     alter default privileges in schema public
--       revoke execute on functions from public;
--
-- É SILENCIOSAMENTE INÓCUO: não grava nada em pg_default_acl e a
-- função seguinte continua saindo com `=X/postgres`. Por isso o
-- comando não está aqui: ele daria falsa sensação de resolvido.
--
-- Consequência prática para as próximas migrations: **toda função
-- nova em `public` precisa trazer o seu próprio**
--
--     revoke execute on function <nome>(<args>) from public, anon;
--     grant  execute on function <nome>(<args>) to authenticated;  -- se for o caso
--
-- As migrations 002–006 já faziam isso para as `security definer` —
-- foi exatamente nas 8 funções em que esqueceram (gatilhos,
-- resolver_versao, versao_esta_em_rascunho) que `anon` entrou. O §4
-- aqui embaixo é a rede: roda no fim de cada migration e denuncia quem
-- ficou de fora.
-- ==========================================================


-- ==========================================================
-- §4 — conferência (não altera nada)
--
-- Roda no fim e IMPRIME o que ficou de fora, em vez de "consertar" em
-- silêncio. Saída só com o "007 OK" = schema limpo. Se aparecer
-- "007 PENDENTE", é função criada fora das migrations: versione antes
-- de mexer.
-- ==========================================================
do $$
declare
  f record;
  n int := 0;
begin
  for f in
    select p.oid::regprocedure as assinatura,
           p.prosecdef        as security_definer,
           coalesce(array_to_string(p.proconfig, ', '), '(nenhum)') as config,
           has_function_privilege('anon', p.oid, 'EXECUTE') as anon_executa
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.prokind = 'f'
      -- Ignora o que pertence a extensão (pgcrypto mora em `public` e
      -- traz ~30 funções sem search_path). Não são nossas, não são
      -- `security definer`, e o advisor do Supabase também as ignora.
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid
          and d.classid = 'pg_proc'::regclass
          and d.deptype = 'e'
      )
      and (
        not exists (
          select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c
          where c like 'search_path=%'
        )
        or has_function_privilege('anon', p.oid, 'EXECUTE')
      )
    order by 1
  loop
    n := n + 1;
    raise notice '007 PENDENTE: % | secdef=% | config=% | anon_executa=%',
      f.assinatura, f.security_definer, f.config, f.anon_executa;
  end loop;

  if n = 0 then
    raise notice '007 OK: nenhuma função em public sem search_path ou alcançável por anon.';
  else
    raise notice '007: % função(ões) acima ainda pendente(s) — ver o comentário do §4.', n;
  end if;
end $$;
