"""The background generation job: assemble the prompt context, call the LLM provider, persist the
suggestion cards, and broadcast the result. Runs outside the HTTP request (FastAPI BackgroundTasks
now; structured so it can graduate to a real task queue later)."""

from __future__ import annotations

import uuid

from sqlalchemy import select

from .database import SessionLocal
from .llm import TranscriptLine, get_provider
from .models import Member, Message, Room, SetStatus, Suggestion, SuggestionSet, Template
from .realtime import broadcaster, make_event
from .serializers import suggestion_set_out

_MAX_LINES = 60
_MAX_CHARS = 6000
_CARD_COUNT = 4


async def _transcript(session, room_id: uuid.UUID) -> list[TranscriptLine]:
    rows = await session.execute(
        select(Message, Member.display_name)
        .join(Member, Message.member_id == Member.id)
        .where(Message.room_id == room_id)
        .order_by(Message.created_at)
    )
    lines: list[TranscriptLine] = [
        {"author": name, "content": msg.content} for msg, name in rows.all()
    ]
    lines = lines[-_MAX_LINES:]
    # Trim from the front to stay within a rough character budget.
    budget = _MAX_CHARS
    kept: list[TranscriptLine] = []
    for line in reversed(lines):
        cost = len(line["author"]) + len(line["content"]) + 2
        if budget - cost < 0 and kept:
            break
        budget -= cost
        kept.append(line)
    kept.reverse()
    return kept


async def run_generation(room_id: uuid.UUID, set_id: uuid.UUID, refinement: str | None = None) -> None:
    async with SessionLocal() as session:
        sset = await session.get(SuggestionSet, set_id)
        try:
            room = await session.get(Room, room_id)
            template = await session.get(Template, room.template_id)
            transcript = await _transcript(session, room_id)

            provider = get_provider()
            cards = await provider.generate_cards(
                system_prompt=template.system_prompt,
                transcript=transcript,
                refinement=refinement,
                card_shape=template.card_shape,
                count=_CARD_COUNT,
                generation_number=sset.generation_number,
            )
            if not cards:
                raise ValueError("provider returned no cards")

            for card in cards:
                session.add(
                    Suggestion(
                        set_id=set_id,
                        title=card["title"][:200],
                        rationale=card["rationale"],
                        meta=card.get("metadata") or {},
                    )
                )
            sset.status = SetStatus.complete
            await session.commit()

            payload = await suggestion_set_out(session, set_id)
            assert payload is not None
            await broadcaster.broadcast(
                str(room_id), make_event("suggestions_ready", payload.model_dump(mode="json"))
            )
        except Exception:
            await session.rollback()
            failed = await session.get(SuggestionSet, set_id)
            generation_number = failed.generation_number if failed else 0
            if failed:
                failed.status = SetStatus.failed
                await session.commit()
            await broadcaster.broadcast(
                str(room_id),
                make_event(
                    "suggestions_ready",
                    {
                        "id": str(set_id),
                        "generation_number": generation_number,
                        "status": "failed",
                        "suggestions": [],
                    },
                ),
            )
