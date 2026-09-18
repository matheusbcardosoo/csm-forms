# Versionamento curricular

O histórico escolar é um documento **retrospectivo**: um aluno que se formou em 2019 tem de receber, hoje, um documento com os nomes dos componentes **como eram em 2019**. Uma reforma educacional não pode reescrever o passado.

Sem versionamento, renomear "Ciências" para "Ciências da Natureza" no cadastro corromperia silenciosamente todo histórico ainda não emitido de quem estudou sob o nome antigo — e ninguém perceberia até a Diretoria de Ensino devolver o documento.

Este documento substitui o desenho de `matriz_curricular` descrito nas primeiras versões de `02-arquitetura.md`.

---

## 1. Princípio

> **Uma versão curricular em uso nunca é editada. Ela é duplicada.**

Editar é permitido apenas enquanto a versão está em `rascunho`. Assim que uma matrícula passa a apontar para ela, a versão fica somente leitura para sempre. Toda mudança — reforma, renomeação, componente que deixa de existir — gera uma versão nova.

É a mesma lógica das migrations do banco: o passado é imutável, o presente é uma camada nova por cima.

---

## 2. Modelo

```sql
versao_curricular
  id · curso_id fk
  nome                     -- "Novo Ensino Médio 2022", "Currículo 2016"
  base_legal text          -- Resolução/Parecer que motivou a versão
  status enum(rascunho, vigente, encerrada)
  ano_inicio int · ano_fim int null        -- null = ainda vigente
  duplicada_de_id fk null                  -- rastreia a linhagem
  criado_por · criado_em
  publicado_por · publicado_em
  unique (curso_id, nome)

versao_bloco               -- "Formação Geral Básica" / "Itinerários Formativos"
  id · versao_id fk · nome · ordem

versao_agrupamento         -- "Linguagens e suas Tecnologias", "Ciclo Integrador"
  id · versao_bloco_id fk · nome · ordem

versao_item                -- UMA LINHA DO HISTÓRICO, nesta versão, nesta série
  id · versao_agrupamento_id fk · serie_id fk
  componente_id fk null    -- identidade estável; null = componente novo sem antecessor
  nome_impresso text       -- o nome COMO SAI NO PAPEL nesta versão
  ordem · carga_horaria int null
  unique (versao_agrupamento_id, serie_id, componente_id)

versao_total               -- as duas linhas de total da grade
  versao_id fk · serie_id fk
  total_aulas_anuais int · total_horas_anuais int
  primary key (versao_id, serie_id)

vigencia_curricular        -- resolve (ano letivo, série) → versão
  ano_letivo_id fk · serie_id fk · versao_id fk
  primary key (ano_letivo_id, serie_id)

componente                 -- catálogo de IDENTIDADE, não de impressão
  id · nome_canonico · sigla · ativo
```

### 2.1 Por que `componente` continua existindo

`versao_item.nome_impresso` é o que vai para o papel. O `componente` serve para uma coisa só: dizer que **"Ciências" (2016) e "Ciências da Natureza" (2023) são a mesma coisa**.

Isso importa em dois lugares:

1. **Casamento de linhas do histórico.** Um aluno que cursou a 1ª série sob uma versão e a 2ª e 3ª sob outra tem de ver uma linha só para aquele componente, com as três notas — não duas linhas meio vazias.
2. **Relatórios.** "Mostre o desempenho em Matemática ao longo dos anos" não pode quebrar porque o nome mudou.

Componente genuinamente novo (Projeto de Vida, em 2022) entra com `componente_id` nulo e ganha identidade própria. Componente que deixou de existir simplesmente não aparece na versão nova — e continua intacto nas antigas.

### 2.2 Por que a versão pertence ao curso, e não ao segmento

Você pediu versionamento "por ano e por segmento". Modelei por **curso**, que é um nível mais fino: o `curso` já carrega o segmento (`curso.etapa`), e dois cursos do mesmo segmento podem ter estruturas diferentes — "Ensino Médio Bilíngue" tem o agrupamento "Ensino Bilíngue" que um Ensino Médio regular não teria. Versionar por segmento obrigaria os dois a compartilhar a mesma estrutura.

Na prática você continua tendo o que pediu: uma reforma do Ensino Médio gera uma versão nova para cada curso de Ensino Médio.

### 2.3 Por que `(ano, série)` e não só `ano`

Reformas entram escalonadas. O Novo Ensino Médio começou pela 1ª série em 2022, chegou à 2ª em 2023 e à 3ª em 2024 — nesses anos, séries diferentes da mesma escola seguiam currículos diferentes ao mesmo tempo. `vigencia_curricular` tem chave `(ano_letivo, serie)` justamente por isso.

### 2.4 Congelamento na matrícula

```sql
matricula
  ... + versao_curricular_id fk     -- resolvido e gravado na criação
```

A matrícula grava qual versão seguiu. Depois disso, nem uma alteração em `vigencia_curricular` muda o que aquele aluno cursou. É o mesmo raciocínio de `historico.snapshot`, uma camada antes.

---

## 3. Ciclo de vida de uma versão

