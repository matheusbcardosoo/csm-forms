-- ==========================================================
-- 014_foto_aluno — foto do aluno (docs/08-carteirinhas.md §3.1, §6.1)
--
-- A foto vem do Activesoft (`url_foto`) e é COPIADA para o Storage na
-- importação: o link da origem pode ser assinado e expirar, e a emissão
-- de carteirinha precisa funcionar com o Activesoft fora do ar
-- (RNF-CART-05). O link cru não ganha coluna — uma URL assinada guardada
-- parece dado e é lixo uma hora depois.
--
-- foto_origem decide quem manda na foto:
--   'activesoft' — a reimportação troca quando foto_alterada_origem muda;
--   'manual'     — enviada pela secretaria; a reimportação NÃO sobrescreve
--                  (mesmo princípio do RF-INT-06), só avisa no relatório.
-- ==========================================================

alter table aluno add column if not exists foto_path            text;        -- bucket 'alunos-fotos'
alter table aluno add column if not exists foto_origem          text;
alter table aluno add column if not exists foto_alterada_origem timestamptz; -- foto_data_hora_alteracao do Activesoft
alter table aluno add column if not exists foto_atualizada_em   timestamptz;

do $$ begin
  alter table aluno add constraint aluno_foto_origem_check
    check (foto_origem is null or foto_origem in ('activesoft', 'manual'));
exception when duplicate_object then null; end $$;

-- ---------- Storage: fotos dos alunos ----------
insert into storage.buckets (id, name, public)
values ('alunos-fotos', 'alunos-fotos', false)
on conflict (id) do nothing;

-- Leitura para todo papel ativo: a foto aparece na ficha do aluno, que
-- todo papel vê. O que é restrito é a emissão em massa (015).
drop policy if exists "alunos_fotos_read_ativos" on storage.objects;
create policy "alunos_fotos_read_ativos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'alunos-fotos' and usuario_ativo());

drop policy if exists "alunos_fotos_insert_sec" on storage.objects;
create policy "alunos_fotos_insert_sec"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'alunos-fotos' and tem_papel('admin', 'secretaria'));

drop policy if exists "alunos_fotos_update_sec" on storage.objects;
create policy "alunos_fotos_update_sec"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'alunos-fotos' and tem_papel('admin', 'secretaria'));

drop policy if exists "alunos_fotos_delete_sec" on storage.objects;
create policy "alunos_fotos_delete_sec"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'alunos-fotos' and tem_papel('admin', 'secretaria'));
