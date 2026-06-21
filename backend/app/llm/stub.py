"""A deterministic stub provider so the full generation loop is testable without an API key.

It ignores the transcript and returns a rotating slice of a small movie catalog, varying by
generation number so 'regenerate' visibly produces different cards. A short delay simulates the
agent thinking, so the generating state is real.
"""

from __future__ import annotations

import asyncio

from .base import Card, TranscriptLine

_CATALOG: list[Card] = [
    {"title": "Dune: Part Two", "rationale": "Big-screen spectacle everyone's been meaning to catch.", "metadata": {"year": "2024", "runtime": "2h 46m", "where_to_watch": "Max"}},
    {"title": "Past Lives", "rationale": "A quieter night — tender, gorgeous, and very talked-about.", "metadata": {"year": "2023", "runtime": "1h 45m", "where_to_watch": "Paramount+"}},
    {"title": "Everything Everywhere All at Once", "rationale": "Chaotic, funny, and oddly moving — a crowd-pleaser.", "metadata": {"year": "2022", "runtime": "2h 19m", "where_to_watch": "Prime Video"}},
    {"title": "The Grand Budapest Hotel", "rationale": "Light, witty, and beautiful if you want something breezy.", "metadata": {"year": "2014", "runtime": "1h 39m", "where_to_watch": "Disney+"}},
    {"title": "Knives Out", "rationale": "A twisty whodunit that keeps everyone guessing together.", "metadata": {"year": "2019", "runtime": "2h 10m", "where_to_watch": "Prime Video"}},
    {"title": "Spider-Man: Into the Spider-Verse", "rationale": "Dazzling animation that works for every age in the room.", "metadata": {"year": "2018", "runtime": "1h 57m", "where_to_watch": "Netflix"}},
    {"title": "Parasite", "rationale": "If the group's up for something sharp and unforgettable.", "metadata": {"year": "2019", "runtime": "2h 12m", "where_to_watch": "Max"}},
    {"title": "Paddington 2", "rationale": "Genuinely delightful and impossible to dislike.", "metadata": {"year": "2017", "runtime": "1h 43m", "where_to_watch": "Prime Video"}},
]


class StubProvider:
    name = "stub"

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
        await asyncio.sleep(1.6)
        start = ((generation_number - 1) * count) % len(_CATALOG)
        picks = [_CATALOG[(start + i) % len(_CATALOG)] for i in range(min(count, len(_CATALOG)))]
        cards: list[Card] = []
        for pick in picks:
            rationale = pick["rationale"]
            if refinement:
                rationale = f"{rationale} (tuned for: {refinement.strip()})"
            cards.append(
                {"title": pick["title"], "rationale": rationale, "metadata": dict(pick["metadata"])}
            )
        return cards
