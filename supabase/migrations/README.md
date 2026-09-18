# Migrations

Scripts numerados e **imutáveis**, aplicados em ordem no SQL Editor do Supabase (Project › SQL Editor › New query). Cada um é idempotente: pode ser reexecutado num banco onde já rodou sem efeito colateral.

| Arquivo | Fase | O que cria |
|---|---|---|
| `001_base.sql` | — | Estado anterior: formulários de visita e avaliação substitutiva, `staff_emails`, bucket `avaliacao-anexos` |
| `002_usuario_perfil.sql` | F0 | `usuario_perfil` com papéis, funções `papel_atual()` / `usuario_ativo()` / `tem_papel()`, RLS dos formulários migrada |
| `003_instituicao.sql` | F1 | `instituicao`, `instituicao_ato`, `instituicao_signatario`, `ano_letivo`, bucket `institucional` |
| `004_cadastros_base.sql` | F2 | `curso`, `serie`, `componente`, `versao_*`, `vigencia_curricular`, `sistema_avaliacao`, `estabelecimento_externo`, `mapeamento_activesoft`, triggers de somente-leitura, `duplicar_versao()`, `publicar_versao()` |

`supabase/schema.sql` (raiz) é o script antigo e continua válido só para bancos que nunca receberam a `001`. Novos objetos entram **sempre** como migration nova — nunca edite uma já aplicada.

## Depois de aplicar a 002

Quem já estava em `staff_emails` entra em `usuario_perfil` como `secretaria`. Promova ao menos uma pessoa a administradora, senão ninguém consegue configurar a instituição:

```sql
update usuario_perfil set papel = 'admin' where email = 'voce@saomarcos.com.br';
```
