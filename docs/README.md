# Secretaria Digital — documentação de planejamento

Branch `feat/secretaria-digital`. Planejamento da evolução do `csm-forms` de central de formulários para sistema de gestão da secretaria, com importação de notas do Activesoft e emissão de histórico escolar.

Colégio São Marcos — Mogi das Cruzes/SP, rede particular, sob a Diretoria de Ensino — Região de Mogi das Cruzes (SEDUC-SP).

| Documento | O que responde |
|---|---|
| [01-requisitos.md](01-requisitos.md) | O que o sistema precisa fazer, para quem, e o que fica de fora |
| [02-arquitetura.md](02-arquitetura.md) | Como é construído: stack, modelo de dados, RLS, fases |
| [03-integracao-activesoft.md](03-integracao-activesoft.md) | Contrato do adaptador, fluxo de importação, tratamento de divergências |
| [04-telas-e-navegacao.md](04-telas-e-navegacao.md) | Mapa de rotas, telas, componentes |
| [mockups/painel-secretaria.html](mockups/painel-secretaria.html) | Protótipo navegável das telas — abrir no navegador |

## Estado

Planejamento para validação. Nenhum código de implementação foi escrito.

## Pendências que bloqueiam fases

| Pendência | Bloqueia | Responsável |
|---|---|---|
| **O histórico oficial hoje sai da SED ou não?** Define a natureza da fase 5 — ver `01-requisitos.md` §5 | Fase 5 | Secretaria do colégio |
| Documentação da API do Activesoft | Fase 3 (integração) | Matheus |
| Modelo de histórico validado com a supervisão da DE de Mogi das Cruzes | Fase 5 | Colégio |
| Até que ano letivo o Activesoft retroage | Escopo do histórico de alunos antigos | Matheus |
| (Opcional) Acesso à API NCA da SED para rede particular — chamado no Portal de Atendimento | Nada; RF-INT-12 é *Could* | Matheus |

**Resolvido em 18/09/2026:** a numeração de registro externa é o **GDAE**, obrigatório só para concluintes de EF e EM. Não tem API — é campo manual, copiado da SED. Detalhes em `03-integracao-activesoft.md` §9.

As fases 1 (configuração da instituição) e 2 (cadastros base) não dependem de nenhuma dessas pendências e podem começar imediatamente.
