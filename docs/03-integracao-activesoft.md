# Integração com o Activesoft

> **Status: especificação provisória.** A documentação da API do Activesoft é protegida por login e ainda não foi analisada. Este documento define o **contrato canônico interno** — o formato que o resto do sistema consome. O adaptador traduz a API real para este contrato. Quando a documentação chegar, só `adapters/activesoft/` muda.

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
5. Códigos sem mapeamento confirmado → pendência de mapeamento (não grava a nota)
6. Modo simulação: nada é gravado, só o relatório
7. Conclui: contadores, divergências e pendências no log
8. Secretaria resolve cada divergência: manter local | aceitar origem | ignorar
```

### Regra central (RF-INT-06)

Comparar sempre com `valor_importado`, nunca com `valor`. Uma nota corrigida à mão pelo secretário não é sobrescrita por uma reimportação de rotina; se a origem também mudou, vira divergência com os dois valores lado a lado e a decisão é humana.

### Idempotência (RNF-03)

Correlação por `codigo_activesoft` em `aluno`, `(aluno, ano_letivo, serie)` em `matricula` e `(matricula, disciplina)` em `nota`, todas com `unique`. Rodar duas vezes seguidas produz `atualizados=0, criados=0`.

## 5. Mapeamento de códigos

O Activesoft usa códigos próprios para disciplina, série, turma e situação. A tabela `mapeamento_activesoft` guarda a correspondência, **por versão curricular** — o destino é um `versao_item`, não uma disciplina solta.

Ao duplicar uma versão, os mapeamentos cujo item foi copiado são recriados automaticamente apontando para o item novo. Sem isso, cada reforma obrigaria a remapear dezenas de códigos à mão, e um erro nesse remapeamento sai impresso num documento permanente. Códigos cujo item não sobreviveu à reforma entram como pendência, com aviso de que existiam na versão anterior. Ver `06-versionamento-curricular.md` §5.

Na primeira importação, todo código novo entra como **pendente**. O sistema sugere destino por similaridade de nome (`MAT`/`Matemática` → disciplina Matemática), mas a confirmação é humana — uma disciplina mapeada errado sai errada no histórico e o documento é permanente.

Notas de disciplina não mapeada não são gravadas. Aparecem como pendência no relatório.

A importação resolve a versão pela matrícula (`matricula.versao_curricular_id`), nunca pela vigência do momento — reimportar notas de 2021 hoje usa o currículo de 2021.

## 6. Configuração

```env
# API Activesoft — preenchido após acesso à documentação
ACTIVESOFT_BASE_URL=
ACTIVESOFT_AUTH_TIPO=          # bearer | basic | apikey | oauth2
ACTIVESOFT_CLIENT_ID=
ACTIVESOFT_CLIENT_SECRET=
ACTIVESOFT_API_KEY=
ACTIVESOFT_TENANT=             # código da escola, se multi-tenant
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

## 8. O que precisa da documentação da API

Lista para conferir assim que houver acesso:

- [ ] URL base e ambientes (produção / homologação)
- [ ] Método de autenticação e validade do token
- [ ] Endpoint de alunos — quais campos cadastrais, incluindo naturalidade e documentos
- [ ] Endpoint de matrículas — série, turma, situação final, datas
- [ ] Endpoint de notas — nota final por disciplina, carga horária, faltas
- [ ] Como são representadas séries e disciplinas (código? descrição?)
- [ ] Notas por bimestre/trimestre ou só a final?
- [ ] Como vem o resultado de recuperação e conselho de classe
- [ ] Paginação: parâmetros e limites
- [ ] Filtro por data de atualização (delta)
- [ ] Limite de requisições
- [ ] Anos letivos disponíveis — até que ano retroage o histórico?
- [ ] Conceitos da Educação Infantil e anos iniciais — como são expostos?

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
