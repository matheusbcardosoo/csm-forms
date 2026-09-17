# Telas e navegação

## 1. Mapa de rotas

```
PÚBLICO (sem login)
  /                                  entrada — login
  /form/visitas                      wizard de visita
  /form/avaliacao-substitutiva       wizard de avaliação substitutiva
  /politica-privacidade

PAINEL (autenticado)
  /app                               início
  /app/alunos                        lista de alunos
  /app/alunos/:id                    ficha do aluno
      ?aba=dados|trajetoria|notas|documentos|historicos
  /app/alunos/:id/historico/novo     assistente de geração
  /app/historicos                    documentos emitidos
  /app/historicos/:id                pré-visualização e edição
  /app/importacoes                   importações do Activesoft
  /app/importacoes/nova              nova importação
  /app/importacoes/:id               relatório e divergências
  /app/mapeamentos                   códigos do Activesoft ↔ cadastro local
  /app/formularios                   formulários (módulo atual)
  /app/formularios/respostas         respostas recebidas
  /app/config/instituicao            dados da instituição
  /app/config/atos-legais            atos por etapa
  /app/config/signatarios            quem assina
  /app/config/anos-letivos
  /app/config/series-disciplinas
  /app/config/matriz-curricular      por ano letivo + série
  /app/config/avaliacao              sistema de notas/conceitos por etapa
  /app/config/observacoes            textos-padrão de observação
  /app/config/usuarios               equipe e papéis
  /app/config/documentos             modelo do histórico e numeração
```

**Visibilidade por papel:** `admin` vê tudo · `secretaria` vê tudo menos `/app/config/usuarios` e `/app/config/documentos` · `coordenacao` vê alunos, históricos (leitura) e formulários · `leitura` só consulta.

## 2. Estrutura do painel

Layout persistente: barra lateral fixa à esquerda (240px, recolhível), topo com busca global de aluno, seletor de ano letivo e menu do usuário.

```
┌────────────┬──────────────────────────────────────────────┐
│  [logo]    │  🔍 buscar aluno…      [2026 ▾]   [MS ▾]     │
│            ├──────────────────────────────────────────────┤
│ Início     │                                              │
│ Alunos     │                                              │
│ Históricos │              conteúdo da rota                │
│ Importação │                                              │
│ Formulários│                                              │
│ ────────── │                                              │
│ Configurar │                                              │
└────────────┴──────────────────────────────────────────────┘
```

O **seletor de ano letivo no topo** é global: filtra lista de alunos, matriz curricular e importações. Evita o erro clássico de importar notas para o ano errado.

## 3. Telas principais

### 3.1 `/app` — Início

Quatro cartões de indicador: alunos ativos · históricos emitidos no mês · importações pendentes de resolução · divergências abertas.

Abaixo: "Precisa de atenção" — divergências não resolvidas, códigos sem mapeamento, alunos com dado obrigatório faltando, históricos em rascunho há mais de 7 dias. Cada item leva direto à tela de resolução.

### 3.2 `/app/alunos` — Lista

Filtros na horizontal: busca por nome/código/RA · ano letivo · série · turma · situação. Tabela com nome, código, série/turma atual, situação, último documento emitido. Ação por linha: abrir ficha · gerar histórico.

Estado vazio quando não há aluno importado: chamada direta para `/app/importacoes/nova`.

### 3.3 `/app/alunos/:id` — Ficha

Cabeçalho fixo com nome, código, série/turma atual, situação e dois botões: **Gerar histórico** e **Editar dados**. Abaixo, abas:

**Dados** — pessoais, documentos, naturalidade, filiação. Campos obrigatórios para histórico que estiverem vazios aparecem destacados com o aviso de que bloqueiam a emissão.

**Trajetória** — linha do tempo vertical, um bloco por ano letivo: série, turma, estabelecimento, situação final, carga horária. Blocos de estabelecimento externo com marcação visual distinta. Botão "Adicionar ano cursado em outra escola".

**Notas** — seletor de ano letivo/série e grade editável:

```
Disciplina              C.H.   Nota   Faltas   Situação
─────────────────────────────────────────────────────────
Língua Portuguesa       200    8,5    12       Aprovado
Matemática              200    7,0 ✎  8        Aprovado     ← editado à mão
Ciências                120    —  ⚠   4        Sem registro ← pendência
```

Célula editada guarda `título` com autor, data e valor anterior. Editar exige motivo (registrado na auditoria). Rodapé da grade mostra a origem do conjunto: *"Importado do Activesoft em 12/09/2026 · 2 células editadas manualmente"*.

**Documentos** — anexos digitalizados do aluno.

**Históricos** — documentos já gerados, com status e ação de 2ª via.

### 3.4 `/app/alunos/:id/historico/novo` — Assistente

Quatro passos, no mesmo padrão de wizard já usado nos formulários:

