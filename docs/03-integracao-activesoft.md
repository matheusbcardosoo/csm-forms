# Integração com o Activesoft

> **Status: API analisada e adaptador implementado** (19/09/2026). A UI de documentação (`/docs/`) exige login, mas o schema OpenAPI é servido sem autenticação em `/docs/?format=openapi` — foi assim que o §8 foi respondido. Este documento define o **contrato canônico interno** — o formato que o resto do sistema consome; `server/adapters/activesoft/cliente.ts` traduz a API real para este contrato.

## 1. Princípio

```
API Activesoft  →  adapters/activesoft/cliente.ts     (HTTP, auth, paginação, retry)
                →  adapters/activesoft/mapeamento.ts  (formato deles → contrato canônico)
                →  contrato canônico
                →  servicos/importacao                (validação, diff, persistência)
                →  Supabase
```

Nenhum serviço, rota ou componente fora de `adapters/` conhece um nome de campo do Activesoft.

O mesmo contrato é alimentado por um adaptador de arquivo (CSV/XLSX) — é o que garante o plano B se a API não cobrir tudo.

## 2. Contrato canônico

```ts
// shared/types/importacao.ts

export interface AlunoOrigem {
  codigoOrigem: string;          // identificador no Activesoft — chave de correlação
  nome: string;
  nomeSocial?: string;
  dataNascimento?: string;       // ISO 8601
  municipioNascimento?: string;
  ufNascimento?: string;
  paisNascimento?: string;
  nacionalidade?: string;
  sexo?: 'M' | 'F' | 'outro';
  rg?: string; rgOrgao?: string; rgUf?: string;
  cpf?: string;
  ra?: string;
  certidao?: { tipo?: string; termo?: string; livro?: string; folha?: string };
  filiacao1?: string;
  filiacao2?: string;
  situacao?: string;             // texto cru; traduzido via mapeamento_activesoft
}

export interface MatriculaOrigem {
  codigoOrigem: string;
  alunoCodigoOrigem: string;
  anoLetivo: number;
  serieCodigoOrigem: string;
  serieDescricao?: string;
  turma?: string;
  numeroMatricula?: string;
  dataMatricula?: string;
  dataSaida?: string;
  situacaoFinal?: string;        // texto cru
  cargaHorariaTotal?: number;
}

export interface NotaOrigem {
  matriculaCodigoOrigem: string;
  disciplinaCodigoOrigem: string;
  disciplinaDescricao?: string;
  valor?: number;                // nota final
  conceito?: string;             // alternativa à nota (EI / anos iniciais)
  cargaHoraria?: number;
  faltas?: number;
  situacao?: string;             // texto cru
}

export interface ResultadoBusca<T> {
  itens: T[];
  paginaAtual: number;
  totalPaginas?: number;
  totalItens?: number;
}
```

## 3. Interface do adaptador

```ts
// adapters/activesoft/tipos.ts

export interface FiltroImportacao {
  anoLetivo: number;
  serieCodigoOrigem?: string;
  turma?: string;
  alunoCodigoOrigem?: string;
  atualizadosApos?: string;      // se a API suportar delta
}

export interface AdaptadorAcademico {
  nome: string;
  testarConexao(): Promise<{ ok: boolean; detalhe?: string }>;
  buscarAlunos(f: FiltroImportacao, pagina?: number): Promise<ResultadoBusca<AlunoOrigem>>;
  buscarMatriculas(f: FiltroImportacao, pagina?: number): Promise<ResultadoBusca<MatriculaOrigem>>;
  buscarNotas(f: FiltroImportacao, pagina?: number): Promise<ResultadoBusca<NotaOrigem>>;
  capacidades(): Capacidades;
}

export interface Capacidades {
  delta: boolean;            // suporta "atualizados após X"
  cargaHoraria: boolean;     // devolve carga horária por disciplina
  situacaoFinal: boolean;    // devolve situação final da matrícula
  faltas: boolean;
  documentosAluno: boolean;  // RG, certidão, naturalidade
  paginacao: boolean;
  limiteRequisicoes?: number;
}
```

`capacidades()` é o que a interface usa para avisar a secretaria: *"a API não devolve carga horária — o histórico vai usar a matriz curricular local"*. Sem isso, o dado some silenciosamente do documento.

Implementações previstas: `ActivesoftApi`, `ArquivoCsv`, `Mock` (fixtures para desenvolvimento e teste sem credenciais).

## 4. Fluxo de importação

