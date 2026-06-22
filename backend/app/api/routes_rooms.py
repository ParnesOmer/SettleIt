"""Rooms, anonymous membership, and chat. Mutations broadcast over WebSocket."""

from __future__ import annotations

import random
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..execution import run_mission_proposal
from ..generation import run_generation
from ..models import (
    MemberRole,
    MemberStatus,
    Message,
    Mission,
    MissionStatus,
    Room,
    RoomStatus,
    SetStatus,
    Suggestion,
    SuggestionSet,
    Template,
)
from ..models import Member as MemberModel
from ..realtime import broadcaster, make_event
from ..schemas import (
    AddChipIn,
    AddMissionIn,
    ApprovalIn,
    CreateCustomRoomIn,
    CreateMessageIn,
    CreateRoomIn,
    DecideIn,
    DecisionLocked,
    GenerateAccepted,
    GenerateIn,
    JoinRoomIn,
    MemberOut,
    MessageOut,
    MissionOut,
    RoomPreview,
    RoomState,
    SuggestionOut,
    TemplateOut,
)
from ..security import (
    generate_invite_code,
    generate_session_token,
    get_session_token,
    set_session_cookie,
)
from ..serializers import current_set_out, mission_out, missions_out, suggestion_set_out
from ..templating import run_template_generation

router = APIRouter(prefix="/rooms", tags=["rooms"])

MAX_GENERATIONS = 3


def _status_str(value: object) -> str:
    """Normalize a status enum member (or plain string) to its string value."""
    return value.value if hasattr(value, "value") else str(value)


def _is_active(member: MemberModel | None) -> bool:
    return member is not None and _status_str(member.status) == "active"


def _is_admin(member: MemberModel | None) -> bool:
    return _is_active(member) and _status_str(member.role) == "admin"


def _ensure_open(room: Room) -> None:
    if room.closed_at is not None:
        raise HTTPException(status_code=409, detail="This huddle is closed.")


async def _get_room_or_404(session: AsyncSession, room_id: uuid.UUID) -> Room:
    room = await session.get(Room, room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="That huddle doesn't exist.")
    return room


async def _get_room_by_invite_or_404(session: AsyncSession, invite_code: str) -> Room:
    room = await session.scalar(
        select(Room).where(Room.invite_code == invite_code.strip().upper())
    )
    if room is None:
        raise HTTPException(status_code=404, detail="That invite link isn't valid.")
    return room


async def _members(session: AsyncSession, room_id: uuid.UUID) -> list[MemberModel]:
    result = await session.scalars(
        select(MemberModel)
        .where(MemberModel.room_id == room_id, MemberModel.status == MemberStatus.active)
        .order_by(MemberModel.created_at)
    )
    return list(result)


async def _pending_members(session: AsyncSession, room_id: uuid.UUID) -> list[MemberModel]:
    result = await session.scalars(
        select(MemberModel)
        .where(MemberModel.room_id == room_id, MemberModel.status == MemberStatus.pending)
        .order_by(MemberModel.created_at)
    )
    return list(result)


async def _resolve_member(
    session: AsyncSession, room_id: uuid.UUID, token: str | None
) -> MemberModel | None:
    if not token:
        return None
    return await session.scalar(
        select(MemberModel).where(
            MemberModel.room_id == room_id, MemberModel.session_token == token
        )
    )


async def _message_outs(session: AsyncSession, room_id: uuid.UUID) -> list[MessageOut]:
    rows = await session.execute(
        select(Message, MemberModel.display_name)
        .join(MemberModel, Message.member_id == MemberModel.id)
        .where(Message.room_id == room_id)
        .order_by(Message.created_at)
    )
    return [
        MessageOut(
            id=msg.id,
            member_id=msg.member_id,
            author_name=name,
            content=msg.content,
            created_at=msg.created_at,
        )
        for msg, name in rows.all()
    ]


async def _unique_invite_code(session: AsyncSession) -> str:
    for _ in range(10):
        code = generate_invite_code()
        exists = await session.scalar(select(Room.id).where(Room.invite_code == code))
        if not exists:
            return code
    raise HTTPException(status_code=500, detail="Couldn't generate an invite code, try again.")


