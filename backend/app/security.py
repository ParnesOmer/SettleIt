"""Lightweight anonymous identity: a server-issued session token in an httpOnly cookie.

A member is identified by ``(room_id, session_token)``. The room admin is simply the member who
created the room. There are no passwords or accounts.
"""

from __future__ import annotations

import secrets

from fastapi import Request, Response

from .config import get_settings

SESSION_COOKIE = "settleit_session"
_COOKIE_MAX_AGE = 60 * 60 * 24 * 30  # 30 days

# Invite-code alphabet without easily confused characters (no 0/O, 1/I/L).
_INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_INVITE_LENGTH = 6


def generate_session_token() -> str:
    return secrets.token_urlsafe(32)


def generate_invite_code() -> str:
    return "".join(secrets.choice(_INVITE_ALPHABET) for _ in range(_INVITE_LENGTH))


def set_session_cookie(response: Response, token: str) -> None:
    is_prod = get_settings().env == "production"
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        max_age=_COOKIE_MAX_AGE,
        httponly=True,
        samesite="none" if is_prod else "lax",
        secure=is_prod,
        path="/",
    )


SESSION_HEADER = "X-Session-Token"


def get_session_token(request: Request) -> str | None:
    """Resolve the session token from the header first (works cross-site, e.g. Vercel→Render),
    falling back to the httpOnly cookie (used for same-origin / local dev)."""
    return request.headers.get(SESSION_HEADER) or request.cookies.get(SESSION_COOKIE)
