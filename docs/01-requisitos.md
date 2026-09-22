# Secretaria Digital — Colégio São Marcos
## Documento de Requisitos

| | |
|---|---|
| **Versão** | 0.1 (rascunho para validação) |
| **Data** | 2026-09-17 |
| **Branch** | `feat/secretaria-digital` |
| **Substitui** | Nada — amplia o escopo do projeto `csm-forms` |

---

## 1. Contexto e objetivo

**Jurisdição:** o Colégio São Marcos fica em Mogi das Cruzes/SP, rede particular, sob supervisão da **Diretoria de Ensino — Região de Mogi das Cruzes** (SEDUC-SP). Todo o modelo de documento e a nomenclatura deste projeto seguem as normas paulistas.

O `csm-forms` hoje é uma central de formulários: coleta visitas e requerimentos de avaliação substitutiva, guarda no Supabase e gera PDF via Puppeteer.

Este documento define a evolução para **Secretaria Digital**: um sistema de gestão para a secretaria do colégio, cujo objetivo central é **importar as notas do Activesoft e emitir históricos escolares**, com pré-visualização e edição antes da geração do PDF.

**O que NÃO está no escopo:** matrículas, financeiro, portal do aluno/responsável, diário de classe, lançamento primário de notas. O Activesoft continua sendo o sistema acadêmico da escola — a Secretaria Digital é a camada de **documentação escolar**.

**Fronteira da v1: o cenário atual.** A v1 atende alunos cuja trajetória está no Activesoft. O colégio emite histórico de quem estudou lá nos últimos 49 anos, mas o acervo anterior ao Activesoft (registro em papel) é **feature própria, diferida** — ver [07-acervo-antigo-diferido.md](07-acervo-antigo-diferido.md). A v1 inclui a guarda que torna isso seguro: pedido sem currículo cadastrado para o período **bloqueia a emissão** (RF-VER-11) em vez de sair com a grade errada.

### Objetivos mensuráveis

| # | Objetivo | Como medir |
|---|---|---|
| O1 | Eliminar a digitação manual de notas na emissão de histórico | ≥ 95% das notas de um histórico vindas de importação |
| O2 | Reduzir o tempo de emissão de um histórico | De "horas/dias" para < 10 minutos por aluno |
| O3 | Garantir rastreabilidade | 100% das edições manuais com autor, data e valor anterior registrados |
| O4 | Padronizar os dados legais da instituição | Dados do cabeçalho e atos legais vindos de um cadastro único, nunca digitados no documento |

---

## 2. Personas e permissões

| Perfil | Quem é | O que pode fazer |
|---|---|---|
| **Administrador** | Direção / TI | Tudo, incluindo configuração da instituição, atos legais, signatários e gestão de usuários |
| **Secretaria** | Secretário(a) escolar e auxiliares | Importar, editar notas, gerar e emitir históricos, ver formulários |
| **Coordenação** | Coordenadores de segmento | Consultar alunos, notas e históricos; **não** emite documento nem edita nota |
| **Leitura** | Estagiário / auditoria | Somente consulta |

> A tabela `staff_emails` atual vira `usuario_perfil`, ganhando a coluna `papel`. Quem já está cadastrado é migrado como `secretaria`.

---

## 3. Requisitos funcionais

### 3.1 Configuração da instituição (RF-INST)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-INST-01 | Cadastro único dos dados da instituição: razão social, nome fantasia, CNPJ, código INEP, endereço completo, telefones, e-mail, site | Must |
| RF-INST-02 | Cadastro da entidade mantenedora (nome, CNPJ) | Must |
| RF-INST-03 | Cadastro do órgão regional de ensino (Diretoria/Secretaria de Educação a que se vincula) | Must |
| RF-INST-04 | Cadastro de **atos legais por etapa de ensino** (criação, autorização de funcionamento, reconhecimento, renovação): número, órgão emissor, data, veículo e data de publicação | Must |
| RF-INST-05 | Cadastro de **signatários**: nome, cargo, RG, nº de registro/autorização do secretário escolar, assinatura digitalizada (imagem), status ativo | Must |
| RF-INST-06 | Upload de logotipo e brasão usados no cabeçalho dos documentos | Must |
| RF-INST-07 | Pré-visualização do cabeçalho do documento com os dados salvos, sem precisar gerar um histórico | Should |
| RF-INST-08 | Cadastro de anos letivos (ano, início, fim, dias letivos, situação aberto/encerrado) | Must |
| RF-INST-09 | Suporte a múltiplas unidades/mantidas sob a mesma mantenedora | Could |

