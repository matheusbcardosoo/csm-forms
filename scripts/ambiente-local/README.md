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
2. O relatório mostra os códigos do mock (`LP`, `MAT`, `PROJ-VD`, `EM1`…) **casados automaticamente** por nome idêntico ao do cadastro — a lista aparece no topo do relatório e dá para trocar qualquer um em **Mapeamentos**.
3. Importe em modo efetivo: alunos, matrículas e notas entram de uma vez (184 registros no mock). Rode de novo: `criados = 0` (idempotência).
4. Repita para **2023** e **2024** — assim um aluno fica com as três séries e dá para gerar um histórico de conclusão.
5. Abra um aluno › Notas, edite uma célula (pede motivo) e veja em **Histórico de alterações**.
6. Ficha do aluno › **Gerar histórico** › conclusão do Ensino Médio → preencha o número da SED → conferir → emitir → baixar PDF → 2ª via.
7. Depois de emitir, o rodapé do documento traz o **QR de verificação**. Abra o endereço que aparece ao lado dele (ou o botão **Copiar** no cartão "Verificação de autenticidade") e confira: a página pública mostra registro, data e o nome do aluno abreviado. Cancele o documento e recarregue — a mesma página passa a dizer *cancelado*. Um código de rascunho responde 404 de propósito.
   > O QR só é impresso se `APP_BASE_URL` estiver definida (ex.: `APP_BASE_URL=http://localhost:3000`) — sem ela o código apontaria para lugar nenhum.
8. Para forçar uma divergência, altere `valor_importado` de uma nota no banco e reimporte: ela aparece no relatório com os dois valores lado a lado.
9. **Históricos › Gerar em lote** › ano **2025**, série **3ª série**, tipo **conclusão do Ensino Médio** › *Conferir turma*: dos 4 alunos do mock, 2 saem prontos e 2 bloqueados (um sem município de nascimento, outro sem RA) — é a conferência real, a mesma da emissão individual. Crie os rascunhos, tente emitir **sem** o número da SED (os dois falham e continuam rascunho, de propósito), preencha os números e emita. O ZIP sai em *Baixar PDF(s)*.
10. **Relatórios** › as três abas (documentos emitidos, importações, divergências em aberto) com o período do mês; o botão **Baixar CSV** entrega um arquivo `;` com BOM, que o Excel brasileiro abre com dois cliques.
11. **Importação › Importação agendada**: ligue, escolha horário e dias, salve. Para ver funcionando sem esperar a madrugada, use **Rodar agora** — ou ponha o horário no minuto seguinte (o relógio confere a cada 30s, no fuso de São Paulo).
12. Para ver o fluxo de pendência de mapeamento (o caso ambíguo), crie um segundo curso com séries de mesmo nome: as séries do mock passam a empatar, viram pendência, e o botão **Aceitar sugestões e importar de novo** resolve.

> A lista de alunos é filtrada pelo **ano letivo do topo**. Importou 2025 e o seletor está em 2026? A tela diz isso e oferece o atalho para o ano certo — não é lista vazia por engano.

> **Criou tabela nova (migration nova)?** O PostgREST local cacheia o schema quando sobe, e uma tabela criada depois responde 404 até ele recarregar:
>
> ```bash
> docker compose -f scripts/ambiente-local/docker-compose.yml restart rest
> ```
>
> No Supabase de verdade isso não acontece — lá o cache recarrega sozinho depois do DDL.

## Limpar

```bash
docker compose -f scripts/ambiente-local/docker-compose.yml down -v
```

O que não é imitado: Storage (assinaturas digitalizadas e **o PDF guardado do histórico emitido** — o download funciona, só regera a cada vez em vez de servir o arquivo do bucket), troca de senha real, e-mails. Nada daqui vai para produção.
