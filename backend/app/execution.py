"""Mission proposal: when a decision locks, turn it into concrete missions and ground each one
with real Tavily links. Runs as a background job; moves the room to 'executing' and broadcasts."""

from __future__ import annotations

import uuid

from .database import SessionLocal
from .llm import get_provider
from .models import Mission, MissionResource, Room, RoomStatus, Suggestion, Template
from .realtime import broadcaster, make_event
from .search import search
from .serializers import missions_out

_MISSION_COUNT = 3
_LINKS_PER_MISSION = 3


def _fallback_specs(execution_spec: dict, title: str) -> list[dict]:
    """If the model can't propose missions, fall back to the template's execution_spec."""
    specs: list[dict] = []
    for mission in execution_spec.get("missions") or []:
        queries = mission.get("search_queries") or []
        query = queries[0].replace("{title}", title) if queries else ""
        specs.append(
            {
                "title": mission.get("title", "Mission"),
                "description": (mission.get("description", "")).replace("{title}", title),
                "search_query": query,
            }
        )
    if not specs:
        specs = [{"title": "Make it happen", "description": f"Sort out the details for {title}.", "search_query": ""}]
    return specs


async def run_mission_proposal(room_id: uuid.UUID) -> None:
    async with SessionLocal() as session:
        room = await session.get(Room, room_id)
        if room is None:
            return
        template = await session.get(Template, room.template_id)
        execution_spec = (template.execution_spec if template else {}) or {}
        decided = (
            await session.get(Suggestion, room.decided_suggestion_id)
            if room.decided_suggestion_id
            else None
        )
        title = decided.title if decided else room.topic

        try:
            provider = get_provider()
            specs = await provider.generate_missions(
                decision_title=title,
                topic=room.topic,
                mission_strategy=execution_spec.get("mission_strategy", ""),
                count=_MISSION_COUNT,
                language=room.content_language,
            )
            if not specs:
                raise ValueError("no missions")
        except Exception:
            specs = _fallback_specs(execution_spec, title)

        for spec in specs:
            mission = Mission(
                room_id=room.id, title=spec["title"][:200], description=spec.get("description", "")
            )
            session.add(mission)
            await session.flush()

            query = (spec.get("search_query") or "").strip()
            if query:
                for result in await search(query, max_results=_LINKS_PER_MISSION):
                    note = (result.get("content") or "")[:400] or None
                    session.add(
                        MissionResource(
                            mission_id=mission.id,
                            title=result["title"][:300],
                            url=result["url"][:1000],
                            note=note,
                        )
                    )

        room.status = RoomStatus.executing
        await session.commit()

        payload = await missions_out(session, room.id)
        await broadcaster.broadcast(
            str(room.id),
            make_event(
                "missions_ready",
                {"status": "executing", "missions": [m.model_dump(mode="json") for m in payload]},
            ),
        )
