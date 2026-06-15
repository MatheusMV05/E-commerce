# Instruções de Execução — Mini E-commerce Distribuído

## Pré-requisitos

- Python 3.11+
- Node.js 20+
- Docker + Docker Compose (opcional, mas recomendado)

---

## Opção 1: Docker Compose (recomendado)

```bash
docker compose up --build
```

Aguarde ~30 s para todos os serviços inicializarem. Acesse:

| Recurso | URL |
|---------|-----|
| Dashboard de monitoramento | http://localhost:5173 |
| API Gateway | http://localhost:8000 |

Para encerrar: `docker compose down`

Para reiniciar preservando dados: `docker compose up`

---

## Opção 2: Execução manual (sem Docker)

Abra **6 terminais separados** e execute cada bloco em seu terminal.

### Terminal 1 — Usuários (:5001)
```bash
cd users
pip install -r requirements.txt
python main.py
```

### Terminal 2 — Produtos primário (:5002)
```bash
cd products
pip install -r requirements.txt
python main.py
```

### Terminal 3 — Produtos réplica (:5012)
```bash
cd products_replica
pip install -r requirements.txt
IS_REPLICA=true PORT=5012 python main.py
```

### Terminal 4 — Pedidos (:5003)
```bash
cd orders
pip install -r requirements.txt
python main.py
```

### Terminal 5 — API Gateway (:8000)
```bash
cd gateway
pip install -r requirements.txt
python main.py
```

### Terminal 6 — Frontend (:5173)
```bash
cd frontend
npm install
npm run dev
```

Abra http://localhost:5173 para o dashboard de monitoramento.

> **Nota:** Para execução manual, copie o arquivo `.env.example` de cada serviço para `.env`:
> ```bash
> cp users/.env.example users/.env
> cp products/.env.example products/.env
> cp products_replica/.env.example products_replica/.env
> cp orders/.env.example orders/.env
> cp gateway/.env.example gateway/.env
> ```

---

## Testando com curl

### 1. Criar usuário admin
```bash
curl -X POST http://localhost:8000/users/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","email":"admin@test.com","password":"admin123","role":"admin"}'
```

### 2. Criar usuário comum
```bash
curl -X POST http://localhost:8000/users/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@test.com","password":"alice123","role":"user"}'
```

### 3. Login como admin e salvar token
```bash
TOKEN=$(curl -s -X POST http://localhost:8000/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"admin123"}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "Token: $TOKEN"
```

### 4. Criar produto (requer token admin)
```bash
curl -X POST http://localhost:8000/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Notebook","description":"Laptop 15 pol","price":2999.99,"stock":10}'
```

### 5. Listar produtos (público)
```bash
curl http://localhost:8000/products
```

### 6. Verificar que a réplica também recebeu o produto
```bash
curl http://localhost:5012/products
```

### 7. Login como Alice e criar pedido
```bash
ALICE_DATA=$(curl -s -X POST http://localhost:8000/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@test.com","password":"alice123"}')
ALICE_TOKEN=$(echo $ALICE_DATA | python -c "import sys,json; print(json.load(sys.stdin)['token'])")
ALICE_ID=$(echo $ALICE_DATA | python -c "import sys,json; print(json.load(sys.stdin)['userId'])")

PRODUCT_ID=$(curl -s http://localhost:8000/products \
  | python -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")

curl -X POST http://localhost:8000/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -d "{\"productId\":\"$PRODUCT_ID\",\"quantity\":2}"
```

### 8. Listar pedidos de Alice
```bash
curl "http://localhost:8000/orders/$ALICE_ID" \
  -H "Authorization: Bearer $ALICE_TOKEN"
```

### 9. Verificar status dos serviços
```bash
curl http://localhost:8000/health/status | python -m json.tool
curl http://localhost:8000/health/logs | python -m json.tool
```

---

## Simulando falha de serviço (heartbeat)

1. Com todos os serviços rodando, **encerre** o serviço de pedidos (Ctrl+C no Terminal 4)
2. Aguarde **~10 segundos** (2 falhas × 5 s de intervalo do heartbeat)
3. Observe no dashboard: card **Orders** muda para vermelho
4. Tente criar um pedido — receberá `503 Service Unavailable`
5. **Reinicie** o serviço de pedidos (`python main.py` no Terminal 4)
6. Após ~5 s o card voltará para verde e o log registrará "recovered"

---

## Executando os testes unitários

```bash
cd users && pytest tests/ -v
cd ../products && pytest tests/ -v
cd ../orders && pytest tests/ -v
cd ../gateway && pytest tests/ -v
```
