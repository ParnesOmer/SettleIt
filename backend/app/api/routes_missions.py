"""Mission self-assignment and completion. Members claim missions; both actions broadcast."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..models import Member, Mission, MissionStatus, Room
from ..realtime import broadcaster, make_event
from ..schemas import MissionOut
from ..security import get_session_token
from ..serializers import mission_out

router = APIRouter(prefix="/missions", tags=["missions"])


async def _mission_member(
    session: AsyncSession, mission_id: uuid.UUID, request: Request
) -> tuple[Mission, Member]:
    mission = await session.get(Mission, mission_id)
    if mission is None:
        raise HTTPException(status_code=404, detail="That mission doesn't exist.")
    token = get_session_token(request)
    member = None
    if token:
        member = await session.scalar(
            select(Member).where(Member.room_id == mission.room_id, Member.session_token == token)
        )
    if member is None:
        raise HTTPException(status_code=403, detail="Join the huddle to take a mission.")
    room = await session.get(Room, mission.room_id)
    if room is not None and room.closed_at is not None:
        raise HTTPException(status_code=409, detail="This huddle is closed.")
    return mission, member


async def _broadcast(session: AsyncSession, mission: Mission) -> MissionOut:
    out = await mission_out(session, mission)
    await broadcaster.broadcast(
        str(mission.room_id), make_event("mission_updated", out.model_dump(mode="json"))
    )
    return out


@router.post("/{mission_id}/claim", response_model=MissionOut)
async def claim_mission(
    mission_id: uuid.UUID, request: Request, session: AsyncSession = Depends(get_session)
) -> MissionOut:
    mission, member = await _mission_member(session, mission_id, request)
    if mission.assigned_member_id == member.id:
        # Toggle off — release the mission.
        mission.assigned_member_id = None
        mission.status = MissionStatus.open
    else:
        mission.assigned_member_id = member.id
        mission.status = MissionStatus.claimed
    await session.commit()
    return await _broadcast(session, mission)


@router.post("/{mission_id}/complete", response_model=MissionOut)
async def complete_mission(
    mission_id: uuid.UUID, request: Request, session: AsyncSession = Depends(get_session)
) -> MissionOut:
    mission, member = await _mission_member(session, mission_id, request)
    if mission.status == MissionStatus.done:
        # Toggle back to in-progress / open.
        mission.status = MissionStatus.claimed if mission.assigned_member_id else MissionStatus.open
    else:
        mission.status = MissionStatus.done
        if mission.assigned_member_id is None:
            mission.assigned_member_id = member.id
    await session.commit()
    return await _broadcast(session, mission)
