import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routers import auth, children, lessons, packages


@asynccontextmanager
async def lifespan(app: FastAPI):
    if os.environ.get("TESTING") != "1":
        Path("data").mkdir(exist_ok=True)
        Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Family Learning", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(children.router, prefix="/api/children", tags=["children"])
app.include_router(packages.router, prefix="/api/packages", tags=["packages"])
app.include_router(lessons.router, prefix="/api/lessons", tags=["lessons"])


@app.get("/api/health")
def health():
    return {"status": "ok"}
