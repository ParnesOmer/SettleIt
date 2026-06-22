"""Voting. One backing per member per set — voting for a card moves your token onto it (and off
any other card in the same set). Voting the same card again removes your backing."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..models import Member, Room, Suggestion, SuggestionSet, Vote
from ..realtime import broadcaster, make_event
from ..schemas import VoteResult
from ..security import get_session_token
from ..serializers import vote_result

router = APIRouter(prefix="/suggestions", tags=["votes"])


@router.post("/{suggestion_id}/vote", response_model=VoteResult)
async def cast_vote(
    suggestion_id: uuid.UUID,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> VoteResult:
    suggestion = await session.get(Suggestion, suggestion_id)
    if suggestion is None:
        raise HTTPException(status_code=404, detail="That suggestion doesn't exist.")

    sset = await session.get(SuggestionSet, suggestion.set_id)
    room = await session.get(Room, sset.room_id)

    token = get_session_token(request)
    me = None
    if token:
        me = await session.scalar(
            select(Member).where(Member.room_id == room.id, Member.session_token == token)
        )
    if me is None:
        raise HTTPException(status_code=403, detail="Join the huddle to vote.")
    if room.closed_at is not None:
        raise HTTPException(status_code=409, detail="This huddle is closed.")

    status = room.status.value if hasattr(room.status, "value") else room.status
    if status != "deciding":
        raise HTTPException(status_code=409, detail="Voting is closed — a decision is locked.")

    existing = await session.scalar(
        select(Vote).where(Vote.suggestion_id == suggestion_id, Vote.member_id == me.id)
    )
    if existing is not None:
        await session.delete(existing)
    else:
        set_suggestion_ids = list(
            await session.scalars(select(Suggestion.id).where(Suggestion.set_id == sset.id))
        )
        await session.execute(
            delete(Vote).where(
                Vote.member_id == me.id, Vote.suggestion_id.in_(set_suggestion_ids)
            )
        )
        session.add(Vote(suggestion_id=suggestion_id, member_id=me.id, value=1))

    await session.commit()

    result = await vote_result(session, sset.id)
    await broadcaster.broadcast(
        str(room.id), make_event("vote_updated", result.model_dump(mode="json"))
    )
    return result
