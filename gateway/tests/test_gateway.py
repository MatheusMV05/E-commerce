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


def test_health_status_returns_services():
    r = client.get("/health/status")
    assert r.status_code == 200
    body = r.json()
    assert "services" in body
    assert "users" in body["services"]
    assert "products" in body["services"]
    assert "products_replica" in body["services"]
    assert "orders" in body["services"]


def test_health_logs_returns_list():
    r = client.get("/health/logs")
    assert r.status_code == 200
    body = r.json()
    assert "logs" in body
    assert isinstance(body["logs"], list)


def test_proxy_rejects_missing_jwt_for_protected_route():
    r = client.get("/users/some-id")
    assert r.status_code == 401


def test_proxy_rejects_invalid_jwt():
    r = client.get("/users/some-id", headers={"Authorization": "Bearer invalid-token"})
    assert r.status_code == 401


def test_proxy_rejects_non_admin_for_product_create():
    r = client.post("/products",
                    json={"name": "X", "description": "Y", "price": 1.0, "stock": 1},
                    headers={"Authorization": f"Bearer {make_token('user')}"})
    assert r.status_code == 403


def test_public_routes_do_not_require_jwt():
    # These return 503 (service down in tests), NOT 401
    r1 = client.get("/products")
    r2 = client.post("/users/login", json={"email": "x", "password": "y"})
    assert r1.status_code != 401
    assert r2.status_code != 401
