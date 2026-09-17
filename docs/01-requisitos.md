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

O `csm-forms` hoje é uma central de formulários: coleta visitas e requerimentos de avaliação substitutiva, guarda no Supabase e gera PDF via Puppeteer.

Este documento define a evolução para **Secretaria Digital**: um sistema de gestão para a secretaria do colégio, cujo objetivo central é **importar as notas do Activesoft e emitir históricos escolares**, com pré-visualização e edição antes da geração do PDF.

**O que NÃO está no escopo:** matrículas, financeiro, portal do aluno/responsável, diário de classe, lançamento primário de notas. O Activesoft continua sendo o sistema acadêmico da escola — a Secretaria Digital é a camada de **documentação escolar**.

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
| RF-BASE-03 | **Matriz curricular** por ano letivo + série: quais disciplinas, carga horária de cada uma, ordem de exibição no histórico | Must |
| RF-BASE-04 | Cadastro de estabelecimentos de ensino externos (para anos cursados em outra escola) | Must |
| RF-BASE-05 | Cópia de matriz curricular de um ano letivo para o seguinte | Should |
| RF-BASE-06 | Cadastro do sistema de avaliação por etapa: nota numérica (0–10, 0–100) ou conceito (A/B/C, MB/B/S/I), média de aprovação | Must |

> **Por que a matriz é obrigatória:** o histórico escolar precisa da carga horária de cada disciplina em cada série. O Activesoft pode não expor esse dado no mesmo formato exigido pelo documento — a matriz local é a fonte da carga horária impressa.

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
| RF-INT-08 | Mapeamento de códigos: disciplina/série do Activesoft ↔ cadastro local, editável na interface | Must |
| RF-INT-09 | Importação alternativa por upload de arquivo (CSV/XLSX), usando o mesmo pipeline de validação | Should |
| RF-INT-10 | Importação agendada (ex.: diária ao fim do ano letivo) | Could |
| RF-INT-11 | Simulação ("dry run"): mostra o que seria importado sem gravar | Should |

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
| RF-HIST-13 | Geração em lote para uma turma inteira (ex.: concluintes do 9º ano) | Could |
| RF-HIST-14 | QR code / código de verificação de autenticidade do documento | Could |

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

O histórico escolar tem itens obrigatórios definidos pela legislação educacional. O gerador deve produzir, no mínimo:

**Cabeçalho** — identificação da instituição e do órgão regional, ato de criação da unidade (por extenso), ato de autorização do curso (por extenso), endereço completo, telefones e e-mail.

**Identificação do aluno** — nome completo, RG/RNE e/ou RA, data, município, estado e país de nascimento, filiação.

**Trajetória escolar** — legislação de base, matriz curricular, anos/séries cursados com notas e carga horária por disciplina.

**Estudos realizados** — para cada série: ano civil, estabelecimento de ensino, município/UF.

**Observações** — informações pertinentes com citação da base legal.

**Certificação** — para concluintes, declaração de conclusão assinada pela direção.

**Rodapé** — data de emissão, nome completo, RG e cargo de quem assina, carimbo e assinatura.

**Verso** — informação de transferência quando aplicável.

> ⚠️ **Validar antes de implementar:** as exigências específicas variam por Estado e por rede. Antes de fechar o template, confirmar com a Secretaria/Diretoria de Ensino local qual o modelo aceito e se há numeração de registro externa obrigatória (equivalente ao GDAE paulista).

---

## 6. Fora de escopo

Matrículas e rematrículas · financeiro/mensalidades · portal do responsável · diário de classe e lançamento primário de notas · frequência diária · comunicados/agenda · biblioteca · substituição do Activesoft.

---

## 7. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| API do Activesoft não expõe carga horária ou situação final | Alto | Matriz curricular local como fonte da carga horária; situação final editável |
| API sem paginação ou com limite baixo de requisições | Médio | Importação por lote com fila e retomada; log de progresso |
| Modelo de histórico aceito pelo órgão regional difere do implementado | Alto | Template configurável e validação do modelo com a Diretoria de Ensino **antes** da fase 5 |
| Dados históricos anteriores ao Activesoft (papel/planilha) | Médio | Lançamento manual de anos anteriores (RF-ALU-07) + importação por arquivo (RF-INT-09) |
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
