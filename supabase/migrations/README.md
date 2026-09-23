# Migrations

Scripts numerados e **imutáveis**, aplicados em ordem no SQL Editor do Supabase (Project › SQL Editor › New query). Cada um é idempotente: pode ser reexecutado num banco onde já rodou sem efeito colateral.

| Arquivo | Fase | O que cria |
|---|---|---|
| `001_base.sql` | — | Estado anterior: formulários de visita e avaliação substitutiva, `staff_emails`, bucket `avaliacao-anexos` |
| `002_usuario_perfil.sql` | F0 | `usuario_perfil` com papéis, funções `papel_atual()` / `usuario_ativo()` / `tem_papel()`, RLS dos formulários migrada |
| `003_instituicao.sql` | F1 | `instituicao`, `instituicao_ato`, `instituicao_signatario`, `ano_letivo`, bucket `institucional` |
| `004_cadastros_base.sql` | F2 | `curso`, `serie`, `componente`, `versao_*`, `vigencia_curricular`, `sistema_avaliacao`, `estabelecimento_externo`, `mapeamento_activesoft`, triggers de somente-leitura, `duplicar_versao()`, `publicar_versao()` |
| `005_alunos_notas_importacao.sql` | F3+F4 | `aluno`, `matricula` (congela a versão curricular), `nota` (por linha da grade), `auditoria`, `importacao`, `importacao_divergencia`, `editar_nota()`, `resolver_divergencia()`, mapeamento global de série/situação |
| `006_historico.sql` | F5 | `historico` (somente leitura depois de emitido), `historico_sequencia` (numeração por ano), `observacao_modelo` com textos-padrão semeados, `emitir_historico()`, `cancelar_historico()`, `criar_segunda_via()`, bucket `documentos` |
| `007_endurecer_rpcs.sql` | — | Segurança: tira `anon` de todas as funções de `public` e fixa `search_path = public, pg_temp` nas 18. Não cria nem altera corpo de função. Responde aos advisors `*_security_definer_function_executable` e `function_search_path_mutable` |
| `008_verificacao.sql` | F6 | Verificação pública de autenticidade do documento emitido |
| `009_agendamento.sql` | F7 | `importacao_agendamento` — importação automática por horário e dias da semana |
| `010_mapeamento_por_componente.sql` | F7 | `mapeamento_activesoft.componente_id`: destino global de disciplina, que vale para todo curso e toda versão. Promove a global os códigos cujos mapeamentos já apontavam todos para o mesmo componente |

`supabase/schema.sql` (raiz) é o script antigo e continua válido só para bancos que nunca receberam a `001`. Novos objetos entram **sempre** como migration nova — nunca edite uma já aplicada.

## Convenção para função nova em `public`

Toda função criada em `public` nasce executável por `anon` — por dois caminhos somados: o `grant` implícito de PUBLIC (Postgres) e o `grant` explícito das *default privileges* do Supabase. A `007` fechou o segundo para o futuro; o primeiro não tem como ser desligado por default privileges (o teste está comentado na própria `007`, §3b).

Então **toda função nova precisa trazer as suas duas linhas**:

```sql
revoke execute on function meu_nome(uuid, text) from public, anon;
grant  execute on function meu_nome(uuid, text) to authenticated;  -- só se o painel chamar
```

E, se for `security definer`, mais duas coisas: `set search_path = public, pg_temp` (com `pg_temp` **por último**, senão uma tabela temporária sequestra as queries de dentro da função) e a checagem de papel **dentro** do corpo:

```sql
if not tem_papel('admin', 'secretaria') then
  raise exception 'Seu perfil não faz isso.' using errcode = 'insufficient_privilege';
end if;
```

Essa checagem não é redundante com o `exigirPapel(...)` da rota: as rotas do painel chamam as RPCs com o **client autenticado do usuário**, então qualquer pessoa logada — inclusive papel `leitura` — alcança `/rest/v1/rpc/<nome>` direto, sem passar pelo Express. O `tem_papel()` de dentro é a barreira que vale nesse caminho.

Para conferir se ficou nada para trás, copie o bloco `do $$ ... $$` do §4 da `007` e rode no fim da migration nova: ele lista o que sobrou sem `search_path` ou ainda alcançável por `anon`.

## Depois de aplicar a 002

Quem já estava em `staff_emails` entra em `usuario_perfil` como `secretaria`. Promova ao menos uma pessoa a administradora, senão ninguém consegue configurar a instituição:

```sql
update usuario_perfil set papel = 'admin' where email = 'voce@saomarcos.com.br';
```
