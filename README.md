Central de formulários do Colégio São Marcos com servidor Node.js/Express. Oferece um fluxo de cadastro para visitas e uma área de visualização de respostas para a equipe autorizada.

## Visão geral

Aplicação web full-stack que:

- exibe uma página inicial com os formulários disponíveis;
- oferece um formulário multi-etapas para cadastro de visitas;
- envia os dados para o Supabase (Postgres);
- permite que membros da equipe autorizados consultem as respostas após login.

## Funcionalidades

- Formulário de visitas com wizard em etapas (aluno, escola, responsáveis, extras, revisão);
- Armazenamento seguro de respostas no Supabase;
- Autenticação de equipe com senha obrigatória na primeira vez;
- Acesso restrito por lista de e-mails (`staff_emails`);
- Renderização de templates lado do servidor com EJS;
- Sessões seguras com cookies httpOnly.

## Tecnologias

- **Backend:** Node.js + Express
- **Frontend:** EJS templates, CSS, JavaScript
- **Banco:** Supabase (Postgres)
- **Autenticação:** Supabase Auth com email/password

## Pré-requisitos

- Node.js 18+
- Uma instância no Supabase com:
  - URL do projeto;
  - chave anônima;
  - chave de serviço (service role);
  - schema aplicado no SQL Editor.

## Configuração

1. Clone e instale as dependências:

   ```bash
   git clone <repo>
   cd csm-forms
   npm install
   ```

2. Copie e configure o arquivo `.env`:

   ```bash
   cp .env.example .env
   ```

   Preencha as variáveis:

   ```env
   SUPABASE_URL=https://seu-projeto.supabase.co
   SUPABASE_ANON_KEY=sua-chave-anonima
   SUPABASE_SERVICE_ROLE_KEY=sua-chave-servico
   COOKIE_SECRET=gere-uma-string-aleatoria-longa-aqui
   PORT=3000
   ```

3. Aplique o schema do banco:

   - Abra o SQL Editor do Supabase;
   - execute o conteúdo de [supabase/schema.sql](supabase/schema.sql).

4. (Opcional) Provisione membros da equipe:

   ```bash
   node scripts/provision-staff-users.mjs email@saomarcos.com.br "Nome Completo"
   ```

   Senha padrão: `SaoMarcos` (obrigatório trocar no primeiro login).

## Executando localmente

```bash
npm start
```

Acesse em http://localhost:3000

## Estrutura do projeto

```text
.
├── lib/
│   └── supabase.js          # Cliente Supabase
├── public/
│   ├── css/
│   ├── images/
│   └── js/
├── routes/
│   ├── api.js               # Endpoints da API
│   └── pages.js             # Rotas de páginas
├── views/
│   ├── form-visitas.ejs     # Formulário multi-etapas
│   ├── respostas.ejs        # Visualização de respostas
│   ├── index.ejs            # Página inicial
│   └── partials/            # Componentes reutilizáveis
├── scripts/
│   └── provision-staff-users.mjs  # Script de provisioning
├── supabase/
│   └── schema.sql           # Schema do banco
├── server.js                # Entrada do app
├── package.json
└── .env.example
```

## Fluxo principal

1. **Página inicial:** Lista formulários disponíveis;
2. **Formulário de visitas:** Coleta dados em etapas e salva no Supabase;
3. **Página de respostas:** Requer login e exibe respostas da equipe autorizada.

## Implantação

Defina as variáveis de ambiente no seu hosting e execute:

```bash
npm start
```

Ou configure um process manager como PM2:

```bash
pm2 start server.js --name csm-forms
```

## Licença

Este projeto está sob a licença [MIT](LICENSE).

