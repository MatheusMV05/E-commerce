import os
import json
import asyncio
import uuid
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from jose import jwt, JWTError
import bcrypt as _bcrypt
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Users Service")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

JWT_SECRET = os.getenv("JWT_SECRET", "changeme-secret-32-characters!!")
ALGORITHM = "HS256"
DATA_FILE = Path("data/users.json")
_lock = asyncio.Lock()
bearer = HTTPBearer(auto_error=False)


def _hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode(), _bcrypt.gensalt()).decode()


def _verify_password(password: str, hashed: str) -> bool:
    return _bcrypt.checkpw(password.encode(), hashed.encode())


async def load() -> list:
    async with _lock:
        if not DATA_FILE.exists():
            DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
            DATA_FILE.write_text("[]")
            return []
        return json.loads(DATA_FILE.read_text())


async def save(data: list) -> None:
    async with _lock:
        DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
        DATA_FILE.write_text(json.dumps(data, indent=2, default=str))


def create_token(user_id: str, email: str, role: str) -> str:
    return jwt.encode(
        {"userId": user_id, "email": email, "role": role,
         "exp": datetime.utcnow() + timedelta(hours=24)},
        JWT_SECRET, algorithm=ALGORITHM,
    )


async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(bearer)):
    if not creds:
        raise HTTPException(401, "Authorization header required")
    try:
        return jwt.decode(creds.credentials, JWT_SECRET, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(401, "Invalid or expired token")


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: str = "user"


class UserLogin(BaseModel):
    email: str
    password: str


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/users/register", status_code=201)
async def register(body: UserCreate):
    users = await load()
    if any(u["email"] == body.email for u in users):
        raise HTTPException(409, "Email already registered")
    user = {
        "id": str(uuid.uuid4()),
        "name": body.name,
        "email": body.email,
        "password_hash": _hash_password(body.password),
        "role": body.role,
        "created_at": datetime.utcnow().isoformat(),
    }
    users.append(user)
    await save(users)
    return {k: v for k, v in user.items() if k != "password_hash"}


@app.post("/users/login")
async def login(body: UserLogin):
    users = await load()
    user = next((u for u in users if u["email"] == body.email), None)
    if not user or not _verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    return {
        "token": create_token(user["id"], user["email"], user["role"]),
        "userId": user["id"],
        "role": user["role"],
    }


@app.get("/users/{user_id}")
async def get_user(user_id: str, current: dict = Depends(get_current_user)):
    users = await load()
    user = next((u for u in users if u["id"] == user_id), None)
    if not user:
        raise HTTPException(404, "User not found")
    return {k: v for k, v in user.items() if k != "password_hash"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 5001)))
