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
from pydantic import BaseModel, Field
from jose import jwt, JWTError
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Orders Service")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

JWT_SECRET = os.getenv("JWT_SECRET", "changeme-secret-32-characters!!")
ALGORITHM = "HS256"
PRODUCTS_URL = os.getenv("PRODUCTS_URL", "http://localhost:5002")
DATA_FILE = Path("data/orders.json")
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


async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(bearer)):
    if not creds:
        raise HTTPException(401, "Authorization header required")
    try:
        return jwt.decode(creds.credentials, JWT_SECRET, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(401, "Invalid or expired token")


class OrderCreate(BaseModel):
    productId: str
    quantity: int = Field(default=1, ge=1)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/orders", status_code=201)
async def create_order(body: OrderCreate, current: dict = Depends(get_current_user)):
    try:
        async with httpx.AsyncClient(timeout=5.0) as c:
            resp = await c.get(f"{PRODUCTS_URL}/products/{body.productId}")
    except httpx.RequestError:
        raise HTTPException(503, "Products service unreachable")

    if resp.status_code == 404:
        raise HTTPException(404, "Product not found")
    if resp.status_code != 200:
        raise HTTPException(502, "Unexpected response from products service")

    product = resp.json()
    order = {
        "id": str(uuid.uuid4()),
        "user_id": current["userId"],
        "product_id": body.productId,
        "product_name": product["name"],
        "quantity": body.quantity,
        "total": product["price"] * body.quantity,
        "status": "pending",
        "created_at": datetime.utcnow().isoformat(),
    }
    async with _lock:
        orders = await _read()
        orders.append(order)
        await _write(orders)
    return order


@app.get("/orders/{user_id}")
async def list_orders(user_id: str, current: dict = Depends(get_current_user)):
    if current["userId"] != user_id and current.get("role") != "admin":
        raise HTTPException(403, "Forbidden")
    orders = await load()
    return [o for o in orders if o["user_id"] == user_id]


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 5003)))
