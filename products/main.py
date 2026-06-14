import os
import json
import asyncio
import uuid
from datetime import datetime
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from jose import jwt, JWTError
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Products Service")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

JWT_SECRET = os.getenv("JWT_SECRET", "changeme-secret-32-characters!!")
ALGORITHM = "HS256"
IS_REPLICA = os.getenv("IS_REPLICA", "false").lower() == "true"
REPLICA_URL = os.getenv("REPLICA_URL", "http://localhost:5012")
DATA_FILE = Path("data/products.json")
_lock = asyncio.Lock()
bearer = HTTPBearer(auto_error=False)


async def _read() -> list:
    if not DATA_FILE.exists():
        DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
        DATA_FILE.write_text("[]")
        return []
    return json.loads(DATA_FILE.read_text())


async def _write(data: list) -> None:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps(data, indent=2, default=str))


async def load() -> list:
    async with _lock:
        return await _read()


async def save(data: list) -> None:
    async with _lock:
        await _write(data)


async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(bearer)):
    if not creds:
        raise HTTPException(401, "Authorization header required")
    try:
        return jwt.decode(creds.credentials, JWT_SECRET, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(401, "Invalid or expired token")


async def require_admin(user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin role required")
    return user


class ProductCreate(BaseModel):
    name: str
    description: str
    price: float
    stock: int


class ProductSync(BaseModel):
    id: str
    name: str
    description: str
    price: float
    stock: int
    created_at: str


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/products")
async def list_products():
    return await load()


@app.get("/products/{product_id}")
async def get_product(product_id: str):
    products = await load()
    product = next((p for p in products if p["id"] == product_id), None)
    if not product:
        raise HTTPException(404, "Product not found")
    return product


@app.post("/products", status_code=201)
async def create_product(body: ProductCreate, _: dict = Depends(require_admin)):
    product = {
        "id": str(uuid.uuid4()),
        "name": body.name,
        "description": body.description,
        "price": body.price,
        "stock": body.stock,
        "created_at": datetime.utcnow().isoformat(),
    }

    async with _lock:
        products = await _read()
        products.append(product)
        await _write(products)

    # Strong consistency: propagate to replica before confirming; rollback on failure
    if not IS_REPLICA:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(f"{REPLICA_URL}/internal/sync", json=product)
                if resp.status_code not in (200, 201):
                    async with _lock:
                        products = await _read()
                        products = [p for p in products if p["id"] != product["id"]]
                        await _write(products)
                    raise HTTPException(503, "Replica rejected write — rolling back")
        except httpx.RequestError:
            async with _lock:
                products = await _read()
                products = [p for p in products if p["id"] != product["id"]]
                await _write(products)
            raise HTTPException(503, "Replica unreachable — write rolled back (strong consistency)")

    return product


@app.post("/internal/sync", status_code=201, include_in_schema=False)
async def internal_sync(product: ProductSync):
    """Receives writes from primary. Not exposed via gateway."""
    async with _lock:
        products = await _read()
        if not any(p["id"] == product.id for p in products):
            products.append(product.model_dump())
            await _write(products)
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 5002)))
