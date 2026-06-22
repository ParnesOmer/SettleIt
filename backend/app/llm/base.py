"""LLM provider abstraction + shared prompt/parse helpers and a fallback chain.

Feature code depends only on ``LLMProvider``, so the model is swappable via env var and the
Gemini→Groq fallback is transparent to the routes.
"""

from __future__ import annotations

import re
from typing import Protocol, TypedDict, runtime_checkable


class TranscriptLine(TypedDict):
    author: str
    content: str


class Card(TypedDict):
    title: str
    rationale: str
    metadata: dict


class MissionSpec(TypedDict):
    title: str
    description: str
    search_query: str


class TemplateSpec(TypedDict):
    system_prompt: str
    seed_chips: list[dict]
    metadata_fields: list[dict]
    mission_strategy: str


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

    async def generate_missions(
        self,
        *,
        decision_title: str,
        topic: str,
        mission_strategy: str,
        count: int,
    ) -> list[MissionSpec]:
        """Turn the locked decision into concrete missions, each with an optional search query."""
        ...

    async def generate_template(self, *, topic: str) -> TemplateSpec:
        """Design a whole decision room for an arbitrary topic (custom-topic pipeline)."""
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


def build_missions_prompt(
    decision_title: str, topic: str, mission_strategy: str, count: int
) -> str:
    parts = [f"The group was deciding: {topic}.", f"They locked in: {decision_title}."]
    if mission_strategy:
        parts.append(f"How to break it into next steps: {mission_strategy}")
    parts.append(
        f"Propose exactly {count} concrete missions that make this actually happen. Each has a "
        "short action title, a one-sentence description of what to do, and a 'search_query' that "
        "would find genuinely useful links to get started — or an empty string if web links "
        "wouldn't help that mission."
    )
    return "\n".join(parts)


def coerce_missions(raw: object) -> list[MissionSpec]:
    if isinstance(raw, dict):
        raw = raw.get("missions") or raw.get("items") or []
    missions: list[MissionSpec] = []
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title", "")).strip()
        if not title:
            continue
        missions.append(
            {
                "title": title[:200],
                "description": str(item.get("description", "")).strip(),
                "search_query": str(item.get("search_query", "") or "").strip(),
            }
        )
    return missions


def build_template_prompt(topic: str) -> str:
    return (
        f'Design a group decision room for this topic: "{topic}".\n'
        "Produce:\n"
        "- system_prompt: instructions for an agent to propose distinct, specific, real options for "
        "this exact topic, each with a warm one-line rationale grounded in what the group says.\n"
        "- seed_chips: 3 to 5 quick constraint questions; each has a short id, a label (the "
        "question), and 2 to 5 options.\n"
        "- metadata_fields: 1 to 3 attributes each option card should show (key + short label).\n"
        "- mission_strategy: one or two sentences on how to break the chosen option into concrete "
        "next steps."
    )


def _slug(text: str, fallback: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")
    return slug[:24] or fallback


def coerce_template(raw: object) -> TemplateSpec:
    data = raw if isinstance(raw, dict) else {}

    seed_chips: list[dict] = []
    for i, chip in enumerate(data.get("seed_chips") or []):
        if not isinstance(chip, dict):
            continue
        label = str(chip.get("label", "")).strip()
        if not label:
            continue
        options = [str(o).strip() for o in (chip.get("options") or []) if str(o).strip()]
        chip_id = str(chip.get("id") or "").strip() or _slug(label, f"chip{i}")
        seed_chips.append({"id": chip_id, "label": label, "options": options})

    metadata_fields: list[dict] = []
    for field in data.get("metadata_fields") or []:
        if not isinstance(field, dict) or not field.get("key"):
            continue
        key = _slug(str(field["key"]), "field")
        metadata_fields.append({"key": key, "label": str(field.get("label") or field["key"])})

    return {
        "system_prompt": str(data.get("system_prompt", "")).strip(),
        "seed_chips": seed_chips,
        "metadata_fields": metadata_fields,
        "mission_strategy": str(data.get("mission_strategy", "")).strip(),
    }


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

    async def generate_missions(self, **kwargs) -> list[MissionSpec]:
        last_error: Exception | None = None
        for provider in self._providers:
            try:
                return await provider.generate_missions(**kwargs)
            except Exception as error:  # noqa: BLE001 — intentional: fall through to next provider
                last_error = error
        raise GenerationError(f"all providers failed: {last_error}")

    async def generate_template(self, **kwargs) -> TemplateSpec:
        last_error: Exception | None = None
        for provider in self._providers:
            try:
                return await provider.generate_template(**kwargs)
            except Exception as error:  # noqa: BLE001 — intentional: fall through to next provider
                last_error = error
        raise GenerationError(f"all providers failed: {last_error}")
