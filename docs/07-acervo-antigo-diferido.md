# Acervo histórico anterior ao Activesoft — FEATURE DIFERIDA

> ## ⛔ Não implementar sem conversar com o Matheus antes
>
> **Status:** diferida por decisão do Matheus em 18/09/2026. Fora do escopo da v1.
> **Motivo:** a v1 entrega o cenário atual — alunos com dados no Activesoft. O acervo antigo sai depois, como feature própria.
>
> Se você é uma sessão futura e o pedido é "implementar os históricos antigos": **leia este documento inteiro e faça as perguntas da §5 antes de escrever qualquer código.** Há decisões de produto aqui que nenhuma leitura do código responde.

---

## 1. O que é esta feature

O Colégio São Marcos emite histórico escolar de quem estudou lá nos **últimos 49 anos** — desde meados dos anos 1970. O Activesoft cobre apenas os **últimos ~20 anos**. Para o restante do período, o registro existe só em livro/papel no arquivo da secretaria.

A feature é o caminho de entrada desses dados: transcrever do papel e emitir o histórico com o currículo da época.

**Não é** migração em massa. É atendimento sob demanda: alguém liga pedindo o histórico de 1987, a secretária busca no arquivo e digita.

---

## 2. Fronteira de escopo da v1

| | v1 (em escopo) | Diferido (esta feature) |
|---|---|---|
| Alunos | Trajetória inteira dentro do período do Activesoft | Qualquer ano anterior ao Activesoft |
| Origem das notas | Importação do Activesoft + edição manual | Transcrição do livro/papel |
| Cursos cadastrados | Os atuais (ex.: Ensino Médio Bilíngue) | 1º grau, 2º grau, EF 8 séries, EF 9 anos |
| Versões curriculares | A vigente e as recentes | Versões retroativas até os anos 1970 |

> **Regra prática para a v1:** se o aluno tem matrícula no Activesoft, é v1. Se não tem, é esta feature.

---

## 3. O que já está decidido

Respostas do Matheus em 18/09/2026. **Não reabrir sem motivo — já foram perguntadas.**

| # | Decisão | Consequência |
|---|---|---|
| D1 | **Histórico antigo é redigitado no modelo atual**, não reproduzido como era na época | O template de PDF **não** é versionado. Um único gerador cobre os 49 anos. Não construa templates por época. |
| D2 | O Activesoft tem notas de **mais de 20 anos** | O ano exato de corte ainda não foi confirmado — ver §5 |
| D3 | **Currículos antigos entram sob demanda**, não em carga inicial | Nada de mutirão de arquivo antes de operar. A versão nasce no primeiro pedido daquele período |
| D4 | Componente renomeado numa reforma imprime **sempre o nome mais recente** | Sem alternativa configurável. Não invente `politica_nome_reforma` |
| D5 | Mudou nome/número das séries → **curso novo**; mudaram só os componentes → **versão nova** | "1º grau" e "EF 9 anos" são cursos distintos, não versões do mesmo curso |

### Por que D5 importa

A passagem de 8 séries para 9 anos (Lei 11.274/2006) não tem correspondência limpa: a antiga 1ª série não é o novo 1º ano. Forçar identidade entre elas produziria histórico errado. Cursos separados dizem a verdade — cada matrícula aponta para o curso que existia na época.

### Marcos que provavelmente viram cursos ou versões

| Marco | Muda o quê | Curso ou versão |
|---|---|---|
| Lei 5.692/71 | 1º grau (1ª–8ª série), 2º grau (1ª–3ª série) | cursos |
| LDB 9.394/96 | vira Ensino Fundamental / Ensino Médio | cursos |
| Lei 11.274/2006 | EF de 8 séries → 9 anos | curso |
| BNCC (2017–2020) | componentes e áreas | versão |
| Novo Ensino Médio (2022) | itinerários formativos | versão |

Isso é levantamento de escritório, não fato confirmado pela secretaria. Confirmar antes de cadastrar.

---

## 4. O que o schema da v1 já suporta

**Boa notícia: nada precisa ser refeito.** O modelo da v1 foi desenhado sabendo que esta feature viria.

