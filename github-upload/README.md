# Meu Site

Projeto React com backend local para mensagens, armazenamento em SQLite e integracoes futuras com webhook do WhatsApp Business API.

## Como rodar

1. Em um terminal, suba a central de mensagens:

```bash
npm run messages:server
```

2. Em outro terminal, rode o frontend:

```bash
npm run dev
```

3. Se preferir testar o build local:

```bash
npm run build
npm run preview
```

## Enderecos locais

- Frontend: `http://localhost:4173`
- API de mensagens: `http://localhost:3002`
- Health da API de mensagens: `http://localhost:3002/api/health`

## Estrutura principal

- `src/App.jsx`: interface principal, sidebar e tela da central de mensagens
- `src/App.css`: estilos da sidebar, badge e painel de mensagens
- `backend/server.js`: API Express da central de mensagens
- `backend/messages-service.js`: regras de negocio para contatos, mensagens e webhook
- `backend/db.js`: inicializacao do banco SQLite
- `database/schema.sql`: schema das tabelas `contatos` e `mensagens`
- `database/mensagens.sqlite`: banco local criado automaticamente ao subir o backend

## Rotas novas

- `GET /api/mensagens/pendentes`
- `GET /api/mensagens`
- `POST /api/mensagens`
- `POST /api/responder`
- `GET /webhook`
- `POST /webhook`

## Observacoes

- O badge da sidebar atualiza a cada 5 segundos.
- A tela de mensagens permite pesquisar, filtrar por status e responder manualmente.
- O webhook ja aceita verificacao da Meta e recebimento via `POST` com segredo em `x-webhook-secret`.
