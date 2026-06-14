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
