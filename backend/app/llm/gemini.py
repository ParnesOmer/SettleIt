"""Gemini provider via the Generative Language REST API (httpx — no SDK dependency).

Uses structured output (responseMimeType=application/json + a responseSchema) so cards come back
parseable. The metadata schema is derived from the template's card_shape.
"""

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

_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


class GeminiProvider:
    name = "gemini"

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
        item_props: dict = {"title": {"type": "STRING"}, "rationale": {"type": "STRING"}}
        if keys:
            item_props["metadata"] = {
                "type": "OBJECT",
                "properties": {k: {"type": "STRING"} for k in keys},
            }
        schema = {
            "type": "ARRAY",
            "items": {"type": "OBJECT", "properties": item_props, "required": ["title", "rationale"]},
        }

        body = {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": [
                {"role": "user", "parts": [{"text": build_user_prompt(transcript, refinement, count)}]}
            ],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": schema,
                "temperature": 1.0,
            },
        }

        async with httpx.AsyncClient(timeout=40) as client:
            resp = await client.post(
                _URL.format(model=self._model),
                headers={"x-goog-api-key": self._api_key, "Content-Type": "application/json"},
                json=body,
            )
        if resp.status_code != 200:
            raise GenerationError(f"gemini {resp.status_code}: {resp.text[:200]}")

        try:
            text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
            raw = json.loads(text)
        except (KeyError, IndexError, json.JSONDecodeError) as error:
            raise GenerationError(f"gemini parse error: {error}") from error

        cards = coerce_cards(raw, keys)
        if not cards:
            raise GenerationError("gemini returned no usable cards")
        return cards[:count]

    async def generate_missions(
        self,
        *,
        decision_title: str,
        topic: str,
        mission_strategy: str,
        count: int,
    ) -> list[MissionSpec]:
        schema = {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "title": {"type": "STRING"},
                    "description": {"type": "STRING"},
                    "search_query": {"type": "STRING"},
                },
                "required": ["title", "description"],
            },
        }
        body = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": build_missions_prompt(decision_title, topic, mission_strategy, count)}
                    ],
                }
            ],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": schema,
                "temperature": 0.7,
            },
        }
        async with httpx.AsyncClient(timeout=40) as client:
            resp = await client.post(
                _URL.format(model=self._model),
                headers={"x-goog-api-key": self._api_key, "Content-Type": "application/json"},
                json=body,
            )
        if resp.status_code != 200:
            raise GenerationError(f"gemini {resp.status_code}: {resp.text[:200]}")
        try:
            text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
            raw = json.loads(text)
        except (KeyError, IndexError, json.JSONDecodeError) as error:
            raise GenerationError(f"gemini parse error: {error}") from error

        missions = coerce_missions(raw)
        if not missions:
            raise GenerationError("gemini returned no usable missions")
        return missions[:count]
