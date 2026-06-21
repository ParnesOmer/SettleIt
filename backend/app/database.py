"""Async SQLAlchemy engine, session factory, and declarative Base."""

from __future__ import annotations

import ssl
from collections.abc import AsyncGenerator
from urllib.parse import urlparse

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from .config import get_settings

settings = get_settings()


def _async_url(url: str) -> str:
    """Ensure the URL uses the asyncpg driver. Hosted providers (Supabase, Render, Heroku) often
    hand out a sync ``postgresql://`` / ``postgres://`` URL."""
    if url.startswith("postgresql+"):
        return url
    if url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + url[len("postgresql://") :]
    if url.startswith("postgres://"):
        return "postgresql+asyncpg://" + url[len("postgres://") :]
    return url


def _connect_args(url: str) -> dict:
    """Remote Postgres (Supabase et al.) requires TLS; local Docker doesn't.

    Supabase's pooler presents a self-signed chain, so we encrypt without CA verification — the
    same posture as libpq's ``sslmode=require`` that Supabase documents.
    """
    host = urlparse(url).hostname or ""
    if host in ("localhost", "127.0.0.1", "::1"):
        return {}
    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    return {"ssl": context}


DATABASE_URL = _async_url(settings.database_url)

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    connect_args=_connect_args(DATABASE_URL),
)

SessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields a request-scoped async session."""
    async with SessionLocal() as session:
        yield session
