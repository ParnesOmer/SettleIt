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
    welcome_blurb: str
    conversation_starters: list[str]


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
        language: str = "en",
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
        language: str = "en",
    ) -> list[MissionSpec]:
        """Turn the locked decision into concrete missions, each with an optional search query."""
        ...

    async def generate_template(self, *, topic: str, language: str = "en") -> TemplateSpec:
        """Design a whole decision room for an arbitrary topic (custom-topic pipeline)."""
        ...


# --- shared helpers used by the concrete providers ---


def respond_in(language: str) -> str:
    """An instruction line telling the model which language to write its output in."""
    return "Respond entirely in Hebrew." if language == "he" else ""


def format_transcript(transcript: list[TranscriptLine]) -> str:
    if not transcript:
        return "(no messages yet — propose sensible, broadly appealing options)"
    return "\n".join(f"{line['author']}: {line['content']}" for line in transcript)


def metadata_keys(card_shape: dict) -> list[str]:
    meta = (card_shape or {}).get("metadata") or []
    return [m["key"] for m in meta if isinstance(m, dict) and m.get("key")]


def build_user_prompt(
    transcript: list[TranscriptLine], refinement: str | None, count: int, language: str = "en"
) -> str:
    parts = [f"The group's chat so far:\n{format_transcript(transcript)}"]
    if refinement:
        parts.append(f"\nThe host wants you to refine toward: {refinement.strip()}")
    parts.append(
        f"\nPropose exactly {count} distinct, specific suggestions for this group. Each needs a "
        "concrete title and a warm, one-line rationale grounded in what the group actually said. "
        "Don't repeat suggestions or invent constraints the group didn't mention."
    )
    instruction = respond_in(language)
    if instruction:
        parts.append(instruction)
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
    decision_title: str, topic: str, mission_strategy: str, count: int, language: str = "en"
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
    instruction = respond_in(language)
    if instruction:
        # The search_query stays in the topic's natural language for good results.
        parts.append(f"{instruction} Keep each 'search_query' in the language most likely to find results.")
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


def build_template_prompt(topic: str, language: str = "en") -> str:
    base = (
        f'Design a group decision room for this topic: "{topic}".\n'
        "Produce:\n"
        "- system_prompt: instructions for an agent to propose distinct, specific, real options for "
        "this exact topic, each with a warm one-line rationale grounded in what the group says.\n"
        "- seed_chips: 3 to 5 quick constraint questions; each has a short id (keep ids in english "
        "lowercase), a label (the question), and 2 to 5 options.\n"
        "- metadata_fields: 1 to 3 attributes each option card should show (english key + short label).\n"
        "- mission_strategy: one or two sentences on how to break the chosen option into concrete "
        "next steps.\n"
        "- welcome_blurb: one friendly sentence (max 25 words) shown to group members on the join "
        "screen before they enter the room — explain what the group is deciding and what they should "
        "do, and mention that chatting freely makes the suggestions smarter "
        '(e.g. "Your group is deciding where to eat Friday — answer the questions and share your '
        'thoughts in the chat so the app can suggest options everyone actually agrees on.").\n'
        "- conversation_starters: exactly 3 short, friendly prompts (max 10 words each) that nudge "
        "group members to share their thoughts in the chat — they appear as tappable buttons in an "
        "empty chat box to break the blank-canvas hesitation. Make them feel like natural conversation "
        'openers specific to this topic, not chip option repeats (e.g. "What are you hoping for?", '
        '"Anything you\'d like to avoid?", "What matters most to you here?").'
    )
    if language == "he":
        base += (
            "\nWrite the system_prompt, every chip label, every option, each metadata label, "
            "mission_strategy, welcome_blurb, and all conversation_starters in Hebrew. "
            "Keep the chip ids and metadata keys in english."
        )
    return base


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

    raw_starters = data.get("conversation_starters") or []
    conversation_starters = [
        str(s).strip() for s in raw_starters if isinstance(s, str) and str(s).strip()
    ][:3]

    return {
        "system_prompt": str(data.get("system_prompt", "")).strip(),
        "seed_chips": seed_chips,
        "metadata_fields": metadata_fields,
        "mission_strategy": str(data.get("mission_strategy", "")).strip(),
        "welcome_blurb": str(data.get("welcome_blurb", "")).strip(),
        "conversation_starters": conversation_starters,
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
