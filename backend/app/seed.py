"""Seed the built-in templates. Idempotent — safe to run repeatedly.

Run from the backend directory:  python -m app.seed
"""

from __future__ import annotations

import asyncio

from sqlalchemy import select

from .database import SessionLocal
from .models import Template

MOVIE_NIGHT: dict = {
    "topic_name": "Movie night",
    "is_custom": False,
    "system_prompt": (
        "You are SettleIt's movie-night agent. Read the whole group chat and the chip answers, "
        "then propose distinct movies the group could watch together. Honour the constraints the "
        "group actually expressed (venue, genre, when, length); never invent constraints. Each "
        "suggestion is one real, well-known film with a one-line reason it fits this specific "
        "group tonight. Keep rationales warm and concrete, not generic. Return only the structured "
        "cards."
    ),
    "seed_chips": [
        {"id": "venue", "label": "Theater or streaming?", "options": ["Theater", "Streaming"]},
        {
            "id": "genre",
            "label": "Genre?",
            "options": ["Comedy", "Drama", "Action", "Horror", "Sci-fi", "Anything"],
        },
        {"id": "when", "label": "When?", "options": ["Tonight", "This weekend"]},
        {"id": "length", "label": "Length?", "options": ["Under 2 hours", "Doesn't matter"]},
    ],
    "card_shape": {
        "fields": [
            {"key": "title", "type": "string", "label": "Movie"},
            {"key": "rationale", "type": "string", "label": "Why this one"},
        ],
        "metadata": [
            {"key": "year", "label": "Year"},
            {"key": "runtime", "label": "Runtime"},
            {"key": "where_to_watch", "label": "Where to watch"},
        ],
    },
    "execution_spec": {
        "mission_strategy": (
            "Turn the chosen movie into the few concrete things that make movie night actually "
            "happen: lock the platform or showtime, sort snacks, and rally everyone."
        ),
        "missions": [
            {
                "title": "Lock the showing",
                "description": "Pick the platform or book the showtime so everyone knows where and when.",
                "search_queries": ["where to watch {title}", "{title} showtimes"],
            },
            {
                "title": "Sort the snacks",
                "description": "Decide on snacks and drinks and who's bringing what.",
                "search_queries": ["easy movie night snacks", "best snacks for {title}"],
            },
            {
                "title": "Rally everyone",
                "description": "Confirm who's coming and share the final plan.",
                "search_queries": [],
            },
        ],
    },
}

BUILTINS: list[dict] = [MOVIE_NIGHT]


async def seed() -> None:
    async with SessionLocal() as session:
        for spec in BUILTINS:
            existing = await session.scalar(
                select(Template).where(
                    Template.topic_name == spec["topic_name"],
                    Template.is_custom.is_(False),
                )
            )
            if existing:
                print(f"= {spec['topic_name']!r} template already present, skipping.")
                continue
            session.add(Template(**spec))
            print(f"+ seeded {spec['topic_name']!r} template.")
        await session.commit()


if __name__ == "__main__":
    asyncio.run(seed())
