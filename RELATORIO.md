# Relatório — Atividade 1: Mini E-commerce Distribuído

**Disciplina:** Sistemas Distribuídos  
**Aluno:** Matheus M. Veríssimo  
**Data:** 2026-06-14  
**Pontuação possível:** 3,0 + 0,2 (Docker) + 0,1 (Dashboard) = **3,3 pts**

---

## 1. Visão Geral

Foi implementado um sistema de e-commerce distribuído composto por:

- **3 microsserviços independentes:** Users, Products, Orders
- **1 réplica de Products** (consistência forte)
- **1 API Gateway** — ponto de entrada único com JWT, heartbeat e roteamento
- **1 frontend React** — dashboard de monitoramento em tempo real
- **Docker Compose** — orquestração completa com 6 contêineres

Toda a comunicação entre clientes e serviços passa obrigatoriamente pelo Gateway na porta `:8000`.

---

## 2. Microsserviços

### 2.1 Users (:5001)

Responsável por identidade e autenticação.

| Endpoint          | Auth | Descrição                          |
|-------------------|------|------------------------------------|
| POST /users/register | — | Cria usuário com senha bcrypt     |
| POST /users/login    | — | Autentica e retorna JWT           |
| GET /users/{id}      | JWT | Retorna dados do usuário          |
| GET /health          | — | Healthcheck                       |

**Senhas:** armazenadas com `bcrypt.hashpw` (fator 12, salt automático). Não usamos `passlib` por incompatibilidade com bcrypt 5.x no Python 3.13.

**Persistência:** `data/users.json` com `asyncio.Lock` para segurança em concorrência. O padrão `_read()`/`_write()` (sem lock) é combinado com seção crítica explícita em `register`, eliminando race condition TOCTOU.

### 2.2 Products (:5002 primário / :5012 réplica)

Gerencia o catálogo de produtos. O mesmo código serve ambas as instâncias; a variável `IS_REPLICA=true` desativa a propagação na réplica.

| Endpoint          | Auth      | Descrição                          |
|-------------------|-----------|-------------------------------------|
| GET /products     | —         | Lista todos os produtos            |
| GET /products/{id}| —         | Detalhe do produto                 |
| POST /products    | JWT admin | Cria produto                       |
| POST /internal/sync | —       | Endpoint interno de replicação     |
| GET /health       | —         | Healthcheck                        |

### 2.3 Orders (:5003)

Cria e lista pedidos. Valida a existência do produto chamando o serviço Products via HTTP.

| Endpoint           | Auth | Descrição                              |
|--------------------|------|----------------------------------------|
| POST /orders       | JWT  | Cria pedido (`productId`, `quantity`)  |
| GET /orders/{userId} | JWT | Lista pedidos do usuário (IDOR-safe) |
| GET /health        | —    | Healthcheck                            |

**Proteção IDOR:** `GET /orders/{userId}` verifica que `current["userId"] == user_id` ou `role == "admin"` antes de retornar os dados.

**Validação:** `quantity: int = Field(ge=1)` — quantidades menores que 1 retornam `422 Unprocessable Entity`.

---

## 3. API Gateway (:8000)

Ponto de entrada único. Responsabilidades:

### 3.1 Autenticação JWT

- Rotas públicas (register, login, GET /products, /health*) não exigem token
- Demais rotas exigem `Authorization: Bearer <token>` válido
- `POST /products` exige adicionalmente `role == "admin"`
- Validação com `options={"require": ["exp"]}` — tokens sem expiração são rejeitados
- Path normalizado com `.rstrip("/")` para evitar bypass por trailing slash
- Prefixo verificado com boundary de segmento: `path == p or path.startswith(p + "/")`

### 3.2 Roteamento e Round-Robin

Leituras de produtos são distribuídas em round-robin entre serviços com estado `UP`. Escritas vão sempre para a primária (:5002).

### 3.3 Heartbeat e Detecção de Falha

Loop `asyncio` em background (não bloqueia requisições):

- **Intervalo:** 5 segundos
- **Timeout por request:** 2 segundos
- **Política:** 2 falhas consecutivas → serviço marcado `DOWN`, evento logado com timestamp ISO 8601
- **Recuperação:** primeira resposta bem-sucedida → serviço marcado `UP`, evento `"recovered"` logado
- **Impacto:** requisições para serviço `DOWN` retornam imediatamente `503 Service Unavailable`

Endpoints de observabilidade:
- `GET /health/status` — estado atual + latência + fail_count de cada serviço
- `GET /health/logs` — histórico completo de eventos

---

## 4. Replicação de Produtos

**Estratégia:** Consistência forte (synchronous replication with rollback).

**Fluxo de escrita:**
1. Gateway encaminha `POST /products` para a primária (:5002)
2. Primária persiste localmente
3. Primária chama `POST /internal/sync` na réplica (:5012) via `httpx` (timeout 5 s)
4. Se réplica aceitar → responde `201` ao cliente
5. Se réplica recusar ou estiver inacessível → **rollback** na primária → responde `503`

**Justificativa:** Consistência forte garante que leituras da réplica nunca retornem dados desatualizados. Para o escopo da atividade, a simplicidade de implementação e a ausência de conflitos compensam a latência de escrita ligeiramente maior.

**Fluxo de leitura:** Round-robin entre instâncias com estado `UP`. Se a primária cair, leituras continuam na réplica.

---

## 5. Autenticação JWT

- **Biblioteca:** `python-jose[cryptography]`
- **Payload:** `{ userId, email, role, exp }`
- **Roles:** `user` (padrão) | `admin`
- **Expiração:** 24 horas
- **Segredo:** variável de ambiente `JWT_SECRET` (mínimo 32 caracteres), nunca commitado

