# Anatomia do histórico escolar

Especificação derivada de um modelo real em uso no colégio (`modelos/JULIA_TEMPLATE.pdf` — Ensino Médio Bilíngue, concluinte de 2025, dados do aluno anonimizados). É este layout que o gerador precisa reproduzir, não o modelo genérico da SEDUC.

**Fato que fecha a questão aberta da fase 5:** o documento sai da secretaria do colégio. Da SED vem **apenas o número de publicação**. A fase 5 vale integralmente.

---

## 1. Página 1

### 1.1 Cabeçalho

Centralizado, sem moldura, acima da tabela:

```
                    COLÉGIO SÃO MARCOS
      Entidade Mantenedora: Associação de Desenvolvimento Educacional CSM
   Autorização de Funcionamento - Portaria de 16-03-2012 - DOE 28-03-2012
            Ensino Bilíngue - Portaria 11-01-2022 - DOE 12-01-2022
                Diretoria de Ensino - Região Mogi das Cruzes
```

Observações que contrariam o modelo genérico da SEDUC e mandam no nosso template:

- **Não imprime** endereço, telefone, e-mail, CNPJ nem código INEP. Esses campos continuam no cadastro (úteis para outros documentos), mas ficam fora do cabeçalho do histórico.
- **Não há logotipo nem brasão** — só texto.
- Cada ato legal é **uma linha livre**. O número é opcional: "Portaria de 16-03-2012" não tem número, "Portaria 11-01-2022" tem data no lugar. O que é sempre presente é a **data do ato** e a **data de publicação no DOE**.
- Há um ato **por programa**, não só por etapa: a linha "Ensino Bilíngue" é do programa bilíngue, não do Ensino Médio.
- A última linha é a Diretoria de Ensino.

→ O cabeçalho é uma lista ordenada de linhas de texto montadas a partir de `instituicao_ato`, com formato de renderização configurável por ato.

### 1.2 Faixa de título

```
            HISTÓRICO ESCOLAR - ENSINO MÉDIO BILÍNGUE
```

O título carrega o **curso**, não a etapa. "Ensino Médio Bilíngue" é um curso; "Ensino Médio" é a etapa. Isso obriga a existir a entidade `curso` — ver correção do modelo de dados.

### 1.3 Identificação do aluno

Tabela de duas faixas:

| NOME DO(A) ALUNO(A) | *(nome completo, centralizado)* |
|---|---|

| DATA DE NASCIMENTO | MUNICÍPIO / ESTADO | NACIONALIDADE | CIN / CPF nº |
|---|---|---|---|

Cinco campos, só isso. **Não imprime filiação, RG, certidão de nascimento nem RA.** O documento de identificação impresso é **CIN / CPF** (CIN = Carteira de Identidade Nacional). O RA aparece só no certificado, na página 2.

### 1.4 Grade de aproveitamento — a parte que define o modelo de dados

Matriz de **componentes × anos**, com três níveis de agrupamento à esquerda:

```
┌─────────────┬──────────────────────────┬──────────────────┬──────┬──────┬──────┐
│             │                          │                  │ 2023 │ 2024 │ 2025 │
│   BLOCO     │      AGRUPAMENTO         │   COMPONENTE     │ 1ª S.│ 2ª S.│ 3ª S.│
│  (vertical) │  (ÁREA DO CONHECIMENTO)  │   CURRICULAR     │ NOTA │ NOTA │ NOTA │
├─────────────┼──────────────────────────┼──────────────────┼──────┼──────┼──────┤
│  FORMAÇÃO   │ Linguagens e suas Tec.   │ Língua Portuguesa│  6,1 │  6,3 │  6,1 │
│    GERAL    │                          │ Arte             │  8,0 │  9,7 │  8,8 │
│   BÁSICA    │                          │ Educação Física  │  6,7 │  8,2 │   -  │
│             │                          │ L. E. M. - Inglês│  6,0 │  8,5 │   -  │
│             │ Matemática e suas Tec.   │ Matemática       │  6,0 │  6,7 │  6,6 │
│             │ Ciências da Natureza…    │ Física           │  6,0 │  7,0 │   -  │
│             │                          │ …                │      │      │      │
├─────────────┼──────────────────────────┼──────────────────┼──────┼──────┼──────┤
│ ITINERÁRIOS │ Ensino Bilíngue          │ Academic Content…│  6,9 │  7,2 │  6,0 │
│ FORMATIVOS  │                          │ L. E. M. - Inglês│   -  │   -  │  6,5 │
│             │ Ciclo Integrador         │ Projeto de Vida  │  8,0 │  7,7 │  7,8 │
│             │                          │ Educação Física  │   -  │   -  │  8,3 │
│             │ Eletivas                 │ Humanidades      │  8,7 │   -  │   -  │
└─────────────┴──────────────────────────┴──────────────────┴──────┴──────┴──────┘
```

