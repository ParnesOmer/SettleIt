"""Rooms, anonymous membership, and chat. Mutations broadcast over WebSocket."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..models import MemberRole, Message, Room, Template
from ..models import Member as MemberModel
from ..realtime import broadcaster, make_event
from ..schemas import (
    CreateMessageIn,
    CreateRoomIn,
    JoinRoomIn,
    MemberOut,
    MessageOut,
    RoomPreview,
    RoomState,
    TemplateOut,
)
from ..security import (
    generate_invite_code,
    generate_session_token,
    get_session_token,
    set_session_cookie,
)

router = APIRouter(prefix="/rooms", tags=["rooms"])


def _status_str(value: object) -> str:
    """Normalize a status enum member (or plain string) to its string value."""
    return value.value if hasattr(value, "value") else str(value)


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
        .where(MemberModel.room_id == room_id)
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
    members = await _members(session, room.id)
    messages = await _message_outs(session, room.id) if me is not None else []
    return RoomState(
        id=room.id,
        topic=room.topic,
        invite_code=room.invite_code,
        status=_status_str(room.status),
        generation_count=room.generation_count,
        template=TemplateOut.model_validate(template),
        members=[MemberOut.model_validate(m) for m in members],
        messages=messages,
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
    return await _build_room_state(session, room, admin)


@router.get("/by-invite/{invite_code}", response_model=RoomPreview)
async def preview_room(
    invite_code: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> RoomPreview:
    room = await _get_room_by_invite_or_404(session, invite_code)
    members = await _members(session, room.id)
    token = get_session_token(request)
    already_member = bool(token) and any(m.session_token == token for m in members)
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

    if member is None:
        token = generate_session_token()
        member = MemberModel(
            room_id=room.id,
            display_name=body.display_name.strip(),
            role=MemberRole.member,
            session_token=token,
        )
        session.add(member)
        await session.flush()
        await session.refresh(member, ["created_at"])
        await session.commit()
        await broadcaster.broadcast(
            str(room.id),
            make_event("member_joined", MemberOut.model_validate(member).model_dump(mode="json")),
        )

    set_session_cookie(response, token)
    return await _build_room_state(session, room, member)


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
    if me is None:
        raise HTTPException(status_code=403, detail="Join the huddle to chat.")

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
