# Instruções de Execução — Mini E-commerce Distribuído

## Pré-requisitos

- Docker + Docker Compose **ou** Python 3.11+ e Node.js 20+

---

## Opção A — Docker Compose (recomendado)

```bash
docker compose up --build
```

Aguarde ~30 s. Acesse o dashboard em **http://localhost:5173** e o gateway em **http://localhost:8000**.

Para encerrar: `docker compose down`

---

## Opção B — Manual (6 terminais)

```bash
# Copiar configurações
cp users/.env.example users/.env
cp products/.env.example products/.env
cp products_replica/.env.example products_replica/.env
cp orders/.env.example orders/.env
cp gateway/.env.example gateway/.env
```

```bash
# Terminal 1 — Users
cd users && pip install -r requirements.txt && python main.py

# Terminal 2 — Products primário
cd products && pip install -r requirements.txt && python main.py

# Terminal 3 — Products réplica
cd products_replica && pip install -r requirements.txt && IS_REPLICA=true PORT=5012 python main.py

# Terminal 4 — Orders
cd orders && pip install -r requirements.txt && python main.py

# Terminal 5 — Gateway
cd gateway && pip install -r requirements.txt && python main.py

# Terminal 6 — Frontend
cd frontend && npm install && npm run dev
```

---

## Testando com curl

```bash
# Registrar admin e obter token
curl -X POST http://localhost:8000/users/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","email":"admin@test.com","password":"admin123","role":"admin"}'

TOKEN=$(curl -s -X POST http://localhost:8000/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"admin123"}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['token'])")

# Criar produto (requer token admin)
curl -X POST http://localhost:8000/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Notebook","description":"Laptop 15 pol","price":2999.99,"stock":10}'

# Verificar réplica
curl http://localhost:5012/products

# Status dos serviços
curl http://localhost:8000/health/status | python -m json.tool
```

---

## Simulando falha (heartbeat)

```bash
docker compose stop orders   # derrubar serviço
# aguardar ~10 s — card Orders fica vermelho no dashboard, /orders retorna 503
docker compose start orders  # reiniciar
# após ~5 s o card volta verde e o log registra "recovered"
```

---

## Testes unitários

```bash
cd users    && pytest tests/ -v   # 9 testes
cd products && pytest tests/ -v   # 11 testes
cd orders   && pytest tests/ -v   # 10 testes
cd gateway  && pytest tests/ -v   # 7 testes
```