```
1. Secretaria escolhe: ano letivo, série/turma opcional, tipo, modo (simulação | efetiva)
2. Cria registro em `importacao` com status=executando
3. Adaptador busca, paginando
4. Para cada item:
      correlaciona por codigo_activesoft
      ├─ não existe         → CRIAR
      ├─ existe, sem edição → ATUALIZAR
      ├─ existe, editado, valor da origem == valor_importado  → IGNORAR (só a origem não mudou)
      └─ existe, editado, valor da origem != valor_importado  → DIVERGÊNCIA
5. Código sem mapeamento confirmado → tenta casar por nome (§5); sem casamento inequívoco, vira pendência e a nota não é gravada
6. Modo simulação: nada é gravado, só o relatório
7. Conclui: contadores, divergências e pendências no log
8. Secretaria resolve cada divergência: manter local | aceitar origem | ignorar
```

### Ordem que importa: currículo antes de tudo

A matrícula congela a versão curricular **na inserção** (`06-versionamento-curricular.md` §2.4). Importar antes de haver currículo publicado para o período cria matrícula sem grade — e sem grade não existe onde encaixar nota, então nenhuma nota entra e nenhum código de disciplina chega a virar mapeamento. O sintoma é "importação com erros e sem mapeamentos", e o relatório diz isso no topo, com o caminho para Currículos.

Como o trigger só resolve a versão na inserção, a reimportação **repara** matrículas que ficaram sem versão: se agora existe vigência para (ano letivo, série), a importação liga a matrícula a ela e segue. Só preenche o que está vazio — versão já congelada nunca é trocada. Sem esse reparo, quem importasse antes de cadastrar o currículo ficaria com matrículas permanentemente sem grade, e nenhuma reimportação as consertaria.

### Regra central (RF-INT-06)

Comparar sempre com `valor_importado`, nunca com `valor`. Uma nota corrigida à mão pelo secretário não é sobrescrita por uma reimportação de rotina; se a origem também mudou, vira divergência com os dois valores lado a lado e a decisão é humana.

### Idempotência (RNF-03)

Correlação por `codigo_activesoft` em `aluno`, `(aluno, ano_letivo, serie)` em `matricula` e `(matricula, disciplina)` em `nota`, todas com `unique`. Rodar duas vezes seguidas produz `atualizados=0, criados=0`.

## 5. Mapeamento de códigos

O Activesoft usa códigos próprios para disciplina, série, turma e situação. A tabela `mapeamento_activesoft` guarda a correspondência.

Para disciplina o destino tem dois níveis, e a importação tenta nesta ordem:

| # | Destino | Alcance | Coluna |
|---|---|---|---|
| 1 | Linha da grade | só aquele currículo — é a exceção | `versao_id` + `versao_item_id` |
| 2 | **Componente** | todo curso e todo currículo, inclusive os que ainda não existem | `componente_id`, com `versao_id` nulo |

O caso normal é o 2. `componente` é a identidade sem curso e sem versão, então mapear o código uma vez basta: a importação resolve componente → linha da grade pela **versão e série da matrícula**. Isso é o que impede que a mesma lista de códigos precise ser remapeada a cada curso novo — um colégio com "Ensino Médio" e "Ensino Médio Bilíngue" mapeia `117 Language Practice - A1` uma vez, não duas. O nível 1 existe para quando um currículo específico precisa mandar o mesmo código para outro lugar.

Códigos que o casamento automático resolve entram direto como mapeamento global, desde que a linha casada tenha componente. Linha sem componente (`componente_id` nulo, "componente novo, sem antecessor") não tem identidade estável para promover e fica presa ao currículo.

Um mapeamento global cujo componente **não existe** na grade de destino vira pendência ali — resultado correto, e a mensagem diz exatamente isso: ou o componente entra naquela versão, ou aquele currículo ganha uma exceção.

Ao duplicar uma versão, as exceções cujo item foi copiado são recriadas apontando para o item novo. Códigos cujo item não sobreviveu à reforma entram como pendência, com aviso de que existiam na versão anterior. Ver `06-versionamento-curricular.md` §5.

### Casamento automático, e onde ele para

Na primeira importação todo código é novo. Exigir confirmação humana para **todos** eles trava a importação inteira antes de a primeira nota entrar — e a maioria não tem dúvida nenhuma: a origem manda "Língua Portuguesa" e o currículo tem "Língua Portuguesa". Então o pipeline resolve sozinho dois casos, e só esses:

| Situação | O que acontece |
|---|---|
| **Nome idêntico** (normalizando acento, caixa e pontuação) e único | Casa sozinho, grava o mapeamento **confirmado** com observação de que veio da máquina |
| **Muito parecido e isolado**: melhor ≥ 0.8 e o segundo colocado ≥ 0.3 atrás (`3ª Série - Ensino Médio` → `3ª série`, com o resto em 0.2) | Casa sozinho, mesma marcação |
| **Empate ou quase-empate no topo** | **Pendência.** É o colégio com "Ensino Médio" e "Ensino Médio Bilíngue", cada um com uma "1ª série": a escolha é da secretaria |
| **Nada parecido o bastante** | Pendência, com sugestão quando houver |