Fluxo:
1. `POST /users/login` → JWT retornado ao cliente
2. Cliente envia `Authorization: Bearer <token>` nas rotas protegidas
3. Gateway valida o token e, se válido, injeta `X-User-Id`, `X-User-Email`, `X-User-Role` nos headers internos
4. Serviços internos também validam (defesa em profundidade)

---

## 6. Frontend — Dashboard de Monitoramento

Stack: **React 19 + TypeScript + Vite + Tailwind CSS v4**

Componentes:
- **ServiceCard** — nome, porta, badge UP/DOWN (verde/vermelho), latência em ms, última verificação
- **EventFeed** — últimos 8 eventos com dots coloridos e timestamps
- **LogTable** — tabela completa com todos os eventos históricos

Polling a cada **3 segundos** via `setInterval`/`clearInterval` — sem bibliotecas externas de estado.

---

## 7. Docker Compose

6 serviços orquestrados com:
- `depends_on` para sequência correta de inicialização
- Âncora YAML (`x-jwt`) compartilhando `JWT_SECRET` entre todos os serviços
- Volumes nomeados para persistência dos JSONs entre reinicializações
- Multi-stage build para o frontend (node:20-alpine → nginx:alpine)

```bash
docker compose up --build   # sobe tudo
docker compose down         # encerra e remove contêineres
```

---

## 8. Testes

**37 testes unitários** com `pytest` + `httpx` (TestClient do FastAPI):

| Serviço  | Testes | Cobertura principal                                              |
|----------|--------|------------------------------------------------------------------|
| Users    | 9      | health, register, email duplicado, login, JWT inválido, 404     |
| Products | 11     | health, CRUD, autenticação admin, rollback de réplica, sync     |
| Orders   | 10     | health, JWT, IDOR (403), validação de quantidade, 503 produtos  |
| Gateway  | 7      | health, JWT ausente/inválido, admin check, trailing slash, prefixo |

Todos os testes passam com `pytest <serviço>/tests/ -v`.

---

## 9. Segurança — Decisões Relevantes

| Vulnerabilidade            | Mitigação implementada                                        |
|----------------------------|---------------------------------------------------------------|
| Senhas em texto puro       | bcrypt com fator 12                                           |
| JWT sem expiração          | `options={"require": ["exp"]}` no decode                     |
| Bypass por trailing slash  | `path.rstrip("/")` no início do proxy                        |
| Prefix overshoot           | Verificação de boundary: `path == p or path.startswith(p+"/")` |
| IDOR em pedidos            | Verificação de ownership: `userId == user_id or role == admin` |
| TOCTOU em registro         | `asyncio.Lock` cobrindo toda a seção read-check-write        |
| Secrets em repositório     | `.env` no `.gitignore`; apenas `.env.example` commitado      |

---

## 10. Estrutura de Arquivos

```
E-commerce/
├── gateway/
│   ├── main.py              # Proxy, JWT, heartbeat, round-robin
│   ├── requirements.txt
│   ├── Dockerfile
│   └── tests/test_gateway.py
├── users/
│   ├── main.py              # Register, login, JWT
│   ├── requirements.txt
│   ├── Dockerfile
│   └── tests/test_users.py
├── products/
│   ├── main.py              # CRUD + replicação + /internal/sync
│   ├── requirements.txt
│   ├── Dockerfile
│   └── tests/test_products.py
├── products_replica/
│   ├── main.py              # Mesmo código; IS_REPLICA=true
│   ├── requirements.txt
│   └── Dockerfile
├── orders/
│   ├── main.py              # Criação e listagem de pedidos
│   ├── requirements.txt
│   ├── Dockerfile
│   └── tests/test_orders.py
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # Polling 3s, layout principal
│   │   ├── components/
│   │   │   ├── ServiceCard.tsx
│   │   │   ├── EventFeed.tsx
│   │   │   └── LogTable.tsx
│   │   └── lib/api.ts       # fetchStatus(), fetchLogs()
│   ├── Dockerfile
│   └── nginx.conf
├── docker-compose.yml
├── README.md
└── RELATORIO.md
```

---

## 11. Requisitos Atendidos

| Requisito                               | Status | Onde                                      |
|-----------------------------------------|--------|-------------------------------------------|
| 3 microsserviços distintos              | ✅     | users, products, orders                   |
| Replicação simples (2 réplicas)         | ✅     | products + products_replica               |
| Escrita em ambas as réplicas            | ✅     | products/main.py — propagação síncrona    |
| Leitura round-robin                     | ✅     | gateway — contador round-robin             |
| Heartbeat a cada 5 s                    | ✅     | gateway — asyncio background task         |
| 2 tentativas antes de DOWN              | ✅     | gateway — fail_count >= 2                 |
| Log com timestamp                       | ✅     | gateway — event log ISO 8601              |
| 503 para serviço DOWN                   | ✅     | gateway — middleware de roteamento        |
| Recuperação logada                      | ✅     | gateway — "recovered" no event log        |
| /health em todos os serviços            | ✅     | todos os serviços                         |
| JWT com userId / email / role / exp     | ✅     | users/main.py                             |
| Senha com hash                          | ✅     | bcrypt fator 12                           |
| Admin para POST /products               | ✅     | gateway + products                        |
| README de execução                      | ✅     | README.md                                 |
| **Docker Compose (bônus +0,2)**         | ✅     | docker-compose.yml                        |
| **Dashboard HTML (bônus +0,1)**         | ✅     | frontend/ — React + Tailwind              |