```
  duplicar versão vigente
          ↓
     [ rascunho ]  ← editável: renomear itens, incluir, excluir, reordenar
          ↓  publicar (define ano_inicio, encerra a anterior)
     [ vigente ]   ← somente leitura assim que a 1ª matrícula aponta para ela
          ↓  publicação de uma versão sucessora
     [ encerrada ] ← somente leitura para sempre; segue servindo históricos antigos
```

**Duplicar** copia blocos, agrupamentos, itens, totais **e os mapeamentos do Activesoft** (ver §5). O usuário então ajusta só o que a reforma mudou.

**Regra de bloqueio:** `UPDATE`/`DELETE` em `versao_bloco`, `versao_agrupamento`, `versao_item` e `versao_total` são rejeitados quando a versão-mãe não está em `rascunho`. Vale como constraint no banco, não só como checagem na aplicação — é o tipo de invariante que não pode depender de ninguém lembrar.

---

## 4. Montagem da grade quando o histórico cruza versões

O caso: aluno cursou 1ª série em 2021 (versão "Currículo 2016") e 2ª e 3ª em 2022–2023 (versão "Novo EM 2022").

**Chave de casamento das linhas:** `(nome do agrupamento, componente_id)`. Quando `componente_id` é nulo dos dois lados, cai para `nome_impresso` normalizado (sem acento, minúsculo, espaços colapsados).

**Qual nome imprime**, quando as versões discordam: o `nome_impresso` da versão do **ano mais recente presente no documento**. Um componente que existia só na versão antiga imprime o nome dela e recebe `-` nas colunas dos anos em que não existia.

> ⚠️ **Decisão a confirmar com a secretaria.** O padrão acima (nome mais recente) é o que parece mais natural, mas a Diretoria de Ensino pode exigir que cada ano apareça com o nome vigente à época — o que obrigaria duas linhas separadas para o mesmo componente. O comportamento fica configurável por curso (`curso.politica_nome_reforma = mais_recente | linhas_separadas`), com `mais_recente` como padrão. Também vale gerar uma observação automática no campo OBSERVAÇÕES citando a reforma, quando o documento cruza versões.

---

## 5. Efeito no mapeamento do Activesoft

O destino de um mapeamento deixa de ser uma disciplina solta e passa a ser um `versao_item`:

```sql
mapeamento_activesoft
  id · versao_id fk
  tipo enum(disciplina, serie, turma, situacao)
  codigo_origem text · descricao_origem text
  versao_item_id fk null · destino_valor text null
  confirmado bool
  unique (versao_id, tipo, codigo_origem)
```

**Herança na duplicação.** Ao duplicar uma versão, cada mapeamento cujo item foi copiado é recriado apontando para o item novo. Sem isso, toda reforma obrigaria a secretaria a remapear dezenas de códigos à mão — e um erro nesse remapeamento sai impresso num documento permanente.

Códigos cujo item **não** foi copiado (componente extinto na reforma) entram como pendência na versão nova, com aviso explícito de que existiam na versão anterior.

---

## 6. Carga inicial

O colégio tem históricos a emitir de alunos que estudaram antes do sistema existir. Cada currículo distinto desse passado precisa virar uma versão `encerrada`, com sua vigência.

Ordem sugerida na fase 2:

1. Cadastrar a versão **vigente** (a de hoje) e validá-la contra o modelo real — é a que atende 90% das emissões.
2. Levantar com a secretaria quantos currículos distintos existiram e desde quando o colégio ainda emite histórico. Isso define quantas versões retroativas cadastrar.
3. Cadastrar as versões antigas já como `encerrada`, com `ano_inicio`/`ano_fim`, preenchendo `vigencia_curricular` para os anos correspondentes.

> **Pendência:** até que ano o colégio ainda emite histórico, e quantas mudanças de currículo houve nesse intervalo? Sem isso não dá para dimensionar a carga inicial da fase 2.

---

## 7. O que isso adiciona aos requisitos

| ID | Requisito | Prioridade |
|---|---|---|
| RF-VER-01 | Versão curricular por curso, com nome, base legal, vigência e status | Must |
| RF-VER-02 | Versão em uso é somente leitura, garantido no banco | Must |
| RF-VER-03 | Duplicar versão, herdando blocos, agrupamentos, itens, totais e mapeamentos | Must |
| RF-VER-04 | Resolver a versão por `(ano letivo, série)`, suportando reforma escalonada | Must |
| RF-VER-05 | Congelar a versão na matrícula no momento da criação | Must |
| RF-VER-06 | Identidade estável de componente entre versões, para casar linhas e relatórios | Must |
| RF-VER-07 | Montar a grade de histórico que cruza versões, com política de nome configurável | Must |
| RF-VER-08 | Linhagem visível: de qual versão esta foi duplicada e o que mudou entre elas | Should |
| RF-VER-09 | Comparar duas versões lado a lado (itens incluídos, removidos, renomeados) | Should |
| RF-VER-10 | Alertar ao publicar versão nova quais códigos do Activesoft ficaram órfãos | Should |