async def _build_room_state(
    session: AsyncSession, room: Room, me: MemberModel | None
) -> RoomState:
    template = await session.get(Template, room.template_id)
    # Removed members are treated as non-members.
    if me is not None and _status_str(me.status) == "removed":
        me = None
    active = _is_active(me)
    admin = _is_admin(me)

    members = await _members(session, room.id)
    pending = await _pending_members(session, room.id) if admin else []
    messages = await _message_outs(session, room.id) if active else []
    current_set = await current_set_out(session, room.id) if active else None
    missions = await missions_out(session, room.id) if active else []
    return RoomState(
        id=room.id,
        topic=room.topic,
        invite_code=room.invite_code,
        status=_status_str(room.status),
        generation_count=room.generation_count,
        generations_left=max(0, MAX_GENERATIONS - room.generation_count),
        template=TemplateOut.model_validate(template),
        members=[MemberOut.model_validate(m) for m in members],
        messages=messages,
        current_set=current_set,
        decided_suggestion_id=room.decided_suggestion_id,
        missions=missions,
        closed_at=room.closed_at,
        requires_approval=room.requires_approval,
        pending_members=[MemberOut.model_validate(m) for m in pending],
        extra_chips=room.extra_chips or [],
        me=MemberOut.model_validate(me) if me is not None else None,
    )


