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
- **Dashboard** — polling a cada 3 s com cards de status, latência, feed de eventos e tabela de logs

---

## Pré-requisitos

- Docker + Docker Compose **ou** Python 3.11+ e Node.js 20+

---

## Execução

### Opção A — Docker Compose (recomendado)

```bash
docker compose up --build
```

Aguarde ~30 s. Acesse o dashboard em **http://localhost:5173** e o gateway em **http://localhost:8000**.

Para encerrar: `docker compose down`  
Para reiniciar preservando dados: `docker compose up`

---

### Opção B — Manual (6 terminais)

Copie os arquivos de configuração primeiro:

```bash
cp users/.env.example users/.env
cp products/.env.example products/.env
cp products_replica/.env.example products_replica/.env
cp orders/.env.example orders/.env
cp gateway/.env.example gateway/.env
```

**Terminal 1 — Users**
```bash
cd users && pip install -r requirements.txt && python main.py
```

**Terminal 2 — Products primário**
```bash
cd products && pip install -r requirements.txt && python main.py
```

**Terminal 3 — Products réplica**
```bash
cd products_replica && pip install -r requirements.txt && IS_REPLICA=true PORT=5012 python main.py
```

**Terminal 4 — Orders**
```bash
cd orders && pip install -r requirements.txt && python main.py
```

**Terminal 5 — Gateway**
```bash
cd gateway && pip install -r requirements.txt && python main.py
```

**Terminal 6 — Frontend**
```bash
cd frontend && npm install && npm run dev
```

---

## Endpoints

Todas as rotas são acessadas via o Gateway em `:8000`.

### Users

| Método | Rota              | Auth  | Descrição                  |
|--------|-------------------|-------|----------------------------|
| POST   | /users/register   | —     | Cria usuário               |
| POST   | /users/login      | —     | Retorna JWT                |
| GET    | /users/{id}       | JWT   | Dados do usuário           |
| GET    | /health           | —     | Healthcheck                |

### Products

| Método | Rota              | Auth       | Descrição                  |
|--------|-------------------|------------|----------------------------|
| GET    | /products         | —          | Lista produtos             |
| GET    | /products/{id}    | —          | Detalhe do produto         |
| POST   | /products         | JWT admin  | Cria produto               |
| GET    | /health           | —          | Healthcheck                |

### Orders

| Método | Rota              | Auth  | Descrição                  |
|--------|-------------------|-------|----------------------------|
| POST   | /orders           | JWT   | Cria pedido                |
| GET    | /orders/{userId}  | JWT   | Lista pedidos do usuário   |
| GET    | /health           | —     | Healthcheck                |

### Gateway

| Método | Rota              | Descrição                              |
|--------|-------------------|----------------------------------------|
| GET    | /health/status    | Estado atual de todos os serviços      |
| GET    | /health/logs      | Histórico de eventos up/down           |

---

## Sequência de teste com curl

```bash
# 1. Registrar admin
curl -X POST http://localhost:8000/users/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","email":"admin@test.com","password":"admin123","role":"admin"}'

# 2. Login e salvar token
TOKEN=$(curl -s -X POST http://localhost:8000/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"admin123"}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['token'])")

# 3. Criar produto (admin)
curl -X POST http://localhost:8000/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Notebook","description":"Laptop 15 pol","price":2999.99,"stock":10}'

# 4. Verificar réplica (deve ter o produto)
curl http://localhost:5012/products

# 5. Registrar usuário comum
curl -X POST http://localhost:8000/users/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@test.com","password":"alice123","role":"user"}'

# 6. Login como Alice
ALICE=$(curl -s -X POST http://localhost:8000/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@test.com","password":"alice123"}')
ALICE_TOKEN=$(echo $ALICE | python -c "import sys,json; print(json.load(sys.stdin)['token'])")
ALICE_ID=$(echo $ALICE | python -c "import sys,json; print(json.load(sys.stdin)['userId'])")

# 7. Criar pedido
PRODUCT_ID=$(curl -s http://localhost:8000/products \
  | python -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
curl -X POST http://localhost:8000/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -d "{\"productId\":\"$PRODUCT_ID\",\"quantity\":2}"

# 8. Listar pedidos de Alice
curl "http://localhost:8000/orders/$ALICE_ID" \
  -H "Authorization: Bearer $ALICE_TOKEN"

# 9. Status dos serviços
curl http://localhost:8000/health/status | python -m json.tool
```

---

## Simulando falha (heartbeat)

```bash
# Parar o serviço de pedidos
docker compose stop orders

# Aguardar ~10 s (2 falhas × 5 s)
# No dashboard: card Orders ficará vermelho
# Tentar criar pedido retorna 503

# Reiniciar
docker compose start orders
# Após ~5 s o card volta verde e o log registra "recovered"
```

---

## Testes unitários

37 testes no total (pytest), cobrindo happy path, erros de autenticação, edge cases e rollback de replicação.

```bash
cd users   && pytest tests/ -v   # 9 testes
cd products && pytest tests/ -v  # 11 testes
cd orders  && pytest tests/ -v   # 10 testes
cd gateway && pytest tests/ -v   # 7 testes
```

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
└── README.md
```
