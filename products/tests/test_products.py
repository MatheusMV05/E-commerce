import httpx
from fastapi.testclient import TestClient
from jose import jwt
from datetime import datetime, timedelta
from main import app

client = TestClient(app)
SECRET = "test-secret-32-characters-minimum-ok!!"


def make_token(role="user"):
    return jwt.encode(
        {"userId": "u1", "email": "t@t.com", "role": role,
         "exp": datetime.utcnow() + timedelta(hours=1)},
        SECRET, algorithm="HS256",
    )


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_list_products_empty():
    r = client.get("/products")
    assert r.status_code == 200
    assert r.json() == []


def test_create_product_no_auth():
    r = client.post("/products",
                    json={"name": "P", "description": "D", "price": 1.0, "stock": 10})
    assert r.status_code == 401


def test_create_product_requires_admin():
    r = client.post("/products",
                    json={"name": "P", "description": "D", "price": 1.0, "stock": 10},
                    headers={"Authorization": f"Bearer {make_token('user')}"})
    assert r.status_code == 403


def test_create_product_as_admin(monkeypatch):
    async def mock_post(self, url, **kw):
        class FakeResp:
            status_code = 201
        return FakeResp()

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    r = client.post("/products",
                    json={"name": "Widget", "description": "A widget", "price": 9.99, "stock": 5},
                    headers={"Authorization": f"Bearer {make_token('admin')}"})
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Widget"
    assert "id" in data


def test_get_product_not_found():
    r = client.get("/products/nonexistent")
    assert r.status_code == 404


def test_list_products_after_create(monkeypatch):
    async def mock_post(self, url, **kw):
        class FakeResp:
            status_code = 201
        return FakeResp()

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    client.post("/products",
                json={"name": "Chair", "description": "Comfy", "price": 199.0, "stock": 3},
                headers={"Authorization": f"Bearer {make_token('admin')}"})
    r = client.get("/products")
    assert len(r.json()) == 1
    assert r.json()[0]["name"] == "Chair"


def test_create_product_replica_unreachable(monkeypatch):
    """Rollback: when replica is unreachable, local write is rolled back and 503 is returned."""
    import httpx as _httpx

    async def mock_post_fail(self, url, **kw):
        raise _httpx.RequestError("connection refused")

    monkeypatch.setattr(_httpx.AsyncClient, "post", mock_post_fail)

    r = client.post("/products",
                    json={"name": "Ghost", "description": "Will rollback", "price": 1.0, "stock": 1},
                    headers={"Authorization": f"Bearer {make_token('admin')}"})
    assert r.status_code == 503

    # Confirm product was rolled back — list must be empty
    r2 = client.get("/products")
    assert r2.json() == []


def test_get_product_by_id(monkeypatch):
    """GET /products/{id} returns the correct product."""
    async def mock_post(self, url, **kw):
        class FakeResp:
            status_code = 201
        return FakeResp()

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    create_r = client.post("/products",
                           json={"name": "Table", "description": "Wooden table", "price": 299.0, "stock": 2},
                           headers={"Authorization": f"Bearer {make_token('admin')}"})
    assert create_r.status_code == 201
    product_id = create_r.json()["id"]

    r = client.get(f"/products/{product_id}")
    assert r.status_code == 200
    assert r.json()["name"] == "Table"
    assert r.json()["id"] == product_id


def test_internal_sync_stores_product():
    """POST /internal/sync writes product without JWT."""
    product = {
        "id": "sync-test-id",
        "name": "Synced",
        "description": "Via sync",
        "price": 5.0,
        "stock": 10,
        "created_at": "2024-01-01T00:00:00"
    }
    r = client.post("/internal/sync", json=product)
    assert r.status_code == 201
    assert r.json() == {"ok": True}

    listed = client.get("/products")
    assert any(p["id"] == "sync-test-id" for p in listed.json())


def test_internal_sync_idempotent():
    """POST /internal/sync twice with same product does not duplicate."""
    product = {
        "id": "idempotent-id",
        "name": "Dupe",
        "description": "Should not duplicate",
        "price": 1.0,
        "stock": 1,
        "created_at": "2024-01-01T00:00:00"
    }
    client.post("/internal/sync", json=product)
    client.post("/internal/sync", json=product)

    listed = client.get("/products")
    matching = [p for p in listed.json() if p["id"] == "idempotent-id"]
    assert len(matching) == 1
