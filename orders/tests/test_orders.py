import httpx
from fastapi.testclient import TestClient
from jose import jwt
from datetime import datetime, timedelta
from main import app

client = TestClient(app)
SECRET = "test-secret-32-characters-minimum-ok!!"


def make_token(user_id="user-1", role="user"):
    return jwt.encode(
        {"userId": user_id, "email": "t@t.com", "role": role,
         "exp": datetime.utcnow() + timedelta(hours=1)},
        SECRET, algorithm="HS256",
    )


def test_health():
    r = client.get("/health")
    assert r.status_code == 200


def test_create_order_requires_jwt():
    r = client.post("/orders", json={"productId": "p1", "quantity": 1})
    assert r.status_code == 401


def test_create_order_product_not_found(monkeypatch):
    async def mock_get(self, url, **kw):
        class FakeResp:
            status_code = 404
            def json(self): return {}
        return FakeResp()

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)
    r = client.post("/orders",
                    json={"productId": "nonexistent", "quantity": 1},
                    headers={"Authorization": f"Bearer {make_token()}"})
    assert r.status_code == 404


def test_create_order_success(monkeypatch):
    async def mock_get(self, url, **kw):
        class FakeResp:
            status_code = 200
            def json(self): return {"id": "p1", "name": "Widget", "price": 10.0, "stock": 5}
        return FakeResp()

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)
    r = client.post("/orders",
                    json={"productId": "p1", "quantity": 2},
                    headers={"Authorization": f"Bearer {make_token('user-1')}"})
    assert r.status_code == 201
    data = r.json()
    assert data["product_id"] == "p1"
    assert data["quantity"] == 2
    assert data["total"] == 20.0
    assert data["status"] == "pending"


def test_list_orders_requires_jwt():
    r = client.get("/orders/user-1")
    assert r.status_code == 401


def test_list_orders_returns_user_orders(monkeypatch):
    async def mock_get(self, url, **kw):
        class FakeResp:
            status_code = 200
            def json(self): return {"id": "p1", "name": "W", "price": 5.0, "stock": 10}
        return FakeResp()

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)
    token = make_token("user-42")
    client.post("/orders", json={"productId": "p1", "quantity": 1},
                headers={"Authorization": f"Bearer {token}"})
    r = client.get("/orders/user-42", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["user_id"] == "user-42"


def test_list_orders_only_returns_own_orders(monkeypatch):
    async def mock_get(self, url, **kw):
        class FakeResp:
            status_code = 200
            def json(self): return {"id": "p1", "name": "W", "price": 5.0, "stock": 10}
        return FakeResp()

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)
    token_a = make_token("user-A")
    token_b = make_token("user-B")
    client.post("/orders", json={"productId": "p1", "quantity": 1},
                headers={"Authorization": f"Bearer {token_a}"})
    client.post("/orders", json={"productId": "p1", "quantity": 1},
                headers={"Authorization": f"Bearer {token_b}"})

    r = client.get("/orders/user-A", headers={"Authorization": f"Bearer {token_a}"})
    assert len(r.json()) == 1
    assert r.json()[0]["user_id"] == "user-A"