A regra do isolamento é o que protege: mapear série ou disciplina errado sai impresso num documento permanente. O sistema não adivinha — mas também não pergunta o óbvio. Tudo que ele casou sozinho aparece no relatório da importação e pode ser trocado em Mapeamentos.

O que sobra como pendência tem duas saídas na interface: **aceitar as sugestões em lote** (um clique, com reimportação em seguida) ou escolher destino a destino. Confirmar o mapeamento **não traz os registros sozinho** — é preciso repetir a importação, e é isso que o botão "Aceitar sugestões e importar de novo" faz de uma vez.

Notas de disciplina não mapeada não são gravadas. Aparecem como pendência no relatório, com a contagem de quantos registros ficaram de fora.

A importação resolve a versão pela matrícula (`matricula.versao_curricular_id`), nunca pela vigência do momento — reimportar notas de 2021 hoje usa o currículo de 2021.

## 6. Configuração

```env
# API Activesoft — só BASE_URL e API_KEY são usados por esta versão da API
ACTIVESOFT_BASE_URL=           # host do SIGA da escola, ex. https://siga03.activesoft.com.br
ACTIVESOFT_AUTH_TIPO=          # não usado — só existe Bearer nesta API
ACTIVESOFT_CLIENT_ID=          # não usado — token já identifica a instituição
ACTIVESOFT_CLIENT_SECRET=      # não usado
ACTIVESOFT_API_KEY=            # token Bearer da instituição
ACTIVESOFT_TENANT=             # não usado
ACTIVESOFT_TIMEOUT_MS=30000
ACTIVESOFT_PAGINA_TAMANHO=100

# Adaptador ativo: activesoft | arquivo | mock
IMPORTACAO_ADAPTADOR=mock
```

Credenciais ficam só no servidor (RNF-07). O navegador nunca vê nem o `base_url`.

## 7. Resiliência

| Situação | Comportamento |
|---|---|
| API fora do ar | Importação falha com mensagem clara; consulta e emissão continuam funcionando com o que já foi importado (RNF-05) |
| Timeout numa página | 3 tentativas com backoff exponencial; se falhar, importação para e registra onde parou, permitindo retomada |
| Limite de requisições (429) | Respeita `Retry-After`; enfileira |
| Campo obrigatório ausente | Registro entra com o campo vazio e marcação de pendência — não bloqueia os demais |
| Resposta em formato inesperado | Falha na validação de schema (Zod) com o payload registrado no log de importação |

## 8. O que a documentação da API respondeu

Analisado em 19/09/2026 a partir do schema OpenAPI (Swagger 2.0, "SigaWeb API", `version: v0`) publicado em `https://siga03.activesoft.com.br/docs/?format=openapi`. 41 endpoints; os relevantes para importação estão listados abaixo.

- [x] **URL base e ambientes** — um host por escola/shard (aqui `siga03.activesoft.com.br`); não há ambiente de homologação documentado. Caminho fixo `/api/v0/...` (o parâmetro `version` é sempre `"0"`, conforme a própria doc).
- [x] **Autenticação** — token **Bearer** único por instituição (`Authorization: Bearer <token>`), sem OAuth2/client_id/secret. O token já identifica a instituição — não existe parâmetro de tenant. Validade do token não documentada.
- [x] **Alunos** — `lista_alunos` (cadastro básico: nome, CPF, sexo, nascimento, RA, vínculos de responsável) + `lista_alunos_dados_sensiveis` (RG, naturalidade, nacionalidade, cor/raça — **exige o escopo `dados_complementares`** no token) + `lista_responsaveis` (nomes, para resolver filiação a partir dos IDs).
- [x] **Matrículas** — `enturmacao_com_detalhes` dá `situacao_aluno_turma` (texto cru), data de efetivação e a turma; `lista_turmas` dá série (`serie_codigo`, padrão MEC tipo `n11`), curso e turno.
- [x] **Notas** — `aluno_notas` (por `aluno_id` + `turma_id`): hierarquia disciplina → fase → composições, com `nota_fase` e `faltas` **por fase**. **Não há nota final anual nem campos de recuperação/conselho de classe** — o adaptador calcula a média simples das fases lançadas como rascunho (conferir na grade de notas antes de emitir histórico).
- [x] **Séries e disciplinas** — por ID numérico + descrição; disciplinas também têm `sigla`; séries também têm `serie_codigo` (código MEC estável entre anos, usado como `serieCodigoOrigem`).
- [x] **Notas por período** — por fase (bimestre/trimestre/etc., quantidade configurável pela escola), nunca só a final.
- [x] **Recuperação/conselho** — não exposto por nenhum endpoint desta versão da API.
- [x] **Paginação** — `limit`/`offset`, envelope padrão DRF (`count`/`next`/`previous`/`results`).
- [x] **Delta** — **não existe** nenhum parâmetro de filtro por data de atualização em nenhum dos 41 endpoints.
- [ ] **Limite de requisições** — não documentado; o cliente respeita `Retry-After` num 429 e faz backoff, por precaução.
- [ ] **Anos letivos disponíveis** — **não existe parâmetro de período** em `lista_turmas` nem em `enturmacao_com_detalhes`; ambos só devolvem o "ano atual" do SIGA (confirmado pela ausência do parâmetro no schema, apesar do texto da descrição mencionar filtro por período). O adaptador filtra pelo campo `sigla_periodo`; pedir um `anoLetivo` que o SIGA não esteja expondo como corrente dá zero resultados, não erro. **Vale abrir chamado com a Activesoft perguntando se há um parâmetro não documentado para anos anteriores** antes de depender disto para reimportar históricos.
- [ ] **Conceitos (Educação Infantil/anos iniciais)** — a fase tem `nota_fase_exibicao` (texto) além de `nota_fase` (número); quando não há valor numérico lançado, o adaptador usa o texto de exibição como `conceito`. Não confirmado com a Activesoft se isso cobre todos os formatos de conceito usados pela escola.