### 3.2 Cadastros acadêmicos base (RF-BASE)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-BASE-01 | Catálogo de séries/anos por etapa (Educação Infantil, EF anos iniciais, EF anos finais, Ensino Médio) | Must |
| RF-BASE-02 | Catálogo de disciplinas, com área de conhecimento (BNCC) e natureza (base comum / parte diversificada / itinerário formativo) | Must |
| RF-BASE-03 | **Estrutura curricular versionada** por curso: quais componentes, em qual agrupamento, em qual ordem, por série — ver [06-versionamento-curricular.md](06-versionamento-curricular.md) para o bloco RF-VER completo | Must |
| RF-BASE-04 | Cadastro de estabelecimentos de ensino externos (para anos cursados em outra escola) | Must |
| RF-BASE-05 | Duplicar uma versão curricular para criar a seguinte, herdando itens e mapeamentos | Must |
| RF-BASE-06 | Cadastro do sistema de avaliação por curso: nota numérica (0–10, 0–100) ou conceito, média de aprovação e frequência mínima | Must |
| RF-BASE-07 | Cadastro de **cursos** (ex.: "Ensino Médio Bilíngue"), distinto da etapa — é o curso que nomeia o documento | Must |
| RF-BASE-08 | Cadastro da hierarquia curricular de três níveis: bloco → agrupamento → componente, tudo configurável | Must |
| RF-BASE-09 | Cadastro dos **totais anuais de aulas e de horas** por série e ano letivo, com razão aula/hora por curso | Must |

> **Por que a estrutura é versionada:** o histórico é retrospectivo. Um aluno de 2019 recebe hoje um documento com os nomes de 2019 — uma reforma educacional não pode reescrever o passado. Versão em uso é somente leitura; mudança gera versão nova. Detalhes em [06-versionamento-curricular.md](06-versionamento-curricular.md).
>
> A carga horária por componente **não** é impressa no modelo do Ensino Médio; o documento imprime os totais anuais de aulas e horas (RF-BASE-09). Segundo a secretaria, o layout é o mesmo para todos os segmentos.

### 3.3 Integração com o Activesoft (RF-INT)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-INT-01 | Importar alunos (dados cadastrais e documentos de identificação) | Must |
| RF-INT-02 | Importar matrículas (aluno × ano letivo × série × turma × situação final) | Must |
| RF-INT-03 | Importar notas finais e faltas por disciplina | Must |
| RF-INT-04 | Importação sob demanda, por ano letivo / série / turma / aluno | Must |
| RF-INT-05 | **Cópia local editável**: o dado importado é persistido no Supabase e pode ser corrigido sem alterar o Activesoft | Must |
| RF-INT-06 | Reimportação não sobrescreve silenciosamente valor editado à mão — mostra a divergência e pede decisão | Must |
| RF-INT-07 | Log de importação: quem executou, quando, quantos registros lidos/criados/atualizados/ignorados, erros e divergências | Must |
| RF-INT-08 | Mapeamento de códigos do Activesoft ↔ itens da versão curricular, editável na interface, herdado ao duplicar a versão. Código cujo destino é inequívoco (nome idêntico, ou muito parecido e isolado) é casado automaticamente na importação e fica marcado como tal; o ambíguo vira pendência, com aceite em lote das sugestões — ver `03-integracao-activesoft.md` §5 | Must |
| RF-INT-09 | Importação alternativa por upload de arquivo (CSV/XLSX), usando o mesmo pipeline de validação | Should |
| RF-INT-10 | Importação agendada (ex.: diária ao fim do ano letivo). Relógio no próprio processo, horário de São Paulo, sempre em modo efetivo e do ano corrente; a trava contra execução dupla é um `update` condicional no banco, então mais de uma réplica não importa. Código ambíguo continua virando pendência — escolher destino não vira decisão automática de madrugada | Could |
| RF-INT-11 | Simulação ("dry run"): mostra o que seria importado sem gravar | Should |
| RF-INT-12 | Consulta de RA e ficha do aluno na **API NCA da SED**, como fonte secundária para completar dados cadastrais faltantes (naturalidade, documentos) | Could |

