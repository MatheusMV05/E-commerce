import os
import asyncio
import time
from datetime import datetime

import httpx
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from jose import jwt, JWTError
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="API Gateway")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

JWT_SECRET = os.getenv("JWT_SECRET", "changeme-secret-32-characters!!")
ALGORITHM = "HS256"

USERS_URL = os.getenv("USERS_URL", "http://localhost:5001")
PRODUCTS_URL = os.getenv("PRODUCTS_URL", "http://localhost:5002")
PRODUCTS_REPLICA_URL = os.getenv("PRODUCTS_REPLICA_URL", "http://localhost:5012")
ORDERS_URL = os.getenv("ORDERS_URL", "http://localhost:5003")

SERVICES = {
    "users": USERS_URL,
    "products": PRODUCTS_URL,
    "products_replica": PRODUCTS_REPLICA_URL,
    "orders": ORDERS_URL,
}

service_state: dict[str, dict] = {
    name: {"up": True, "fail_count": 0, "last_ping": None, "latency_ms": None}
    for name in SERVICES
}
event_log: list[dict] = []
_rr = 0


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _log(service: str, status: str, note: str = "") -> None:
    event_log.append({"service": service, "status": status, "note": note, "timestamp": _now()})
    if len(event_log) > 200:
        event_log.pop(0)


def _register_fail(name: str) -> None:
    state = service_state[name]
    state["fail_count"] += 1
    state["last_ping"] = _now()
    if state["fail_count"] >= 2 and state["up"]:
        state["up"] = False
        _log(name, "DOWN")
        print(f"[{_now()}] {name} DOWN", flush=True)


async def _heartbeat():
    while True:
        await asyncio.sleep(5)
        for name, base_url in SERVICES.items():
            try:
                start = time.time()
                async with httpx.AsyncClient(timeout=2.0) as c:
                    resp = await c.get(f"{base_url}/health")
                latency = round((time.time() - start) * 1000)
                if resp.status_code == 200:
                    was_down = not service_state[name]["up"]
                    service_state[name].update(
                        {"up": True, "fail_count": 0, "last_ping": _now(), "latency_ms": latency}
                    )
                    if was_down:
                        _log(name, "UP", "recovered")
                        print(f"[{_now()}] {name} RECOVERED", flush=True)
                else:
                    _register_fail(name)
            except Exception:
                _register_fail(name)


@app.on_event("startup")
async def startup():
    asyncio.create_task(_heartbeat())


# --- JWT helpers ---

def _decode(token: str) -> dict:
    return jwt.decode(
        token, JWT_SECRET, algorithms=[ALGORITHM],
        options={"require": ["exp"]},
    )


def _token(request: Request) -> str | None:
    auth = request.headers.get("Authorization", "")
    return auth[7:] if auth.startswith("Bearer ") else None


# Public routes (no JWT needed): (method, path_prefix)
_PUBLIC = [
    ("POST", "users/register"),
    ("POST", "users/login"),
    ("GET", "products"),
    ("GET", "health"),
]

# Admin-only routes: (method, exact_path)
_ADMIN = [("POST", "products")]


def _is_public(method: str, path: str) -> bool:
    for m, p in _PUBLIC:
        if method != m:
            continue
        if path == p or path.startswith(p + "/"):
            return True
    return False


def _needs_admin(method: str, path: str) -> bool:
    return any(method == m and path == p for m, p in _ADMIN)


def _resolve(path: str, method: str) -> tuple[str, str]:
    global _rr
    prefix = path.split("/")[0]
    if prefix == "users":
        return "users", USERS_URL
    if prefix == "products":
        if method == "GET":
            candidates = [
                ("products", PRODUCTS_URL),
                ("products_replica", PRODUCTS_REPLICA_URL),
            ]
            up = [(n, u) for n, u in candidates if service_state[n]["up"]]
            if not up:
                raise LookupError("all-products-down")
            name, url = up[_rr % len(up)]
            _rr += 1
            return name, url
        return "products", PRODUCTS_URL
    if prefix == "orders":
        return "orders", ORDERS_URL
    raise KeyError(prefix)


# --- Health endpoints ---

@app.get("/health/status")
async def health_status():
    return {"services": service_state, "timestamp": _now()}


@app.get("/health/logs")
async def health_logs():
    return {"logs": list(reversed(event_log)), "count": len(event_log)}


# --- Proxy ---

@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy(path: str, request: Request):
    method = request.method
    path = path.rstrip("/")
    token = _token(request)
    claims = None

    if not _is_public(method, path):
        if not token:
            return JSONResponse({"detail": "Authorization header required"}, status_code=401)
        try:
            claims = _decode(token)
        except JWTError:
            return JSONResponse({"detail": "Invalid or expired token"}, status_code=401)

    if _needs_admin(method, path):
        if not claims:
            return JSONResponse({"detail": "Authorization header required"}, status_code=401)
        if claims.get("role") != "admin":
            return JSONResponse({"detail": "Admin role required"}, status_code=403)

    try:
        service_name, base_url = _resolve(path, method)
    except LookupError:
        return JSONResponse({"detail": "All products services are unavailable"}, status_code=503)
    except KeyError as e:
        return JSONResponse({"detail": f"Unknown service: {e}"}, status_code=404)

    if not service_state[service_name]["up"]:
        return JSONResponse(
            {"detail": f"Service '{service_name}' is currently unavailable"},
            status_code=503,
        )

    body = await request.body()
    headers = {k: v for k, v in request.headers.items() if k.lower() != "host"}

    try:
        async with httpx.AsyncClient(timeout=10.0) as c:
            resp = await c.request(
                method=method,
                url=f"{base_url}/{path}",
                headers=headers,
                content=body,
                params=dict(request.query_params),
                follow_redirects=True,
            )
        return Response(
            content=resp.content,
            status_code=resp.status_code,
            headers={k: v for k, v in resp.headers.items()
                     if k.lower() not in ("content-encoding", "transfer-encoding")},
            media_type=resp.headers.get("content-type"),
        )
    except httpx.RequestError as exc:
        return JSONResponse(
            {"detail": f"Service '{service_name}' unreachable: {exc}"},
            status_code=503,
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8000)))