**Também em aberto, fora do escopo dos endpoints em si:**

- [ ] `nome_civil` existe em `lista_alunos_dados_sensiveis` para os casos em que `nome` é o nome social — não confirmado qual dos dois deve ir no histórico oficial. O adaptador hoje só traz `nome`; o campo `nomeSocial` do contrato fica sem preencher até essa confirmação.
- [ ] Carga horária por disciplina — não exposta (só "aulas dadas", unidade diferente); `capacidades().cargaHoraria = false`, como já era o comportamento sem a API.

---

## 9. SED / SEDUC-SP — o que cobre e o que não cobre

O colégio fica em Mogi das Cruzes/SP, então existe uma segunda API no horizonte: a da Secretaria Escolar Digital. Levantamento de 18/09/2026.

### Existe

**API NCA — Sistema Cadastro de Alunos**

| | |
|---|---|
| Produção | `https://integracaosed.educacao.sp.gov.br/ncaapi/api` |
| Homologação | `https://homologacaointegracaosed.educacao.sp.gov.br/ncaapi/api` |
| Autenticação | Bearer token obtido em `ValidarUsuario`, validade de 30 minutos |
| Formato | REST/JSON (há também uma família de serviços SOAP, mais antiga) |

Serviços relevantes: `ConsultaRA`, `ExibirFichaAluno`, `Manutencao` (altera a ficha do aluno), `IncluirTurmaClasse`, `BaixarMatricula`, gestão de responsáveis, consultas ao SIAU (legislação, assuntos).

**Uso possível aqui:** completar dado cadastral faltante — RA, naturalidade, documentos — via `ConsultaRA` + `ExibirFichaAluno`. É o RF-INT-12, prioridade *Could*: nada no sistema depende dele.

**Nunca escrever.** Ver decisão D6 em `02-arquitetura.md`.

### Não existe

- **Nenhum serviço de histórico escolar, notas ou rendimento.** O escopo da API é cadastro e matrícula.
- **Nenhum endpoint para o número de registro GDAE.** Esse número sai do fluxo de Concluintes da SED — escola cadastra → diretor ratifica → supervisor valida → dirigente de ensino publica, com carregamento duas vezes por ano. É processo humano, não recurso consultável. No nosso sistema é campo manual (RF-HIST-15).
- A consulta pública de concluintes (`sed.educacao.sp.gov.br/SedCon/ConsultaPublica/Index`) é tela, não endpoint. Serve para a secretaria conferir à mão.

### Acesso

A documentação de integração descreve o processo para **Secretarias Municipais**, com solicitação por chamado no Portal de Atendimento. Não há caminho documentado para escola particular. Vale abrir o chamado e perguntar, mas planeje assumindo que pode ser negado — é por isso que o RF-INT-12 é *Could*.

### Implicação estratégica

A SED emite histórico escolar por conta própria (`Vida Escolar > Documentos Escolares > Histórico Escolar`, com QR Code e fluxo de aprovação). Se o histórico oficial do colégio já sai de lá, a fase 5 deste projeto muda de natureza. Questão aberta registrada em `01-requisitos.md` §5.
