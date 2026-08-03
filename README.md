Central de formulários do Colégio São Marcos, com um fluxo de cadastro para visitas e uma área de visualização de respostas para a equipe autorizada.

## Visão geral

Este projeto é uma aplicação web estática em HTML/CSS/JavaScript que:

- exibe uma página inicial com os formulários disponíveis;
- oferece um formulário multi-etapas para cadastro de visitas;
- envia os dados para o Supabase;
- permite que membros da equipe autorizados consultem as respostas via login por magic link.

## Funcionalidades

- Formulário de visitas com wizard em etapas:
  - dados do aluno;
  - escola de origem;
  - dados dos responsáveis;
  - informações extras;
  - revisão antes do envio.
- Armazenamento das respostas em tabelas do Supabase.
- Acesso restrito para visualização de respostas, controlado por lista de e-mails autorizados.

## Tecnologias

- HTML, CSS e JavaScript puro
- Supabase (Postgres + Auth)
- Arquivos estáticos servidos por qualquer web server simples

## Pré-requisitos

- Node.js/NPM não é obrigatório para rodar a interface, mas pode ser útil para servir arquivos localmente.
- Uma instância ou projeto no Supabase com:
  - URL do projeto;
  - chave anônima;
  - schema aplicado no SQL Editor.

## Configuração

1. Copie o arquivo de exemplo de variáveis de ambiente:

   ```bash
   copy .env.example .env
   ```

2. Preencha as variáveis no arquivo `.env`:

   ```env
   SUPABASE_URL=https://seu-projeto.supabase.co
   SUPABASE_ANON_KEY=sua-chave-anonima
   ```

3. Gere o arquivo de configuração do frontend:

   ```bash
   sh scripts/generate-config.sh
   ```

4. Aplique o schema do banco no Supabase:

   - abra o SQL Editor do Supabase;
   - execute o conteúdo de [supabase/schema.sql](supabase/schema.sql).

5. Libere o acesso para a equipe autorizada:

   - insira e-mails na tabela `staff_emails` do Supabase.

## Executando localmente

Como o projeto é estático, você pode servir a pasta raiz com qualquer servidor simples, por exemplo:

```bash
python -m http.server 8000
```

Em seguida, abra no navegador:

- http://localhost:8000/index.html

## Estrutura do projeto

```text
.
├── assets/
│   ├── css/
│   ├── images/
│   └── js/
├── scripts/
├── supabase/
├── form-visitas.html
├── index.html
├── respostas.html
└── README.md
```

## Fluxo principal

- Página inicial: lista os formulários disponíveis.
- Formulário de visitas: coleta os dados do interessado e salva a resposta no Supabase.
- Página de respostas: autentica a equipe via magic link e exibe as respostas aprovadas para o e-mail autorizado.

## Implantação

A geração do arquivo `assets/js/config.js` é feita automaticamente a partir das variáveis de ambiente. Em ambientes como EasyPanel, basta definir `SUPABASE_URL` e `SUPABASE_ANON_KEY` e configurar o build command para:

```bash
sh scripts/generate-config.sh
```

## Licença

Este projeto está sob a licença [MIT](LICENSE).