**Quatro consequências diretas:**

1. **O agrupamento não é um enum da BNCC.** "Ensino Bilíngue", "Ciclo Integrador" e "Eletivas" convivem com as quatro áreas da BNCC no mesmo nível. Tem de ser cadastro configurável, não enum no código.

2. **O mesmo componente aparece em mais de uma linha, com notas diferentes.** No modelo: "Língua Estrangeira Moderna - Inglês" aparece em Linguagens (6,0 / 8,5 / -) **e** em Ensino Bilíngue (- / - / 6,5). O mesmo acontece com Educação Física, Filosofia e Sociologia. Portanto **a nota não pertence a uma disciplina — pertence a uma linha da matriz curricular.**

3. **Célula vazia é `-`, não em branco.** Componente não cursado naquele ano recebe traço.

4. **As linhas do documento são a união das matrizes das três séries**, casadas por (nome do agrupamento, `componente_id`). Um componente que existe na matriz de 2023 e não na de 2025 ocupa a linha inteira, com `-` na coluna de 2025. Quando o histórico cruza uma reforma curricular, o casamento e a escolha do nome impresso seguem `06-versionamento-curricular.md` §4.

### 1.5 Totais

Duas linhas ao pé da grade, por ano:

| | 2023 | 2024 | 2025 |
|---|---|---|---|
| **TOTAL GERAL DE AULAS ANUAIS** | 1760 | 1760 | 1680 |
| **TOTAL GERAL DE HORAS ANUAIS** | 1320 | 1320 | 1260 |

Duas unidades: **aulas** (tempo de aula) e **horas** (hora-relógio). A razão no modelo é 0,75 — aula de 45 minutos. 1760 × 0,75 = 1320 e 1680 × 0,75 = 1260.

> **Não há carga horária por componente neste modelo.** Só o total anual. Isso simplifica bastante a matriz curricular em relação ao que estava planejado — a carga horária por disciplina deixa de ser campo obrigatório. **Confirmar se o histórico de Ensino Fundamental segue a mesma regra.**

### 1.6 Estabelecimentos

| ENSINO | ANO/SÉRIE | ANO | ESTABELECIMENTO | MUNICÍPIO / ESTADO |
|---|---|---|---|---|
| ENSINO MÉDIO | 1ª | 2023 | COLÉGIO SÃO MARCOS | MOGI DAS CRUZES / SP |
| | 2ª | 2024 | COLÉGIO SÃO MARCOS | MOGI DAS CRUZES / SP |
| | 3ª | 2025 | COLÉGIO SÃO MARCOS | MOGI DAS CRUZES / SP |

Coluna ENSINO com agrupamento vertical. É aqui que entra um ano cursado em outra escola.

---

## 2. Página 2

### 2.1 Observações

Bloco com moldura, título `OBSERVAÇÕES:`, parágrafos livres. No modelo aparecem três tipos, e valem como textos-padrão do sistema:

1. **Conclusão da etapa anterior** — "O(a) referido(a) aluno(a) concluiu o Ensino Fundamental no Colégio São Marcos de Mogi das Cruzes/SP no ano letivo de 2022."
2. **Critério de promoção do Regimento Escolar** — "Será considerado promovido o aluno que obtiver, nos diferentes conteúdos curriculares, os seguintes resultados: I – frequência igual ou superior a 75% com nota final mínima 6,0 (seis) inteiros no final do ano letivo."
3. **Certificação de nível** — "2025 - O(a) aluno(a) concluiu o componente English Language – Linguistic Development no nível B2 (CEFR)."

O tipo 2 é fixo por curso e deve vir preenchido automaticamente. Os tipos 1 e 3 dependem do aluno.

### 2.2 Certificado

Bloco com moldura, só em histórico de **conclusão**. Texto corrido com campos interpolados:

> O Diretor do Colégio São Marcos, de acordo com o inciso VII do art. 24 da Lei nº 9394/96, certifica que o(a) aluno(a) **{NOME}**, de nacionalidade **{NACIONALIDADE}**, natural de **{MUNICÍPIO}**, estado de **{ESTADO}**, portador(a) do CPF nº **{CPF}** / RA nº **{RA}**, nascido(a) em **{NASCIMENTO}**, concluiu o **{CURSO}** no ano letivo de **{ANO}**, estando apto(a) ao prosseguimento de estudos.
>
> {MUNICÍPIO}, {DATA POR EXTENSO}.

O **RA** aparece aqui e em nenhum outro lugar do documento.

### 2.3 Assinaturas

Duas colunas, sem linha de assinatura desenhada:

```
   Jessica Flaviana dos Santos Mello        Marcio Luiz Miranda de Paula
              Secretária                              Diretor
           R.G nº 00.000.000-0                  R.G nº 0.000.000-0
```

Nome · cargo · R.G. Confirma `instituicao_signatario` com campo de RG.

### 2.4 Número de publicação da SED

Faixa com moldura, centralizada, abaixo do certificado:

> Certificado expedido conforme publicação na SED, sob Registro / Visto Confere nº **000000000000**.

O rótulo oficial é **"Registro / Visto Confere"** — é o número que sai do fluxo de Concluintes da SED (ver `03-integracao-activesoft.md` §9). Não tem API; a secretaria copia. No modelo tem 12 dígitos.

### 2.5 Rodapé

> Este Histórico não contém emendas ou rasuras.

Texto fixo, fonte pequena, alinhado à esquerda.

Abaixo dele, o **QR de verificação** (RF-HIST-14): um quadrado de 16mm à
esquerda e, ao lado, o endereço em texto. Os 16mm não são estéticos —
abaixo disso a câmera de celular erra a leitura num papel que foi dobrado
ou fotocopiado, que é exatamente a situação em que alguém confere. O
endereço vai escrito por extenso porque nem todo mundo aponta a câmera:
quem recebe o documento pela secretaria de outra escola muitas vezes
digita.

Documento emitido antes da migration 008 não tem código, e o rodapé sai
sem o bloco — o espaço é ocupado pelo texto fixo, sem buraco.

---

## 3. Regras de renderização

| Regra | Detalhe |
|---|---|
| Fonte | Sem serifa, condensada; corpo ~7–8pt na grade, ~10pt no certificado |
| Bordas | Tabela com bordas finas contínuas; cabeçalhos de seção com fundo cinza claro |
| Célula sem nota | `-` |
| Nota | Uma casa decimal, vírgula (`6,1`) |
| Blocos verticais | Texto rotacionado 90° na coluna mais à esquerda, com `rowspan` do bloco inteiro |
| Página | A4 retrato, duas páginas, quebra fixa entre grade e observações |
| Certificado | Só em histórico de conclusão; omitido em transferência |

---

## 4. Pendências deste modelo

- [x] ~~O histórico de **Ensino Fundamental** usa o mesmo layout?~~ Sim — segundo a secretaria, o layout é o mesmo para todos os segmentos.
- [x] ~~Desde que ano o colégio emite histórico?~~ 49 anos. Currículos antigos entram sob demanda — `06-versionamento-curricular.md` §6.
- [x] ~~Nome de componente que muda no meio do curso?~~ Imprime sempre o mais recente, sem alternativa configurável.
- → Pendências do acervo anterior ao Activesoft (título do 1º grau, ano de corte) migraram para [07-acervo-antigo-diferido.md](07-acervo-antigo-diferido.md) §5, junto com a feature.
- [x] ~~Modelo de **transferência** (aluno não concluinte) — como fica sem o bloco de certificado?~~ Implementado na F5 pela regra do §3: **mesmo layout, sem o bloco CERTIFICADO** e sem a exigência do número de publicação da SED. O tipo do documento (`transferencia`, `conclusao_ef`, `conclusao_em`, `parcial`, `declaracao`) é escolhido no assistente e é ele que liga ou desliga o bloco. **Falta conferir com um documento real da secretaria** — se divergir, o ajuste é no template, não no modelo de dados.
- [ ] **Educação Infantil** emite histórico ou só declaração/relatório?
- [ ] Qual é a razão aulas→horas para cada curso? (0,75 no EM Bilíngue)
- [ ] Existe versão do histórico para aluno com anos cursados em outra escola? Precisamos de um exemplo.