> **Dependência aberta:** a documentação da API do Activesoft ainda não foi analisada. Toda a integração é especificada contra um **contrato canônico interno** (ver `03-integracao-activesoft.md`), com um adaptador isolando o formato real da API. Se a API não expuser algum campo, ele cai no fluxo de preenchimento manual sem afetar o resto do sistema.

### 3.4 Alunos e notas (RF-ALU)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-ALU-01 | Lista de alunos com busca por nome, código, turma, ano letivo e situação | Must |
| RF-ALU-02 | Ficha do aluno: dados pessoais, documentos, filiação, naturalidade, trajetória escolar completa | Must |
| RF-ALU-03 | Edição dos dados cadastrais do aluno (correção de grafia, acentuação, documentos faltantes) | Must |
| RF-ALU-04 | Grade de notas por matrícula, editável célula a célula | Must |
| RF-ALU-05 | Toda edição de nota registra autor, data, valor anterior e motivo | Must |
| RF-ALU-06 | Indicação visual clara de campo editado à mão vs. importado | Must |
| RF-ALU-07 | Lançamento manual de anos cursados em outra escola (série, ano, estabelecimento, município/UF, notas) | Must |
| RF-ALU-08 | Validação automática antes da emissão: disciplina sem nota, série faltando na trajetória, carga horária zerada, dado obrigatório do aluno ausente | Must |
| RF-ALU-09 | Anexar documentos ao aluno (certidão, RG, histórico de origem digitalizado) | Should |

### 3.5 Histórico escolar (RF-HIST)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-HIST-01 | Gerar histórico nos tipos: **transferência**, **conclusão do Ensino Fundamental**, **conclusão do Ensino Médio**, **histórico parcial/declaração** | Must |
| RF-HIST-02 | **Pré-visualização fiel antes do PDF** — a tela mostra o documento paginado exatamente como sairá impresso | Must |
| RF-HIST-03 | Edição na pré-visualização: observações, campos do aluno, notas, carga horária, ordem das disciplinas, signatário | Must |
| RF-HIST-04 | Campo de observações com base legal, com textos-padrão reutilizáveis | Must |
| RF-HIST-05 | Estados do documento: `rascunho` → `conferido` → `emitido` (→ `cancelado`) | Must |
| RF-HIST-06 | Ao emitir, o documento congela um **snapshot** dos dados — alterações posteriores em notas não modificam o histórico já emitido | Must |
| RF-HIST-07 | Numeração de registro do documento (nº, livro, folha), com controle de sequência | Must |
| RF-HIST-08 | PDF final com cabeçalho institucional, brasão, dados legais, assinatura do diretor e do secretário | Must |
| RF-HIST-09 | Verso do documento com legislação, legenda do sistema de avaliação e observações de transferência | Must |
| RF-HIST-10 | Reemissão de 2ª via, marcada como tal, mantendo o registro original | Must |
| RF-HIST-11 | Histórico de alterações do documento (quem gerou, quem conferiu, quem emitiu, quando) | Must |
| RF-HIST-12 | Lista de documentos emitidos, filtrável por aluno, tipo, período e status | Must |
| RF-HIST-13 | Geração em lote para uma turma inteira (ex.: concluintes do 9º ano). A conferência roda por aluno **antes** de qualquer coisa ser criada, agrupada por motivo; a emissão é documento a documento, pela mesma função do banco, porque número de registro consumido não volta — quem falha continua rascunho. Download dos PDFs em ZIP | Could |
| RF-HIST-14 | QR code / código de verificação de autenticidade do documento. O QR sai no rodapé e leva a uma página pública que confirma o documento sem expor o aluno — nome abreviado, sem nota, CPF ou nascimento. O código é aleatório, não o número de registro, para que ninguém possa varrer os documentos emitidos; e identifica a **via impressa**, então a 2ª via tem o seu | Could |
| RF-HIST-15 | Campo de **número de publicação da SED** ("Registro / Visto Confere") nos históricos de conclusão, preenchido manualmente, com bloqueio de emissão enquanto vazio | Must |
| RF-HIST-16 | Bloco **Certificado** com texto-modelo interpolado, presente só em histórico de conclusão e omitido em transferência | Must |
| RF-HIST-17 | Grade renderizada como união das matrizes das séries envolvidas, casadas por (agrupamento, componente), com `-` onde o componente não foi cursado | Must |

