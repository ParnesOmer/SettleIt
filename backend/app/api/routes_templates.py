"""Built-in topic templates (the tactile cards on the create screen)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..models import Template
from ..schemas import TemplateOut

router = APIRouter(prefix="/templates", tags=["templates"])


@router.get("", response_model=list[TemplateOut])
async def list_templates(session: AsyncSession = Depends(get_session)) -> list[Template]:
    result = await session.scalars(
        select(Template).where(Template.is_custom.is_(False)).order_by(Template.topic_name)
    )
    return list(result)
