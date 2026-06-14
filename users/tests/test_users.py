from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_register_success():
    r = client.post("/users/register", json={
        "name": "Alice", "email": "alice@test.com", "password": "secret123"
    })
    assert r.status_code == 201
    data = r.json()
    assert data["email"] == "alice@test.com"
    assert "id" in data
    assert "password_hash" not in data


def test_register_duplicate_email():
    payload = {"name": "Alice", "email": "alice@test.com", "password": "secret123"}
    client.post("/users/register", json=payload)
    r = client.post("/users/register", json=payload)
    assert r.status_code == 409


def test_login_success():
    client.post("/users/register", json={
        "name": "Bob", "email": "bob@test.com", "password": "pass123"
    })
    r = client.post("/users/login", json={"email": "bob@test.com", "password": "pass123"})
    assert r.status_code == 200
    body = r.json()
    assert "token" in body
    assert "userId" in body


def test_login_wrong_password():
    client.post("/users/register", json={
        "name": "Bob", "email": "bob@test.com", "password": "pass123"
    })
    r = client.post("/users/login", json={"email": "bob@test.com", "password": "wrong"})
    assert r.status_code == 401


def test_get_user_requires_jwt():
    r = client.get("/users/some-id")
    assert r.status_code == 401


def test_get_user_with_valid_jwt():
    client.post("/users/register", json={
        "name": "Carol", "email": "carol@test.com", "password": "abc123"
    })
    login = client.post("/users/login", json={"email": "carol@test.com", "password": "abc123"})
    token = login.json()["token"]
    user_id = login.json()["userId"]

    r = client.get(f"/users/{user_id}", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["email"] == "carol@test.com"