@router.post("", response_model=RoomState, status_code=201)
async def create_room(
    body: CreateRoomIn,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> RoomState:
    template = await session.get(Template, body.template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="That template doesn't exist.")

    invite_code = await _unique_invite_code(session)
    room = Room(template_id=template.id, topic=body.topic.strip(), invite_code=invite_code)
    session.add(room)
    await session.flush()

    token = generate_session_token()
    admin = MemberModel(
        room_id=room.id,
        display_name=body.display_name.strip(),
        role=MemberRole.admin,
        session_token=token,
    )
    session.add(admin)
    await session.flush()
    await session.refresh(admin, ["created_at"])
    await session.commit()

    set_session_cookie(response, token)
    state = await _build_room_state(session, room, admin)
    state.session_token = token
    return state


@router.post("/custom", response_model=RoomState, status_code=201)
async def create_custom_room(
    body: CreateCustomRoomIn,
    request: Request,
    response: Response,
    background: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> RoomState:
    topic = body.topic.strip()
    # Placeholder template; a background job designs it (chips/prompt/card shape/execution spec).
    template = Template(
        topic_name=topic[:120],
        is_custom=True,
        system_prompt="",
        seed_chips=[],
        card_shape={},
        execution_spec={},
    )
    session.add(template)
    await session.flush()

    invite_code = await _unique_invite_code(session)
    room = Room(template_id=template.id, topic=topic, invite_code=invite_code)
    session.add(room)
    await session.flush()

    token = generate_session_token()
    admin = MemberModel(
        room_id=room.id,
        display_name=body.display_name.strip(),
        role=MemberRole.admin,
        session_token=token,
    )
    session.add(admin)
    await session.flush()
    await session.refresh(admin, ["created_at"])
    await session.commit()

    set_session_cookie(response, token)
    background.add_task(run_template_generation, template.id, topic)
    state = await _build_room_state(session, room, admin)
    state.session_token = token
    return state


@router.get("/by-invite/{invite_code}", response_model=RoomPreview)
async def preview_room(
    invite_code: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> RoomPreview:
    room = await _get_room_by_invite_or_404(session, invite_code)
    members = await _members(session, room.id)
    me = await _resolve_member(session, room.id, get_session_token(request))
    already_member = me is not None and _status_str(me.status) != "removed"
    return RoomPreview(
        id=room.id,
        topic=room.topic,
        status=_status_str(room.status),
        member_count=len(members),
        members=[m.display_name for m in members],
        already_member=already_member,
    )


@router.post("/{invite_code}/join", response_model=RoomState)
async def join_room(
    invite_code: str,
    body: JoinRoomIn,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> RoomState:
    room = await _get_room_by_invite_or_404(session, invite_code)

    token = get_session_token(request)
    member = await _resolve_member(session, room.id, token)
    if member is not None and _status_str(member.status) == "removed":
        member = None  # a removed person can re-join as a fresh membership

    if member is None:
        token = generate_session_token()
        pending = room.requires_approval
        member = MemberModel(
            room_id=room.id,
            display_name=body.display_name.strip(),
            role=MemberRole.member,
            status=MemberStatus.pending if pending else MemberStatus.active,
            session_token=token,
        )
        session.add(member)
        await session.flush()
        await session.refresh(member, ["created_at"])
        await session.commit()
        await broadcaster.broadcast(
            str(room.id),
            make_event(
                "member_pending" if pending else "member_joined",
                MemberOut.model_validate(member).model_dump(mode="json"),
            ),
        )

    set_session_cookie(response, token)
    state = await _build_room_state(session, room, member)
    state.session_token = token
    return state


@router.get("/{room_id}", response_model=RoomState)
async def get_room(
    room_id: uuid.UUID,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> RoomState:
    room = await _get_room_or_404(session, room_id)
    me = await _resolve_member(session, room.id, get_session_token(request))
    return await _build_room_state(session, room, me)


@router.post("/{room_id}/messages", response_model=MessageOut, status_code=201)
async def post_message(
    room_id: uuid.UUID,
    body: CreateMessageIn,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> MessageOut:
    room = await _get_room_or_404(session, room_id)
    me = await _resolve_member(session, room.id, get_session_token(request))
    if not _is_active(me):
        raise HTTPException(status_code=403, detail="Join the huddle to chat.")
    _ensure_open(room)

    message = Message(room_id=room.id, member_id=me.id, content=body.content.strip())
    session.add(message)
    await session.flush()
    await session.refresh(message, ["created_at"])
    await session.commit()

    out = MessageOut(
        id=message.id,
        member_id=me.id,
        author_name=me.display_name,
        content=message.content,
        created_at=message.created_at,
    )
    await broadcaster.broadcast(
        str(room.id), make_event("message_created", out.model_dump(mode="json"))
    )
    return out


@router.post("/{room_id}/generate", response_model=GenerateAccepted, status_code=202)
async def generate(
    room_id: uuid.UUID,
    body: GenerateIn,
    request: Request,
    background: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> GenerateAccepted:
    room = await _get_room_or_404(session, room_id)
    me = await _resolve_member(session, room.id, get_session_token(request))
    if not _is_admin(me):
        raise HTTPException(status_code=403, detail="Only the host can generate suggestions.")
    _ensure_open(room)
    if _status_str(room.status) != "deciding":
        raise HTTPException(status_code=409, detail="This huddle has already locked a decision.")
    if room.generation_count >= MAX_GENERATIONS:
        raise HTTPException(status_code=409, detail="You've used all 3 generations.")

    room.generation_count += 1
    sset = SuggestionSet(
        room_id=room.id, generation_number=room.generation_count, status=SetStatus.pending
    )
    session.add(sset)
    await session.flush()
    set_id, generation_number = sset.id, sset.generation_number
    await session.commit()

    await broadcaster.broadcast(
        str(room.id),
        make_event(
            "generation_started",
            {"set_id": str(set_id), "generation_number": generation_number},
        ),
    )
    background.add_task(run_generation, room.id, set_id, body.refinement)
    return GenerateAccepted(
        set_id=set_id,
        generation_number=generation_number,
        generations_left=max(0, MAX_GENERATIONS - room.generation_count),
    )


@router.post("/{room_id}/decide", response_model=RoomState)
async def decide(
    room_id: uuid.UUID,
    body: DecideIn,
    request: Request,
    background: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> RoomState:
    room = await _get_room_or_404(session, room_id)
    me = await _resolve_member(session, room.id, get_session_token(request))
    if not _is_admin(me):
        raise HTTPException(status_code=403, detail="Only the host can lock the decision.")
    _ensure_open(room)
    if _status_str(room.status) != "deciding":
        raise HTTPException(status_code=409, detail="A decision is already locked.")

    suggestion = await session.get(Suggestion, body.suggestion_id)
    if suggestion is None:
        raise HTTPException(status_code=404, detail="That suggestion doesn't exist.")
    sset = await session.get(SuggestionSet, suggestion.set_id)
    if sset is None or sset.room_id != room.id:
        raise HTTPException(status_code=400, detail="That suggestion isn't part of this huddle.")

    room.decided_suggestion_id = suggestion.id
    room.status = RoomStatus.decided
    await session.commit()

    set_out = await suggestion_set_out(session, sset.id)
    winner = next(
        (s for s in (set_out.suggestions if set_out else []) if s.id == suggestion.id), None
    )
    if winner is None:
        winner = SuggestionOut(
            id=suggestion.id, title=suggestion.title, rationale=suggestion.rationale, metadata=suggestion.meta or {}
        )
    await broadcaster.broadcast(
        str(room.id),
        make_event(
            "decision_locked",
            DecisionLocked(decided_suggestion_id=suggestion.id, suggestion=winner).model_dump(mode="json"),
        ),
    )
    # Kick off mission proposal (AI + grounded links); it flips the room to 'executing'.
    background.add_task(run_mission_proposal, room.id)
    return await _build_room_state(session, room, me)


@router.post("/{room_id}/assign-random", response_model=list[MissionOut])
async def assign_random(
    room_id: uuid.UUID,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> list[MissionOut]:
    room = await _get_room_or_404(session, room_id)
    me = await _resolve_member(session, room.id, get_session_token(request))
    if me is None:
        raise HTTPException(status_code=403, detail="Join the huddle to assign missions.")
    _ensure_open(room)

    members = await _members(session, room.id)
    open_missions = list(
        await session.scalars(
            select(Mission).where(
                Mission.room_id == room.id, Mission.assigned_member_id.is_(None)
            )
        )
    )
    if open_missions and members:
        shuffled = members[:]
        random.shuffle(shuffled)
        for i, mission in enumerate(open_missions):
            mission.assigned_member_id = shuffled[i % len(shuffled)].id
            mission.status = MissionStatus.claimed
        await session.commit()

    payload = await missions_out(session, room.id)
    await broadcaster.broadcast(
        str(room.id),
        make_event(
            "missions_ready",
            {"status": _status_str(room.status), "missions": [m.model_dump(mode="json") for m in payload]},
        ),
    )
    return payload


@router.post("/{room_id}/close", response_model=RoomState)
async def close_room(
    room_id: uuid.UUID,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> RoomState:
    room = await _get_room_or_404(session, room_id)
    me = await _resolve_member(session, room.id, get_session_token(request))
    if not _is_admin(me):
        raise HTTPException(status_code=403, detail="Only the host can close the huddle.")

    if room.closed_at is None:
        room.closed_at = datetime.now(timezone.utc)
        await session.commit()
        await broadcaster.broadcast(
            str(room.id),
            make_event("room_closed", {"closed_at": room.closed_at.isoformat()}),
        )
    return await _build_room_state(session, room, me)


@router.delete("/{room_id}", status_code=204)
async def delete_room(
    room_id: uuid.UUID,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> Response:
    room = await _get_room_or_404(session, room_id)
    me = await _resolve_member(session, room.id, get_session_token(request))
    if not _is_admin(me):
        raise HTTPException(status_code=403, detail="Only the host can delete the huddle.")

    template_id = room.template_id
    # Tell connected clients before the row (and their sockets) disappear.
    await broadcaster.broadcast(str(room.id), make_event("room_deleted", {"room_id": str(room.id)}))

    # Break the circular FK, then delete — child rows cascade at the DB level.
    room.decided_suggestion_id = None
    await session.flush()
    await session.execute(delete(Room).where(Room.id == room.id))

    # Sweep an orphaned custom template (built-ins are shared and kept).
    template = await session.get(Template, template_id)
    if template is not None and template.is_custom:
        still_used = await session.scalar(select(Room.id).where(Room.template_id == template_id))
        if still_used is None:
            await session.delete(template)

    await session.commit()
    return Response(status_code=204)


@router.post("/{room_id}/members/{member_id}/remove", response_model=RoomState)
async def remove_member(
    room_id: uuid.UUID,
    member_id: uuid.UUID,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> RoomState:
    room = await _get_room_or_404(session, room_id)
    me = await _resolve_member(session, room.id, get_session_token(request))
    if not _is_admin(me):
        raise HTTPException(status_code=403, detail="Only the host can remove people.")
    if me is not None and me.id == member_id:
        raise HTTPException(status_code=400, detail="You can't remove yourself.")
    target = await session.get(MemberModel, member_id)
    if target is None or target.room_id != room.id:
        raise HTTPException(status_code=404, detail="That person isn't in this huddle.")

    target.status = MemberStatus.removed
    await session.commit()
    await broadcaster.broadcast(
        str(room.id), make_event("member_removed", {"member_id": str(member_id)})
    )
    return await _build_room_state(session, room, me)


@router.post("/{room_id}/members/{member_id}/approve", response_model=RoomState)
async def approve_member(
    room_id: uuid.UUID,
    member_id: uuid.UUID,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> RoomState:
    room = await _get_room_or_404(session, room_id)
    me = await _resolve_member(session, room.id, get_session_token(request))
    if not _is_admin(me):
        raise HTTPException(status_code=403, detail="Only the host can approve people.")
    target = await session.get(MemberModel, member_id)
    if target is None or target.room_id != room.id:
        raise HTTPException(status_code=404, detail="That person isn't in this huddle.")

    if _status_str(target.status) == "pending":
        target.status = MemberStatus.active
        await session.commit()
        payload = MemberOut.model_validate(target).model_dump(mode="json")
        await broadcaster.broadcast(str(room.id), make_event("member_joined", payload))
        await broadcaster.broadcast(str(room.id), make_event("member_approved", payload))
    return await _build_room_state(session, room, me)


@router.post("/{room_id}/rotate-invite", response_model=RoomState)
async def rotate_invite(
    room_id: uuid.UUID,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> RoomState:
    room = await _get_room_or_404(session, room_id)
    me = await _resolve_member(session, room.id, get_session_token(request))
    if not _is_admin(me):
        raise HTTPException(status_code=403, detail="Only the host can change the invite link.")
    room.invite_code = await _unique_invite_code(session)
    await session.commit()
    return await _build_room_state(session, room, me)


@router.post("/{room_id}/approval", response_model=RoomState)
async def set_approval(
    room_id: uuid.UUID,
    body: ApprovalIn,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> RoomState:
    room = await _get_room_or_404(session, room_id)
    me = await _resolve_member(session, room.id, get_session_token(request))
    if not _is_admin(me):
        raise HTTPException(status_code=403, detail="Only the host can change this setting.")
    room.requires_approval = body.requires_approval
    await session.commit()
    return await _build_room_state(session, room, me)


@router.post("/{room_id}/chips", response_model=RoomState)
async def add_chip(
    room_id: uuid.UUID,
    body: AddChipIn,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> RoomState:
    room = await _get_room_or_404(session, room_id)
    me = await _resolve_member(session, room.id, get_session_token(request))
    if not _is_admin(me):
        raise HTTPException(status_code=403, detail="Only the host can add questions.")
    _ensure_open(room)

    chips = list(room.extra_chips or [])
    if len(chips) >= 8:
        raise HTTPException(status_code=409, detail="You've added the maximum number of questions.")
    options = [o.strip() for o in body.options if o.strip()][:6]
    chips.append({"id": f"x_{secrets.token_hex(4)}", "label": body.label.strip(), "options": options})
    room.extra_chips = chips
    await session.commit()
    await broadcaster.broadcast(str(room.id), make_event("chips_updated", {"extra_chips": chips}))
    return await _build_room_state(session, room, me)


@router.delete("/{room_id}/chips/{chip_id}", response_model=RoomState)
async def remove_chip(
    room_id: uuid.UUID,
    chip_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> RoomState:
    room = await _get_room_or_404(session, room_id)
    me = await _resolve_member(session, room.id, get_session_token(request))
    if not _is_admin(me):
        raise HTTPException(status_code=403, detail="Only the host can remove questions.")
    chips = [c for c in (room.extra_chips or []) if c.get("id") != chip_id]
    room.extra_chips = chips
    await session.commit()
    await broadcaster.broadcast(str(room.id), make_event("chips_updated", {"extra_chips": chips}))
    return await _build_room_state(session, room, me)


@router.post("/{room_id}/missions", response_model=RoomState)
async def add_mission(
    room_id: uuid.UUID,
    body: AddMissionIn,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> RoomState:
    room = await _get_room_or_404(session, room_id)
    me = await _resolve_member(session, room.id, get_session_token(request))
    if not _is_admin(me):
        raise HTTPException(status_code=403, detail="Only the host can add missions.")
    _ensure_open(room)
    if _status_str(room.status) not in ("decided", "executing"):
        raise HTTPException(status_code=409, detail="Lock a decision before adding missions.")

    session.add(Mission(room_id=room.id, title=body.title.strip()[:200], description=body.description.strip()))
    await session.commit()
    payload = await missions_out(session, room.id)
    await broadcaster.broadcast(
        str(room.id),
        make_event(
            "missions_ready",
            {"status": _status_str(room.status), "missions": [m.model_dump(mode="json") for m in payload]},
        ),
    )
    return await _build_room_state(session, room, me)


@router.post("/{room_id}/missions/generate", status_code=202)
async def suggest_missions(
    room_id: uuid.UUID,
    request: Request,
    background: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    room = await _get_room_or_404(session, room_id)
    me = await _resolve_member(session, room.id, get_session_token(request))
    if not _is_admin(me):
        raise HTTPException(status_code=403, detail="Only the host can generate missions.")
    _ensure_open(room)
    if _status_str(room.status) not in ("decided", "executing"):
        raise HTTPException(status_code=409, detail="Lock a decision first.")
    background.add_task(run_mission_proposal, room.id)
    return {"status": "accepted"}
