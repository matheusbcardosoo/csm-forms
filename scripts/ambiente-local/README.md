# Ambiente local sem Supabase

Sobe um banco de desenvolvimento com as migrations aplicadas e uma semente (curso, séries, versão curricular vigente, signatários), sem tocar no projeto Supabase de produção. Auth é imitado: **qualquer senha entra**, e o e-mail define o papel (`admin@local`, `secretaria@local`, `coordenacao@local`).

## Subir

```bash
docker compose -f scripts/ambiente-local/docker-compose.yml up -d
```

```bash
node scripts/ambiente-local/fake-supabase.mjs
```

O segundo comando imprime as chaves `anon` e `service` (JWTs de teste). Rode o servidor apontando para o ambiente falso:

```bash
SUPABASE_URL=http://localhost:54321 SUPABASE_ANON_KEY=<anon> SUPABASE_SERVICE_ROLE_KEY=<service> COOKIE_SECRET=dev IMPORTACAO_ADAPTADOR=mock npm run dev
```

No PowerShell:

```powershell
$env:SUPABASE_URL='http://localhost:54321'; $env:SUPABASE_ANON_KEY='<anon>'; $env:SUPABASE_SERVICE_ROLE_KEY='<service>'; $env:COOKIE_SECRET='dev'; $env:IMPORTACAO_ADAPTADOR='mock'; npm run dev
```

Depois `npm run build` (ou `npm run dev:client`) e entre em http://localhost:3000/app com `admin@local`.

## Roteiro sugerido

1. Importação › Nova importação › ano letivo **2025**, tipo **completo**, **Simular primeiro**.
2. O relatório mostra as disciplinas do mock (`LP`, `MAT`, `PROJ-VD`…) como pendências de mapeamento, com sugestão por nome. Confirme em **Mapeamentos**.
3. Importe de novo em modo efetivo: alunos, matrículas e notas entram. Rode uma terceira vez: `criados = 0` (idempotência).
4. Abra um aluno › Notas, edite uma célula (pede motivo) e veja em **Histórico de alterações**.
5. Para forçar uma divergência, altere `valor_importado` de uma nota no banco e reimporte: ela aparece no relatório com os dois valores lado a lado.

## Limpar

```bash
docker compose -f scripts/ambiente-local/docker-compose.yml down -v
```

O que não é imitado: Storage (assinaturas digitalizadas), troca de senha real, e-mails. Nada daqui vai para produção.