### 3.6 Formulários existentes (RF-FORM)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-FORM-01 | Formulário de visitas mantém comportamento atual (wizard público, PDF, envio ao n8n) | Must |
| RF-FORM-02 | Formulário de avaliação substitutiva mantém comportamento atual, incluindo anexos | Must |
| RF-FORM-03 | Modelos em branco para impressão continuam disponíveis | Must |
| RF-FORM-04 | Tela de respostas passa a ser um módulo dentro do painel, sem perder funcionalidade (PDF, anexos, envio manual por WhatsApp) | Must |
| RF-FORM-05 | Ligar uma resposta de visita a um aluno cadastrado, quando a visita virar matrícula | Could |

---

## 4. Requisitos não-funcionais

| ID | Requisito |
|---|---|
| RNF-01 | **Dados pessoais de menores.** O sistema passa a tratar dado sensível de criança e adolescente. Acesso restrito por papel, RLS no banco, trilha de auditoria em leitura de ficha completa e em toda edição |
| RNF-02 | **Retenção.** Histórico escolar é documento de guarda permanente. Nenhuma exclusão física de aluno, matrícula, nota ou documento emitido — apenas inativação lógica |
| RNF-03 | **Idempotência da importação.** Executar a mesma importação duas vezes não duplica registros |
| RNF-04 | **Fidelidade da pré-visualização.** A tela de pré-visualização e o PDF usam o mesmo template — não podem divergir |
| RNF-05 | **Disponibilidade.** Falha ou indisponibilidade da API do Activesoft não impede consultar, editar ou emitir histórico a partir dos dados já importados |
| RNF-06 | **Desempenho.** Lista de alunos e grade de notas respondem em < 1s para 3.000 alunos; PDF de histórico em < 8s |
| RNF-07 | **Credenciais.** Chaves do Activesoft e `service_role` do Supabase nunca chegam ao navegador |
| RNF-08 | **Idioma.** Interface e documentos em português do Brasil |
| RNF-09 | **Responsivo.** Painel usável em notebook (uso principal) e tablet; formulários públicos continuam mobile-first |
| RNF-10 | **Acessibilidade.** Contraste AA, navegação por teclado na grade de notas, rótulos associados |

---

## 5. Conformidade do documento

O modelo real em uso está especificado campo a campo em **[05-modelo-historico.md](05-modelo-historico.md)**, derivado de `docs/modelos/JULIA_TEMPLATE.pdf` (Ensino Médio Bilíngue, concluinte de 2025). É esse layout que o gerador reproduz — não o modelo genérico da SEDUC.

**Questão da fase 5: resolvida.** O documento sai da secretaria do colégio. Da SED vem apenas o **número de publicação** (rótulo impresso: "Registro / Visto Confere"), copiado à mão pela secretaria. A fase 5 vale integralmente.

Resumo do que o documento tem:

| Página | Blocos |
|---|---|
| 1 | Cabeçalho institucional (nome, mantenedora, atos legais com DOE, Diretoria de Ensino) · título com o **curso** · identificação do aluno (nome, nascimento, naturalidade, nacionalidade, CIN/CPF) · grade de aproveitamento em três níveis · totais anuais de aulas e horas · tabela de estabelecimentos |
| 2 | Observações · **Certificado** (só em conclusão) · assinaturas de secretário e diretor com RG · número de publicação da SED · rodapé "não contém emendas ou rasuras" |

Três achados do modelo real que mudaram o plano:

1. **Agrupamento curricular é cadastro, não enum.** "Ensino Bilíngue", "Ciclo Integrador" e "Eletivas" convivem com as áreas da BNCC no mesmo nível da grade.
2. **A nota pertence a uma linha da matriz, não a uma disciplina.** O mesmo componente aparece em dois agrupamentos com notas diferentes no mesmo histórico.
3. **Não há carga horária por componente** — só os totais anuais de aulas e de horas. Isso simplifica a matriz curricular em relação ao que estava planejado.

Pendências específicas do modelo estão listadas no §4 de `05-modelo-historico.md`.

## 6. Fora de escopo

Matrículas e rematrículas · financeiro/mensalidades · portal do responsável · diário de classe e lançamento primário de notas · frequência diária · comunicados/agenda · biblioteca · substituição do Activesoft.

---

## 7. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| API do Activesoft não expõe carga horária ou situação final | Alto | Matriz curricular local como fonte da carga horária; situação final editável |
| API sem paginação ou com limite baixo de requisições | Médio | Importação por lote com fila e retomada; log de progresso |
| Modelo de histórico aceito pela DE de Mogi das Cruzes difere do implementado | Alto | Template configurável e validação do modelo com a supervisão da DE **antes** da fase 5 |
| A SED já é o emissor oficial do histórico e este sistema duplica trabalho | Alto | Confirmar com a secretaria antes da fase 5 (ver seção 5). Se for o caso, a fase 5 vira "documento de trabalho + conferência" e o esforço migra para as fases 3 e 4 |
| Acesso à API NCA da SED negado para rede particular | Baixo | RF-INT-12 é *Could* — nada depende dele. Dados cadastrais faltantes seguem por preenchimento manual |
| Dados históricos anteriores ao Activesoft (papel/planilha) | Médio | Lançamento manual de anos anteriores (RF-ALU-07) + importação por arquivo (RF-INT-09) |
| Currículo antigo não cadastrado: histórico sai com nomes de componentes errados | Alto | RF-VER-11 bloqueia a emissão e manda cadastrar a versão daquele período. Nunca sai documento silenciosamente errado |
| Pedido de histórico anterior ao Activesoft chegar antes da feature existir | Médio | RF-VER-11 bloqueia a emissão com mensagem clara em vez de gerar documento errado. O acervo antigo é feature própria — ver [07-acervo-antigo-diferido.md](07-acervo-antigo-diferido.md) |
| Migração para React quebrando formulários públicos em produção | Médio | Migração por fase, formulários públicos por último, com a versão EJS mantida até validação |
| Divergência entre nota do Activesoft e nota impressa no documento | Alto | Snapshot na emissão + auditoria de edição + relatório de divergências na reimportação |

---

## 8. Critérios de aceite da entrega

1. Secretaria configura a instituição uma vez e nunca mais digita dado institucional em documento.
2. Importa as notas de uma turma do Activesoft em uma ação e vê o relatório do que entrou.
3. Abre a ficha de um aluno e vê a trajetória escolar completa, com origem de cada nota.
4. Corrige uma nota e o sistema registra quem, quando e qual era o valor anterior.
5. Gera a pré-visualização do histórico, edita as observações e o PDF sai idêntico ao que viu na tela.
6. Emite o documento, ele recebe número de registro e fica congelado.
7. Os formulários de visita e avaliação substitutiva continuam funcionando exatamente como hoje.