1. **Tipo** — transferência · conclusão EF · conclusão EM · parcial/declaração
2. **Trajetória** — confirma quais anos entram no documento (todos marcados por padrão)
3. **Conferência** — o sistema lista o que falta: dado do aluno vazio, disciplina sem nota, carga horária zerada. Bloqueia o avanço no que for obrigatório; o que for opcional, alerta
4. **Signatários e observações** — diretor, secretário, observações (com textos-padrão)

→ Ao concluir, cria o histórico em `rascunho` e leva à pré-visualização.

### 3.5 `/app/historicos/:id` — Pré-visualização e edição ⭐

A tela central do sistema. Duas colunas:

```
┌─────────────────────────────┬───────────────────────┐
│  [ Rascunho ]  Aluno · Tipo │  ▸ Cabeçalho          │
│                             │  ▸ Dados do aluno     │
│   ┌───────────────────────┐ │  ▸ Notas e C.H.       │
│   │                       │ │  ▾ Observações        │
│   │   PÁGINA 1 — frente   │ │     [textarea]        │
│   │   (documento fiel)    │ │     + modelo pronto   │
│   │                       │ │  ▸ Assinaturas        │
│   └───────────────────────┘ │  ▸ Registro           │
│   ┌───────────────────────┐ │                       │
│   │   PÁGINA 2 — verso    │ │  ─────────────────    │
│   └───────────────────────┘ │  Conferência: 1 aviso │
│                             │  ⚠ Ciências sem nota  │
│  [100% ▾] [Frente|Verso]    │                       │
├─────────────────────────────┴───────────────────────┤
│  [Salvar rascunho]  [Marcar conferido]  [Emitir ▸]  │
└─────────────────────────────────────────────────────┘
```

- A coluna esquerda é o documento renderizado no tamanho real (A4), com o mesmo CSS do PDF — é o que RNF-04 exige. Clicar num trecho do documento abre a seção correspondente no painel direito.
- A coluna direita edita; a esquerda atualiza na hora.
- **Emitir** abre confirmação explicando que o documento será congelado, atribui número de registro e gera o PDF.
- Emitido, o painel direito vira somente leitura e os botões passam a ser **Baixar PDF** · **Gerar 2ª via** · **Cancelar documento** (com motivo obrigatório).

### 3.6 `/app/importacoes/nova`

Formulário curto: adaptador ativo (mostrado, não escolhido pelo usuário) · ano letivo · série/turma opcional · o que importar (alunos, matrículas, notas) · modo.

**Simular primeiro** é o botão primário; **Importar agora** é o secundário. A simulação devolve o relatório de contagens e divergências previstas antes de qualquer gravação.

Durante a execução, progresso por etapa com contadores ao vivo.

### 3.7 `/app/importacoes/:id` — Relatório

Contadores no topo. Abaixo, abas: **Divergências** (comparação lado a lado, com ação por linha e ação em lote) · **Pendências de mapeamento** (com sugestão de destino) · **Erros** (payload cru para diagnóstico).

Comparação de divergência:

```
Ana Souza · 8º ano · Matemática · nota final

  Valor local (editado)      Valor no Activesoft
  7,0                        8,0
  editado por secretaria@…   sincronizado em 17/09/2026
  em 12/09/2026
  motivo: "correção conforme
  ata de conselho nº 12"

  [ Manter local ]  [ Aceitar origem ]  [ Ignorar ]
```

### 3.8 `/app/config/instituicao`

Formulário em seções (identificação · endereço · contato · mantenedora · órgão regional · logotipos) com **pré-visualização do cabeçalho do documento** ao lado, atualizando conforme se digita. Mostra na hora o efeito de cada campo no papel impresso.

### 3.9 `/app/config/matriz-curricular`

Seletor de ano letivo + série. Tabela de disciplinas com carga horária e ordem, arrastável. Ações: adicionar disciplina · **copiar matriz de outro ano** · total de carga horária calculado no rodapé.

### 3.10 `/app/formularios`

Os formulários de hoje, preservados: cartões para abrir cada wizard, baixar modelo em branco e ir para as respostas. `/app/formularios/respostas` é a tela atual de respostas, dentro do layout do painel.

## 4. Componentes compartilhados

`LayoutPainel` · `TabelaDados` (ordenação, paginação, estado vazio) · `GradeNotas` (edição inline com auditoria) · `CampoAuditado` (mostra origem e histórico do valor) · `PreviaDocumento` (renderiza `HistoricoDocumento`) · `Assistente` (wizard, reaproveitado dos formulários) · `SelecaoAnoLetivo` · `PainelValidacao` · `ComparadorDivergencia` · `UploadArquivo`.

## 5. Identidade visual

Mantida a do projeto: azul `#0F385A` (primária), vermelho `#c5251a` (destaque), fundo `#F4F6F9`, Inter, cantos `24/14/10px`, sombra suave de cartão. O painel introduz uma densidade maior que a dos formulários públicos — tabelas compactas, espaçamento menor — por ser ferramenta de uso diário e não formulário ocasional.
