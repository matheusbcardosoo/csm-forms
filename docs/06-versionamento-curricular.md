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

## 6. Alcance retroativo: 49 anos

O colégio emite histórico de quem estudou lá desde meados dos anos 1970. Três respostas da secretaria (18/09/2026) definem o que isso custa.

### 6.1 O layout é um só

**Histórico antigo é redigitado no modelo de hoje.** A secretaria não reproduz o documento como ele era em 1985 — pega o registro em papel e digita no modelo atual.

Isso corta um escopo inteiro: **não existe versionamento de template.** Só a estrutura curricular é versionada. Um único gerador de PDF atende os 49 anos; o que muda entre épocas são as linhas da grade, não o desenho da folha.

### 6.2 A fronteira digital fica no Activesoft

O Activesoft tem notas lançadas de **mais de 20 anos**. Isso divide o acervo em dois regimes:

| Período | Origem das notas | Fluxo |
|---|---|---|
| Últimos ~20 anos | Activesoft | Importação (fases 3 e 4) |
| Antes disso | Livro/papel do arquivo | Transcrição manual (RF-ALU-07) |

> **Confirmar o ano exato de corte.** É o número que diz quantos históricos ainda dependem de digitação e, portanto, quanto a tela de transcrição precisa ser boa.

A tela de transcrição de histórico antigo deixa de ser acessório e vira funcionalidade de primeira classe: para quase metade do período coberto, ela é o **único** caminho de entrada.

### 6.3 Currículos antigos entram sob demanda

Cadastrar os currículos dos 49 anos antes de emitir o primeiro documento atrasaria o sistema em meses de pesquisa de arquivo. **A versão vigente é cadastrada na fase 2; as antigas nascem quando aparece o primeiro pedido daquele período.**

Na prática:

1. A secretaria abre um histórico de alguém que estudou em 1987.
2. Não há `vigencia_curricular` para 1987 → o sistema **bloqueia a emissão** e explica: *"Nenhum currículo cadastrado para 1987. Cadastre a versão vigente naquele período para continuar."*
3. Botão direto para criar a versão, já com o ano preenchido, duplicando a versão mais próxima como ponto de partida.
4. Cadastrada uma vez, serve todos os pedidos futuros daquele período.

O acervo de versões se constrói sozinho, na ordem em que a demanda real aparece. Um currículo que nunca é pedido nunca é cadastrado.

> **Requisito que isso cria:** o bloqueio por currículo ausente precisa ser explícito e acionável, nunca um documento saindo com a grade errada em silêncio. Ver RF-VER-11.

### 6.4 Mudança de nomenclatura é curso novo, não versão nova

Em 49 anos a estrutura do ensino brasileiro mudou de nome e de tamanho, não só de conteúdo:

| Marco | O que mudou | Efeito no modelo |
|---|---|---|
| Lei 5.692/71 | 1º grau (1ª–8ª série) e 2º grau (1ª–3ª série) | cursos próprios |
| LDB 9.394/96 | vira Ensino Fundamental e Ensino Médio | cursos novos |
| Lei 11.274/2006 | EF passa de 8 séries para 9 anos, com nomenclatura nova | **curso novo** |
| BNCC (2017–2020) | componentes e áreas mudam; séries não | versão nova |
| Novo Ensino Médio (2022) | itinerários formativos; séries não | versão nova |

**A regra:** mudou o número ou o nome das séries → curso novo. Mudaram só os componentes → versão nova.

Isso evita forçar identidade entre coisas que não são a mesma. A passagem de 8 séries para 9 anos não tem correspondência limpa — a antiga 1ª série não é o novo 1º ano — e tentar mapear isso produziria histórico errado. Cursos separados dizem a verdade: cada matrícula aponta para o curso que existia na época, com as séries que existiam na época.

> **Pendência:** um histórico de quem cursou o 1º grau imprime "HISTÓRICO ESCOLAR - 1º GRAU" ou a secretaria moderniza para "ENSINO FUNDAMENTAL"? O título vem do nome do curso, então a resposta decide como cadastrar os cursos antigos.

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
| RF-VER-12 | Ao criar versão retroativa, sugerir como ponto de partida a versão vigente mais próxima no tempo | Should |
| RF-VER-13 | Observação automática no campo OBSERVAÇÕES quando o documento cruza versões curriculares, citando a reforma e o período de cada currículo | Should |