| Já existe | Serve para |
|---|---|
| `versao_curricular` com vigência e status | Versões retroativas entram como `encerrada` com `ano_inicio`/`ano_fim` |
| `vigencia_curricular (ano_letivo, serie)` | Resolve qual currículo valia em 1987 |
| `versao_item.nome_impresso` separado de `componente` | Imprime "OSPB" em 1985 e o nome atual hoje, sem conflito |
| `matricula.versao_curricular_id` congelado | O que o aluno cursou não muda depois |
| `curso` como entidade separada da etapa | Comporta "1º grau" e "2º grau" sem gambiarra |
| `estabelecimento_externo` | Anos cursados em outra escola |
| `aluno.origem = manual` | Aluno que nunca existiu no Activesoft |
| RF-VER-11 (bloqueio por currículo ausente) | **Já na v1.** Impede que um pedido antigo gere documento errado em silêncio |

RF-VER-11 fica na v1 de propósito: é a guarda que torna seguro adiar o resto. Sem ela, um pedido de 1987 na v1 sairia com a grade do currículo de hoje.

### O que ainda não existe

- Tela de transcrição de histórico antigo (era RF-ALU-10, agora diferido)
- RF-VER-12 — sugerir a versão vigente mais próxima ao criar versão retroativa
- Cadastro dos cursos antigos e suas séries
- Fluxo de busca no arquivo físico (se é que entra no sistema)

---

## 5. Perguntas a fazer ao Matheus antes de implementar

**Faça estas perguntas. Não assuma respostas.**

### Sobre volume e prioridade
1. **Quantos pedidos de histórico antigo a secretaria recebe por mês?** Isso decide se a tela precisa ser otimizada para velocidade ou se um formulário simples resolve.
2. **Qual o ano exato de corte do Activesoft?** ("mais de 20 anos" foi a resposta em 2026 — falta o número.) Define quantos anos dependem de digitação.
3. Existe algum período **sem registro nenhum** (arquivo perdido, incêndio, mudança de sede)? Muda o que o sistema promete.

### Sobre o documento
4. Um histórico de quem cursou o **1º grau** imprime "HISTÓRICO ESCOLAR - 1º GRAU" no título, ou a secretaria moderniza para "ENSINO FUNDAMENTAL"? *(pendência conhecida, nunca respondida)*
5. O documento antigo precisa de alguma **observação obrigatória** citando que foi expedido a partir de registro de arquivo? Algumas redes exigem.
6. Concluinte antigo tem **número de publicação na SED**? O sistema de Concluintes é recente — provavelmente não, e o campo teria de ficar opcional para esses casos.

### Sobre a entrada de dados
7. O registro em papel é **livro de escrituração, ficha individual, ou histórico já pronto arquivado**? Muda completamente a tela: transcrever um livro é diferente de copiar um documento pronto.
8. A secretaria quer **digitalizar o registro** (foto/scan anexado ao aluno) junto com a transcrição, ou só digitar?
9. Quem digita — a própria secretária no atendimento, ou alguém faz em lote depois? Decide se a tela precisa de rascunho/retomada.
10. O aluno antigo precisa virar **cadastro permanente** no sistema, ou basta o documento emitido?

### Sobre os currículos
11. A secretaria **tem** a documentação dos currículos antigos (grade, carga horária, nomes dos componentes), ou isso vai ser reconstruído a partir dos próprios históricos arquivados?
12. Se não tiver: aceita-se cadastrar a versão **a partir do que está escrito no histórico daquele aluno**? Isso inverte o fluxo — a transcrição gera a versão, em vez de depender dela.

> A pergunta 12 é a mais importante. Se a documentação curricular antiga não existir, o desenho muda de "cadastre a versão, depois transcreva" para "transcreva livre, e o sistema aprende a versão". São duas features diferentes.

---

## 6. Riscos de implementar sem perguntar

| Risco | Efeito |
|---|---|
| Assumir que a documentação curricular antiga existe | Constrói-se um fluxo que trava na primeira tentativa de uso real |
| Construir templates de PDF por época | Trabalho jogado fora — D1 já resolveu isso |
| Tratar cursos antigos como versões do curso atual | Histórico errado, permanente, com a escola respondendo por ele |
| Migração em massa em vez de sob demanda | Meses de digitação de arquivo antes de qualquer valor entregue |
| Deixar a emissão passar sem currículo cadastrado | Documento oficial com a grade errada, em silêncio — o pior caso do projeto |

---

## 7. Onde está o resto do contexto

- `06-versionamento-curricular.md` — o modelo de versões, §6 tem o alcance retroativo
- `05-modelo-historico.md` — anatomia do documento; §4 lista pendências
- `02-arquitetura.md` §3.2 — o schema que já acomoda esta feature
- `modelos/JULIA_TEMPLATE.pdf` — modelo real (conclusão de EM Bilíngue, atual)
