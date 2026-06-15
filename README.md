# Mini E-commerce Distribuído

Sistema de e-commerce distribuído com 3 microsserviços, API Gateway, replicação de produtos e dashboard de monitoramento em tempo real.

---

## Arquitetura

```
Cliente (curl / Postman / Dashboard)
│
┌──────────▼───────────┐
│     API Gateway      │  :8000  — ponto de entrada único
└───┬────────┬──────┬──┘
    │        │      │
┌───▼──┐ ┌───▼──┐ ┌─▼─────┐
│Users │ │Prod  │ │Orders │
│:5001 │ │:5002 │ │:5003  │
└──────┘ └──┬───┘ └───────┘
            │ sync (escrita forte)
         ┌──▼──────┐
         │Replica  │
         │:5012    │
         └─────────┘
```

| Serviço             | Porta | Descrição                              |
|---------------------|-------|----------------------------------------|
| API Gateway         | 8000  | Proxy reverso + JWT + heartbeat        |
| Users               | 5001  | Registro, login, JWT                   |
| Products (primário) | 5002  | CRUD de produtos + replicação          |
| Products (réplica)  | 5012  | Réplica de leitura                     |
| Orders              | 5003  | Criação e listagem de pedidos          |
| Frontend            | 5173  | Dashboard de monitoramento             |

---

## Funcionalidades

- **JWT** — autenticação com `userId`, `email`, `role`, `exp` (24 h)
- **Roles** — `admin` (cria produtos) e `user` (cria pedidos)
- **Bcrypt** — hash de senha com fator 12
- **Replicação forte** — escrita na primária propaga sincronamente para a réplica; rollback em caso de falha
- **Round-robin** — leituras de produtos alternadas entre primária e réplica
- **Heartbeat** — verificação a cada 5 s; 2 falhas consecutivas → serviço marcado DOWN; recuperação logada
- **503 automático** — requisições para serviços DOWN retornam `503 Service Unavailable`
- **Dashboard** — polling a cada 3 s com cards de status, request tester e log unificado de eventos

---

## Endpoints

Todas as rotas são acessadas via o Gateway em `:8000`.

### Users

| Método | Rota            | Auth      | Descrição        |
|--------|-----------------|-----------|------------------|
| POST   | /users/register | —         | Cria usuário     |
| POST   | /users/login    | —         | Retorna JWT      |
| GET    | /users/{id}     | JWT       | Dados do usuário |

### Products

| Método | Rota            | Auth      | Descrição        |
|--------|-----------------|-----------|------------------|
| GET    | /products       | —         | Lista produtos   |
| GET    | /products/{id}  | —         | Detalhe          |
| POST   | /products       | JWT admin | Cria produto     |

### Orders

| Método | Rota              | Auth | Descrição                |
|--------|-------------------|------|--------------------------|
| POST   | /orders           | JWT  | Cria pedido              |
| GET    | /orders/{userId}  | JWT  | Lista pedidos do usuário |

### Gateway

| Método | Rota           | Descrição                         |
|--------|----------------|-----------------------------------|
| GET    | /health/status | Estado atual de todos os serviços |
| GET    | /health/logs   | Histórico de eventos up/down      |

---

## Estrutura do projeto

```
E-commerce/
├── gateway/            # API Gateway — proxy, JWT, heartbeat, round-robin
├── users/              # Serviço de usuários — registro, login, JWT
├── products/           # Serviço de produtos — CRUD + replicação primária
├── products_replica/   # Réplica de produtos (mesmo código, IS_REPLICA=true)
├── orders/             # Serviço de pedidos
├── frontend/           # Dashboard React + Tailwind CSS v4 + Vite
├── docker-compose.yml
├── README.md
└── README_execucao.md  # Instruções de execução
```

> Para executar o projeto consulte **[README_execucao.md](README_execucao.md)**.
