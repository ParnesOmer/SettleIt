"""Read-side helpers that assemble suggestion sets and vote tallies. Shared by the room routes,
the vote route, and the background generation job to keep serialization in one place."""

from __future__ import annotations

import uuid
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Member, Mission, MissionResource, Suggestion, SuggestionSet, Vote
from .schemas import (
    MissionOut,
    MissionResourceOut,
    SuggestionOut,
    SuggestionSetOut,
    VoteResult,
)


def _value(status: object) -> str:
    return status.value if hasattr(status, "value") else str(status)


async def _backers(
    session: AsyncSession, suggestion_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[uuid.UUID]]:
    backers: dict[uuid.UUID, list[uuid.UUID]] = defaultdict(list)
    if not suggestion_ids:
        return backers
    rows = await session.execute(
        select(Vote.suggestion_id, Vote.member_id).where(Vote.suggestion_id.in_(suggestion_ids))
    )
    for suggestion_id, member_id in rows.all():
        backers[suggestion_id].append(member_id)
    return backers


async def suggestion_set_out(session: AsyncSession, set_id: uuid.UUID) -> SuggestionSetOut | None:
    sset = await session.get(SuggestionSet, set_id)
    if sset is None:
        return None
    suggestions = list(
        await session.scalars(
            select(Suggestion).where(Suggestion.set_id == set_id).order_by(Suggestion.created_at)
        )
    )
    backers = await _backers(session, [s.id for s in suggestions])
    return SuggestionSetOut(
        id=sset.id,
        generation_number=sset.generation_number,
        status=_value(sset.status),
        suggestions=[
            SuggestionOut(
                id=s.id,
                title=s.title,
                rationale=s.rationale,
                metadata=s.meta or {},
                vote_count=len(backers[s.id]),
                backer_ids=backers[s.id],
            )
            for s in suggestions
        ],
    )


async def latest_set(session: AsyncSession, room_id: uuid.UUID) -> SuggestionSet | None:
    return await session.scalar(
        select(SuggestionSet)
        .where(SuggestionSet.room_id == room_id)
        .order_by(SuggestionSet.generation_number.desc())
        .limit(1)
    )


async def current_set_out(session: AsyncSession, room_id: uuid.UUID) -> SuggestionSetOut | None:
    sset = await latest_set(session, room_id)
    return await suggestion_set_out(session, sset.id) if sset else None


async def mission_out(session: AsyncSession, mission: Mission) -> MissionOut:
    resources = list(
        await session.scalars(
            select(MissionResource)
            .where(MissionResource.mission_id == mission.id)
            .order_by(MissionResource.created_at)
        )
    )
    assignee_name = None
    if mission.assigned_member_id is not None:
        member = await session.get(Member, mission.assigned_member_id)
        assignee_name = member.display_name if member else None
    return MissionOut(
        id=mission.id,
        title=mission.title,
        description=mission.description,
        status=_value(mission.status),
        assigned_member_id=mission.assigned_member_id,
        assignee_name=assignee_name,
        resources=[
            MissionResourceOut(id=r.id, title=r.title, url=r.url, note=r.note) for r in resources
        ],
    )


async def missions_out(session: AsyncSession, room_id: uuid.UUID) -> list[MissionOut]:
    missions = list(
        await session.scalars(
            select(Mission).where(Mission.room_id == room_id).order_by(Mission.created_at)
        )
    )
    return [await mission_out(session, m) for m in missions]


async def vote_result(session: AsyncSession, set_id: uuid.UUID) -> VoteResult:
    suggestion_ids = list(
        await session.scalars(select(Suggestion.id).where(Suggestion.set_id == set_id))
    )
    backers = await _backers(session, suggestion_ids)
    return VoteResult(
        set_id=set_id,
        tallies={str(sid): len(backers[sid]) for sid in suggestion_ids},
        backers={str(sid): backers[sid] for sid in suggestion_ids},
    )
