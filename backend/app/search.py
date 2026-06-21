"""Grounded web search via Tavily. Only real results are ever returned — model-invented URLs are
never persisted as mission resources."""

from __future__ import annotations

import httpx

from .config import get_settings

_URL = "https://api.tavily.com/search"


async def search(query: str, max_results: int = 3) -> list[dict]:
    """Return up to ``max_results`` grounded results: [{title, url, content}]. Empty on any failure
    or when no key is configured, so callers degrade gracefully (a mission just has no links)."""
    settings = get_settings()
    if not settings.tavily_api_key or not query.strip():
        return []

    body = {
        "api_key": settings.tavily_api_key,
        "query": query,
        "max_results": max_results,
        "search_depth": "basic",
    }
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(_URL, json=body)
        if resp.status_code != 200:
            return []
        results = resp.json().get("results", [])
    except Exception:
        return []

    return [
        {"title": r.get("title", "") or r["url"], "url": r["url"], "content": r.get("content", "")}
        for r in results
        if r.get("url")
    ]
