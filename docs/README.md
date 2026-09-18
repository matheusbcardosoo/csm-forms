# Secretaria Digital — documentação de planejamento

Branch `feat/secretaria-digital`. Planejamento da evolução do `csm-forms` de central de formulários para sistema de gestão da secretaria, com importação de notas do Activesoft e emissão de histórico escolar.

Colégio São Marcos — Mogi das Cruzes/SP, rede particular, sob a Diretoria de Ensino — Região de Mogi das Cruzes (SEDUC-SP).

| Documento | O que responde |
|---|---|
| [01-requisitos.md](01-requisitos.md) | O que o sistema precisa fazer, para quem, e o que fica de fora |
| [02-arquitetura.md](02-arquitetura.md) | Como é construído: stack, modelo de dados, RLS, fases |
| [03-integracao-activesoft.md](03-integracao-activesoft.md) | Contrato do adaptador, fluxo de importação, tratamento de divergências |
| [04-telas-e-navegacao.md](04-telas-e-navegacao.md) | Mapa de rotas, telas, componentes |
| [05-modelo-historico.md](05-modelo-historico.md) | Anatomia campo a campo do histórico real — o que o gerador tem de reproduzir |
| [06-versionamento-curricular.md](06-versionamento-curricular.md) | Como a estrutura curricular é versionada para que o histórico de 2019 saia com os nomes de 2019 |
| [modelos/JULIA_TEMPLATE.pdf](modelos/JULIA_TEMPLATE.pdf) | Modelo real em uso (EM Bilíngue, aluno anonimizado) |
| [mockups/painel-secretaria.html](mockups/painel-secretaria.html) | Protótipo navegável das telas — abrir no navegador |

## Estado

Planejamento para validação. Nenhum código de implementação foi escrito.

## Pendências que bloqueiam fases

| Pendência | Bloqueia | Responsável |
|---|---|---|
| Documentação da API do Activesoft | Fase 3 (integração) | Matheus |
| **Desde que ano o colégio ainda emite histórico, e quantos currículos distintos existiram?** Dimensiona a carga inicial de versões curriculares | Fase 2 | Secretaria do colégio |
| Modelo de **transferência** (aluno não concluinte) — só temos o de conclusão | Fase 5 | Secretaria do colégio |
| Nome de componente que muda no meio do curso: imprime só o mais recente? | Fase 5 | Diretoria de Ensino |
| Até que ano letivo o Activesoft retroage | Escopo do histórico de alunos antigos | Matheus |
| (Opcional) Acesso à API NCA da SED para rede particular — chamado no Portal de Atendimento | Nada; RF-INT-12 é *Could* | Matheus |

**Resolvido em 18/09/2026**

- A numeração externa é o número de publicação da SED, rótulo **"Registro / Visto Confere"**. Não tem API — campo manual (`03-integracao-activesoft.md` §9).
- **O documento sai da secretaria do colégio**, não da SED. A fase 5 vale integralmente.
- O modelo real está especificado em `05-modelo-historico.md`. Ele corrigiu três pontos do modelo de dados — ver a nota no §3.2 de `02-arquitetura.md`.

As fases 1 (configuração da instituição) e 2 (cadastros base) não dependem de nenhuma dessas pendências e podem começar imediatamente.
