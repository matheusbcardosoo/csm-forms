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

**Decidido (18/09/2026):** imprime sempre o nome mais recente. Fica só isso — sem alternativa configurável, sem `politica_nome_reforma`. Se um dia a Diretoria de Ensino exigir o contrário, vira uma versão nova do template, não uma opção que ninguém usa.

Quando o documento cruza versões, o sistema acrescenta automaticamente uma observação no campo OBSERVAÇÕES citando a reforma e o período de cada currículo.

---

## 5. Efeito no mapeamento do Activesoft

O destino de um mapeamento de disciplina é o **componente** — a identidade que atravessa versão e curso — e, como exceção, um `versao_item`:

```sql
mapeamento_activesoft
  id · versao_id fk null
  tipo enum(disciplina, serie, turma, situacao)
  codigo_origem text · descricao_origem text
  componente_id fk null      -- destino global: todo curso, toda versão
  versao_item_id fk null     -- exceção: só naquela versão
  destino_valor text null
  confirmado bool
  unique (versao_id, tipo, codigo_origem)
  unique (tipo, codigo_origem) where versao_id is null
```

**Por que o componente e não o item.** O item é (agrupamento, série, componente) dentro de uma versão, e versão pertence a um curso. Amarrar o mapeamento nele obriga a remapear a mesma lista de códigos em cada curso e em cada versão que não tenha sido duplicada da anterior. O componente não tem curso nem versão: mapeia-se uma vez, e a importação resolve a linha da grade pela versão e pela série da matrícula — o mesmo mecanismo que já atravessava as séries dentro de uma versão. Migration `010`.

**Herança na duplicação.** Ao duplicar uma versão, cada exceção cujo item foi copiado é recriada apontando para o item novo. Os mapeamentos globais não precisam ser herdados: já valem na versão nova no instante em que ela existe.

Códigos cuja exceção perdeu o item (componente extinto na reforma) entram como pendência na versão nova, com aviso explícito de que existiam na versão anterior. Mapeamento global cujo componente não está na grade nova também vira pendência ali, e só ali.

---

## 6. Alcance retroativo

O colégio emite histórico de quem estudou lá nos últimos **49 anos**, mas o Activesoft só cobre os ~20 mais recentes. O acervo anterior é **feature diferida** — o dossiê completo, com decisões já tomadas e as perguntas a fazer antes de implementar, está em **[07-acervo-antigo-diferido.md](07-acervo-antigo-diferido.md)**.

O que importa aqui, porque afeta o desenho da v1:

**Currículos entram sob demanda.** A versão vigente é cadastrada na fase 2. Versões de períodos anteriores nascem quando aparece o primeiro pedido daquele período — cadastrar 49 anos de currículo antes de emitir o primeiro documento atrasaria o sistema em meses de pesquisa de arquivo.

**A guarda fica na v1.** Quando não há `vigencia_curricular` para o ano pedido, o sistema **bloqueia a emissão** e explica: *"Nenhum currículo cadastrado para 1987. Cadastre a versão vigente naquele período para continuar."* Isso é RF-VER-11, e está na v1 de propósito: é o que torna seguro adiar o resto. Sem ela, um pedido antigo sairia com a grade do currículo de hoje, em silêncio, num documento permanente.

**Mudança de nomenclatura é curso novo, não versão nova.** Mudou o número ou o nome das séries (1º grau → EF 8 séries → EF 9 anos) → curso novo. Mudaram só os componentes (BNCC, Novo Ensino Médio) → versão nova. A passagem de 8 séries para 9 anos não tem correspondência limpa — a antiga 1ª série não é o novo 1º ano —, e forçar identidade produziria histórico errado.

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
| RF-VER-11 | Bloquear a emissão quando não houver currículo cadastrado para o período, com mensagem explícita e atalho para criar a versão já preenchida com o ano | Must |
| RF-VER-12 | ~~Ao criar versão retroativa, sugerir a versão vigente mais próxima no tempo~~ — **diferido** com o acervo antigo | — |
| RF-VER-13 | Observação automática no campo OBSERVAÇÕES quando o documento cruza versões curriculares, citando a reforma e o período de cada currículo | Should |
