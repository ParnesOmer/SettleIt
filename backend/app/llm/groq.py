"""Groq provider via the OpenAI-compatible REST API (httpx). Used as the free-tier fallback when
Gemini's quota is exhausted. JSON object mode for parseable output."""

from __future__ import annotations

import json

import httpx

from .base import (
    Card,
    GenerationError,
    MissionSpec,
    TranscriptLine,
    build_missions_prompt,
    build_user_prompt,
    coerce_cards,
    coerce_missions,
    metadata_keys,
)

_URL = "https://api.groq.com/openai/v1/chat/completions"


class GroqProvider:
    name = "groq"

    def __init__(self, api_key: str, model: str) -> None:
        self._api_key = api_key
        self._model = model

    async def generate_cards(
        self,
        *,
        system_prompt: str,
        transcript: list[TranscriptLine],
        refinement: str | None,
        card_shape: dict,
        count: int,
        generation_number: int,
    ) -> list[Card]:
        keys = metadata_keys(card_shape)
        meta_hint = f' Each suggestion\'s "metadata" object should include keys: {", ".join(keys)}.' if keys else ""
        system = (
            f"{system_prompt}\n\nReturn a JSON object of the form "
            '{"suggestions": [{"title": "...", "rationale": "...", "metadata": {}}]}.'
            f"{meta_hint}"
        )
        user = build_user_prompt(transcript, refinement, count) + " Respond with JSON only."

        body = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.9,
        }

        async with httpx.AsyncClient(timeout=40) as client:
            resp = await client.post(
                _URL, headers={"Authorization": f"Bearer {self._api_key}"}, json=body
            )
        if resp.status_code != 200:
            raise GenerationError(f"groq {resp.status_code}: {resp.text[:200]}")

        try:
            content = resp.json()["choices"][0]["message"]["content"]
            raw = json.loads(content)
        except (KeyError, IndexError, json.JSONDecodeError) as error:
            raise GenerationError(f"groq parse error: {error}") from error

        cards = coerce_cards(raw, keys)
        if not cards:
            raise GenerationError("groq returned no usable cards")
        return cards[:count]

    async def generate_missions(
        self,
        *,
        decision_title: str,
        topic: str,
        mission_strategy: str,
        count: int,
    ) -> list[MissionSpec]:
        system = (
            "You break a group's locked decision into concrete next-step missions. Return a JSON "
            'object of the form {"missions": [{"title": "...", "description": "...", '
            '"search_query": "..."}]}.'
        )
        user = build_missions_prompt(decision_title, topic, mission_strategy, count) + " JSON only."
        body = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.7,
        }
        async with httpx.AsyncClient(timeout=40) as client:
            resp = await client.post(
                _URL, headers={"Authorization": f"Bearer {self._api_key}"}, json=body
            )
        if resp.status_code != 200:
            raise GenerationError(f"groq {resp.status_code}: {resp.text[:200]}")
        try:
            content = resp.json()["choices"][0]["message"]["content"]
            raw = json.loads(content)
        except (KeyError, IndexError, json.JSONDecodeError) as error:
            raise GenerationError(f"groq parse error: {error}") from error

        missions = coerce_missions(raw)
        if not missions:
            raise GenerationError("groq returned no usable missions")
        return missions[:count]
