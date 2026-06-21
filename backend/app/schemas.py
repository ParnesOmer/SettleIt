"""Pydantic API models. Feature schemas (rooms, suggestions, missions) arrive in milestone 2;
for now this carries the health contract shared with the typed frontend client."""

from __future__ import annotations

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    database: bool
