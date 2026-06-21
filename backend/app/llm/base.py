"""LLM provider abstraction + shared prompt/parse helpers and a fallback chain.

Feature code depends only on ``LLMProvider``, so the model is swappable via env var and the
Gemini→Groq fallback is transparent to the routes.
"""

from __future__ import annotations

from typing import Protocol, TypedDict, runtime_checkable


class TranscriptLine(TypedDict):
    author: str
    content: str


class Card(TypedDict):
    title: str
    rationale: str
    metadata: dict


class GenerationError(Exception):
    """Raised when a provider cannot produce valid cards."""


@runtime_checkable
class LLMProvider(Protocol):
    name: str

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
        """Read the room and return structured suggestion cards."""
        ...


# --- shared helpers used by the concrete providers ---


def format_transcript(transcript: list[TranscriptLine]) -> str:
    if not transcript:
        return "(no messages yet — propose sensible, broadly appealing options)"
    return "\n".join(f"{line['author']}: {line['content']}" for line in transcript)


def metadata_keys(card_shape: dict) -> list[str]:
    meta = (card_shape or {}).get("metadata") or []
    return [m["key"] for m in meta if isinstance(m, dict) and m.get("key")]


def build_user_prompt(
    transcript: list[TranscriptLine], refinement: str | None, count: int
) -> str:
    parts = [f"The group's chat so far:\n{format_transcript(transcript)}"]
    if refinement:
        parts.append(f"\nThe host wants you to refine toward: {refinement.strip()}")
    parts.append(
        f"\nPropose exactly {count} distinct, specific suggestions for this group. Each needs a "
        "concrete title and a warm, one-line rationale grounded in what the group actually said. "
        "Don't repeat suggestions or invent constraints the group didn't mention."
    )
    return "\n".join(parts)


def coerce_cards(raw: object, keys: list[str]) -> list[Card]:
    """Normalize a parsed model response into Card dicts."""
    if isinstance(raw, dict):
        raw = raw.get("suggestions") or raw.get("cards") or raw.get("items") or []
    cards: list[Card] = []
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title", "")).strip()
        rationale = str(item.get("rationale", "")).strip()
        if not title:
            continue
        meta_in = item.get("metadata") or {}
        if not isinstance(meta_in, dict):
            meta_in = {}
        if keys:
            meta = {k: str(meta_in[k]) for k in keys if k in meta_in and meta_in[k] is not None}
        else:
            meta = {k: str(v) for k, v in meta_in.items() if v is not None}
        cards.append({"title": title[:200], "rationale": rationale, "metadata": meta})
    return cards


class FallbackProvider:
    """Tries each provider in order; on any failure (quota, parse, network) moves to the next."""

    name = "fallback"

    def __init__(self, providers: list[LLMProvider]) -> None:
        self._providers = providers

    async def generate_cards(self, **kwargs) -> list[Card]:
        last_error: Exception | None = None
        for provider in self._providers:
            try:
                return await provider.generate_cards(**kwargs)
            except Exception as error:  # noqa: BLE001 — intentional: fall through to next provider
                last_error = error
        raise GenerationError(f"all providers failed: {last_error}")
