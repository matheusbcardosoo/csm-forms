-- ==========================================================
-- 009_agendamento — importação agendada (RF-INT-10). Desenho em
-- docs/superpowers/specs/2026-09-21-f7-refino-design.md §3.4.
--
-- Uma linha só, no mesmo padrão de `instituicao` (coluna `unico` com
-- unique + check): é configuração da escola, não registro por entidade.
--
-- A execução em si continua caindo na tabela `importacao` de sempre, com
-- `parametros.agendada = true` — relatório, divergências e pendências
-- não precisam saber que a origem do disparo foi um relógio.
-- ==========================================================

create table if not exists importacao_agendamento (
  id                uuid primary key default gen_random_uuid(),
  unico             boolean not null default true unique check (unico),

  ativo             boolean not null default false,
  -- HH:MM no fuso de São Paulo. Guardado como texto de propósito: é o
  -- que a pessoa digitou, e converter para UTC aqui deixaria o horário
  -- do agendamento andando sozinho quando o horário de verão voltasse.
  hora              text not null default '03:00' check (hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  -- 0 = domingo … 6 = sábado
  dias_semana       int[] not null default '{1,2,3,4,5}',
  tipo              text not null default 'completo' check (tipo in ('alunos', 'matriculas', 'notas', 'completo')),

  -- marca de execução: é ela que impede duas réplicas de rodarem a mesma
  -- janela. Quem consegue gravar aqui é quem executa (ver servicos/agendador.ts)
  ultima_execucao   timestamptz,
  -- quem gravou a marca acima. Existe porque o update que reserva a
  -- janela não consegue dizer se pegou: o PostgREST reaplica o filtro
  -- depois de escrever, e a linha recém-marcada já não casa mais com
  -- "ultima_execucao é nula ou antiga", então a resposta volta vazia
  -- mesmo tendo gravado. Cada processo escreve um token e relê: quem se
  -- encontra ali é quem reservou.
  reserva_token     text,
  ultimo_resultado  jsonb,

  atualizado_em     timestamptz not null default now(),
  atualizado_por    text
);

insert into importacao_agendamento (unico) values (true) on conflict do nothing;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_importacao_agendamento_atualizado') then
    create trigger trg_importacao_agendamento_atualizado before update on importacao_agendamento
      for each row execute function marcar_atualizado_em();
  end if;
end $$;

-- ---------- RLS ----------
-- Leitura para todo papel ativo (a tela de importação mostra quando foi a
-- última execução); escrita só de quem já podia importar.
alter table importacao_agendamento enable row level security;
grant select, update on importacao_agendamento to authenticated;

drop policy if exists "agendamento_select_ativos" on importacao_agendamento;
create policy "agendamento_select_ativos" on importacao_agendamento for select to authenticated using (usuario_ativo());

drop policy if exists "agendamento_update_sec" on importacao_agendamento;
create policy "agendamento_update_sec" on importacao_agendamento for update to authenticated
  using (tem_papel('admin', 'secretaria')) with check (tem_papel('admin', 'secretaria'));
